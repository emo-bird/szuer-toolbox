import { chatDetailed, chatUrl, LlmError, type LlmConfig } from './llm.ts';
import { MAX_SAMPLES, parseModelAnswer } from './parse.ts';
import { buildPrompt, TEMPLATES, type PromptTemplate } from './prompts.ts';
import { questionInputIssue, type ExamQuestion } from './paper.ts';
import { getCachedAnswer, setCachedAnswer } from './answer-cache.ts';
import { readRunnerSettings, type RunnerSettings } from './runner-settings.ts';

const ASK_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 30_000;

export interface ExecutionSnapshot {
  readonly requests: number;
  readonly totalTokens: number;
  readonly usageResponses: number;
  readonly budget: number;
  readonly phase: 'requesting' | 'retrying' | 'parsing' | 'cache' | 'idle';
  readonly pending: number;
  readonly retrying: number;
  readonly cacheHits: number;
}

export interface AnswerExecution {
  readonly settings: RunnerSettings;
  readonly snapshot: ExecutionSnapshot;
  readonly terminalError: string;
  readonly retryAt: number;
  startRequest(): boolean;
  finishRequest(tokens?: number): void;
  reportParsing(): void;
  setWaiting(waiting: boolean): void;
  reportCacheHit(): void;
  postpone(ms: number): void;
  stop(message: string): void;
}

export function createAnswerExecution(
  settings = readRunnerSettings(),
  onUpdate?: (snapshot: ExecutionSnapshot) => void,
): AnswerExecution {
  let requests = 0;
  let totalTokens = 0;
  let usageResponses = 0;
  let pending = 0;
  let retrying = 0;
  let cacheHits = 0;
  let terminalError = '';
  let retryAt = 0;
  const snapshot = (phase: ExecutionSnapshot['phase']): ExecutionSnapshot => ({
    requests, totalTokens, usageResponses, budget: settings.budget, phase, pending, retrying, cacheHits,
  });
  const idlePhase = (): ExecutionSnapshot['phase'] => pending > 0 ? 'requesting' : retrying > 0 ? 'retrying' : 'idle';
  const emit = (phase: ExecutionSnapshot['phase']): void => {
    try { onUpdate?.(snapshot(phase)); } catch { /* 显示异常不能中断作答 */ }
  };
  return {
    settings,
    get snapshot() { return snapshot(idlePhase()); },
    get terminalError() { return terminalError; },
    get retryAt() { return retryAt; },
    startRequest() {
      if (terminalError || (settings.budget > 0 && requests >= settings.budget)) return false;
      requests += 1;
      pending += 1;
      emit('requesting');
      return true;
    },
    finishRequest(tokens) {
      pending -= 1;
      if (tokens !== undefined && Number.isSafeInteger(tokens) && tokens >= 0) {
        totalTokens += tokens;
        usageResponses += 1;
      }
      emit(idlePhase());
    },
    reportParsing() { emit('parsing'); },
    setWaiting(waiting) {
      retrying += waiting ? 1 : -1;
      emit(idlePhase());
    },
    reportCacheHit() { cacheHits += 1; emit('cache'); },
    postpone(ms) { retryAt = Math.max(retryAt, Date.now() + ms); },
    stop(message) { terminalError = message; },
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

export interface AnswerOutcome {
  readonly qid: string;
  readonly answer: string;
  readonly requests: number;
  readonly samples: readonly (string | null)[];
  readonly error: string;
  readonly note?: string;
  readonly review?: boolean;
  readonly explanation?: string;
  readonly cached?: boolean;
  readonly unsupported?: boolean;
}

export interface AnswerOneOptions {
  readonly signal?: AbortSignal;
  readonly execution?: AnswerExecution;
  readonly force?: boolean;
  readonly onDebug?: (m: string) => void;
  readonly onWarn?: (m: string) => void;
  /** 重答时排除已经判错的答案，可参考此前其他有效票。 */
  readonly exclude?: string;
  readonly prior?: readonly string[];
  readonly maxRequests?: number;
}

export interface AnswerProgress {
  readonly index: number;
  readonly total: number;
  readonly question: ExamQuestion;
  readonly outcome: AnswerOutcome;
}

export interface AnswerOptions {
  readonly signal?: AbortSignal;
  readonly cfg: LlmConfig;
  readonly execution?: AnswerExecution;
  readonly force?: boolean;
  readonly concurrency?: number;
  readonly onProgress?: (ev: AnswerProgress) => void;
  readonly onDebug?: (msg: string) => void;
  readonly onWarn?: (msg: string) => void;
}

function shuffledTemplates(): PromptTemplate[] {
  const out = [...TEMPLATES];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface Vote {
  readonly answer: string;
  readonly explanation?: string;
}

function tally(votes: readonly Vote[]): { winner?: Vote; count: number; agreed: boolean } {
  const groups = new Map<string, { vote: Vote; count: number }>();
  for (const vote of votes) {
    const prev = groups.get(vote.answer);
    groups.set(vote.answer, { vote: vote.explanation ? vote : prev?.vote ?? vote, count: (prev?.count ?? 0) + 1 });
  }
  let best: { vote: Vote; count: number } | undefined;
  for (const group of groups.values()) {
    if (best === undefined || group.count > best.count) best = group;
  }
  const count = best?.count ?? 0;
  return { winner: best?.vote, count, agreed: count >= 2 && count * 2 > votes.length };
}

async function cacheKey(q: ExamQuestion, cfg: LlmConfig, settings: RunnerSettings): Promise<string> {
  const input = JSON.stringify([
    'answer-v1', chatUrl(cfg.baseUrl), cfg.profileId ?? '', cfg.model,
    cfg.responseFormat ?? 'text', settings.explain, settings.reviewModel,
    q.id, q.kind, q.typeText, q.stem, q.options, q.blankCount ?? 0,
  ]);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface AskResult {
  readonly vote: Vote | null;
  readonly requests: number;
  readonly error: string;
  readonly terminal: boolean;
}

function failurePolicy(err: unknown): { retry: boolean; wait?: number; global: boolean } {
  if (!(err instanceof LlmError)) {
    return { retry: err instanceof Error && (err.name === 'TimeoutError' || err instanceof TypeError), global: false };
  }
  if (err.category === 'config' || err.category === 'quota' || err.category === 'auth' ||
      err.category === 'not-found' || err.category === 'format') {
    return { retry: false, global: true };
  }
  const status = err.status;
  if (status !== undefined) {
    const retry = status === 408 || status === 425 || status === 429 || status >= 500;
    const wait = err.retryAfterMs;
    return { retry: retry && (wait ?? 0) <= MAX_BACKOFF_MS, wait, global: !retry || (wait ?? 0) > MAX_BACKOFF_MS };
  }
  return { retry: true, global: false };
}

async function waitBeforeRequest(execution: AnswerExecution, delay: number, signal?: AbortSignal): Promise<void> {
  const { requests, budget } = execution.snapshot;
  if (budget > 0 && requests >= budget) return;
  const until = Date.now() + delay;
  let remaining = Math.max(until, execution.retryAt) - Date.now();
  if (remaining <= 0 || execution.terminalError) return;
  execution.setWaiting(true);
  try {
    do {
      await sleep(remaining, signal);
      signal?.throwIfAborted();
      remaining = Math.max(until, execution.retryAt) - Date.now();
    } while (remaining > 0 && !execution.terminalError);
  } finally {
    execution.setWaiting(false);
  }
}

async function askOnce(
  question: ExamQuestion,
  cfg: LlmConfig,
  template: PromptTemplate,
  exclude: string,
  opts: AnswerOneOptions,
  execution: AnswerExecution,
  review = false,
): Promise<AskResult> {
  let requests = 0;
  let error = '';
  let delay = 0;
  const prompt = buildPrompt([question], template, exclude || undefined, cfg.responseFormat, execution.settings.explain);
  const images = cfg.vision === true ? question.images?.map(({ dataUrl }) => dataUrl) : undefined;
  for (let attempt = 0; attempt < (review ? 1 : ASK_ATTEMPTS); attempt += 1) {
    opts.signal?.throwIfAborted();
    await waitBeforeRequest(execution, delay, opts.signal);
    opts.signal?.throwIfAborted();
    if (!execution.startRequest()) {
      return { vote: null, requests, error: execution.terminalError || '本次作答已达到请求预算', terminal: true };
    }
    requests += 1;
    let tokens: number | undefined;
    try {
      const result = await chatDetailed(cfg, prompt, opts.signal, {
        ...(cfg.responseFormat === 'json' ? { responseFormat: 'json' } : {}),
        ...(images?.length ? { images } : {}),
      });
      const usage = result.usage;
      tokens = usage?.totalTokens ?? (
        usage?.promptTokens !== undefined && usage.completionTokens !== undefined
          ? usage.promptTokens + usage.completionTokens : undefined
      );
      opts.signal?.throwIfAborted();
      execution.reportParsing();
      const vote = parseModelAnswer(result.content, question);
      if (vote !== null && vote.answer !== exclude) return { vote, requests, error: '', terminal: false };
      error = vote === null ? '模型未返回有效答案格式' : '模型重复了已排除的答案';
      opts.onWarn?.(error);
      delay = 1000 * 2 ** attempt;
    } catch (err) {
      opts.signal?.throwIfAborted();
      error = err instanceof Error ? err.message : String(err);
      opts.onWarn?.(error);
      const policy = failurePolicy(err);
      if (policy.global && !review) execution.stop(error);
      if (!policy.retry) return { vote: null, requests, error, terminal: true };
      delay = Math.max(policy.wait ?? 0, 1000 * 2 ** attempt);
      if (err instanceof LlmError && (err.status === 429 || policy.wait !== undefined)) execution.postpone(delay);
    } finally {
      execution.finishRequest(tokens);
    }
  }
  return { vote: null, requests, error, terminal: false };
}

export async function answerOne(
  question: ExamQuestion,
  cfg: LlmConfig,
  opts: AnswerOneOptions = {},
): Promise<AnswerOutcome> {
  opts.signal?.throwIfAborted();
  const execution = opts.execution ?? createAnswerExecution();
  const { settings } = execution;
  const exclude = opts.exclude ?? '';
  const prior = opts.prior ?? [];
  const retryMode = exclude !== '' || prior.length > 0;
  const samples: (string | null)[] = [];
  let requests = 0;
  let error = '';
  const deliver = (fields: Partial<AnswerOutcome> = {}): AnswerOutcome => ({
    qid: question.id, answer: '', requests, samples, error, ...fields,
  });
  const issue = questionInputIssue(question, cfg.vision === true);
  if (issue !== null) return deliver({ unsupported: true, error: issue });

  let key: string | undefined;
  if (settings.cache && !retryMode && !question.images?.length) {
    try { key = await cacheKey(question, cfg, settings); } catch { /* 无摘要能力时照常请求 */ }
  }
  opts.signal?.throwIfAborted();
  const cached = key === undefined || opts.force ? undefined : getCachedAnswer(key);
  if (cached !== undefined) {
    execution.reportCacheHit();
    return deliver({ ...cached, cached: true, note: '使用当前页面缓存' });
  }

  const pool = shuffledTemplates();
  const votes: Vote[] = prior
    .filter((answer) => answer !== '' && answer !== exclude)
    .map((answer) => ({ answer }));
  const rounds = Math.max(1, Math.min(retryMode ? 2 : MAX_SAMPLES, opts.maxRequests ?? MAX_SAMPLES));
  let newVotes = 0;
  for (const template of pool.slice(0, rounds)) {
    const result = await askOnce(question, cfg, template, exclude, opts, execution);
    requests += result.requests;
    samples.push(result.vote?.answer ?? null);
    if (result.vote === null) {
      error = result.error;
      if (result.terminal) break;
      continue;
    }
    newVotes += 1;
    votes.push(result.vote);
    opts.onDebug?.(`模板「${template.label}」已获得有效答案`);
    const consensus = tally(votes);
    // 两次新答案一致可直接完成，出现分歧时继续收集票。
    if (newVotes >= 2 && consensus.count === votes.length) break;
    if (retryMode && consensus.agreed) break;
  }

  if (newVotes === 0) return deliver();
  const consensus = tally(votes);
  const winner = consensus.winner!;
  const note = `候选答案获得 ${consensus.count}/${votes.length} 票`;
  if (consensus.agreed) {
    if (key !== undefined) setCachedAnswer(key, { ...winner, samples: [...samples] });
    return deliver({ ...winner, note });
  }

  const model = settings.reviewModel;
  const template = TEMPLATES[0];
  if (new Set(votes.map((vote) => vote.answer)).size > 1 && model && model !== cfg.model && template !== undefined) {
    const result = await askOnce(question, { ...cfg, model }, template, exclude, opts, execution, true);
    requests += result.requests;
    samples.push(result.vote?.answer ?? null);
    if (result.vote !== null) {
      return deliver({ ...winner, review: true, note: `${note}，复核模型给出「${result.vote.answer}」` });
    }
    return deliver({ ...winner, review: true, note: `${note}，复核未完成`, error: result.error });
  }
  return deliver({ ...winner, review: true, note: `${note}，请人工核对` });
}

/** 并发作答，共享任务预算。结果按入参顺序返回。 */
export async function answerQuestions(
  questions: readonly ExamQuestion[],
  opts: AnswerOptions,
): Promise<AnswerOutcome[]> {
  const total = questions.length;
  const out = new Array<AnswerOutcome>(total);
  const execution = opts.execution ?? createAnswerExecution();
  const concurrency = Math.floor(opts.concurrency ?? 1) || 1;
  const workers = Math.min(total, 8, Math.max(1, concurrency));
  let cursor = 0;
  async function pump(): Promise<void> {
    for (;;) {
      opts.signal?.throwIfAborted();
      const index = cursor++;
      const question = questions[index];
      if (question === undefined) return;
      const outcome = await answerOne(question, opts.cfg, { ...opts, execution });
      opts.signal?.throwIfAborted();
      out[index] = outcome;
      opts.onProgress?.({ index, total, question, outcome });
    }
  }
  await Promise.all(Array.from({ length: workers }, pump));
  return out;
}

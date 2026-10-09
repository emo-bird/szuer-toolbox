/**
 * 「一道题 → 一个答案」的执行器：抽提示词模板 → 调模型 → 解析 → 投票。
 *
 * ## 抽签规则（用户 m01877 口径）
 *
 * **每题独立不放回**：每道题都从**完整 5 套池**里抽，抽过的在本题内不再用；
 * 答完一题池子重置 —— 下一道题还是全新的 5 套。
 * 这样同一道题的几次请求一定来自不同提示词（投票才有意义），
 * 又不会因为「前面用过直答」导致后面的题只能拿到剩下几套。
 *
 * ## 为什么要并发
 *
 * 一道题最坏要 4 次请求，一份卷子十几道题 ⇒ 串行会等到天荒地老。
 * 但并发太高又容易撞到服务商的速率限制（撞了就是 429，
 * 表现出来是「这道题没答出来」而不是「请求太密」——很难查）。
 * 所以并发数做成设置项，默认 1，别自己调高默认值。
 */

import { chat, type LlmConfig } from './llm.ts';
import { MAX_SAMPLES, majority, parseAnswers } from './parse.ts';
import { buildPrompt, TEMPLATES, type PromptTemplate } from './prompts.ts';
import type { ExamQuestion } from './paper.ts';

/**
 * 单次「请求 + 解析」失败后最多试几次 —— 用户口径「最多 3 次，含首次」。
 * **计数是本调用自己的**：同一道题的不同轮次各自从头数（「每轮独立计数」）。
 */
export const ASK_ATTEMPTS = 3;
/** 两次尝试之间固定等这么久 —— 用户口径「间隔 2 秒」，不做指数退避 */
export const ASK_RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


export interface AnswerOutcome {
  readonly qid: string;
  /** 定稿答案；空串 = 没答出来（解析失败或接口一直报错） */
  readonly answer: string;
  /** 实际发了几次请求 */
  readonly requests: number;
  /** 每次请求解析出的答案（含 null），日志用 */
  readonly samples: readonly (string | null)[];
  /** 最后一次出错的原因（没有错则是空串） */
  readonly error: string;
  /** 给监视页看的备注（目前只有重答模式会用：模型没听排除 / 重答成功） */
  readonly note?: string;
}

/** `answerOne` 的运行参数 */
export interface AnswerOneOptions {
  readonly onDebug?: (m: string) => void;
  readonly onWarn?: (m: string) => void;
  /**
   * 上一轮这道题的错误答案 —— 写进提示词里禁止模型再给这一个。
   * **只要传了就进入「重答模式」**（见 `maxRequests`）。
   */
  readonly exclude?: string;
  /**
   * 上一轮这道题的**投票记录**（取 `AnswerOutcome.samples` 里非 null 的那几个）。
   * 用户 m01884 Q6 口径：重答时把「上一轮其他投票」一起累进投票 ——
   * 先垫上这些票，再发请求，够了多数就收，不够再补 1 次。
   * ⚠️ 与 `exclude` 相等的那一票会被**滤掉**（见 `answerOne` 里的 `decided` 初始化）：
   * 不滤的话「上一轮那个错答案」票数天然最多，重答必然原样吐回来，等于没重答。
   */
  readonly prior?: readonly string[];
  /**
   * 最多请求几次。默认 `MAX_SAMPLES`（4，多数投票）；
   * 重答模式默认 **2**（用户 m01884 Q6 口径：「只请求一次，没有多数就再请求一次」）。
   */
  readonly maxRequests?: number;
  /**
   * 重答模式下，若模型没听排除（返回的答案仍等于 `exclude`），
   * 是否再补 **1** 次。默认 true；补发也只允许一次，防死循环。
   * ⚠️ 只在**没传 `prior`** 的老路径上才起作用；传了 `prior` 时轮数由 `maxRequests` 管。
   */
  readonly extraOnUnchanged?: boolean;
}

export interface AnswerProgress {
  readonly index: number;
  readonly total: number;
  readonly question: ExamQuestion;
  readonly outcome: AnswerOutcome;
}

export interface AnswerOptions {
  readonly cfg: LlmConfig;
  /** 同时答几道题；≤0 或不填按 1 */
  readonly concurrency?: number;
  readonly onProgress?: (ev: AnswerProgress) => void;
  /** 日志钩子（避免本模块直接依赖站点的日志作用域） */
  readonly onDebug?: (msg: string) => void;
  readonly onWarn?: (msg: string) => void;
}

/** 洗一副牌（Fisher-Yates，不改动入参） */
export function shuffledTemplates(): PromptTemplate[] {
  const out = [...TEMPLATES];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * 答一道题。返回 `AnswerOutcome`，**不抛异常** ——
 * 一道题失败不该拖垮整份卷子，剩下的题照答，失败的在日志和确认框里点名。
 *
 * ## 两种模式
 *
 * - **首答**（不传 `exclude`、也不传 `prior`）：抽 `MAX_SAMPLES`（4）套不同模板各问一次，
 *   `majority` 一旦能定案就提前返回。
 * - **重答**（传了 `prior`，或只传了 `exclude`）：
 *   先把上一轮这道题的投票（`prior`）**垫进累计票**（`exclude` 那一票被滤掉），
 *   然后**只发 1 次**请求，看累计票里哪个多；**没有多数就再补 1 次**
 *   —— 用户 m01884 Q6 原话：「把累计投票，上一轮其他投票也算进去，然后只请求一次，
 *   看哪个多，没有多数就再请求一次」。
 *
 * ## 单次请求的重试节奏（用户 m01815 口径）
 *
 * 走 `askOnce`：一次「请求 + 解析」失败（网络异常 / 解析不出答案）就**等 2 秒再来**，
 * 最多 3 次（含首次），**每轮独立计数**。60 秒单次超时由 `AI_TIMEOUT_MS` 管。
 */
export async function answerOne(
  question: ExamQuestion,
  cfg: LlmConfig,
  opts: AnswerOneOptions = {},
): Promise<AnswerOutcome> {
  const exclude = opts.exclude ?? '';
  const prior = opts.prior ?? [];
  const retryMode = exclude !== '' || prior.length > 0;
  const pool = shuffledTemplates();
  const samples: (string | null)[] = [];
  // 重答：先垫上上一轮的票（**滤掉那个被排除的错答案**）；首答：空手起家。
  // 滤除是必须的 —— 上一轮那个错答案的票数天然最多，不滤则重答等于复读。
  const decided: string[] =
    retryMode ? prior.filter((v) => v !== '' && v !== exclude) : [];
  let requests = 0;
  let lastError = '';
  let note: string | undefined;

  // 重答：默认「先发 1 次，没多数再补 1 次」（用户 m01884 Q6）；
  // 首答：最多 MAX_SAMPLES 次多数投票
  const hardMax = retryMode
    ? Math.max(1, Math.min(2, opts.maxRequests ?? 2))
    : Math.min(MAX_SAMPLES, pool.length);
  const deliver = (answer: string): AnswerOutcome => ({
    qid: question.id,
    answer,
    requests,
    samples,
    error: lastError,
    ...(note !== undefined ? { note } : {}),
  });

  // 重答模式下 `decided` 是**垫了旧票**的：旧票本身也可能已经够多数。
  // 即使如此也**先发满 1 次请求**再收 —— 用户口径是「只请求一次，看哪个多」。

  for (let round = 0; round < hardMax; round += 1) {
    const template = pool.pop();
    if (template === undefined) break;
    const ask = await askOnce(question, cfg, template, exclude, opts);
    requests += ask.requests;
    if (ask.error !== '') lastError = ask.error;

    // 请求失败与解析失败都不计入投票，但**要消耗一次机会**，
    // 否则接口一直 500 时这道题会无限重试。
    if (!ask.ok) {
      samples.push(null);
      continue;
    }
    samples.push(ask.parsed);

    decided.push(ask.parsed);
    const verdict = majority(decided);
    if (verdict.decided) {
      note = retryMode
        ? `重答：累计 ${decided.length} 票里「${verdict.answer}」占多数（共发 ${requests} 次请求）`
        : note;
      return deliver(verdict.answer);
    }
    // 老路径（只传 exclude、不传 prior）保留「模型没听就补 1 次」的语义 ——
    // 这条只在第一轮请求返回的答案仍等于被排除值时触发。
    if (
      retryMode &&
      prior.length === 0 &&
      (opts.extraOnUnchanged ?? true) &&
      round === 0 &&
      ask.parsed === exclude
    ) {
      continue;
    }
  }

  // 全部机会用尽：重答模式至少要吐出一个结果（哪怕是重复答案），
  // 否则「模型没听」会变成「这题没答案」，反而丢掉一个可能对的结果。
  if (retryMode) {
    // 大多数情况 `decided` 里已经有上一轮垫进来的票，直接取最后一票定稿
    const tailSample = decided[decided.length - 1];
    if (tailSample !== undefined) {
      note = `重答：没凑出多数，取累计 ${decided.length} 票里的最后一票「${tailSample}」`;
      return deliver(tailSample);
    }
    const last = samples.filter((s): s is string => s !== null).pop();
    if (last !== undefined) return deliver(last);
  }
  return deliver('');
}

/** `askOnce` 的返回：一次「请求 + 解析」的结果 */
interface AskResult {
  readonly ok: boolean;
  /** 解析出的答案；`ok === false` 时是空串 */
  readonly parsed: string;
  /** 这一轮实际发了几次请求（1..`ASK_ATTEMPTS`） */
  readonly requests: number;
  /** 最后一次失败的原因（成功时是空串） */
  readonly error: string;
}

/**
 * 发一次「请求 + 解析」，失败就**等 2 秒再来**，最多 `ASK_ATTEMPTS`（3）次。
 *
 * 用户 m01815 口径：「单次超时 60 秒；网络异常或格式读不出 ⇒ 间隔 2 秒重试，
 * 最多 3 次（含首次）」。60 秒超时由 `AI_TIMEOUT_MS`（默认 60000）在 `llm.ts` 里管，
 * 这里只管**失败后的重试节奏**。
 *
 * 计数是**本调用自己的**（`requests` 从 1 数起）—— 同一道题的不同轮次各自独立计数。
 */
async function askOnce(
  question: ExamQuestion,
  cfg: LlmConfig,
  template: PromptTemplate,
  exclude: string,
  opts: AnswerOneOptions,
): Promise<AskResult> {
  let requests = 0;
  let error = '';
  for (let attempt = 1; attempt <= ASK_ATTEMPTS; attempt += 1) {
    requests += 1;
    let text = '';
    try {
      text = await chat(cfg, buildPrompt([question], template, exclude === '' ? undefined : exclude));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      opts.onWarn?.(`第 ${attempt}/${ASK_ATTEMPTS} 次请求失败（模板 ${template.label}）：${error}`);
      if (attempt < ASK_ATTEMPTS) await sleep(ASK_RETRY_DELAY_MS);
      continue;
    }
    const parsed = parseAnswers(text, [question.kind])[0] ?? null;
    opts.onDebug?.(
      `模板「${template.label}」→ ${parsed === null ? '解析不出答案' : parsed}（原始回答：${text.trim().slice(0, 60)}）`,
    );
    if (parsed === null) {
      error = '解析不出答案';
      opts.onWarn?.(`第 ${attempt}/${ASK_ATTEMPTS} 次回答解析不出答案（模板 ${template.label}）`);
      if (attempt < ASK_ATTEMPTS) await sleep(ASK_RETRY_DELAY_MS);
      continue;
    }
    return { ok: true, parsed, requests, error: '' };
  }
  return { ok: false, parsed: '', requests, error };
}


/**
 * 并发跑一批任务，把结果按原顺序写回。
 * `limit` 会被夹在 1..8：上限是防呆，不是性能调优。
 */
async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  const size = Math.min(8, Math.max(1, Math.floor(limit)));
  let cursor = 0;

  async function pump(): Promise<void> {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      const item = items[i];
      if (item === undefined) return;
      out[i] = await worker(item, i);
    }
  }

  const lanes: Promise<void>[] = [];
  for (let i = 0; i < size; i += 1) lanes.push(pump());
  await Promise.all(lanes);
  return out;
}

/** 按顺序答完一整批题（结果下标与入参下标一致） */
export async function answerQuestions(
  questions: readonly ExamQuestion[],
  opts: AnswerOptions,
): Promise<AnswerOutcome[]> {
  const total = questions.length;
  return runPool(questions, opts.concurrency ?? 1, async (q, index) => {
    const outcome = await answerOne(q, opts.cfg, {
      ...(opts.onDebug !== undefined ? { onDebug: opts.onDebug } : {}),
      ...(opts.onWarn !== undefined ? { onWarn: opts.onWarn } : {}),
    });
    opts.onProgress?.({ index, total, question: q, outcome });
    return outcome;
  });
}

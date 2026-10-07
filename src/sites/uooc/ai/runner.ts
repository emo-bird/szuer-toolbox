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
 */
export async function answerOne(
  question: ExamQuestion,
  cfg: LlmConfig,
  hook: { onDebug?: (m: string) => void; onWarn?: (m: string) => void } = {},
): Promise<AnswerOutcome> {
  const pool = shuffledTemplates();
  const samples: (string | null)[] = [];
  const decided: string[] = [];
  let requests = 0;
  let lastError = '';

  const max = Math.min(MAX_SAMPLES, pool.length);
  for (let round = 0; round < max; round += 1) {
    const template = pool.pop();
    if (template === undefined) break;
    requests += 1;
    let text = '';
    try {
      text = await chat(cfg, buildPrompt([question], template));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      hook.onWarn?.(`第 ${requests} 次请求失败（模板 ${template.label}）：${lastError}`);
      // 解析失败与请求失败都不计入样本，但**要消耗一次机会**，
      // 否则接口一直 500 时这道题会无限重试。
      samples.push(null);
      continue;
    }

    const parsed = parseAnswers(text, [question.kind])[0] ?? null;
    samples.push(parsed);
    hook.onDebug?.(
      `模板「${template.label}」→ ${parsed === null ? '解析不出答案' : parsed}（原始回答：${text.trim().slice(0, 60)}）`,
    );
    if (parsed === null) continue;

    decided.push(parsed);
    const verdict = majority(decided);
    if (verdict.decided) {
      return { qid: question.id, answer: verdict.answer, requests, samples, error: lastError };
    }
  }

  return { qid: question.id, answer: '', requests, samples, error: lastError };
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

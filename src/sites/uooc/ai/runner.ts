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
   * 最多请求几次。默认 `MAX_SAMPLES`（4，多数投票）；
   * **重答模式传 1**（用户口径：重答只发 1 次请求）。
   */
  readonly maxRequests?: number;
  /**
   * 重答模式下，若模型没听排除（返回的答案仍等于 `exclude`），
   * 是否再补 **1** 次。默认 true；补发也只允许一次，防死循环。
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
 * - **首答**（不传 `exclude`）：抽 `MAX_SAMPLES`（4）套不同模板各问一次，
 *   `majority` 一旦能定案就提前返回。
 * - **重答**（传了 `exclude`，需求细则 §C.5.1）：上一轮这题答错了，只**再发 1 次**
 *   请求，并在提示词里禁掉上一轮那个答案（多选禁的是「组合」不是单个字母）。
 *   若模型没听（返回的仍是那个答案），默认再补 **1** 次 —— 补发也最多一次，防死循环。
 */
export async function answerOne(
  question: ExamQuestion,
  cfg: LlmConfig,
  opts: AnswerOneOptions = {},
): Promise<AnswerOutcome> {
  const exclude = opts.exclude ?? '';
  const retryMode = exclude !== '';
  const pool = shuffledTemplates();
  const samples: (string | null)[] = [];
  const decided: string[] = [];
  let requests = 0;
  let lastError = '';
  let note: string | undefined;

  // 重答：只发 1 次；首答：最多 MAX_SAMPLES 次多数投票
  const hardMax = retryMode
    ? Math.max(1, Math.min(2, opts.maxRequests ?? 1))
    : Math.min(MAX_SAMPLES, pool.length);
  // 重答默认允许「模型没听 → 补 1 次」
  const extraOnUnchanged = retryMode ? (opts.extraOnUnchanged ?? true) : false;
  const deliver = (answer: string): AnswerOutcome => ({
    qid: question.id,
    answer,
    requests,
    samples,
    error: lastError,
    ...(note !== undefined ? { note } : {}),
  });

  for (let round = 0; round < hardMax; round += 1) {
    const template = pool.pop();
    if (template === undefined) break;
    requests += 1;
    let text = '';
    try {
      text = await chat(cfg, buildPrompt([question], template, exclude === '' ? undefined : exclude));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      opts.onWarn?.(`第 ${requests} 次请求失败（模板 ${template.label}）：${lastError}`);
      // 解析失败与请求失败都不计入样本，但**要消耗一次机会**，
      // 否则接口一直 500 时这道题会无限重试。
      samples.push(null);
      continue;
    }

    const parsed = parseAnswers(text, [question.kind])[0] ?? null;
    samples.push(parsed);
    opts.onDebug?.(
      `模板「${template.label}」→ ${parsed === null ? '解析不出答案' : parsed}（原始回答：${text.trim().slice(0, 60)}）`,
    );
    if (parsed === null) continue;

    if (retryMode) {
      // 重答：不等投票 —— 拿到就是这轮的定稿（除非它跟被排除的一模一样）
      if (parsed !== exclude) {
        note = '重答：已给出与上一轮不同的答案';
        return deliver(parsed);
      }
      note = '重答：模型仍给出上一轮的答案';
      if (extraOnUnchanged && requests < 2) {
        // 再给它一次机会（只在 hardMax 允许第二轮时才有效）
        continue;
      }
      return deliver(parsed);
    }

    decided.push(parsed);
    const verdict = majority(decided);
    if (verdict.decided) return deliver(verdict.answer);
  }

  // 全部机会用尽：重答模式至少要吐出最后一次样本（哪怕是重复答案），
  // 否则「模型没听」会变成「这题没答案」，反而丢掉一个可能对的结果。
  if (retryMode) {
    const last = samples.filter((s): s is string => s !== null).pop();
    if (last !== undefined) return deliver(last);
  }
  return deliver('');
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

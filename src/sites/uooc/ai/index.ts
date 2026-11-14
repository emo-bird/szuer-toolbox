/**
 * AI 答题的总装。旧版课程页的测验是**页内同源 iframe**（需求细则 §C 修订，`a4536e4`），
 * 所以这里不跳转、不需要 tid 交接 —— 拉到题、往 iframe 的 DOM 里填、点站点自己的【提交】。
 *
 * ## 完整时间线（需求细则 §C）
 *
 * ```
 * 脚本：拉题（getTaskPaper）
 *   ↓ 逐题：问模型 → **一有答案立刻回填**（不等全部，用户 m04879 第 6 条）
 *   ↓ 页面上已经有答案的题：不请求，标「跳过」（第 7 条）
 *   ↓ 题号前铺【清除答案】、标题后铺【清除全部答案】（第 7 条）
 *   ↓ 全屏框「已填好 N 题，点【开始提交】」
 *   ↓ 用户点主按钮 → 框消失（先收遮罩！）→ 合成点击站点【提交】
 *   ↓ 截获 POST /exam/commit
 *        code == 1   → 通过，收工
 *        code == 110 → **没通过**：按 `score_list` 挑本次回填的低分题重答一轮，
 *                      有改动时由用户确认是否再次提交
 * ```
 *
 * ## ⚠️ 顺序不是随便排的：遮罩与验证码**不能共存**
 *
 * `sztb-modal-mask` 的 `z-index` 是 2147483002（`src/common/ui/style.css`），
 * 几乎顶到 2147483647；阿里云验证码弹窗挂在这之下。
 * 所以必须先收遮罩、**再**点提交 —— `showConfirm` 正好是「先 remove 遮罩再 resolve」。
 * **别把「点提交」挪进确认回调里**，那样遮罩和验证码会同时存在，人点不到验证码。
 *
 * ## 为什么只填不保存
 *
 * 用户 m03875 选 B：不点【保存试卷】（`vm.saveTask()`），确认后直接点【提交】
 * （`vm.commitTask()`）。所以这里永远不碰 `button.btn.btn-success`。
 */

import { scoped } from '../../../common/core/log.ts';
import { pageOrSelf } from '../../../common/utils/page.ts';
import type { PanelApi } from '../../types.ts';
import { installUoocIntercept, isCommitHttpOk, waitCommit, type CommitResult } from '../intercept.ts';
import {
  clearQuestion,
  fillAnswers,
  findSubmitButton,
  injectClearButtons,
  quizDomReady,
  readQuestionAnswer,
  type FillTarget,
} from './fill.ts';
import type { LlmConfig } from './llm.ts';
import { fetchPaper, isAnswerable, type ExamQuestion } from './paper.ts';
import { parseQuestionAnswer } from './parse.ts';
import { answerOne, answerQuestions, createAnswerExecution, type AnswerExecution, type AnswerOutcome } from './runner.ts';
import { monitorState, quizBegin, quizEnd, quizExecution, quizPatch, quizPhase, quizSetIncomplete } from './monitor.ts';
import { quizOverlayClose, quizOverlayOpen } from './overlay.ts';
import { playQuizAlertSound, prepareQuizAlertSound, watchVerificationPrompt } from './verification-notice.ts';
import { currentReview, loadReviewDraft, openReview, sameAnswer, sameReviewPaper, undoReviewAnswer, type QuizReview } from './review.ts';
import { aiConcurrency, aiConfig, waitTimeoutMs } from '../settings.ts';
import { noticePost } from '../notice.ts';
import { hasOpenVideoQuiz } from '../video-quiz.ts';

const log = scoped('uooc/ai');

/** 交卷后等站点回话的上限（用户还得手动点人机验证码，给足时间） */
const SUBMIT_WAIT_MS = 5 * 60 * 1000;

let activeRun: AbortController | null = null;
const runListeners = new Set<() => void>();

export function isQuizRunning(): boolean {
  return activeRun !== null;
}

export function stopQuizAnswer(): void {
  activeRun?.abort();
}

export function subscribeQuizRun(listener: () => void): () => void {
  runListeners.add(listener);
  return () => { runListeners.delete(listener); };
}

function notifyRun(): void {
  for (const listener of runListeners) {
    try { listener(); } catch (err) { log.warn('作答状态更新失败', err); }
  }
}

interface QuizRun {
  readonly signal: AbortSignal;
  readonly doc: Document;
  readonly frame: HTMLIFrameElement | null;
  checkPage(): void;
  isCurrentPage(): boolean;
  markSubmitted(): void;
}

type QuizIntent = 'draft' | 'submit' | { readonly ids: readonly string[] };

export async function applyReviewedAnswer(id: string, host: PanelApi): Promise<boolean> {
  const review = currentReview();
  const entry = review?.entries.get(id);
  if (review === null || entry?.suggestion === undefined || isQuizRunning()) return false;
  const q = entry.question;
  const suggestion = entry.suggestion;
  const before = readQuestionAnswer(id, q.kind, review.doc);
  if (before.some((value) => value.trim() !== '') && !sameAnswer(before, entry.applied ?? [])) {
    const ok = await host.confirm({
      title: '应用 AI 建议？',
      body: '这道题已有答案。确认将 AI 建议应用到页面。',
      confirmText: '应用',
    });
    if (!ok) return false;
  }
  if (currentReview() !== review || isQuizRunning() ||
    !sameAnswer(readQuestionAnswer(id, q.kind, review.doc), before)) return false;
  const result = fillAnswers([{ ...fillTargetFor(q, suggestion), preserveFilledBlanks: false }], review.doc);
  if (result.filled.length === 0) return false;
  if (entry.applied === undefined || !sameAnswer(entry.applied, before)) entry.original = before;
  entry.applied = readQuestionAnswer(id, q.kind, review.doc);
  quizPatch(id, { status: 'answered', answer: entry.applied.join(q.kind === 'blank' ? ' | ' : ','),
    incomplete: !isAnswerComplete(q, entry.applied), note: '已审核并应用' });
  return true;
}

export function undoReviewedAnswers(id?: string): number {
  const review = currentReview();
  if (review === null || isQuizRunning()) return 0;
  let restored = 0;
  for (const entry of review.entries.values()) {
    if (id !== undefined && entry.question.id !== id) continue;
    if (undoReviewAnswer(review, entry)) {
      restored += 1;
      const q = entry.question;
      quizPatch(q.id, { status: 'review', answer: entry.suggestion ?? '',
        incomplete: !isAnswerComplete(q, readQuestionAnswer(q.id, q.kind, review.doc)), note: '已恢复回填前的答案' });
    }
  }
  return restored;
}

export function markReviewedAnswer(id: string): boolean {
  const review = currentReview();
  const entry = review?.entries.get(id);
  if (review === null || entry === undefined || isQuizRunning()) return false;
  const q = entry.question;
  const values = readQuestionAnswer(id, q.kind, review.doc);
  if (!isAnswerComplete(q, values)) return false;
  quizPatch(id, { status: 'answered', answer: values.join(q.kind === 'blank' ? ' | ' : ','),
    incomplete: false, note: '已人工核对' });
  return true;
}

export interface AiQuizResult {
  readonly cancelled?: boolean;
  /** 卷面一共几道题 */
  readonly total: number;
  /** 页面上本来就有答案、我们没请求的题数 */
  readonly alreadyAnswered: number;
  /** 模型给出了答案的题数 */
  readonly answered: number;
  /** 成功回填进页面的题数 */
  readonly filled: number;
  /** 最后有没有点下去【提交】 */
  readonly submitted: boolean;
  /** 站点对最后一次提交的判读（截获不到就是 `null`） */
  readonly commit: CommitResult | null;
  /** 重答了几道题（一轮，最多 1 次/题） */
  readonly retried: number;
}

/** `A,C` → `['A','C']` */
function lettersOf(answer: string): string[] {
  return answer
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s !== '');
}

/**
 * 把一道题的答案包装成回填指令。
 *
 * 填空题走 `text`（原文，多空已用 `|` 分隔），选择题走 `letters` ——
 * 两套字段不混用，`fill.ts` 按 `kind` 分流（用户 m00107）。
 */
function fillTargetFor(q: ExamQuestion, answer: string): FillTarget {
  if (q.kind === 'blank') {
    return { qid: q.id, kind: q.kind, letters: [], text: answer, preserveFilledBlanks: true };
  }
  return { qid: q.id, kind: q.kind, letters: lettersOf(answer) };
}

/**
 * 从一个地址里取测验的 `tid`；取不到返回 null。
 *
 * 实测有**两种形状**，都要认（`local/uooc-flow-index.txt` 里两种都出现过）：
 *   - 路径形态 `/exam/736720049`   —— 旧版**页内 iframe** 走这条（用户 m05858 实测）
 *   - 查询形态 `/exam/paper?cid=2042342697&tid=736720049` —— 整页跳转走这条
 *
 * ⚠️ 相对地址（iframe 的 `src` 常写成 `/exam/1208164042`）要以当前页为基准解析。
 */
function tidFromLocation(href: string = location.href): string | null {
  let u: URL;
  try {
    u = new URL(href, location.href);
  } catch {
    return null;
  }
  const fromQuery = u.searchParams.get('tid');
  if (fromQuery !== null && fromQuery !== '') return fromQuery;
  const m = /^\/exam\/(\d{6,})\/?$/.exec(u.pathname);
  return m !== null && m[1] !== undefined ? m[1] : null;
}

/**
 * 当前所在页面上「那份试卷」的 `tid`。
 *
 * 旧版测验是**页内同源 iframe**（需求细则 §A.4），所以**先扫答题 iframe 的 `src`** ——
 * 这就是 §A.4 那句「不需要交接」的真意：tid 白写在 iframe 地址里，
 * 不用连播预先知道、也不用跨页面传递。扫不到再退一步看当前地址
 * （手动打开整页答题页时走这条）。
 */
export function quizTidOnPage(): string | null {
  for (const frame of document.querySelectorAll('iframe')) {
    const src = frame.getAttribute('src') ?? '';
    if (!src.includes('/exam/')) continue;
    const tid = tidFromLocation(src);
    if (tid !== null) return tid;
  }
  return tidFromLocation();
}

/**
 * 当前页面上那份试卷的 iframe —— **进度遮罩要盖的就是它**（`./overlay.ts`）。
 *
 * 手动打开整页答题页时没有 iframe，返回 `null`（那种情况就不盖遮罩）。
 */
function quizFrameOnPage(tid: string): HTMLIFrameElement | null {
  for (const frame of document.querySelectorAll('iframe')) {
    const src = frame.getAttribute('src') ?? '';
    if (src.includes('/exam/') && tidFromLocation(src) === tid) return frame;
  }
  return null;
}

async function waitForQuizDocument(
  tid: string,
  frame: HTMLIFrameElement | null,
  checkPage: () => void,
): Promise<Document> {
  const deadline = Date.now() + waitTimeoutMs();
  for (;;) {
    checkPage();
    const doc = frame === null ? document : frame.contentDocument;
    if (doc !== null && tidFromLocation(doc.URL) === tid && quizDomReady(doc)) return doc;
    if (Date.now() >= deadline) throw new Error('试卷还没加载完成，请打开试卷后重试');
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

function readAnswer(q: ExamQuestion, run: QuizRun): string[] {
  return readQuestionAnswer(q.id, q.kind, run.doc);
}

function isAnswerComplete(question: ExamQuestion, values: readonly string[]): boolean {
  return values.length > 0 && values.every((value) => value.trim() !== '') &&
    (question.kind !== 'blank' || !question.blankCount || values.length === question.blankCount);
}

function auditAnswers(questions: readonly ExamQuestion[], run: QuizRun): number {
  run.checkPage();
  const incomplete = new Set(questions.filter((q) => !isAnswerComplete(q, readAnswer(q, run))).map((q) => q.id));
  quizSetIncomplete(incomplete);
  return incomplete.size;
}

/** 把「没答出来」的原因汇总成一行，放进确认框与日志 */
function summarizeFailures(outcomes: readonly AnswerOutcome[]): string {
  const bad = outcomes.filter((o) => o.answer === '');
  if (bad.length === 0) return '';
  const reasons = new Set<string>();
  for (const o of bad) {
    if (o.error !== '') reasons.add(o.error);
  }
  const head = `有 ${bad.length} 道题没答出来`;
  if (reasons.size === 0) return `${head}（模型没给出能识别的答案格式）`;
  return `${head}：${[...reasons].join('；').slice(0, 200)}`;
}

/** 点站点【提交】并等它回话 */
async function submitAndRead(run: QuizRun): Promise<{ submitted: boolean; commit: CommitResult | null }> {
  run.checkPage();
  checkVideoQuizClosed();
  // ⚠️ 交卷是在**试卷 iframe** 里发出去的，而 iframe 有自己的 realm ——
  // 顶层那套装不上它。这里再补一次（幂等），确保点提交之前钩子一定在。
  const source = run.frame === null
    ? pageOrSelf()
    : run.frame.contentWindow as unknown as Record<string, unknown> | null;
  if (source === null) throw new Error('找不到当前试卷的提交环境');
  installUoocIntercept(source);
  // ⚠️ 到这里遮罩已经被 showConfirm 移除了，现在点提交，验证码才不会被我们自己的遮罩盖住。
  const btn = findSubmitButton(run.doc);
  if (btn === null) {
    const msg = '页面上找不到【提交】按钮，请自己点一下（答案已经填好了）';
    log.error(msg);
    noticePost(msg, 'warn');
    return { submitted: false, commit: null };
  }
  // 提交前保持试卷无遮罩，让站点验证码可以接收点击。
  quizPhase('submitting');
  log.info('已合成点击站点【提交】，接下来请手动完成人机验证码');
  const pending = waitCommit(SUBMIT_WAIT_MS, run.signal, source);
  const stopNotice = watchVerificationPrompt(run.doc, run.frame);
  let commit: CommitResult | null;
  try {
    btn.click();
    run.markSubmitted();
    commit = await pending;
  } finally {
    stopNotice();
  }
  run.checkPage();
  if (commit === null) log.warn('没截获到交卷响应（可能你还没点完验证码，或站点换了接口）');
  else log.info(`交卷判读：${commit.verdict}，得分 ${commit.score}/${commit.passScore}，msg=${commit.message}`);
  return { submitted: true, commit };
}

function checkVideoQuizClosed(): void {
  if (hasOpenVideoQuiz()) {
    throw new Error('请先关闭页面上的视频小测，再继续测验');
  }
}

/**
 * 从 `score_list` 里挑出「低分题」并重答一轮。
 *
 * 低分 = 该题得分 < 该题满分（满分取卷面 `score` 字段）。拿不到 `score_list`
 * 就**一道都不重答**（宁可少做，不可乱做 —— 重答要花用户的 API 额度）。
 *
 * @param previous 上一轮实际提交的答案（`qid → 'A,C'`），用来写进提示词做排除
 */
async function retryLowScore(
  commit: CommitResult,
  questions: readonly ExamQuestion[],
  previous: Map<string, string>,
  priorVotes: Map<string, readonly string[]>,
  cfg: LlmConfig,
  run: QuizRun,
  applied: Map<string, string[]>,
  review: QuizReview,
  execution: AnswerExecution,
): Promise<{ retried: number; changed: number }> {
  const lows: ExamQuestion[] = [];
  for (const q of questions) {
    if (!applied.has(q.id)) continue;
    const got = commit.scoreList[q.id];
    if (got === undefined) continue;
    const full = Number(q.score);
    const score = Number(got);
    if (Number.isFinite(full) && Number.isFinite(score) && score < full) lows.push(q);
  }
  if (lows.length === 0) {
    log.info('这次没过，但 score_list 里挑不出低分题（或没带分数），不重答');
    return { retried: 0, changed: 0 };
  }

  quizPhase('retrying', `未通过（得分 ${commit.score} / 门槛 ${commit.passScore}），重答 ${lows.length} 道低分题`);
  log.info(`未通过，重答 ${lows.length} 道低分题：${lows.map((q) => q.id).join(', ')}`);

  let changed = 0;
  let retried = 0;
  for (const q of lows) {
    run.checkPage();
    const before = applied.get(q.id);
    if (before === undefined || !sameAnswer(readAnswer(q, run), before)) continue;
    const exclude = previous.get(q.id) ?? '';
    // 用户 m01884 Q6：把上一轮这道题的**投票记录**一起带进去累计（不是只带最终答案）
    const prior = priorVotes.get(q.id) ?? [];
    quizPatch(q.id, { status: 'pending', note: '重答中…' });
    const o = await answerOne(q, cfg, {
      signal: run.signal,
      execution,
      onDebug: (m) => log.debug(m),
      onWarn: (m) => log.warn(m),
      ...(exclude === '' ? {} : { exclude }),
      prior,
      maxRequests: 2,
    });
    retried += 1;
    run.checkPage();
    const unchanged = sameAnswer(readAnswer(q, run), before);
    const entry = review.entries.get(q.id);
    if (entry !== undefined && o.answer !== '') entry.suggestion = o.answer;
    const r = o.answer !== '' && unchanged && !o.review
      ? fillAnswers([{ ...fillTargetFor(q, o.answer), preserveFilledBlanks: false }], run.doc)
      : null;
    const ok = (r?.filled.length ?? 0) > 0;
    quizPatch(q.id, {
      status: ok ? 'answered' : unchanged && !o.review ? 'failed' : 'review',
      answer: ok ? readAnswer(q, run).join(q.kind === 'blank' ? ' | ' : ',') : o.answer,
      requests: o.requests,
      samples: o.samples,
      explanation: o.explanation,
      citations: o.citations,
      note: unchanged ? (o.note ?? (ok ? '' : '重答未能回填')) : '页面答案已修改，请人工核对',
    });
    if (ok) {
      const after = readAnswer(q, run);
      if (!sameAnswer(before, after)) changed += 1;
      applied.set(q.id, after);
      if (entry !== undefined) entry.applied = after;
      previous.set(q.id, o.answer);
      // 这轮的票也要并进累计票，否则同一轮里再重答一次时又只剩一个孤零零的最终答案
      priorVotes.set(q.id, o.samples.filter((s): s is string => s !== null));
    }
  }
  return { retried, changed };
}

/**
 * 跑完整流程。**不抛异常** —— 出错就 toast + 日志，返回 null。
 *
 * @param tid  测验任务 id（= 资源里的 `task_id`）
 * @param host 面板 API（toast / confirm 都用它）
 */
export async function runQuizAnswer(
  tid: string,
  host: PanelApi,
  ownerSignal?: AbortSignal,
  intent?: QuizIntent,
): Promise<AiQuizResult | null> {
  prepareQuizAlertSound();
  if (activeRun !== null) {
    noticePost('已有 AI 作答正在运行', 'warn');
    return null;
  }
  const cfg = aiConfig();
  if (cfg === null && intent !== 'draft' && intent !== 'submit') {
    const msg = 'AI 作答未配置：请到【AI 作答】标签页填接口地址与模型名';
    quizBegin(tid, []);
    quizEnd(msg, 'error');
    host.activateTab('uooc:ai');
    return null;
  }
  const controller = new AbortController();
  const signal = ownerSignal === undefined
    ? controller.signal
    : AbortSignal.any([controller.signal, ownerSignal]);
  activeRun = controller;
  const href = location.href;
  const frame = quizFrameOnPage(tid);
  let boundDoc: Document | null = null;
  let submitted = false;
  const isCurrentPage = (): boolean => location.href === href && (
    frame === null || (frame.isConnected && tidFromLocation(frame.getAttribute('src') ?? '') === tid &&
      (boundDoc === null || frame.contentDocument === boundDoc))
  );
  const checkPage = (): void => {
    if (!isCurrentPage()) {
      controller.abort(new Error('试卷页面已切换，AI 作答已停止'));
    }
    signal.throwIfAborted();
  };
  const watch = setInterval(() => {
    try { checkPage(); } catch { /* 作答流程处理取消 */ }
  }, 200);
  notifyRun();
  try {
    if (intent === undefined || intent === 'draft') quizBegin(tid, []);
    checkVideoQuizClosed();
    boundDoc = await waitForQuizDocument(tid, frame, checkPage);
    return await runQuizAnswerBody(tid, host, cfg, {
      signal, doc: boundDoc, frame, checkPage, isCurrentPage,
      markSubmitted: () => { submitted = true; },
    }, intent, ownerSignal !== undefined);
  } catch (err) {
    const reason: unknown = signal.reason;
    const detail = signal.aborted
      ? (reason instanceof Error && reason.name !== 'AbortError' ? reason.message : 'AI 作答已停止')
      : `AI 作答失败：${err instanceof Error ? err.message : String(err)}`;
    const msg = submitted ? `${detail}。已点击过提交，请在站点核对结果。` : detail;
    log.warn(msg);
    const kind = signal.aborted ? 'warn' : 'error';
    if (monitorState().quiz === null) noticePost(msg, kind);
    else quizEnd(msg, kind);
    if (signal.aborted) {
      const quiz = monitorState().quiz;
      const filled = quiz?.questions.filter((question) => question.status === 'answered').length ?? 0;
      return { total: quiz?.total ?? 0, alreadyAnswered: 0, answered: filled,
        filled, submitted, commit: null, retried: 0, cancelled: true };
    }
    return null;
  } finally {
    clearInterval(watch);
    controller.abort();
    // 无论从哪条路出去（含提前 return 与抛错）都要把试卷遮罩收掉，否则会一直盖着
    quizOverlayClose();
    activeRun = null;
    notifyRun();
  }
}

async function runQuizAnswerBody(
  tid: string,
  host: PanelApi,
  cfg: LlmConfig | null,
  run: QuizRun,
  intent: QuizIntent | undefined,
  auto: boolean,
): Promise<AiQuizResult> {
  if (cfg !== null) log.info(`开始 AI 作答：tid=${tid}，模型=${cfg.model}`);
  const paper = await fetchPaper(tid, run.signal);
  run.checkPage();

  const all = paper.questions;
  const priorReview = currentReview();
  const preserve = intent !== undefined && intent !== 'draft' && priorReview?.doc === run.doc &&
    priorReview.tid === tid && sameReviewPaper(priorReview, all);
  if (intent !== undefined && intent !== 'draft' && !preserve) {
    throw new Error('试卷内容已变化，请重新读取试卷并核对答案');
  }
  const review = preserve ? priorReview : openReview(tid, run.doc, run.isCurrentPage, all);
  const initial = new Map(all.map((q) => [q.id, readAnswer(q, run)]));
  const already = all.filter((q) => isAnswerComplete(q, initial.get(q.id) ?? []));
  const alreadyIds = new Set(already.map((q) => q.id));
  const selected = typeof intent === 'object' ? new Set(intent.ids) : null;
  const todo = all.filter((q) => isAnswerable(q.kind) && (
    selected === null ? !alreadyIds.has(q.id) : selected.has(q.id)
  ));
  const skippedKind = all.filter((q) => !alreadyIds.has(q.id) && !isAnswerable(q.kind)).length;

  quizBegin(
    tid,
    all.map((q) => ({ id: q.id, typeText: q.typeText, hasAnswer: alreadyIds.has(q.id) })),
    preserve,
  );
  for (const q of already) {
    if (!preserve) quizPatch(q.id, { status: 'skipped', note: '页面上已有答案，不重复请求' });
  }
  for (const q of all) {
    if (!alreadyIds.has(q.id) && !isAnswerable(q.kind)) {
      quizPatch(q.id, { status: 'unsupported', note: '暂不支持此题型' });
    }
  }
  // 给试卷 iframe 盖上进度遮罩（用户 m02281 第 1 条）。拿不到 iframe（整页答题页）就跳过
  if (intent !== 'draft' && intent !== 'submit') quizOverlayOpen(run.frame, tid, stopQuizAnswer);

  log.info(
    `拿到 ${all.length} 道题：页面上已有答案 ${already.length} 道（跳过），` +
      `可自动作答 ${todo.length} 道，跳过 ${skippedKind} 道主观题`,
  );

  /** 我们实际填进去/提交的答案（重答时要拿它做排除） */
  const answers = new Map<string, string>();
  /** 每题上一轮的投票记录（`samples` 里非 null 的），重答时累进投票用（用户 m01884 Q6） */
  const priorVotes = new Map<string, readonly string[]>();
  /** 没答出来的那几道（确认框里点名） */
  const failures: AnswerOutcome[] = [];
  const applied = new Map<string, string[]>();
  const execution = createAnswerExecution(undefined, (snapshot) => {
    if (!run.signal.aborted) quizExecution(snapshot);
  });

  const recordAnswer = (question: ExamQuestion, outcome: AnswerOutcome): void => {
    run.checkPage();
    const entry = review.entries.get(question.id);
    if (outcome.answer !== '' && entry !== undefined) entry.suggestion = outcome.answer;
    if (outcome.answer === '') failures.push(outcome);
    const before = initial.get(question.id) ?? [];
    const same = sameAnswer(readAnswer(question, run), before);
    const hasCurrentAnswer = selected !== null && before.some((value) => value.trim() !== '');
    const needsReview = outcome.review === true || !same || hasCurrentAnswer;
    const report = outcome.answer === '' || needsReview
      ? null
      : fillAnswers([fillTargetFor(question, outcome.answer)], run.doc);
    const ok = (report?.filled.length ?? 0) > 0;
    const after = ok ? readAnswer(question, run) : [];
    if (ok) {
      answers.set(question.id, outcome.answer);
      if (entry !== undefined) {
        if (entry.applied === undefined || !sameAnswer(entry.applied, before)) entry.original = before;
        entry.applied = after;
      }
      if (question.kind !== 'blank' || before.every((value) => value.trim() === '')) applied.set(question.id, after);
      priorVotes.set(question.id, outcome.samples.filter((value): value is string => value !== null));
    }
    quizPatch(question.id, {
      status: ok ? 'answered' : outcome.unsupported ? 'unsupported' : needsReview ? 'review' : 'failed',
      answer: ok ? after.join(question.kind === 'blank' ? ' | ' : ',') : outcome.answer,
      requests: outcome.requests,
      samples: outcome.samples,
      explanation: outcome.explanation,
      citations: outcome.citations,
      cached: outcome.cached,
      note: !same || hasCurrentAnswer ? '保留了页面原答案，请核对建议'
        : outcome.note || outcome.error || (ok ? '' : '未能回填到当前试卷'),
    });
  };
  if (intent === 'draft') {
    const draft = await loadReviewDraft(review);
    run.checkPage();
    for (const question of all) {
      const saved = draft.get(question.id);
      if (saved === undefined || !isAnswerable(question.kind)) continue;
      const answer = parseQuestionAnswer(`1. ${saved}`, question);
      if (answer === null) continue;
      recordAnswer(question, { qid: question.id, answer, requests: 0, samples: [], error: '',
        note: '来自本机草稿', review: alreadyIds.has(question.id) });
    }
    if (draft.size === 0) quizEnd('没有找到与当前试卷匹配的草稿', 'warn');
    else quizPhase('reviewing', '已恢复草稿，请核对答案');
  } else if (cfg !== null && intent !== 'submit' && todo.length > 0) {
    const concurrency = aiConcurrency();
    quizPhase('answering', `并发 ${concurrency}`);
    log.info(`开始问模型（并发 ${concurrency}）…`);
    await answerQuestions(todo, {
      cfg,
      concurrency,
      execution,
      force: selected !== null,
      signal: run.signal,
      onDebug: (m) => log.debug(m),
      onWarn: (m) => log.warn(m),
      onProgress: ({ question, outcome }) => recordAnswer(question, outcome),
    });
  }

  // 清除按钮：点一下就把那一题的 DOM 答案清空（走 Angular ngModel，见 fill.ts）
  run.checkPage();
  const buttons = injectClearButtons({
    top: run.doc,
    onClearOne: (qid) => {
      if (currentReview() !== review || isQuizRunning()) return;
      const q = all.find((x) => x.id === qid);
      const how = clearQuestion(qid, q?.kind ?? 'other', run.doc);
      answers.delete(qid);
      applied.delete(qid);
      const entry = review.entries.get(qid);
      if (entry !== undefined) delete entry.applied;
      quizPatch(qid, { status: 'pending', answer: '', incomplete: true, note: '答案已清除' });
      refreshButtons();
      log.info(`清除第 ${qid} 题的答案（${how}）`);
    },
    onClearAll: () => {
      if (currentReview() !== review || isQuizRunning()) return;
      for (const q of all) {
        clearQuestion(q.id, q.kind, run.doc);
        answers.delete(q.id);
        applied.delete(q.id);
        const entry = review.entries.get(q.id);
        if (entry !== undefined) delete entry.applied;
      quizPatch(q.id, { status: 'pending', answer: '', incomplete: true, note: '答案已清除' });
      }
      refreshButtons();
      log.info('清除全部答案');
    },
  });
  const refreshButtons = (): void => { buttons.refresh(new Set(answers.keys())); };
  refreshButtons();

  const filled = answers.size;
  const pendingResult: AiQuizResult = { total: all.length, alreadyAnswered: already.length, answered: filled,
    filled, submitted: false, commit: null, retried: 0 };
  const incomplete = auditAnswers(all, run);
  const reportIncomplete = (count: number): void => {
    const message = `已检查 ${all.length} 道题，${count} 道为空或未填完整。请在【监视】定位并补齐后提交。`;
    quizPhase('reviewing', message);
    if (auto || intent === 'submit') noticePost(message, 'warn');
  };
  if (incomplete > 0) {
    reportIncomplete(incomplete);
    return pendingResult;
  }
  if (!auto && intent !== 'submit') {
    if (intent !== 'draft') quizPhase('reviewing', `已检查 ${all.length} 道题，全部已填写。请到【监视】核对答案，再决定是否提交`);
    return pendingResult;
  }
  const failure = summarizeFailures(failures);
  const reviewCount = monitorState().quiz?.questions.filter((q) => q.status === 'review').length ?? 0;
  const bodyLines = [
    `当前页面：${all.length}/${all.length} 道题已填完整。`,
  ];
  if (reviewCount > 0) bodyLines.push(`${reviewCount} 道题有待核对的建议。`);
  if (skippedKind > 0) bodyLines.push(`跳过 ${skippedKind} 道主观题（名词解释/问答/论述）。`);
  if (filled < todo.length) bodyLines.push(`有 ${todo.length - filled} 道没填进去（见【监视】页的逐题表）。`);
  if (failure !== '') bodyLines.push(failure);
  bodyLines.push('');
  bodyLines.push('点【开始提交】后，请手动完成站点验证码。验证成功后站点会继续提交，脚本会等待交卷结果。');
  bodyLines.push('未通过时，脚本可重答本次填入的低分题。再次提交前会请你确认。');

  checkVideoQuizClosed();
  quizPhase('confirming', `已填入 ${filled} 道，等你确认提交`);
  const confirmation = host.confirm({
    title: '答案已填好，确认提交？',
    body: bodyLines.join('\n'),
    danger: true,
    confirmText: '开始提交（会弹验证码）',
    cancelText: '再等等',
    signal: run.signal,
  });
  playQuizAlertSound('confirm');
  const confirmed = await confirmation;
  if (run.signal.aborted) buttons.remove();
  run.checkPage();

  if (!confirmed) {
    log.info('用户选择「再等等」，不提交。答案已填在页面上，你可以自己改');
    quizEnd('用户取消了提交，答案已填在页面上', 'warn');
    return {
      total: all.length,
      alreadyAnswered: already.length,
      answered: answers.size,
      filled,
      submitted: false,
      commit: null,
      retried: 0,
      cancelled: true,
    };
  }

  const remaining = auditAnswers(all, run);
  if (remaining > 0) {
    reportIncomplete(remaining);
    return pendingResult;
  }
  buttons.remove();
  const first = await submitAndRead(run);
  let commit = first.commit;
  let retried = 0;

  // 没通过 → 挑低分题重答一轮（只此一轮，避免无底洞）
  if (cfg !== null && commit !== null && isCommitHttpOk(commit) && commit.verdict === 'fail' && first.submitted) {
    const r = await retryLowScore(commit, all, answers, priorVotes, cfg, run, applied, review, execution);
    retried = r.retried;
    if (r.changed > 0) {
      const retryIncomplete = auditAnswers(all, run);
      if (retryIncomplete > 0) {
        reportIncomplete(retryIncomplete);
        return { ...pendingResult, submitted: true, commit, retried, cancelled: true };
      }
      checkVideoQuizClosed();
      quizPhase('confirming', `已修改 ${r.changed} 道题，等待你确认再次提交`);
      const reconfirmation = host.confirm({
        title: '确认再次提交？',
        body: `第一次未通过，已修改 ${r.changed} 道题。请确认是否再次提交。`,
        danger: true,
        signal: run.signal,
      });
      playQuizAlertSound('confirm');
      const resubmit = await reconfirmation;
      run.checkPage();
      if (resubmit) {
        const retryRemaining = auditAnswers(all, run);
        if (retryRemaining > 0) {
          reportIncomplete(retryRemaining);
          return { ...pendingResult, submitted: true, commit, retried, cancelled: true };
        }
        const again = await submitAndRead(run);
        if (again.submitted) commit = again.commit;
      } else {
        quizEnd('已取消再次提交，修改后的答案保留在页面上');
        return { total: all.length, alreadyAnswered: already.length, answered: answers.size,
          filled: answers.size, submitted: true, commit, retried, cancelled: true };
      }
    }
  }

  if (commit !== null) {
    const passed = isCommitHttpOk(commit) && commit.verdict === 'pass';
    quizEnd(
      passed
        ? `已通过（得分 ${commit.score}）`
        : !isCommitHttpOk(commit)
          ? `站点请求返回 HTTP ${commit.httpStatus}，请核对提交状态`
          : commit.verdict === 'fail'
          ? `仍未通过：${commit.message}`
          : `提交完成，但读不懂站点回话：${commit.message}`,
      passed ? 'success' : 'warn',
    );
  } else {
    quizEnd(first.submitted ? '已点击提交，站点结果未知' : '没有提交，请检查试卷上的提交按钮', 'warn');
  }

  return {
    total: all.length,
    alreadyAnswered: already.length,
    answered: answers.size,
    filled: answers.size,
    submitted: first.submitted,
    commit,
    retried,
  };
}

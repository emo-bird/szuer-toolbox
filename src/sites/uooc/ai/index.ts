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
 *        code == 110 → **没通过**：按 `score_list` 挑低分题重答一轮（每题只再发 1 次请求，
 *                      提示词里禁掉上一轮那个答案），再提交一次
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
import type { PanelApi } from '../../types.ts';
import { clearCommit, installUoocInterceptInFrames, waitCommit, type CommitResult } from '../intercept.ts';
import {
  clearQuestion,
  fillAnswers,
  findSubmitButton,
  injectClearButtons,
  isAnsweredInDom,
  type ClearButtonsHandle,
  type FillTarget,
} from './fill.ts';
import { chatUrl, type LlmConfig } from './llm.ts';
import { fetchPaper, isAnswerable, type ExamQuestion } from './paper.ts';
import { answerOne, answerQuestions, type AnswerOutcome } from './runner.ts';
import { quizBegin, quizClear, quizEnd, quizPatch, quizPhase } from './monitor.ts';
import { quizOverlayClose, quizOverlayOpen } from './overlay.ts';
import { aiConcurrency, aiConfig } from '../settings.ts';
import { noticePost } from '../notice.ts';

const log = scoped('uooc/ai');

/** 交卷后等站点回话的上限（用户还得手动点人机验证码，给足时间） */
const SUBMIT_WAIT_MS = 5 * 60 * 1000;

export interface AiQuizResult {
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
function quizFrameOnPage(): HTMLIFrameElement | null {
  for (const frame of document.querySelectorAll('iframe')) {
    const src = frame.getAttribute('src') ?? '';
    if (src.includes('/exam/') && tidFromLocation(src) !== null) return frame;
  }
  return null;
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
async function submitAndRead(): Promise<{ submitted: boolean; commit: CommitResult | null }> {
  // ⚠️ 交卷是在**试卷 iframe** 里发出去的，而 iframe 有自己的 realm ——
  // 顶层那套装不上它。这里再补一次（幂等），确保点提交之前钩子一定在。
  installUoocInterceptInFrames();
  // ⚠️ 到这里遮罩已经被 showConfirm 移除了，现在点提交，验证码才不会被我们自己的遮罩盖住。
  const btn = findSubmitButton();
  if (btn === null) {
    const msg = '页面上找不到【提交】按钮，请自己点一下（答案已经填好了）';
    log.error(msg);
    noticePost(msg, 'warn');
    return { submitted: false, commit: null };
  }
  // 丢掉上一条结果，否则 waitCommit 会立刻返回旧的那份响应
  clearCommit();
  // ⚠️ 这一行会**让试卷遮罩自动让开**（`overlay.ts` 里 `phase === 'submitting'` 就隐藏）——
  // 阿里云验证码是弹在试卷 iframe 里的，遮罩不让开就点不到它。别调换这两行的顺序。
  quizPhase('submitting');
  log.info('已合成点击站点【提交】，接下来请手动完成人机验证码');
  btn.click();
  const commit = await waitCommit(SUBMIT_WAIT_MS);
  if (commit === null) log.warn('没截获到交卷响应（可能你还没点完验证码，或站点换了接口）');
  else log.info(`交卷判读：${commit.verdict}，得分 ${commit.score}/${commit.passScore}，msg=${commit.message}`);
  return { submitted: true, commit };
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
): Promise<{ retried: number; filled: number }> {
  const lows: ExamQuestion[] = [];
  for (const q of questions) {
    const got = commit.scoreList[q.id];
    if (got === undefined) continue;
    const full = Number(q.score);
    const score = Number(got);
    if (Number.isFinite(full) && Number.isFinite(score) && score < full) lows.push(q);
  }
  if (lows.length === 0) {
    log.info('这次没过，但 score_list 里挑不出低分题（或没带分数），不重答');
    return { retried: 0, filled: 0 };
  }

  quizPhase('retrying', `未通过（得分 ${commit.score} / 门槛 ${commit.passScore}），重答 ${lows.length} 道低分题`);
  log.info(`未通过，重答 ${lows.length} 道低分题：${lows.map((q) => q.id).join(', ')}`);

  let filled = 0;
  for (const q of lows) {
    const exclude = previous.get(q.id) ?? '';
    // 用户 m01884 Q6：把上一轮这道题的**投票记录**一起带进去累计（不是只带最终答案）
    const prior = priorVotes.get(q.id) ?? [];
    quizPatch(q.id, { status: 'pending', note: '重答中…' });
    const o = await answerOne(q, cfg, {
      onDebug: (m) => log.debug(m),
      onWarn: (m) => log.warn(m),
      ...(exclude === '' ? {} : { exclude }),
      prior,
      maxRequests: 2,
    });
    quizPatch(q.id, {
      status: o.answer === '' ? 'failed' : 'answered',
      answer: o.answer,
      requests: o.requests,
      samples: o.samples,
      note: o.note ?? '',
    });
    if (o.answer === '') continue;
    const target: FillTarget = { qid: q.id, kind: q.kind, letters: lettersOf(o.answer) };
    const r = fillAnswers([target]);
    if (r.filled.length > 0) {
      filled += 1;
      previous.set(q.id, o.answer);
      // 这轮的票也要并进累计票，否则同一轮里再重答一次时又只剩一个孤零零的最终答案
      priorVotes.set(q.id, o.samples.filter((s): s is string => s !== null));
    }
  }
  return { retried: lows.length, filled };
}

/**
 * 跑完整流程。**不抛异常** —— 出错就 toast + 日志，返回 null。
 *
 * @param tid  测验任务 id（= 资源里的 `task_id`）
 * @param host 面板 API（toast / confirm 都用它）
 */
export async function runQuizAnswer(tid: string, host: PanelApi): Promise<AiQuizResult | null> {
  try {
    return await runQuizAnswerBody(tid, host);
  } finally {
    // 无论从哪条路出去（含提前 return 与抛错）都要把试卷遮罩收掉，否则会一直盖着
    quizOverlayClose();
  }
}

async function runQuizAnswerBody(tid: string, host: PanelApi): Promise<AiQuizResult | null> {
  const cfg: LlmConfig | null = aiConfig();
  if (cfg === null) {
    const msg = 'AI 作答未配置：请到【AI 作答】标签页填接口地址与模型名';
    log.error(msg);
    noticePost(msg, 'error');
    host.activateTab('uooc:ai');
    return null;
  }
  log.info(`开始 AI 作答：tid=${tid}，接口=${chatUrl(cfg.baseUrl)}，模型=${cfg.model}`);
  // 试卷 iframe 的 realm 要单独补装嗅探，否则交卷响应永远截获不到（见 intercept.ts）
  installUoocInterceptInFrames();
  quizClear();

  let paper;
  try {
    paper = await fetchPaper(tid);
  } catch (err) {
    const msg = `拉题失败：${err instanceof Error ? err.message : String(err)}`;
    log.error(msg);
    noticePost(msg, 'error');
    return null;
  }

  const all = paper.questions;
  const already = all.filter((q) => q.studentAnswer.length > 0 || isAnsweredInDom(q.id));
  const alreadyIds = new Set(already.map((q) => q.id));
  const todo = all.filter((q) => !alreadyIds.has(q.id) && isAnswerable(q.kind));
  const skippedKind = all.filter((q) => !alreadyIds.has(q.id) && !isAnswerable(q.kind)).length;

  quizBegin(
    tid,
    all.map((q) => ({ id: q.id, typeText: q.typeText, hasAnswer: alreadyIds.has(q.id) })),
  );
  for (const q of already) quizPatch(q.id, { status: 'skipped', note: '页面上已有答案，不重复请求' });
  // 给试卷 iframe 盖上进度遮罩（用户 m02281 第 1 条）。拿不到 iframe（整页答题页）就跳过
  quizOverlayOpen(quizFrameOnPage(), tid);

  log.info(
    `拿到 ${all.length} 道题：页面上已有答案 ${already.length} 道（跳过），` +
      `可自动作答 ${todo.length} 道，跳过 ${skippedKind} 道填空/主观题`,
  );

  /** 我们实际填进去/提交的答案（重答时要拿它做排除） */
  const answers = new Map<string, string>();
  /** 每题上一轮的投票记录（`samples` 里非 null 的），重答时累进投票用（用户 m01884 Q6） */
  const priorVotes = new Map<string, readonly string[]>();
  /** 没答出来的那几道（确认框里点名） */
  const failures: AnswerOutcome[] = [];
  let filled = 0;

  let buttons: ClearButtonsHandle = injectClearButtons({
    onClearOne: () => undefined,
    onClearAll: () => undefined,
  });
  const refreshButtons = (): void => {
    buttons.refresh(new Set(answers.keys()));
  };

  if (todo.length > 0) {
    const concurrency = aiConcurrency();
    quizPhase('answering', `并发 ${concurrency}`);
    log.info(`开始问模型（并发 ${concurrency}）…`);
    await answerQuestions(todo, {
      cfg,
      concurrency,
      onDebug: (m) => log.debug(m),
      onWarn: (m) => log.warn(m),
      onProgress: (ev) => {
        const { question, outcome } = ev;
        log.info(
          `[${ev.index + 1}/${ev.total}] ${question.typeText} ${question.id} → ${
            outcome.answer === '' ? '未答出' : outcome.answer
          }（${outcome.requests} 次请求）`,
        );
        // 逐题回填：一有答案立刻填这一题，不等整卷（用户 m04879 第 6 条）
        if (outcome.answer === '') {
          failures.push(outcome);
          quizPatch(question.id, {
            status: 'failed',
            requests: outcome.requests,
            samples: outcome.samples,
            note: outcome.error === '' ? '模型没给出可识别的答案' : outcome.error,
          });
          return;
        }
        const report = fillAnswers([
          { qid: question.id, kind: question.kind, letters: lettersOf(outcome.answer) },
        ]);
        const ok = report.filled.length > 0;
        if (ok) {
          filled += 1;
          answers.set(question.id, outcome.answer);
          priorVotes.set(
            question.id,
            outcome.samples.filter((s): s is string => s !== null),
          );
        }
        quizPatch(question.id, {
          status: ok ? 'answered' : 'failed',
          answer: outcome.answer,
          requests: outcome.requests,
          samples: outcome.samples,
          note: ok ? (outcome.note ?? '') : '模型答出来了，但页面里点不动这一题',
        });
        refreshButtons();
      },
    });
  }

  // 清除按钮：点一下就把那一题的 DOM 答案清空（走 Angular ngModel，见 fill.ts）
  buttons.remove();
  buttons = injectClearButtons({
    onClearOne: (qid) => {
      const q = all.find((x) => x.id === qid);
      const how = clearQuestion(qid, q?.kind ?? 'other');
      answers.delete(qid);
      refreshButtons();
      log.info(`清除第 ${qid} 题的答案（${how}）`);
    },
    onClearAll: () => {
      for (const q of all) {
        clearQuestion(q.id, q.kind);
        answers.delete(q.id);
      }
      refreshButtons();
      log.info('清除全部答案');
    },
  });
  refreshButtons();

  const failure = summarizeFailures(failures);
  const bodyLines = [
    `卷面 ${all.length} 道题：页面上本来就有答案 ${already.length} 道，模型作答并填入 ${filled} 道。`,
  ];
  if (skippedKind > 0) bodyLines.push(`跳过 ${skippedKind} 道（填空/主观题）。`);
  if (filled < todo.length) bodyLines.push(`有 ${todo.length - filled} 道没填进去（见【监视】页的逐题表）。`);
  if (failure !== '') bodyLines.push(failure);
  bodyLines.push('');
  bodyLines.push('点【开始提交】后脚本会点站点的提交按钮，接着会弹人机验证码，需要你手动点一下。');
  bodyLines.push('没通过的话，脚本会按分数挑低分题重答一轮（每题只再问 1 次），然后自动再提交一次。');

  quizPhase('filling', `已填入 ${filled} 道，等你确认提交`);
  const confirmed = await host.confirm({
    title: '答案已填好，确认提交？',
    body: bodyLines.join('\n'),
    danger: true,
    confirmText: '开始提交（会弹验证码）',
    cancelText: '再等等',
  });

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
    };
  }

  buttons.remove();
  const first = await submitAndRead();
  let commit = first.commit;
  let retried = 0;

  // 没通过 → 挑低分题重答一轮（只此一轮，避免无底洞）
  if (commit !== null && commit.verdict === 'fail' && first.submitted) {
    const r = await retryLowScore(commit, all, answers, priorVotes, cfg);
    retried = r.retried;
    filled += r.filled;
    if (r.retried > 0) {
      const again = await submitAndRead();
      commit = again.commit ?? commit;
    }
  }

  if (commit !== null) {
    const passed = commit.verdict === 'pass';
    quizEnd(
      passed
        ? `已通过（得分 ${commit.score}）`
        : commit.verdict === 'fail'
          ? `仍未通过：${commit.message}`
          : `提交完成，但读不懂站点回话：${commit.message}`,
      passed ? 'success' : 'warn',
    );
  } else {
    quizEnd('已点提交，但没截获到站点回话（可能验证码还没点完）', 'warn');
  }

  return {
    total: all.length,
    alreadyAnswered: already.length,
    answered: answers.size,
    filled,
    submitted: first.submitted,
    commit,
    retried,
  };
}

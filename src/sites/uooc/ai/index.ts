/**
 * AI 答题的总装：拉题 → 问模型 → 回填 DOM → 交卷前确认 → 点站点自己的【提交】。
 *
 * ## 完整时间线（需求细则 §D.1，用户 m01812 拍板）
 *
 * ```
 * 脚本：拉题 → 定答案 → 真实回填 DOM → 弹全屏框「已填好 N 题，点【开始提交】」
 *   ↓ 用户点主按钮
 * 框消失 → 合成点击站点【提交】→ 阿里云验证码弹出 → 用户点验证码
 *   ↓
 * 站点自己 commit → 页面跳转 → toast「已提交」
 * ```
 *
 * ## ⚠️ 顺序不是随便排的：遮罩与验证码**不能共存**
 *
 * `sztb-modal-mask` 的 `z-index` 是 2147483002（`src/common/ui/style.css:472`），
 * 几乎顶到 2147483647；阿里云验证码弹窗挂在这之下。
 * 所以必须先收遮罩、**再**点提交 —— `showConfirm` 正好是「先 remove 遮罩再 resolve」
 * （`src/common/ui/widgets/confirm.ts:29,29-31`），这个顺序是它保证的。
 * **别把「点提交」挪进确认回调里**，那样遮罩和验证码会同时存在，人点不到验证码。
 *
 * ## 为什么只填不保存
 *
 * 用户 m03875 选 B：不点【保存试卷】（`vm.saveTask()`），确认后直接点【提交】
 * （`vm.commitTask()`）。所以这里永远不碰 `button.btn.btn-success`。
 */

import { scoped } from '../../../common/core/log.ts';
import type { PanelApi } from '../../types.ts';
import {
  fillAnswers,
  findSubmitButton,
  isAnswerBoxVisible,
  waitForOptionInputs,
  type FillTarget,
} from './fill.ts';
import { consumeHandoff, type QuizHandoff } from './handoff.ts';
import { chatUrl, type LlmConfig } from './llm.ts';
import { fetchPaper, isAnswerable, type ExamQuestion } from './paper.ts';
import { answerQuestions, type AnswerOutcome } from './runner.ts';
import { aiConcurrency, aiConfig } from '../settings.ts';

const log = scoped('uooc/ai');

export interface AiQuizResult {
  /** 卷面一共几道题 */
  readonly total: number;
  /** 参与自动作答的题数（排除填空等） */
  readonly answerable: number;
  /** 模型给出了答案的题数 */
  readonly answered: number;
  /** 成功回填进页面的题数 */
  readonly filled: number;
  /** 最后有没有点下去【提交】 */
  readonly submitted: boolean;
}

/** `A,C` → `['A','C']` */
export function lettersOf(answer: string): string[] {
  return answer
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s !== '');
}

/** 从当前地址取测验的 `tid`；取不到返回 null（由调用方提示用户） */
export function tidFromLocation(href: string = location.href): string | null {
  try {
    const u = new URL(href);
    const tid = u.searchParams.get('tid');
    if (tid !== null && tid !== '') return tid;
    // 新版路径形如 /exam/983779533
    const m = /\/exam\/(\d{6,})/.exec(u.pathname);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
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

/**
 * 跑完整流程。**不抛异常** —— 出错就 toast + 日志，返回 null。
 *
 * @param tid  测验任务 id（= 资源里的 `task_id`）
 * @param host 面板 API（toast / confirm 都用它）
 */
export async function runQuizAnswer(tid: string, host: PanelApi): Promise<AiQuizResult | null> {
  const cfg: LlmConfig | null = aiConfig();
  if (cfg === null) {
    const msg = 'AI 作答未配置：请到【AI 作答】标签页填接口地址与模型名';
    log.error(msg);
    host.toast(msg, 'error');
    host.activateTab('uooc:ai');
    return null;
  }
  log.info(`开始 AI 作答：tid=${tid}，接口=${chatUrl(cfg.baseUrl)}，模型=${cfg.model}`);

  let paper;
  try {
    paper = await fetchPaper(tid);
  } catch (err) {
    const msg = `拉题失败：${err instanceof Error ? err.message : String(err)}`;
    log.error(msg);
    host.toast(msg, 'error');
    return null;
  }

  const answerable: ExamQuestion[] = paper.questions.filter((q) => isAnswerable(q.kind));
  const skipped = paper.questions.length - answerable.length;
  log.info(
    `拿到 ${paper.questions.length} 道题（可自动作答 ${answerable.length} 道，跳过 ${skipped} 道填空/主观题）`,
  );
  if (answerable.length === 0) {
    host.toast('这份卷子没有可自动作答的题目', 'warn');
    return null;
  }

  const concurrency = aiConcurrency();
  log.info(`开始问模型（并发 ${concurrency}）…`);
  const outcomes = await answerQuestions(answerable, {
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
    },
  });

  const targets: FillTarget[] = [];
  for (let i = 0; i < outcomes.length; i += 1) {
    const o = outcomes[i];
    const q = answerable[i];
    if (o === undefined || q === undefined || o.answer === '') continue;
    targets.push({ qid: q.id, kind: q.kind, letters: lettersOf(o.answer) });
  }

  // 回填前先确认页面上的题确实是这一批（题号对不上就不填，宁可不动）
  const report = fillAnswers(targets);
  log.info(
    `回填结果：成功 ${report.filled.length} 题，页面没找到 ${report.missing.length} 题，点不动 ${report.failed.length} 题`,
  );

  const failure = summarizeFailures(outcomes);
  const bodyLines = [
    `卷面 ${paper.questions.length} 道题：模型作答 ${targets.length} 道，已填入页面 ${report.filled.length} 道。`,
  ];
  if (skipped > 0) bodyLines.push(`跳过 ${skipped} 道（填空/主观题暂不支持自动作答）。`);
  if (report.missing.length > 0) bodyLines.push(`有 ${report.missing.length} 道在页面上没找到对应选项，未填入。`);
  if (failure !== '') bodyLines.push(failure);
  bodyLines.push('');
  bodyLines.push('点【开始提交】后脚本会点站点的提交按钮，接着会弹人机验证码，需要你手动点一下。');

  const confirmed = await host.confirm({
    title: '答案已填好，确认提交？',
    body: bodyLines.join('\n'),
    danger: true,
    confirmText: '开始提交（会弹验证码）',
    cancelText: '再等等',
  });

  if (!confirmed) {
    log.info('用户选择「再等等」，不提交。答案已填在页面上，你可以自己改');
    return {
      total: paper.questions.length,
      answerable: answerable.length,
      answered: targets.length,
      filled: report.filled.length,
      submitted: false,
    };
  }

  // ⚠️ 到这里遮罩已经被 showConfirm 移除了（confirm.ts:29），
  //    现在点提交，验证码才不会被我们自己的遮罩盖住。
  const btn = findSubmitButton();
  if (btn === null) {
    const msg = '页面上找不到【提交】按钮，请自己点一下（答案已经填好了）';
    log.error(msg);
    host.toast(msg, 'warn');
  } else {
    log.info('已合成点击站点【提交】，接下来请手动完成人机验证码');
    host.toast('已点提交，请完成人机验证码', 'info');
    btn.click();
  }

  return {
    total: paper.questions.length,
    answerable: answerable.length,
    answered: targets.length,
    filled: report.filled.length,
    submitted: btn !== null,
  };
}

// ------------------------------------------------------------------ 答题页入口

/** 交卷要等多久才放弃自动返回（用户还得手动点人机验证码，给足时间） */
const SUBMIT_WAIT_MS = 5 * 60 * 1000;

/** 等「已交卷」的结果 —— 三种都要区分开，因为它们的处置完全不同 */
export type SubmitWait =
  /** 站点自己把页面跳走了，**脚本别再插一脚** */
  | 'left'
  /** 看出来了：卷子已经交上去 */
  | 'done'
  /** 等超时，判不出来 */
  | 'timeout';

/**
 * 等「这一份卷子已经交上去了」这件事发生。
 *
 * 判据（按可靠性排序）：
 *  1. `location.pathname` 已经不在 `/exam/` 下 ⇒ 站点自己跳走了，返回 `left`；
 *  2. 【提交】按钮（`button.btn.btn-danger`，旧版整颗由 `vm.paper.can_do` 控制显隐）
 *     **消失**，并且答案解析区 `div.answerBox` **亮起来**
 *     （见 `fill.ts` 的 `isAnswerBoxVisible`，出处是已完成的实测快照）⇒ `done`；
 *  3. 超时 ⇒ `timeout`。
 *
 * ⚠️ 判据 2 是从实测快照里推出来的，**还没在真实交卷现场验证过**。
 *    它只决定「要不要自动跳回课程页」—— 判错最多是**不跳**，不会损坏任何东西。
 *    若实测不符，**只改这一个函数**。
 */
export function waitForSubmitted(
  timeoutMs: number = SUBMIT_WAIT_MS,
  intervalMs = 1000,
): Promise<SubmitWait> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = (): void => {
      if (!location.pathname.startsWith('/exam/')) {
        resolve('left');
        return;
      }
      if (findSubmitButton() === null && isAnswerBoxVisible()) {
        resolve('done');
        return;
      }
      if (Date.now() >= deadline) {
        resolve('timeout');
        return;
      }
      window.setTimeout(tick, intervalMs);
    };
    tick();
  });
}

export interface ExamAutoResult {
  readonly tid: string;
  /** `runQuizAnswer` 的结果；没跑到那一步就为 null */
  readonly quiz: AiQuizResult | null;
  /** 答完之后有没有把当前页换回课程页 */
  readonly returned: boolean;
}

/**
 * 答题页的自动作答入口 —— 由站点适配器在 `/exam/*` 页面上调用。
 *
 * ## 为什么答题页要单独一个入口
 *
 * 答题页是**整页跳转**过来的（不是 SPA 里的 hash 导航），学习页连同连播循环
 * 一起已经卸载了。所以「连播 → 答题 → 回课程页」这条链是**两个页面实例**接力：
 * 学习页跳转前用 `saveHandoff()` 记一笔（`handoff.ts`），这里 `consumeHandoff()`
 * 取出来，答完再跳回去。
 *
 * ## 两道闸（用户 m04227 选的是「只要 URL 带 tid 且 AI 开着就自动」）
 *
 *  1. **等卷子渲染出来**（`waitForOptionInputs`）—— AngularJS + 旧版 iframe 都是异步的，
 *     脚本一进页面就回填必然整卷 `missing`；
 *  2. **页面上得有【提交】按钮**（`findSubmitButton`）—— 它同时是「这份卷子还能不能交」
 *     的现场证据。已交过的卷子（复习页）没有它 ⇒ **不填、不交、不动**，
 *     这也是「URL 带 tid 就自动」这个宽松触发条件的安全阀。
 *
 * @param host 面板 API（toast / confirm 都用它）
 * @param tidArg 显式指定 tid；不传就从地址里取
 */
export async function autoAnswerExamPage(
  host: PanelApi,
  tidArg?: string,
): Promise<ExamAutoResult | null> {
  const tid = tidArg ?? tidFromLocation();
  if (tid === null) {
    log.warn('答题页地址里找不到 tid，不做自动作答');
    return null;
  }

  const handoff: QuizHandoff | null = consumeHandoff(tid);
  log.info(
    `答题页自动作答：tid=${tid}` +
      (handoff === null ? '（没有交接条，答完留在本页）' : `，答完回课程页 ${handoff.courseUrl}`),
  );

  if (!(await waitForOptionInputs())) {
    const msg = '答题页等了 20 秒还没渲染出选项，放弃自动作答（题型结构可能变了）';
    log.error(msg);
    host.toast(msg, 'warn');
    return { tid, quiz: null, returned: false };
  }

  if (findSubmitButton() === null) {
    // 没有提交按钮 = 卷子已经交过了（或者这一版按钮换了选择器）。
    // 往已交的卷子上填答案是纯副作用，所以这里**直接不动**。
    const msg = '页面上没有【提交】按钮：这份卷子可能已经交过了，不做自动作答';
    log.warn(msg);
    host.toast(msg, 'warn');
    return { tid, quiz: null, returned: false };
  }

  let quiz: AiQuizResult | null;
  try {
    quiz = await runQuizAnswer(tid, host);
  } catch (err) {
    // runQuizAnswer 号称不抛；真抛了也必须留下痕迹，不能静默
    const msg = `自动作答意外出错：${err instanceof Error ? err.message : String(err)}`;
    log.error(msg);
    host.toast(msg, 'error');
    return { tid, quiz: null, returned: false };
  }

  if (quiz === null || !quiz.submitted) {
    // 拉题失败，或用户在确认框里选了「再等等」⇒ 停在这里，不跳回课程页。
    // 交接条已经在 consumeHandoff 里消费掉了，不会留下「下次还被带回去」的隐患。
    return { tid, quiz, returned: false };
  }

  if (handoff === null) return { tid, quiz, returned: false };

  const signal = await waitForSubmitted();
  if (signal !== 'done') {
    log.warn(
      signal === 'left'
        ? '站点自己已经把页面跳走了，脚本不再插手'
        : `等了 ${SUBMIT_WAIT_MS / 60_000} 分钟没看出「已交卷」，不自动跳回课程页；交完卷自己回课程页即可`,
    );
    return { tid, quiz, returned: false };
  }

  log.info(`已交卷，把当前页换回课程页继续连播：${handoff.courseUrl}`);
  host.toast('已交卷，正在回到课程页继续连播', 'success');
  location.href = handoff.courseUrl;
  return { tid, quiz, returned: true };
}

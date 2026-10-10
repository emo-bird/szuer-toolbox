/**
 * UOOC【接管】—— **API 驱动**的连播主循环。
 *
 * 唯一口径：`docs/UOOC-API驱动连播-需求.md`。和旧 `autoplay.ts` 的根本区别：
 *
 * | | 旧（`autoplay.ts`） | 新（本文件） |
 * | --- | --- | --- |
 * | 怎么知道下一个去哪 | 点 DOM、看 `.active` / `.complete` 类名 | 一次 `getCatalogList` 拿整棵树，自己算 |
 * | 怎么跳 | `el.click()` + href 兜底 | `location.hash = ...`，让站点自己的路由接手 |
 * | 做完没做完 | 看 DOM 类名 | 重拉接口看 `finished`（§B.5） |
 *
 * DOM 在这里**只用来读**：等 `video` 元素、等 `ended`、等测验 iframe。
 * 一行都不去点。
 *
 * ⚠️ `waitFor` / 视频保底时长等「配套小工具」已拆到 `takeover-utils.ts`（C2 批2）；
 * 旧 `autoplay.ts` 已随清理删除（A2），这里不再有「有意重复」的问题。
 * 主循环与收尾在本文件，配套层在 utils —— 两边都不许碰对方的收尾/主循环。
 *
 * ## 停止条件（§D）
 *
 * 全部收敛到 `fatal()`：**全屏弹窗 + 停止接管**，等用户手动重开。
 * 唯一的例外是「测验读不出 tid」—— 只停 + 日志，不弹窗（§D 原话）。
 */

import { scoped } from '../../common/core/log.ts';
import { isEnabled } from '../../common/core/settings.ts';
import type { PanelApi } from '../types.ts';

import { sleep, gotoPoint, waitVideoEnd, taskLabel, publishProgress, pointLabel, VIEWER_SEL, type Task } from './takeover-utils.ts';
import { quizTidOnPage, runQuizAnswer, type AiQuizResult } from './ai/index.ts';
import { setCourseProgress } from './ai/monitor.ts';
import {
  courseIdFromLocation,
  firstUnfinished,
  firstUnfinishedSource,
  hashForSource,
  summarizeTaskPoints,
  type TaskPoint,
} from './catalog.ts';
import {
  describeFailure,
  fetchCatalogPoints,
  fetchUnitSources,
  type CatalogFailure,
} from './fetch-catalog.ts';
import { isCommitHttpOk, type CommitResult, type CommitVerdict } from './intercept.ts';
import { noticePost, type NoticeKind } from './notice.ts';
import { SITE_ID, TOGGLE, holdAfterMs, waitTimeoutMs } from './settings.ts';

const log = scoped('uooc/takeover');

// ------------------------------------------------------------- 常量

/**
 * 同一个任务点**连续**被挑中这么多次还没往下走 → 判定卡死，弹窗停下。
 *
 * 正常路径下**不该触发**（视频走完两轮直接 `fatal` 返回，跳过的点都进了
 * `skipped` 不会再被挑中）。留着是防「某条分支忘了 return」这类改错，
 * 免得变成整夜空转。
 */
const STUCK_LIMIT = 3;
/**
 * 测验最多重做几轮（含首次）—— 「未达标就要重做」（用户 2026-10-08 拍板）。
 *
 * 一轮 = 一次完整的 `runQuizAnswer`（它内部已经带「重答低分题再交一次」）。
 * 3 是**暂定值**，等实测（`docs/...-需求.md` §F.2）看到真实失分分布再调。
 */
const QUIZ_MAX_ROUNDS = 3;
/** 弹窗判重类名：同一个提醒同时只留一个遮罩 */
const ALERT_DEDUPE = 'sztb-uooc-takeover-alert';

const IDLE_TEXT = '已停止 —— 点【开始接管】从第一个未完成任务点接着走';

// 说明：VIEWER_SEL / POLL_MS / 视频保底时长（VIDEO_*）这几个与 DOM 等待相关的
// 常量已随配套层一起移到 takeover-utils.ts，本文件不再重复声明。

// ------------------------------------------------------------- 对外接口

export interface TakeoverStatus {
  readonly running: boolean;
  /** 状态行文字（【接管】页实时显示这个） */
  readonly text: string;
}

let running = false;
let statusText = IDLE_TEXT;
/** 本次运行的取消令牌；同时也是「只允许跑一个」的锁 */
let token: { cancelled: boolean } | null = null;
const listeners = new Set<() => void>();

/**
 * 「本次接管已经弹过一次致命弹窗」的守卫。
 *
 * `fatal` 是 async、且多路 `void fatal(...)`（循环内分支 + 顶层 catch），
 * 不加守卫会出现两条不同 fatal 依次调用：`dedupeClass` 只防了遮罩叠加，
 * 状态行 `statusText` 是 last-writer-wins，后到的会把先到的覆盖掉。
 * 这里保证**一次接管最多弹一条**；在「开始接管 / 停止接管」处复位
 * （不在 `release()` 里复位——`release()` 正是 `fatal` 自己调用的，放那里会立刻失效）。
 */
let fatalShown = false;

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* 订阅者自己出错不影响接管 */
    }
  }
}

function setStatus(text: string, kind: NoticeKind = 'info'): void {
  statusText = text;
  notify();
  // 状态行的每一句都同时进提示流（监视页顶部的历史 + 右上角 Toast），
  // 单一出口在 notice.ts；`kind` 决定 Toast 要不要常驻（warn/error 不自动消失）
  noticePost(text, kind);
}

export function takeoverStatus(): TakeoverStatus {
  return { running, text: statusText };
}

/** 订阅状态变化，返回退订函数（【接管】页靠 `root.isConnected` 退订） */
export function subscribeTakeover(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 开始接管。**立刻返回**，循环在后台跑 */
export function takeoverStart(host: PanelApi): void {
  if (running) {
    log.warn('接管已经在跑，这次【开始接管】被忽略');
    return;
  }
  // 新的一轮允许再弹一次致命弹窗
  fatalShown = false;
  const t = { cancelled: false };
  token = t;
  running = true;
  setStatus('接管中：正在读取课程目录…');
  void loop(host, t).catch((err) => {
    const detail = err instanceof Error ? err.message : String(err);
    log.error('接管循环异常退出', detail);
    // 循环自己抛出来的（不该发生）也要把面板解开，否则按钮会一直显示「停止」
    void fatal(host, `已停止 —— 接管内部出错：${detail}`, `接管循环抛了异常：\n\n${detail}`);
  });
}

/** 【停止接管】：立刻停，不等收尾 */
export function takeoverStop(): void {
  const t = token;
  if (t === null) return;
  t.cancelled = true;
  release();
  setStatus(IDLE_TEXT);
  // 这一轮已经收场，下次开始接管可再弹
  fatalShown = false;
}

// ------------------------------------------------------------- 收尾

/** 把「在跑」的状态收掉（不改状态行文字） */
function release(): void {
  running = false;
  token = null;
  setCourseProgress(null);
}

/** 正常停下（不弹窗） */
function stop(text: string): void {
  release();
  setStatus(text);
}

/**
 * 出事了：**全屏弹窗 + 停止接管**（§D）。
 *
 * 按钮只有一个【知道了】，点完就停在那儿 —— 不自动重开、不自动往下走。
 * 理由：这些条件都需要人看一眼才知道怎么办。
 */
async function fatal(host: PanelApi, status: string, body: string): Promise<void> {
  if (fatalShown) return;
  fatalShown = true;
  release();
  // `'warn'` 会让这条提示在右上角**常驻**（带「×」），错过了还能回头看
  setStatus(status, 'warn');
  log.warn(status);
  await host.alert({
    title: '接管已停止',
    body,
    danger: true,
    dedupeClass: ALERT_DEDUPE,
    actions: [{ key: 'ok', label: '知道了', variant: 'primary' }],
  });
}

/** 取课程目录失败 → 统一收尾文案（§E.6：共 3 次全失败才走到这里） */
async function fatalCatalog(host: PanelApi, failure: CatalogFailure, attempts: number): Promise<void> {
  const detail = describeFailure(failure);
  log.error(`取课程目录失败（已试 ${attempts} 次）：${detail}`);
  await fatal(
    host,
    '已停止 —— 读取课程目录失败',
    `连着试了 ${attempts} 次都没能拿到课程目录（间隔 2 秒、单次超时 30 秒）。\n\n` +
      `${detail}\n\n` +
      '多半是断网或登录态失效。处理完之后点【开始接管】重来。',
  );
}


// ------------------------------------------------------------- 主循环

interface Ctx {
  readonly host: PanelApi;
  readonly cid: string;
  /** 本次运行里「本站不自动处理、已跳过」的**节** id（节点级） */
  readonly skipped: Set<string>;
  /** 同上，但记的是**资源** id（资源级，§B.5 第二段） */
  readonly skippedSources: Set<string>;
  /** 未知类型只 warn 一次 */
  readonly warnedTypes: Set<string>;
  points: TaskPoint[];
}

/** 拉一次树；成功返回 true。失败时该弹的窗、该停的状态都已经处理好了 */
async function reload(ctx: Ctx, t: { cancelled: boolean }): Promise<boolean> {
  const res = await fetchCatalogPoints({ cid: ctx.cid, shouldAbort: () => t.cancelled });
  if (res.ok) {
    ctx.points = res.points;
    return true;
  }
  // 用户自己按的停止 —— 不是故障，什么也别弹
  if (res.failure.kind === 'aborted') return false;
  await fatalCatalog(ctx.host, res.failure, res.attempts);
  return false;
}

/** 某个任务点在最新的树里还是「未完成」吗（点没了也算不再拦路） */
async function loop(host: PanelApi, t: { cancelled: boolean }): Promise<void> {
  // ---- ① 这是哪门课 ----
  const cid = courseIdFromLocation(location.pathname, location.hash);
  if (cid === null) {
    stop('已停止 —— 认不出这是哪门课（地址栏里没有 cid）');
    log.warn(`认不出 cid：pathname=${location.pathname} hash=${location.hash}`);
    return;
  }

  const ctx: Ctx = {
    host,
    cid,
    skipped: new Set<string>(),
    skippedSources: new Set<string>(),
    warnedTypes: new Set<string>(),
    points: [],
  };

  // ---- ② 首次取树 ----
  const first = await fetchCatalogPoints({ cid, shouldAbort: () => t.cancelled });
  if (!first.ok) {
    if (first.failure.kind === 'aborted') return; // 用户按的停止
    await fatalCatalog(host, first.failure, first.attempts);
    return;
  }
  ctx.points = first.points;
  log.info(`课程 ${cid} 共 ${first.points.length} 个任务点`);

  if (first.points.length === 0) {
    stop('已停止 —— 这门课一个任务点都没有');
    return;
  }

  // ---- ③ 主循环 ----
  let lastNodeId = '';
  let stuck = 0;

  for (;;) {
    if (t.cancelled) return;

    const sum = summarizeTaskPoints(ctx.points);
    const section = firstUnfinished(ctx.points, ctx.skipped);
    publishProgress(ctx.points, sum, section);

    if (sum.done === sum.total) {
      release();
      setStatus('已停止 —— 全部任务点都完成了 🎉');
      log.info('全部任务点都完成了');
      return;
    }
    if (section === null) {
      // 剩下的全是本站不自动处理的（附件 / 讨论 / 形态不支持 / 资源全完成）
      stop(`已停止 —— 剩 ${sum.total - sum.done} 个任务点本站不自动处理，其余都完成了`);
      log.info(`没有可自动处理的节了，跳过 ${ctx.skipped.size} 个`);
      return;
    }

    stuck = section.nodeId === lastNodeId ? stuck + 1 : 1;
    lastNodeId = section.nodeId;
    if (stuck > STUCK_LIMIT) {
      await fatal(
        host,
        `已停止 —— 「${section.name}」连续 ${STUCK_LIMIT} 轮没有进展`,
        `同一节被连续挑中 ${STUCK_LIMIT} 次都没能往下走，判定为卡死。\n\n` +
          `位置：${pointLabel(section)}\n形态：${section.form}\n任务点个数：${section.taskCount}\n` +
          '这多半是本工具的 bug（而不是站点的问题），可以带着上面的信息反馈。',
      );
      return;
    }

    // ---- 形态不支持：**只 warn 一次、跳过**，绝不为它中断整轮 ----
    if (section.form === 'unsupported') {
      log.warn(`「${section.name}」(${section.nodeId}) 的路径形态不支持，已跳过`);
      ctx.skipped.add(section.nodeId);
      continue;
    }

    // ---- ② 资源级：这一节到底要打开哪一个（§B.5 第二段）----
    const unit = await fetchUnitSources({ cid, point: section, shouldAbort: () => t.cancelled });
    if (!unit.ok) {
      if (unit.failure.kind === 'aborted') return; // 用户按的停止
      await fatalCatalog(host, unit.failure, unit.attempts);
      return;
    }

    // ---- ③ 把这一节的资源**按顺序做完** ----
    // 2026-10-09 用户拍板：视频播完**不再重拉课程树核实**，直接接着做这一节里排在后头的
    // 那一个（通常是测验）。内层循环靠 `ctx.skippedSources` 记住「这一轮已经做过的资源」，
    // **不靠站点的 `finished`** —— 站点记账是滞后的，靠它必然空转或者把同一集重做一遍。
    let processed = 0;
    for (;;) {
      const target = firstUnfinishedSource(unit.sources, ctx.skippedSources);
      if (target === null) break;

      const kind: 'video' | 'quiz' = target.kind === 'video' ? 'video' : 'quiz';
      const task: Task = { point: section, source: target, hash: hashForSource(cid, section, target) };
      const label = taskLabel(task);
      setStatus(
        `接管中：${kind === 'video' ? '正在播放' : '正在作答'} ${label}（${sum.done}/${sum.total} 已完成）`,
      );

      if (kind === 'quiz') {
        // §C.2 / D1：交卷响应本身就是结论 —— **不拉树核实**
        const q = await handleQuiz(ctx, task, t);
        if (t.cancelled) return;
        if (!q.ok) return; // 内部已经 fatal() 或 stop() 过了
        if (q.verdict !== 'pass') {
          await fatal(
            host,
            `已停止 —— 测验「${label}」答了 ${q.rounds} 轮仍未通过`,
            `这个测验连着作答并提交了 ${q.rounds} 轮，站点每次都判没到及格线。\n\n` +
              `位置：${label}\n\n` +
              '去页面看一眼得分与及格线，再决定要不要点【开始接管】接着走。',
          );
          return;
        }
        processed += 1;
        // 通过之后同样记「已处理」：课程树这一轮不会再重拉，不记的话下一轮会把同一张卷再做一遍
        ctx.skippedSources.add(task.source.sourceId);
        continue;
      }

      const handled = await handleVideo(ctx, task, t);
      if (t.cancelled) return;
      if (!handled) return; // 内部已经 fatal() 或 stop() 过了

      // 播到底了（`handleVideo` 内部已经等过「播完后停留」）—— 记「已处理」，
      // 内层循环立刻挑这一节的下一个资源（通常就是测验），**不重拉课程树**
      processed += 1;
      ctx.skippedSources.add(task.source.sourceId);
    }

    if (processed === 0) {
      // 一个可做的都没有。两种来路：① 这一节压根没有 10/80 的任务点；
      // ② 视频/测验都完成了，只是站点的节点级汇总没跟上。
      // 无论哪种都**不能**在这儿空转，跳过它（也没必要为它重拉树：什么都没做）
      const taskSources = unit.sources.filter((s) => s.isTask);
      for (const s of unit.sources) {
        if (s.kind === 'unknown' && !ctx.warnedTypes.has(s.type)) {
          ctx.warnedTypes.add(s.type);
          log.warn(`遇到未知类型 ${s.type}（${s.typeName || '无名字'}），已跳过`);
        }
      }
      const reason =
        taskSources.length === 0
          ? '这一节没有本站能处理的任务点'
          : '这一节的视频/测验都已完成，但目录树仍标未完成（站点记账滞后）';
      log.warn(
        `跳过「${section.name}」(${section.nodeId})：${reason}` +
          `（资源 ${unit.sources.length} 个 / 任务点 ${taskSources.length} 个）`,
      );
      ctx.skipped.add(section.nodeId);
      continue;
    }

    // ---- ④ 这一节做完了：**重拉一次课程树** ----
    // 这是整轮接管里**唯一**会重拉的地方（用户 2026-10-09 拍板 C）。节点级 `finished`
    // 是资源级状态的汇总，所以「这一节都做完了」这一刻重拉，进度、终点判定与
    // 「下一个未完成的节」才会跟着往前走 —— 只在视频播完那一刻拉是查不出东西的。
    log.info(`「${section.name}」这一节处理了 ${processed} 个任务点，重拉课程树刷新进度`);
    if (!(await reload(ctx, t))) return;
    if (t.cancelled) return;
    // 重拉之后站点仍标这一节未完成 ⇒ 本轮不再挑它（防死循环）；
    // 记上了的话它本来就不会再被 `firstUnfinished` 挑中，这一句是幂等的
    if (ctx.points.find((p) => p.nodeId === section.nodeId)?.finished !== true) {
      log.warn(`「${section.name}」(${section.nodeId}) 做完了但站点仍标未完成，本轮先跳过它`);
      ctx.skipped.add(section.nodeId);
    }
  }
}

// ------------------------------------------------------------- 视频

/** @returns `false` = 已经收尾（停止 / 弹窗），调用方直接返回 */
async function handleVideo(ctx: Ctx, task: Task, t: { cancelled: boolean }): Promise<boolean> {
  const label = taskLabel(task);
  if (!(await gotoPoint(task.hash, 'video', label, t))) {
    if (t.cancelled) return false;
    // D1（用户拍板 a）：等不到预期元素 → 与测验同一套，弹窗 + 停
    await fatal(
      ctx.host,
      `已停止 —— 视频「${label}」等满等待超时也没出现播放器`,
      `跳到这一项之后，等了 ${Math.round(waitTimeoutMs() / 1000)} 秒都没等到播放器出现。\n\n` +
        `位置：${label}\n形态：${task.point.form}\n跳转地址：${task.hash}\n\n` +
        '如果是四级路径（`/subsection`）的项，那说明这套 hash 拼法没被站点认下来 —— ' +
        '这是新方案里**唯一没有实证**的地方，把上面那一行地址反馈给开发者。',
    );
    return false;
  }

  const box = document.querySelector<HTMLElement>(VIEWER_SEL);
  const video = box?.querySelector('video');
  if (video === undefined || video === null) {
    await fatal(
      ctx.host,
      `已停止 —— 视频「${label}」找到了播放器却拿不到 video 元素`,
      `内容区里出现了 \`div.showViewer\`，但里面取不到 \`<video>\`。多半是页面结构和预期不一致，请反馈。`,
    );
    return false;
  }

  // ⚠️ 视频是站点路由加载的，**是否自动开播取决于站点 + 浏览器自动播放策略**，
  // 实测「有概率停在 0:00 不播」（hash 跳转后站点没自己 play，或自动播放被拦）。
  // 接管既然把这一项导航进来了，就负责把它踢起来：只在「还没开始过」（暂停且几乎在 0 秒）
  // 时主动 play() 一次；已经在播、或播到一半再暂停的，交给 video.ts 的「防暂停」处理，这里不抢。
  if (video.paused && video.currentTime < 1) {
    try {
      const started = video.play();
      if (started !== undefined && typeof started.catch === 'function') {
        started.catch((err: unknown) => {
          log.warn(`视频「${label}」主动开播被拒绝：${err instanceof Error ? err.message : String(err)}`);
        });
      }
      log.info(`视频「${label}」未自动开播（停在 0:00），已主动 play() 一次`);
    } catch (err) {
      log.warn(`视频「${label}」主动 play() 抛错：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  log.info(`视频「${label}」开始等播完（当前 ${video.currentTime.toFixed(1)}s / ${String(video.duration)}s）`);
  const ended = await waitVideoEnd(video, t);
  if (t.cancelled) return false;
  if (!ended) {
    // 2026-10-09 用户拍板 A：**不假报成功**。原来这里靠「重拉树核实」兜住，
    // 那条路已经按用户要求删掉了 ⇒ 没等到 `ended` 就如实停下（红线：「没抛异常」≠「成功了」）
    const total = Number.isFinite(video.duration) ? `${video.duration.toFixed(1)}s` : '未知';
    await fatal(
      ctx.host,
      `已停止 —— 视频「${label}」没播到底`,
      `等着它播完，但一直没等到 \`ended\`（当前 ${video.currentTime.toFixed(1)}s / ${total}，` +
        `播放速率 ${video.playbackRate}x）。\n\n` +
        `位置：${label}\n\n` +
        '可能原因：播放被暂停（比如页面失焦且「防暂停」没开）、加载出错、或者它压根没在播。\n' +
        '去页面看一眼这一项现在的状态，再决定要不要点【开始接管】接着走。',
    );
    return false;
  }

  // §C.1 第 3 步：`ended` 之后等 HOLD_AFTER_MS（= 5000），站点上报完成状态需要时间
  await sleep(holdAfterMs(), t);
  return !t.cancelled;
}

// ------------------------------------------------------------- 测验

/**
 * 做测验。**「未达标就要重做」**（用户 2026-10-08 拍板）：
 * 交卷响应 `code == 110`（`verdict === 'fail'`，站点会带「您的得分是 N,
 * 测验分数至少要达到 M 分」）就重跑一轮，最多 `QUIZ_MAX_ROUNDS` 轮。
 *
 * @returns `ok === false` = 已经收尾（停止 / 弹窗），调用方直接返回；
 *          `ok === true` 时看 `verdict`：`'pass'` 进下一个任务点、`'fail'` 是
 *          答满 `QUIZ_MAX_ROUNDS` 轮仍未通过（由调用方收尾）
 */
/**
 * 测验这一支跑完之后的交代（§C.2 / §D，2026-10-09 用户拍板 D1）。
 *
 * **不再拿 `getCatalogList` 去核实**：交卷响应本身就是结论 ——
 * `code == 1` 就是完成了，`code == 110` 就是没完成，站点自己的 `finished`
 * 也是靠这次提交写的，再拉一次树纯属多此一举。
 */
interface QuizOutcome {
  /** `false` = 已经收尾（弹窗 + 停止），调用方直接返回 */
  readonly ok: boolean;
  readonly verdict: CommitVerdict | null;
  /** **实际**跑了几轮 —— 日志与弹窗一律用它，不许再写常量 */
  readonly rounds: number;
}

async function handleQuiz(ctx: Ctx, task: Task, t: { cancelled: boolean }): Promise<QuizOutcome> {
  const give = (ok: boolean, verdict: CommitVerdict | null, rounds: number): QuizOutcome => ({
    ok,
    verdict,
    rounds,
  });
  const label = taskLabel(task);
  // §C.2 / §F.1-6：AI 作答关着 → 与「等满超时」完全同一套处理，只有文案不同
  if (!isEnabled(SITE_ID, TOGGLE.AI_ANSWER)) {
    await fatal(
      ctx.host,
      `已停止 —— 测验「${label}」到了，但 AI 作答没开`,
      '走到测验了，但【AI 作答】开关是关着的。\n\n' +
        `位置：${label}\n\n` +
        '没有替你跳过：跳过等于在不知情的情况下漏掉一整个测验。\n' +
        '去【AI 作答】页把开关打开（顺便确认接口地址与模型名填好了），再点【开始接管】。',
    );
    return give(false, null, 0);
  }

  if (!(await gotoPoint(task.hash, 'quiz', label, t))) {
    if (t.cancelled) return give(false, null, 0);
    await fatal(
      ctx.host,
      `已停止 —— 测验「${label}」等满等待超时还没出题`,
      `跳到这一项之后，等了 ${Math.round(waitTimeoutMs() / 1000)} 秒，测验的题目一直没渲染出来。\n\n` +
        `位置：${label}\n跳转地址：${task.hash}\n\n` +
        '去页面看一眼这项到底是什么情况，再决定要不要点【开始接管】接着走。',
    );
    return give(false, null, 0);
  }

  // tid 优先读页面（页面里真正打开的那份才是要动的那份），
  // 页面上读不出来才退回 `getUnitLearn` 白给的 `task_id`（§B.5 第二段）。
  const fromPage = quizTidOnPage();
  const tid = fromPage ?? (task.source.taskId === '' ? null : task.source.taskId);
  if (tid === null) {
    // §D：这一条**只停 + 日志，不弹窗**
    stop(`已停止 —— 测验「${label}」读不出 tid`);
    log.warn(`测验「${label}」页面与接口都给不出 tid，无法作答`);
    return give(false, null, 0);
  }
  if (fromPage !== null && task.source.taskId !== '' && fromPage !== task.source.taskId) {
    log.warn(`测验「${label}」页面 tid=${fromPage} 与接口 tid=${task.source.taskId} 不一致，按页面的走`);
  }

  let last: CommitResult | null = null;
  let rounds = 0;

  for (let round = 1; round <= QUIZ_MAX_ROUNDS; round += 1) {
    if (t.cancelled) return give(false, null, rounds);
    rounds = round;
    setStatus(`接管中：正在作答 ${label}（第 ${round}/${QUIZ_MAX_ROUNDS} 轮）`);
    const result: AiQuizResult | null = await runQuizAnswer(tid, ctx.host);
    if (t.cancelled) return give(false, null, rounds);

    if (result === null) {
      // 没跑起来（模型没配 / 拉题失败）—— `runQuizAnswer` 自己已经 toast 过原因了
      stop(`已停止 —— 测验「${label}」没能开始作答（看日志与提示）`);
      log.warn(`runQuizAnswer 返回 null，测验「${label}」没跑起来`);
      return give(false, null, rounds);
    }

    const commit = result.commit;
    last = commit;

    // ① 压根没截获到交卷响应（§D：与「等满超时」同一套处理）
    if (commit === null) {
      await fatal(
        ctx.host,
        `已停止 —— 测验「${label}」没截获到交卷响应`,
        '点完提交之后没有读到站点的回话，所以无从判断过没过。\n\n' +
          `位置：${label}\n\n` +
          '可能原因：验证码还没点完、站点换了交卷接口、或者交卷请求不是从试卷 iframe 里发出来的。\n' +
          '去页面看一眼这次到底交上没有（有没有出现分数），再决定要不要点【开始接管】接着走。',
      );
      return give(false, null, rounds);
    }

    // ② 交卷这一发 HTTP 就没成功（用户 2026-10-09 拍板：非 200 一律弹窗）
    if (!isCommitHttpOk(commit)) {
      await fatal(
        ctx.host,
        `已停止 —— 测验「${label}」交卷请求返回 HTTP ${commit.httpStatus}`,
        `这一发 POST /exam/commit 的状态码是 ${commit.httpStatus}，不是 200，` +
          '响应体里的业务码不能当结论用。\n\n' +
          `位置：${label}\n站点回话：${commit.message || '（空）'}\n\n` +
          '去页面看一眼状态，过一会儿再点【开始接管】重试。',
      );
      return give(false, null, rounds);
    }

    if (commit.verdict === 'pass') {
      log.info(`测验「${label}」第 ${round} 轮通过（得分 ${commit.score}）`);
      return give(true, 'pass', rounds);
    }

    // ③ 站点给了不认识的 code —— **不擅自判定**，弹窗停下
    if (commit.verdict === 'unknown') {
      await fatal(
        ctx.host,
        `已停止 —— 测验「${label}」的交卷回话读不懂`,
        '站点回了一个我们不认识的业务码，不敢替你下结论（既不重做也不跳过）。\n\n' +
          `位置：${label}\n站点回话：${commit.message || '（空）'}\n` +
          `原始响应：${JSON.stringify(commit.raw).slice(0, 300)}\n\n` +
          '把上面这段贴回来，我们对一下新的判据。',
      );
      return give(false, null, rounds);
    }

    // verdict === 'fail'
    log.warn(
      `测验「${label}」第 ${round} 轮未通过：${commit.message}` +
        `（得分 ${commit.score} / 门槛 ${commit.passScore}）`,
    );
    if (round === QUIZ_MAX_ROUNDS) return give(true, 'fail', rounds);
    setStatus(`接管中：测验「${label}」第 ${round} 轮没过（得分 ${commit.score}），重做…`);
    // 重做前给站点一点时间落库，也让日志好读
    await sleep(holdAfterMs(), t);
  }

  return give(true, last === null ? null : last.verdict, rounds);
}

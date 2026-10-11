/**
 * UOOC【接管】的「配套层」：可被打断的等待、内容区判据（视频/测验）、跳转与标签/进度工具。
 *
 * 从 takeover.ts 拆出来的（docs/清理问题清单.md C2 批2）：这里**不碰退出层**
 * （fatal / stop / release 都在主文件），每项只返回「成不成 / 取消没取消」，由主文件决定怎么收尾。
 * 与旧 autoplay 的那份小工具是同一职责；旧文件已删后这里就是唯一的一份。
 */

import { scoped } from '../../common/core/log.ts';
import { waitBeforeMs, waitTimeoutMs } from './settings.ts';
import { quizTidOnPage } from './ai/index.ts';
import { quizDomReady } from './ai/fill.ts';
import { setCourseProgress } from './ai/monitor.ts';
import { buildCourseRows, SOURCE_NAME, type TaskPoint, type TaskPointSummary, type TaskSource } from './catalog.ts';

const log = scoped('uooc/takeover-utils');

// ------------------------------------------------------------- 常量

/** 内容区（video / iframe 都挂在这里面） */
export const VIEWER_SEL = 'div.showViewer';
/** 轮询 / 取消检查的最小间隔 */
const POLL_MS = 200;
/** 视频保底超时（与旧 autoplay 同一套） */
const VIDEO_SLACK_MS = 10 * 60 * 1000;
const VIDEO_MIN_MS = 5 * 60 * 1000;
const VIDEO_MAX_MS = 6 * 60 * 60 * 1000;

// ------------------------------------------------------------- 小工具

/** 可被打断的 sleep */
export function sleep(ms: number, t: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    if (t.cancelled || ms <= 0) {
      resolve();
      return;
    }
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.clearInterval(iv);
      resolve();
    };
    const timer = window.setTimeout(finish, ms);
    const iv = window.setInterval(() => {
      if (t.cancelled) finish();
    }, POLL_MS);
  });
}

/** 等到 `pred()` 为真；超时或被停止都返回 false（靠 `t.cancelled` 区分） */
async function waitFor(
  pred: () => boolean,
  timeoutMs: number,
  t: { cancelled: boolean },
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (t.cancelled) return false;
    if (pred()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS, t);
  }
}

/** 内容区里视频 / iframe 的「身份指纹」，用来判断**换了内容**而不是旧内容还在 */
function viewerSignature(): string {
  const box = document.querySelector<HTMLElement>(VIEWER_SEL);
  if (box === null) return '';
  const parts: string[] = [];
  box.querySelectorAll('video').forEach((v) => parts.push(`v:${v.getAttribute('src') ?? ''}`));
  box.querySelectorAll('iframe').forEach((f) => parts.push(`i:${f.getAttribute('src') ?? ''}`));
  return parts.join('|');
}

/**
 * 目标内容出现了吗。
 *
 * ⚠️ 光有 `video` / `iframe` **不够**：站点换路由时内容区是异步替换的，
 * 上一项的视频可能还挂在那儿几百毫秒。所以调用方还要比 `viewerSignature()`，
 * 见 `gotoPoint()`。
 *
 * ⚠️ **2026-10-09 第六份反馈**：测验过去只看「iframe 出现 + 地址里有 tid」，等于没看
 * 题目渲染了没有 ⇒ 网络差时答案先到、选项后到，**一道都填不上**。现在多一道
 * `quizDomReady()`（每个 `div.queContainer` 里都已经有选项控件或文本框）。
 */
function viewerReady(kind: 'video' | 'quiz'): boolean {
  const box = document.querySelector<HTMLElement>(VIEWER_SEL);
  if (box === null) return false;
  if (kind === 'video') return box.querySelector('video') !== null;
  // 测验：iframe 出现 **+** 地址里能读出 tid（§C.2）**+ 题目 DOM 真的渲染出来了**
  if (box.querySelector('iframe') === null) return false;
  if (quizTidOnPage() === null) return false;
  return quizDomReady();
}

/**
 * 跳到某个具体资源，并等内容真的换过来。
 *
 * ⚠️ `hash` 是**资源级**的地址（`hashForSource()` 算出来的），不是
 * `point.primaryHash` —— 一个节可以挂好几个任务点。
 *
 * @returns `true` = 目标内容已就绪；`false` = 等满了全局等待超时（调用方按 §D 处理）
 */
export async function gotoPoint(
  hash: string,
  kind: 'video' | 'quiz',
  label: string,
  t: { cancelled: boolean },
): Promise<boolean> {
  const needsChange = location.hash !== hash;
  const before = needsChange ? viewerSignature() : '';
  if (needsChange) {
    log.info(`跳转 ${hash}`);
    location.hash = hash;
  } else {
    log.debug(`已经在这一项上了（${hash}），不再改 hash`);
  }

  // §E.3：`WAIT_BEFORE_MS` = 改完 hash 后、开始等元素出现之前的固定 sleep
  await sleep(waitBeforeMs(), t);
  if (t.cancelled) return false;

  const ok = await waitFor(() => {
    if (!viewerReady(kind)) return false;
    // 要求「内容确实换了」——同一个点重入时 `needsChange` 为 false，不比较
    return !needsChange || viewerSignature() !== before;
  }, waitTimeoutMs(), t);

  if (ok) log.info(`内容已就绪：${label}`);
  return ok;
}

/** 等视频播完（听 `ended`）。返回是否真的播到底 */
export function waitVideoEnd(video: HTMLVideoElement, t: { cancelled: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    if (video.ended) {
      resolve(true);
      return;
    }
    const rate = video.playbackRate > 0 ? video.playbackRate : 1;
    const remaining = Number.isFinite(video.duration) ? (video.duration - video.currentTime) / rate : 0;
    const budget = Math.min(VIDEO_MAX_MS, Math.max(VIDEO_MIN_MS, remaining * 1000 + VIDEO_SLACK_MS));

    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.clearInterval(iv);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      resolve(ok);
    };
    const onEnded = (): void => finish(true);
    const onError = (): void => finish(false);
    const timer = window.setTimeout(() => finish(video.ended), budget);
    const iv = window.setInterval(() => {
      if (t.cancelled) finish(false);
    }, POLL_MS);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
  });
}

/** 给人看的位置，如 `第 2 章 第 3 节「1.3 绪论」` */
export function pointLabel(point: TaskPoint): string {
  const parts = point.path.filter((s) => s !== '');
  const tail = point.name === '' ? '' : `「${point.name}」`;
  const head = parts.length === 0 ? '' : parts.join(' ');
  return `${head}${tail}` === '' ? point.typeName || point.nodeId : `${head}${tail}`;
}

/**
 * 一个**真·待办项**：节点层的一节 + 这一节里具体哪个资源（§B.5 两段式）。
 *
 * 为什么非要两个字段：站点把「完成状态」分成两层 —— 节点的 `finished` 是**汇总**，
 * 逐资源的状态只有 `getUnitLearn` 有。只拿节点会认错（视频已经打勾了、但同一节里
 * 还有个测验没做，节点级就仍是未完成）。
 */
export interface Task {
  /** 节点层：这一节（`finished` 是汇总，判断「还要不要做」用节点级） */
  readonly point: TaskPoint;
  /** 资源层：这一节里第一个没做完的**真任务点**（视频 / 测验） */
  readonly source: TaskSource;
  /** 资源级跳转地址（`hashForSource()` 算好的） */
  readonly hash: string;
}

/** 给日志/状态行看的名字：节名 + 资源名，如 `…「1.3 绪论」 · 视频` */
export function taskLabel(task: Task): string {
  const head = pointLabel(task.point);
  const fallback = SOURCE_NAME[task.source.type] ?? '';
  const name = task.source.name === '' ? fallback : task.source.name;
  return name === '' ? head : `${head} · ${name}`;
}

/** 进度推给【监视】页顶部那块（§E.2） */
export function publishProgress(points: readonly TaskPoint[], sum: TaskPointSummary, current: TaskPoint | null): void {
  const label = current === null ? '' : pointLabel(current);
  setCourseProgress({
    index: sum.done,
    total: sum.total,
    label,
    rows: buildCourseRows(points),
    currentId: current === null ? null : current.nodeId,
  });
}

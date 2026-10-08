/**
 * UOOC **旧版**课程页的自动连播 —— **全程模拟用户点击，实时从 DOM 取下一步该点哪儿**。
 *
 * ## 与旧实现的关系
 *
 * 旧实现是「请求驱动」的：先用 `getCatalogList` / `getUnitLearn` 把整棵树拉下来，
 * 自己算出下一个叶子，再合成 URL 跳过去（还要靠 `handoff` 把 tid 交接给答题页）。
 * 用户 m04485 明确否掉了这条路：**忘掉各种检测方案、接续方案，全程模拟用户点击，
 * 一个一个点开**；点开之后再看当前页是什么，据此决定下一步。
 *
 * 所以这一版：
 *  - **不发任何自己的请求**（目录/资源清单全部从 DOM 读）；
 *  - **不拼 URL、不交接**（点 `div.basic` 就走，`href` 只作兜底）；
 *  - 起点是站点自己标出的当前项（`.active`），**没有 `.active` 就停下等用户点**，
 *    绝不自己猜「第一个未完成的」。
 *
 * ## 目录 DOM 的三条硬约束（`local/capture/uooc-domskel-旧.txt` + `dom-uooc-catalog-旧.txt`）
 *
 * 1. **懒渲染**：`ul.rank-2`（小节）只在「当前章」下渲染，`div.resourcelist`（资源）
 *    只在「当前节」下渲染 ⇒ **想点下一章必须先把它点开、等 DOM 出来**。
 * 2. `.active` 是站点给的当前项信号（章 / 节 / 资源三层都有），**这就是唯一的真相来源**。
 * 3. `complete` 只在 `source.finished == 1 && source.is_task == 1` 时挂 ⇒
 *    普通视频可能**永远没有**完成标记，所以「看得到 `.complete` 就跳过、
 *    看不到就老老实实播到底」（用户拍板）。
 *
 * ## 怎么知道一个资源是什么类型
 *
 * 资源行里有一颗类型图标：`<span class="tag-source-ico iconfont icon-video"
 * ng-if="source.type == 10">`（`dom-uooc-catalog-旧.txt:142`）。
 * **`ng-if` 里的 `source.type == NN` 就是站点自己的类型号**，比猜图标类名可靠得多；
 * 图标类名只作兜底。类型号到 `SourceKind` 的映射走 `catalog.ts` 的 `classifySource`。
 *
 * ## 点开之后再看
 *
 * 点开一个资源后，`div.showViewer` 里会出现实际内容：
 *  - 有 `<video>` ⇒ 视频，**听 `ended` 事件**（用户拍板，不轮询时长）；
 *  - 有带 `tid` 的 `<iframe>` ⇒ 测验（旧版测验是**页内同源 iframe**，不跳转），
 *    交给 `ai/index.ts` 的 `runQuizAnswer`；
 *  - 其它 ⇒ 等 `holdAfterMs()` 就走。
 */

import { scoped } from '../../common/core/log.ts';
import { isEnabled } from '../../common/core/settings.ts';
import type { PanelApi } from '../types.ts';
import { quizTidOnPage, runQuizAnswer } from './ai/index.ts';
import { classifySource, type SourceKind } from './catalog.ts';
import { setCourseProgress } from './ai/monitor.ts';
import { SITE_ID, TOGGLE, holdAfterMs, waitBeforeMs } from './settings.ts';

const log = scoped('uooc/autoplay');

// ------------------------------------------------------------- 常量

/** 点完导航类节点（章 / 节）后等 DOM 跟上的上限 */
const NAV_WAIT_MS = 6000;
/** 点完资源后等内容区出现东西的上限 */
const VIEW_WAIT_MS = 8000;
/** 视频保底超时：算出来的剩余时长之外再宽这么多 */
const VIDEO_SLACK_MS = 10 * 60 * 1000;
const VIDEO_MIN_MS = 5 * 60 * 1000;
const VIDEO_MAX_MS = 6 * 60 * 60 * 1000;

/** 目录根（`div.panel > div.panel-catalog > ul.rank-1`） */
const CATALOG_ROOT_SEL = 'div.panel-catalog ul.rank-1';
/** 内容区（视频 / iframe 都挂在这里面） */
const VIEWER_SEL = 'div.showViewer';

// ------------------------------------------------------------- 对外接口

export interface AutoplayStatus {
  readonly running: boolean;
  /** 状态行文字（【连播】页实时显示这个） */
  readonly text: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let host: PanelApi | null = null;
let running = false;
let statusText = '已停止';
/** 每次 start/stop 换一个 token，旧循环靠它自杀 */
let token: { cancelled: boolean } | null = null;

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch {
      /* 订阅者自己出错不影响连播 */
    }
  }
}

function setStatus(text: string): void {
  statusText = text;
  notify();
}

export function autoplayStatus(): AutoplayStatus {
  return { running, text: statusText };
}

/** 订阅状态变化，返回退订函数 */
export function subscribeAutoplay(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * 装载：把 `host`（面板 API）存下来，返回卸载函数。
 *
 * **不会自动开始连播** —— 由用户在【连播】页点【开始连播】（用户 m04485 第二轮拍板：
 * 原来的「自动连播」复选框换成两个按钮）。
 */
export function startAutoplay(api: PanelApi): () => void {
  host = api;
  log.debug('连播已装载（等待用户点【开始连播】）');
  return () => {
    autoplayStop();
    host = null;
    listeners.clear();
  };
}

/** 【开始连播】 */
export function autoplayStart(): void {
  if (running) return;
  if (host === null) {
    log.warn('还没装载就点了【开始连播】，忽略');
    return;
  }
  const root = catalogRoot();
  if (root === null) {
    const msg = '当前页面上找不到课程目录，无法连播（要先打开旧版课程页）';
    log.error(msg);
    host.toast(msg, 'error');
    setStatus(msg);
    return;
  }
  running = true;
  const t = { cancelled: false };
  token = t;
  setStatus('连播中：正在定位当前项…');
  log.info('连播开始');
  void loop(t);
}

/** 【停止连播】—— 立刻停（用户拍板） */
export function autoplayStop(): void {
  if (!running && token === null) return;
  running = false;
  if (token !== null) token.cancelled = true;
  token = null;
  setStatus('已停止');
  setCourseProgress(null);
  log.info('连播已停止');
  notify();
}

// ------------------------------------------------------------- 小工具

/** 可被【停止连播】打断的等待 */
function sleep(ms: number, t: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    if (t.cancelled) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      window.clearTimeout(timer);
      resolve();
    }, ms);
    const off = subscribeAutoplay(() => {
      if (!t.cancelled) return;
      off();
      window.clearTimeout(timer);
      resolve();
    });
  });
}

/** 等到 `pred()` 为真；超时返回 false。可被【停止连播】打断。 */
async function waitFor(
  pred: () => boolean,
  timeoutMs: number,
  t: { cancelled: boolean },
  intervalMs = 200,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (t.cancelled) return false;
    if (pred()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(intervalMs, t);
  }
}

function textOf(node: Element | null): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isComplete(el: Element): boolean {
  return el.classList.contains('complete');
}

function isActive(el: Element): boolean {
  return el.classList.contains('active');
}

/** 章 / 节 / 资源的「点这一颗」：先 click，点不动再用自带 href 兜底 */
async function clickNav(el: HTMLElement, t: { cancelled: boolean }): Promise<boolean> {
  const before = location.hash;
  try {
    el.click();
  } catch (err) {
    log.warn('click 抛异常', err instanceof Error ? err.message : String(err));
  }
  if (before !== location.hash) return true;
  // 兜底：自带 href（章 / 节的 div.basic 上有，资源行上没有）
  const href = el.getAttribute('href');
  if (href !== null && href !== '' && href !== before) {
    log.debug(`click 没换 hash，改用 href 兜底：${href}`);
    location.hash = href;
    await sleep(120, t);
    return location.hash !== before;
  }
  return false;
}

// ------------------------------------------------------------- 目录 DOM

function catalogRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(CATALOG_ROOT_SEL);
}

/** `ul.rank-1 > li.catalogItem`（章） */
function chapterLis(root: HTMLElement): HTMLElement[] {
  return [...root.children].filter(
    (n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('catalogItem'),
  );
}

/** 章标题那颗（`li > div.basic.chapter`） */
function chapterTitle(li: HTMLElement): HTMLElement | null {
  return li.querySelector<HTMLElement>(':scope > div.basic.chapter');
}

/** 章的展开区（`li > ul.rank-2`）—— 懒渲染，没用过就是 null */
function chapterBody(li: HTMLElement): HTMLElement | null {
  return li.querySelector<HTMLElement>(':scope > ul.rank-2');
}

/** `ul.rank-2 > li`（小节） */
function sectionLis(chapterLi: HTMLElement): HTMLElement[] {
  const body = chapterBody(chapterLi);
  if (body === null) return [];
  return [...body.children].filter((n): n is HTMLElement => n instanceof HTMLElement);
}

/** 小节标题那颗（`li > div.basic`） */
function sectionTitle(li: HTMLElement): HTMLElement | null {
  return li.querySelector<HTMLElement>(':scope > div.basic');
}

/** 小节的资源区（`li > div.resourcelist`）—— 懒渲染 */
function resourceList(sectionLi: HTMLElement): HTMLElement | null {
  return sectionLi.querySelector<HTMLElement>(':scope > div.resourcelist');
}

/** 资源行（`div.resourcelist > div.basic`，ng-repeat=source） */
function resourceRows(sectionLi: HTMLElement): HTMLElement[] {
  const list = resourceList(sectionLi);
  if (list === null) return [];
  return [...list.children].filter(
    (n): n is HTMLElement => n instanceof HTMLElement && n.classList.contains('basic'),
  );
}

/**
 * 资源行 → 类型。
 *
 * 首选 `span.tag-source-ico` 的 `ng-if="source.type == NN"` —— 那是站点自己写的类型号
 * （字典见 `catalog.ts` 的 `SOURCE_TYPE`，已按 11 份采样核对过）。
 *
 * 取不到再退回图标类名，**类名取的是 2026-10-08 那批采样的实测值**
 * （`icon-huixingzhen` / `icon-wendang1` / `icon-dingdanguanli` —— 站点用的是
 * 阿里图标库那种没语义的中文拼音名，猜是猜不出来的）。
 */
function kindOf(row: HTMLElement): SourceKind {
  const ico = row.querySelector('span.tag-source-ico');
  if (ico !== null) {
    const ngIf = ico.getAttribute('ng-if') ?? '';
    const m = /source\.type\s*==\s*(\d+)/.exec(ngIf);
    if (m !== null && m[1] !== undefined) return classifySource(Number(m[1]));
    for (const cls of [...ico.classList]) {
      if (!cls.startsWith('icon-')) continue;
      if (cls === 'icon-video') return 'video';
      if (cls === 'icon-huixingzhen') return 'attach';
      if (cls === 'icon-wendang1') return 'text';
      if (cls === 'icon-discuss') return 'discussion';
      if (cls === 'icon-dingdanguanli') return 'quiz';
    }
  }
  return 'unknown';
}

/** 资源行的显示名（`span.tag-source-name`） */
function rowName(row: HTMLElement): string {
  return textOf(row.querySelector('span.tag-source-name')) || textOf(row);
}

/** 当前项在哪：章 / 节 / 资源的下标（没有就是 -1） */
interface Pos {
  readonly chapterIdx: number;
  readonly sectionIdx: number;
  readonly resourceIdx: number;
}

function posOf(root: HTMLElement): Pos {
  const chs = chapterLis(root);
  let chapterIdx = -1;
  for (let i = 0; i < chs.length; i += 1) {
    const li = chs[i];
    if (li === undefined) continue;
    const title = chapterTitle(li);
    // 章是「当前」有两种表现：标题带 active，或者它的展开区在（站点只渲染当前章）
    if ((title !== null && isActive(title)) || chapterBody(li) !== null) chapterIdx = i;
  }
  if (chapterIdx < 0) return { chapterIdx: -1, sectionIdx: -1, resourceIdx: -1 };

  const chapLi = chs[chapterIdx];
  if (chapLi === undefined) return { chapterIdx: -1, sectionIdx: -1, resourceIdx: -1 };
  const secs = sectionLis(chapLi);
  let sectionIdx = -1;
  for (let i = 0; i < secs.length; i += 1) {
    const li = secs[i];
    if (li === undefined) continue;
    const title = sectionTitle(li);
    if ((title !== null && isActive(title)) || resourceList(li) !== null) sectionIdx = i;
  }
  if (sectionIdx < 0) return { chapterIdx, sectionIdx: -1, resourceIdx: -1 };

  const secLi = secs[sectionIdx];
  if (secLi === undefined) return { chapterIdx, sectionIdx: -1, resourceIdx: -1 };
  const rows = resourceRows(secLi);
  let resourceIdx = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r !== undefined && isActive(r)) resourceIdx = i;
  }
  return { chapterIdx, sectionIdx, resourceIdx };
}

/** 状态行文字：`第 3 章 第 2 节「第一章测验」` */
function describe(root: HTMLElement, pos: Pos): string {  const chs = chapterLis(root);
  const chapLi = chs[pos.chapterIdx];
  const chap = textOf(chapLi !== undefined ? chapterTitle(chapLi) : null);
  const parts: string[] = [];
  if (chap !== '') parts.push(chap);
  if (chapLi !== undefined && pos.sectionIdx >= 0) {
    const secLi = sectionLis(chapLi)[pos.sectionIdx];
    const sec = textOf(secLi !== undefined ? sectionTitle(secLi) : null);
    if (sec !== '') parts.push(sec);
  }
  if (chapLi !== undefined && pos.sectionIdx >= 0) {
    const secLi = sectionLis(chapLi)[pos.sectionIdx];
    if (secLi !== undefined && pos.resourceIdx >= 0) {
      const row = resourceRows(secLi)[pos.resourceIdx];
      if (row !== undefined) {
        const name = rowName(row);
        if (name !== '') parts.push(`「${name}」`);
      }
    }
  }
  return parts.join(' ');
}

// ------------------------------------------------------------- 内容区

interface Viewer {
  readonly video: HTMLVideoElement | null;
  /** 内容区里有 iframe（未必是试卷） */
  readonly hasFrame: boolean;
  /**
   * 答题 iframe 在不在 —— 这是旧版测验的判据（需求细则 §B.5）：
   * `iframe[src*="/exam/"]`。
   */
  readonly hasQuizFrame: boolean;
}

function viewerOf(): Viewer {
  const box = document.querySelector<HTMLElement>(VIEWER_SEL) ?? document.body;
  const video = box.querySelector<HTMLVideoElement>('video');
  const frames = [...box.querySelectorAll<HTMLIFrameElement>('iframe')];
  const hasQuizFrame = frames.some((f) => (f.getAttribute('src') ?? '').includes('/exam/'));
  return { video, hasFrame: frames.length > 0, hasQuizFrame };
}

/** 等视频播完（听 `ended`）。返回是否真的播完了 */
function waitVideoEnd(video: HTMLVideoElement, t: { cancelled: boolean }): Promise<boolean> {
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
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      off();
      resolve(ok);
    };
    const onEnded = (): void => finish(true);
    const onError = (): void => finish(false);
    const timer = window.setTimeout(() => finish(video.ended), budget);
    const off = subscribeAutoplay(() => {
      if (t.cancelled) finish(false);
    });
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    if (t.cancelled) finish(false);
  });
}

// ------------------------------------------------------------- 主循环

/**
 * 一直走到「没有下一项」或用户点【停止连播】。
 *
 * 每一步都**重新读 DOM**：不缓存下标、不预知下一课。原因见文件头「懒渲染」那条 ——
 * 站点永远只渲染当前章的小节与当前节的资源，任何提前算好的路线都会在点击后失效。
 */
async function loop(t: { cancelled: boolean }): Promise<void> {
  let clickFails = 0;
  while (running && !t.cancelled) {
    const root = catalogRoot();
    if (root === null) {
      await halt(t, '找不到课程目录 DOM（div.panel-catalog ul.rank-1），连播停止');
      return;
    }

    const pos = posOf(root);
    publishCourseProgress(root, pos);
    if (pos.chapterIdx < 0) {
      // 用户 m04485 第四轮拍板：没有当前项就**停下等他点**，不自己猜第一个未完成的
      await halt(t, '目录里没有「当前项」标记 —— 请你先点开一节，脚本会跟着你走');
      return;
    }

    const chapLi = chapterLis(root)[pos.chapterIdx];
    if (chapLi === undefined) {
      await halt(t, '目录结构变了，连播停止');
      return;
    }

    // 当前章要展开（懒渲染：不点开就没有小节可读）
    if (chapterBody(chapLi) === null) {
      setStatus(`连播中：正在展开 ${textOf(chapterTitle(chapLi))}`);
      await clickNav(chapterTitle(chapLi) ?? chapLi, t);
      await waitFor(() => chapterBody(chapLi) !== null, NAV_WAIT_MS, t);
      continue;
    }

    const secs = sectionLis(chapLi);
    if (pos.sectionIdx < 0) {
      // 章开了但没选中节：找第一个未完成小节
      const next = secs.findIndex((li) => {
        if (li.hasAttribute(SKIP_ATTR)) return false;
        const title = sectionTitle(li);
        return title === null || !isComplete(title);
      });
      if (next < 0) {
        if (!(await goNextChapter(root, pos.chapterIdx, t))) return;
        continue;
      }
      const target = sectionTitle(secs[next] ?? (undefined as never));
      setStatus(`连播中：正在进入 ${describe(root, { ...pos, sectionIdx: next, resourceIdx: -1 })}`);
      if (!(await clickNav(target ?? (secs[next] as HTMLElement), t))) {
        const failed = secs[next];
        if (failed !== undefined) failed.setAttribute(SKIP_ATTR, '1');
        clickFails += 1;
        log.warn('节点不动，标记跳过');
        if (clickFails > 3) await halt(t, '连续几次都点不动目录，连播停止');
        continue;
      }
      await sleep(waitBeforeMs(), t);
      continue;
    }

    const secLi = secs[pos.sectionIdx];
    if (secLi === undefined) {
      if (!(await goNextChapter(root, pos.chapterIdx, t))) return;
      continue;
    }

    // 本节资源要渲染（同样懒渲染）
    if (resourceList(secLi) === null) {
      setStatus(`连播中：正在展开 ${describe(root, pos)}`);
      await clickNav(sectionTitle(secLi) ?? secLi, t);
      await waitFor(() => resourceList(secLi) !== null, NAV_WAIT_MS, t);
      continue;
    }

    const rows = resourceRows(secLi);
    // 找本节下一个「还没完成」的资源（从当前项之后开始）
    let nextIdx = -1;
    for (let i = pos.resourceIdx + 1; i < rows.length; i += 1) {
      const r = rows[i];
      if (r === undefined) continue;
      if (r.hasAttribute(SKIP_ATTR)) continue;
      if (isComplete(r)) continue;
      nextIdx = i;
      break;
    }

    if (nextIdx < 0) {
      // 本节到底了 → 下一节
      const after = secs.findIndex((li) => li === secLi);
      const nextSec = secs.findIndex(
        (li, i) => i > after && !li.hasAttribute(SKIP_ATTR) && !isComplete(sectionTitle(li) ?? li),
      );
      if (nextSec >= 0) {
        const target = sectionTitle(secs[nextSec] ?? (undefined as never));
        setStatus(`连播中：正在进入 ${describe(root, { ...pos, sectionIdx: nextSec, resourceIdx: -1 })}`);
        if (!(await clickNav(target ?? (secs[nextSec] as HTMLElement), t))) {
          const failed = secs[nextSec];
          if (failed !== undefined) failed.setAttribute(SKIP_ATTR, '1');
          log.warn('下一节点不动，标记跳过');
        }
        await sleep(waitBeforeMs(), t);
        continue;
      }
      if (!(await goNextChapter(root, pos.chapterIdx, t))) return;
      continue;
    }

    // 处理当前项（如果站点当前位置就是我们要处理的这一项，先把它播完）
    const cur = pos.resourceIdx >= 0 ? rows[pos.resourceIdx] : undefined;
    const target = rows[nextIdx] ?? (undefined as never);
    setStatus(`连播中：${describe(root, { ...pos, resourceIdx: nextIdx })}`);

    if (cur !== undefined && cur === target) {
      // 已经在这一项上（比如用户自己点开、或上一轮点完停在这）→ 直接处理，不再点
      await handleCurrent(target, t);
      continue;
    }

    const ok = await clickNav(target, t);
    if (!ok) {
      clickFails += 1;
      log.warn(`点不动这一项，跳过：${rowName(target)}`);
      // 点不动就跳过：下一轮从 pos.resourceIdx+1 重新找，所以给这一行打个跳过标记
      await skipOne(t);
      if (clickFails > 20) await halt(t, '连续点不动太多次，连播停止');
      continue;
    }
    clickFails = 0;
    await sleep(waitBeforeMs(), t);
    await handleCurrent(target, t);
  }
}

/**
 * 把「当前位置 index / 总数」写进监视页（需求细则拍板口径：当前位置 index / 总数）。
 *
 * 粒度取能确定的最细一层：有当前资源就报「本节第几个资源 / 本节资源数」，
 * 有当前节就报「本章第几节 / 本章节数」，否则报「第几章 / 总章数」。
 */
function publishCourseProgress(root: HTMLElement, pos: Pos): void {
  const chs = chapterLis(root);
  const chapLi = chs[pos.chapterIdx];
  const label = describe(root, pos);
  if (chapLi !== undefined && pos.sectionIdx >= 0) {
    const secLi = sectionLis(chapLi)[pos.sectionIdx];
    if (secLi !== undefined && pos.resourceIdx >= 0) {
      const rows = resourceRows(secLi);
      setCourseProgress({ index: pos.resourceIdx + 1, total: rows.length, label });
      return;
    }
    setCourseProgress({ index: pos.sectionIdx + 1, total: sectionLis(chapLi).length, label });
    return;
  }
  if (pos.chapterIdx >= 0) {
    setCourseProgress({ index: pos.chapterIdx + 1, total: chs.length, label });
  }
}

/** 点不动时的「跳过一位」：临时给这一行打一个跳过标记，下轮 findIndex 就会越过它 */
const SKIP_ATTR = 'data-sztb-skip';
async function skipOne(t: { cancelled: boolean }): Promise<void> {
  const root = catalogRoot();
  if (root === null) return;
  const pos = posOf(root);
  if (pos.chapterIdx < 0 || pos.sectionIdx < 0 || pos.resourceIdx < 0) {
    await sleep(300, t);
    return;
  }
  const chapLi = chapterLis(root)[pos.chapterIdx];
  if (chapLi === undefined) return;
  const secLi = sectionLis(chapLi)[pos.sectionIdx];
  if (secLi === undefined) return;
  const rows = resourceRows(secLi);
  const idx = pos.resourceIdx + 1;
  const row = rows[idx];
  if (row !== undefined) {
    row.setAttribute(SKIP_ATTR, '1');
    log.debug(`标记跳过：${rowName(row)}`);
  }
  await sleep(200, t);
}

/** 展开并进入下一章；没有下一章就收工。返回是否还要继续 */
async function goNextChapter(
  root: HTMLElement,
  chapterIdx: number,
  t: { cancelled: boolean },
): Promise<boolean> {
  const chs = chapterLis(root);
  // 下一章要跳过被标记过点不动的（点不动就跳过，不重试不暂停）
  let nextLi: HTMLElement | undefined;
  for (let i = chapterIdx + 1; i < chs.length; i += 1) {
    const li = chs[i];
    if (li === undefined) continue;
    if (li.hasAttribute(SKIP_ATTR)) continue;
    nextLi = li;
    break;
  }
  if (nextLi === undefined) {
    // 后面的章都被跳过标记占了 → 也当走到头
    const anyLeft = chs.slice(chapterIdx + 1).some((li) => !li.hasAttribute(SKIP_ATTR));
    if (!anyLeft) {
      await halt(t, '已经是最后一章最后一节，连播结束');
      return false;
    }
    nextLi = chs[chapterIdx + 1];
  }
  if (nextLi === undefined) {
    await halt(t, '已经是最后一章最后一节，连播结束');
    return false;
  }
  const title = chapterTitle(nextLi);
  setStatus(`连播中：正在进入下一章 ${textOf(title)}`);
  const ok = await clickNav(title ?? nextLi, t);
  if (!ok) {
    log.warn(`下一章点不动，跳过去：${textOf(title)}`);
    nextLi.setAttribute(SKIP_ATTR, '1');
  }
  await waitFor(() => chapterBody(nextLi) !== null, NAV_WAIT_MS, t);
  await sleep(waitBeforeMs(), t);
  return true;
}

/** 处理「站点当前就停在这一项上」的那一项 */
async function handleCurrent(row: HTMLElement, t: { cancelled: boolean }): Promise<void> {
  if (isComplete(row)) {
    log.debug('这一项站点标了完成，跳过');
    return;
  }
  const kind = kindOf(row);
  const name = rowName(row);
  setStatus(`连播中：正在处理「${name}」（${KIND_TEXT[kind]}）`);

  // 等内容区出现东西（点完导航到渲染之间有延迟）
  await waitFor(() => viewerReady(), VIEW_WAIT_MS, t);
  const v = viewerOf();

  if (v.video !== null || kind === 'video') {
    if (v.video === null) {
      log.warn(`看着像视频但没找到 <video>，等一会儿就往下走：「${name}」`);
      await sleep(holdAfterMs(), t);
      return;
    }
    const done = await waitVideoEnd(v.video, t);
    log.info(`视频「${name}」${done ? '已播完' : '没等到播完（被停止或出错）'}`);
    if (t.cancelled || !running) return;
    await sleep(holdAfterMs(), t);
    return;
  }

  if (kind === 'quiz' || v.hasQuizFrame) {
    // tid 白写在答题 iframe 的地址里（`/exam/1208164042`），不需要任何交接
    const tid = quizTidOnPage();
    if (tid === null) {
      log.warn(`走到测验「${name}」但 iframe 地址里读不出 tid，停下等你`);
      await halt(t, `走到测验「${name}」但读不出 tid，连播停下等你`);
      return;
    }
    if (isEnabled(SITE_ID, TOGGLE.SKIP_QUIZ)) {
      await halt(t, `走到测验「${name}」，【跳过测验】开着，连播停下等你`);
      return;
    }
    if (!isEnabled(SITE_ID, TOGGLE.AI_ANSWER)) {
      await halt(t, `走到测验「${name}」，AI 答题没开，连播停下等你`);
      return;
    }
    if (host === null) return;
    setStatus(`连播中：正在作答「${name}」`);
    log.info(`测验「${name}」→ tid=${tid}，交给 AI 作答`);
    await runQuizAnswer(tid, host);
    await sleep(holdAfterMs(), t);
    return;
  }

  // 附件 / 文本 / 讨论 / 认不出来 —— 按各自的「跳过」开关决定停不停
  if (kind === 'attach' && isEnabled(SITE_ID, TOGGLE.SKIP_ATTACHMENT)) {
    log.debug(`跳过附件「${name}」`);
    return;
  }
  if (kind === 'text' && isEnabled(SITE_ID, TOGGLE.SKIP_TEXT)) {
    log.debug(`跳过文本「${name}」`);
    return;
  }
  if (kind === 'discussion' && isEnabled(SITE_ID, TOGGLE.SKIP_DISCUSSION)) {
    log.debug(`跳过讨论「${name}」，不等待`);
    return;
  }
  if (v.hasFrame) {
    log.warn(`这一项是个 iframe 但没有 tid，认不出来是什么，等一会儿就往下走：「${name}」`);
  } else {
    log.warn(`认不出这一项是什么（类型 ${kind}），等一会儿就往下走：「${name}」`);
  }
  if (kind === 'unknown') setStatus(`连播中：认不出「${name}」，稍等就继续`);
  await sleep(holdAfterMs(), t);
}

/** 内容区有东西了吗（视频 / iframe / 有文字） */
function viewerReady(): boolean {
  const box = document.querySelector<HTMLElement>(VIEWER_SEL);
  if (box === null) return false;
  if (box.querySelector('video') !== null) return true;
  if (box.querySelector('iframe') !== null) return true;
  return textOf(box).length > 0;
}

const KIND_TEXT: Record<SourceKind, string> = {
  video: '视频',
  attach: '附件',
  text: '文本',
  discussion: '讨论',
  quiz: '测验',
  unknown: '认不出来',
};

/** 停下（不改 `running`，只报告并终止这一轮循环） */
async function halt(t: { cancelled: boolean }, reason: string): Promise<void> {
  t.cancelled = true;
  running = false;
  token = null;
  setStatus(`已停止 —— ${reason}`);
  setCourseProgress(null);
  log.warn(reason);
  host?.toast(reason, 'warn');
  notify();
}

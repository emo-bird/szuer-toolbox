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
 * ## 主循环（用户 m06126 的流程）
 *
 * 每一轮只做一件事，做完回头**重新读一遍 DOM**：
 *
 * ```
 * 取「当前项」→
 *   ├ 章还没展开 → 点章标题，等展开，重来
 *   ├ 节还没展开 → 点节标题，等展开，重来
 *   ├ 站点标了 complete → 下一项
 *   ├ 视频   → 等 video 的 ended 事件 → 下一项
 *   ├ 文本   → 等「播完后停留」 → 下一项
 *   ├ 测验   → AI 答题开着就答，没开就**停下载等用户**
 *   ├ 讨论   → **停下载等用户**
 *   ├ 附件   → 直接下一项（点开过就算了）
 *   └ 认不出来 → 等一会儿就下一项
 * ```
 *
 * 「下一项」= 本节下一个资源行 → 本节没了换下一节（先点开）→ 本节没了换下一章（先点开）
 * → 都没有了才收工。**位置不缓存下标**，而是每轮从渲染出来的 DOM 现推。
 *
 * ## 目录 DOM 的三条硬约束（`local/capture/uooc-domskel-旧.txt` + 2026-10-08 那批采样）
 *
 * 1. **懒渲染**：`ul.rank-2`（小节）只在「当前章」下渲染，`div.resourcelist`（资源）
 *    只在「当前节」下渲染 ⇒ **想点下一章必须先把它点开、等 DOM 出来**。
 * 2. `.active` 是站点给的当前项信号，但它**挂在三种不同的元素上**：
 *    - 资源行 `div.resourcelist > div.basic.active` —— 视频 / 文本 / 测验打开时都有；
 *    - 节级 `div.oneline.active` —— 打开附件时**只有这个**（四级 point 级），
 *      资源行**不挂** `.active`；
 *    - 播放器自己的 `span.vjs-source-cdn-item.active` / `span.vjs-menu-content.active`
 *      —— 所以**绝对不能**直接 `document.querySelector('.active')`，会被播放器抢走。
 *    本文件只在目录区内找，且优先认资源行。
 * 3. `complete` 只在 `source.finished == 1 && source.is_task == 1` 时挂 ⇒
 *    普通视频可能**永远没有**完成标记，所以「看得到 `.complete` 就跳过、
 *    看不到就老老实实播到底」（用户拍板）。
 *    另外 `.complete` 也挂在**章标题 / 节标题**上（`div.basic.chapter.complete`）。
 *
 * ## 怎么知道一个资源是什么类型
 *
 * 资源行里有一颗类型图标：`<span class="tag-source-ico iconfont icon-video"
 * ng-if="source.type == 10">`（`dom-uooc-catalog-旧.txt:142`）。
 * **`ng-if` 里的 `source.type == NN` 就是站点自己的类型号**，比猜图标类名可靠得多；
 * 图标类名只作兜底（兜底值是 2026-10-08 采样的实测值，见 `kindOf`）。
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
/** 「点不动，别再点它」的临时标记（不重试、不停下，直接跳过继续） */
const SKIP_ATTR = 'data-sztb-skip';

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

/** 光标：这一轮在哪儿。定位靠 DOM 的 id，不缓存下标 */
interface Cursor {
  readonly chapterId: string;
  readonly sectionId: string;
  /** 本节第几个资源行；-1 = 这一节刚展开、还没点过任何行 */
  readonly resourceIdx: number;
}
let cursor: Cursor | null = null;
/** 刚点过的那一行：「点了但还没处理」和「处理完了」两种状态 */
let rowMark: { key: string; phase: 'clicked' | 'done' } | null = null;
/** 本次连播已经处理过的行（重启连播就清空，从头按 `.active` 重新判断） */
let handled = new Set<string>();

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

  // 每次开始都从零判断：位置、已完成集合全部重来
  cursor = null;
  rowMark = null;
  handled = new Set<string>();

  if (!primeCursor(root)) {
    // 用户 m04485 第四轮拍板：没有当前项就**停下等他点**，不自己猜第一个未完成的
    const msg = '目录里没有「当前项」标记 —— 请你先点开一节，脚本会跟着你走';
    log.warn(msg);
    host.toast(msg, 'warn');
    setStatus(`已停止 —— ${msg}`);
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

/** 章的展开区（`li > ul.rank-2`）—— 懒渲染，没展开过就是 null */
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

/** 小节的资源区（`li > div.resourcelist`）—— 懒渲染，注意它是 `li` 的孩子而不是 `div.basic` 的 */
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

// ------------------------------------------------------------- 定位

/** 章 / 节的稳定标识：DOM 上就带 id，取不到才退回下标 */
function chapterKey(li: HTMLElement, idx: number): string {
  return li.id !== '' ? li.id : `c${idx}`;
}

function sectionKey(li: HTMLElement, idx: number): string {
  return li.id !== '' ? li.id : `s${idx}`;
}

function findChapterById(id: string): HTMLElement | null {
  const root = catalogRoot();
  if (root === null) return null;
  const chs = chapterLis(root);
  for (let i = 0; i < chs.length; i += 1) {
    const li = chs[i];
    if (li !== undefined && chapterKey(li, i) === id) return li;
  }
  return null;
}

function findSectionById(chapterLi: HTMLElement, id: string): HTMLElement | null {
  const secs = sectionLis(chapterLi);
  for (let i = 0; i < secs.length; i += 1) {
    const li = secs[i];
    if (li !== undefined && sectionKey(li, i) === id) return li;
  }
  return null;
}

/** 一行资源的光标坐标 */
function rowAt(chapterId: string, sectionId: string, resourceIdx: number): Cursor {
  return { chapterId, sectionId, resourceIdx };
}

function keyOf(c: Cursor): string {
  return `${c.chapterId}/${c.sectionId}/${c.resourceIdx}`;
}

/** 一次 DOM 快照里「我们关心的一切」 */
interface Snap {
  readonly chs: HTMLElement[];
  /** 当前章下标（-1 = 没找到） */
  readonly ci: number;
  readonly chapLi: HTMLElement | null;
  readonly chapterId: string;
  readonly secs: HTMLElement[];
  /** 当前节下标（-1 = 没找到） */
  readonly si: number;
  readonly secLi: HTMLElement | null;
  readonly sectionId: string;
  /** 当前节已渲染的资源行（节没展开就是空） */
  readonly rows: HTMLElement[];
}

/**
 * 读一遍 DOM，推出「当前章 / 当前节 / 当前节的资源行」。
 *
 * 站点懒渲染，所以「渲了小节的那一章」「渲了资源的那一节」本来就是当前章 / 当前节；
 * 光标只用来在渲染结果还没跟上时兜个底，以及记住「本节第几个资源」。
 */
function snapshot(root: HTMLElement): Snap {
  const chs = chapterLis(root);

  let ci = -1;
  if (cursor !== null) {
    for (let i = 0; i < chs.length; i += 1) {
      const li = chs[i];
      if (li !== undefined && chapterKey(li, i) === cursor.chapterId && chapterBody(li) !== null) {
        ci = i;
        break;
      }
    }
  }
  if (ci < 0) ci = chs.findIndex((li) => chapterBody(li) !== null);
  if (ci < 0) {
    ci = chs.findIndex((li) => {
      const t = chapterTitle(li);
      return t !== null && isActive(t);
    });
  }

  const chapLi = ci >= 0 ? (chs[ci] ?? null) : null;
  if (chapLi === null) {
    return {
      chs,
      ci: -1,
      chapLi: null,
      chapterId: '',
      secs: [],
      si: -1,
      secLi: null,
      sectionId: '',
      rows: [],
    };
  }
  const chapterId = chapterKey(chapLi, ci);
  const secs = sectionLis(chapLi);

  let si = -1;
  if (cursor !== null && cursor.chapterId === chapterId && cursor.sectionId !== '') {
    for (let i = 0; i < secs.length; i += 1) {
      const li = secs[i];
      if (li !== undefined && sectionKey(li, i) === cursor.sectionId) {
        si = i;
        break;
      }
    }
  }
  if (si < 0) si = secs.findIndex((li) => resourceList(li) !== null);
  if (si < 0) {
    si = secs.findIndex((li) => {
      const t = sectionTitle(li);
      return t !== null && isActive(t);
    });
  }
  // 章展开了但没有任何节被选中 → 从第一节开始
  if (si < 0 && secs.length > 0) si = 0;

  const secLi = si >= 0 ? (secs[si] ?? null) : null;
  return {
    chs,
    ci,
    chapLi,
    chapterId,
    secs,
    si,
    secLi,
    sectionId: secLi !== null ? sectionKey(secLi, si) : '',
    rows: secLi !== null ? resourceRows(secLi) : [],
  };
}

/** 【开始连播】时的起点：站点自己标出来的当前项。找不到返回 false */
function primeCursor(root: HTMLElement): boolean {
  const s = snapshot(root);
  if (s.chapLi === null) return false;
  const act = s.rows.find((r) => isActive(r));
  if (act !== undefined) {
    cursor = rowAt(s.chapterId, s.sectionId, s.rows.indexOf(act));
    log.debug(`起点 = 站点标出的当前项：${rowName(act)}`);
    return true;
  }
  // 没有活动资源行，但至少知道在哪一章（章标题 / 节标题带 .active 也算）
  log.debug('目录里没有活动的资源行，按渲染出来的章节从头判断');
  return true;
}

// ------------------------------------------------------------- 下一步

/** 落在某一行资源上的步骤 */
interface RowAtStep {
  readonly chapterId: string;
  readonly sectionId: string;
  readonly resourceIdx: number;
  readonly row: HTMLElement;
  readonly name: string;
}

type Step =
  | {
      readonly kind: 'expand-chapter';
      readonly el: HTMLElement;
      readonly name: string;
      readonly chapterId: string;
    }
  | {
      readonly kind: 'expand-section';
      readonly el: HTMLElement;
      readonly name: string;
      readonly chapterId: string;
      readonly sectionId: string;
    }
  | ({ readonly kind: 'click-row' } & RowAtStep)
  | ({ readonly kind: 'handle' } & RowAtStep)
  | { readonly kind: 'end' }
  | { readonly kind: 'stop'; readonly why: string };

/** 下一章；没有就收工 */
function nextChapter(s: Snap, ci: number): Step {
  for (let i = ci + 1; i < s.chs.length; i += 1) {
    const li = s.chs[i];
    if (li === undefined) continue;
    if (li.hasAttribute(SKIP_ATTR)) continue;
    const t = chapterTitle(li);
    // 整章做完了 → 不停留，直接掠过
    if (t !== null && isComplete(t)) continue;
    return {
      kind: 'expand-chapter',
      el: t ?? li,
      name: textOf(t) || `第 ${i + 1} 章`,
      chapterId: chapterKey(li, i),
    };
  }
  return { kind: 'end' };
}

/**
 * 「下一项」：先在本节里往后找没做过的资源行，本节到底了换下一节（先点开），
 * 本章到底了换下一章（先点开）。
 *
 * `from` 是「从本节的第几行之后开始找」，-1 表示从第一行开始（刚展开的节）。
 */
function nextFrom(s: Snap, from: number): Step {
  const { chapLi, secLi, chapterId, sectionId, rows, secs, ci, si } = s;
  if (chapLi === null || secLi === null) return { kind: 'end' };

  for (let k = from + 1; k < rows.length; k += 1) {
    const r = rows[k];
    if (r === undefined) continue;
    if (r.hasAttribute(SKIP_ATTR)) continue;
    if (isComplete(r)) continue;
    if (handled.has(keyOf(rowAt(chapterId, sectionId, k)))) continue;
    return { kind: 'click-row', chapterId, sectionId, resourceIdx: k, row: r, name: rowName(r) };
  }

  for (let j = si + 1; j < secs.length; j += 1) {
    const li = secs[j];
    if (li === undefined) continue;
    if (li.hasAttribute(SKIP_ATTR)) continue;
    const t = sectionTitle(li);
    // 整节做完了 → 掠过
    if (t !== null && isComplete(t)) continue;
    return {
      kind: 'expand-section',
      el: t ?? li,
      name: textOf(t) || `第 ${j + 1} 节`,
      chapterId,
      sectionId: sectionKey(li, j),
    };
  }

  return nextChapter(s, ci);
}

/**
 * 算出「这一轮该干什么」。
 *
 * 优先级：① 刚点过、还没处理的那一行 → 处理它；② 站点标的当前项（用户手动点过目录
 * 就跟着他走）；③ 没有活动资源行时用光标认（**附件就是这种**：点开了，资源行不挂
 * `.active`）；④ 这一节刚展开 → 从第一行开始。
 */
function nextStep(s: Snap): Step {
  if (s.chs.length === 0) return { kind: 'stop', why: '找不到课程目录' };
  if (s.chapLi === null) {
    return {
      kind: 'stop',
      why: '目录里没有「当前项」标记 —— 请你先点开一节，脚本会跟着你走',
    };
  }

  const chapLi = s.chapLi;
  const chapName = textOf(chapterTitle(chapLi)) || `第 ${s.ci + 1} 章`;

  // 章的展开区还没出来 → 先把它点开（懒渲染：不点开就没有小节可读）
  if (chapterBody(chapLi) === null) {
    // 上一轮点过却没展开出来 → 别死循环，直接跳到下一章
    if (chapLi.hasAttribute(SKIP_ATTR)) return nextChapter(s, s.ci);
    return {
      kind: 'expand-chapter',
      el: chapterTitle(chapLi) ?? chapLi,
      name: chapName,
      chapterId: s.chapterId,
    };
  }
  if (s.secs.length === 0) return nextChapter(s, s.ci);

  const secLi = s.secLi;
  if (secLi === null) return nextChapter(s, s.ci);
  const secName = textOf(sectionTitle(secLi)) || `第 ${s.si + 1} 节`;

  // 节的资源区还没出来 → 先把它点开
  if (resourceList(secLi) === null) {
    // 上一轮点过却没展开出来 → 别死循环，跳到下一节
    if (secLi.hasAttribute(SKIP_ATTR)) return nextFrom(s, s.rows.length);
    return {
      kind: 'expand-section',
      el: sectionTitle(secLi) ?? secLi,
      name: secName,
      chapterId: s.chapterId,
      sectionId: s.sectionId,
    };
  }

  const rows = s.rows;
  const at = (idx: number): RowAtStep => ({
    chapterId: s.chapterId,
    sectionId: s.sectionId,
    resourceIdx: idx,
    row: rows[idx] as HTMLElement,
    name: rowName(rows[idx] as HTMLElement),
  });
  const done = (idx: number): boolean =>
    handled.has(keyOf(rowAt(s.chapterId, s.sectionId, idx)));

  // ① 刚点过的那一行：等它加载完就处理（这里也兜住了「资源行不挂 .active」的附件）
  const here =
    cursor !== null && cursor.chapterId === s.chapterId && cursor.sectionId === s.sectionId
      ? cursor.resourceIdx
      : -1;
  if (here >= 0 && rows[here] !== undefined) {
    const k = keyOf(rowAt(s.chapterId, s.sectionId, here));
    if (rowMark !== null && rowMark.phase === 'clicked' && rowMark.key === k) {
      return { kind: 'handle', ...at(here) };
    }
  }

  // ② 站点标的当前项优先 —— 用户自己点过目录就跟着他走
  const act = rows.findIndex((r) => isActive(r));
  if (act >= 0) {
    if (!done(act)) return { kind: 'handle', ...at(act) };
    return nextFrom(s, act);
  }

  // ③ 没有活动资源行：光标还指着的那一行就是当前项（附件走这里）
  if (here >= 0 && rows[here] !== undefined) {
    if (!done(here)) return { kind: 'handle', ...at(here) };
    return nextFrom(s, here);
  }

  // ④ 这一节刚展开、还没点过任何行 → 从第一行开始
  return nextFrom(s, -1);
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

/** 内容区有东西了吗（视频 / iframe / 有文字） */
function viewerReady(): boolean {
  const box = document.querySelector<HTMLElement>(VIEWER_SEL);
  if (box === null) return false;
  if (box.querySelector('video') !== null) return true;
  if (box.querySelector('iframe') !== null) return true;
  return textOf(box).length > 0;
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

const KIND_TEXT: Record<SourceKind, string> = {
  video: '视频',
  attach: '附件',
  text: '文本',
  discussion: '讨论',
  quiz: '测验',
  unknown: '认不出来',
};

/** 停下（不改 `running` 之外的任何东西，只报告并终止这一轮循环） */
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

/**
 * 处理「已经打开的这一行」——点开之后再判断它是什么，然后据此决定下一步。
 *
 * 除了测验 / 讨论（停下等用户），其余都走完就返回，由主循环接着「下一项」。
 */
async function handleRow(row: HTMLElement, name: string, t: { cancelled: boolean }): Promise<void> {
  if (isComplete(row)) {
    log.debug(`这一项站点标了完成，跳过：${name}`);
    return;
  }

  const kind = kindOf(row);
  setStatus(`连播中：正在处理「${name}」（${KIND_TEXT[kind]}）`);

  // 点完导航到渲染之间有延迟，等内容区出现东西
  await waitFor(() => viewerReady(), VIEW_WAIT_MS, t);
  if (!running || t.cancelled) return;
  const v = viewerOf();

  if (kind === 'video' || v.video !== null) {
    if (v.video === null) {
      log.warn(`看着像视频但没找到 <video>，等一会儿就往下走：「${name}」`);
    } else {
      const ok = await waitVideoEnd(v.video, t);
      log.info(`视频「${name}」${ok ? '已播完' : '没等到播完（被停止或出错）'}`);
      if (!running || t.cancelled) return;
    }
  } else if (kind === 'quiz' || v.hasQuizFrame) {
    // tid 白写在答题 iframe 的地址里（`/exam/1208164042`），不需要任何交接
    if (!isEnabled(SITE_ID, TOGGLE.AI_ANSWER)) {
      await halt(t, `走到测验「${name}」，AI 答题没开 —— 连播停下，你处理完再点【开始连播】`);
      return;
    }
    const tid = quizTidOnPage();
    if (tid === null) {
      await halt(t, `走到测验「${name}」但读不出 tid —— 连播停下等你`);
      return;
    }
    if (host === null) return;
    setStatus(`连播中：正在作答「${name}」`);
    log.info(`测验「${name}」→ tid=${tid}，交给 AI 作答`);
    await runQuizAnswer(tid, host);
    if (!running || t.cancelled) return;
  } else if (kind === 'discussion') {
    await halt(t, `走到讨论「${name}」—— 连播停下，你处理完再点【开始连播】`);
    return;
  } else if (kind === 'attach') {
    // 附件：点开过就算过，直接下一项
    log.debug(`附件「${name}」：不打开文件，直接下一项`);
  } else if (kind !== 'text') {
    if (v.hasFrame) log.warn(`这一项是个 iframe 但没有 tid，认不出来是什么：「${name}」`);
    else log.warn(`认不出这一项是什么（类型 ${kind}）：「${name}」`);
    setStatus(`连播中：认不出「${name}」，稍等就继续`);
  }

  await sleep(holdAfterMs(), t);
}

async function loop(t: { cancelled: boolean }): Promise<void> {
  for (;;) {
    if (!running || t.cancelled) return;

    const root = catalogRoot();
    if (root === null) {
      await halt(t, '找不到课程目录 DOM（div.panel-catalog ul.rank-1），连播停止');
      return;
    }

    const s = snapshot(root);
    publishCourseProgress(s);

    const step = nextStep(s);
    log.debug(`下一步：${step.kind}`);
    switch (step.kind) {
      case 'stop':
        await halt(t, step.why);
        return;

      case 'end':
        await halt(t, '已经是最后一章最后一节，连播结束');
        return;

      case 'expand-chapter': {
        setStatus(`连播中：正在展开 ${step.name}`);
        cursor = rowAt(step.chapterId, '', -1);
        rowMark = null;
        const ok = await clickNav(step.el, t);
        if (!ok) {
          step.el.setAttribute(SKIP_ATTR, '1');
          log.warn(`这一章点不动，跳过去：${step.name}`);
          break;
        }
        const shown = await waitFor(() => {
          const li = findChapterById(step.chapterId);
          return li !== null && chapterBody(li) !== null;
        }, NAV_WAIT_MS, t);
        if (!shown) {
          // 点了但没展开出来 → 标掉，别在下一轮又回来点它
          step.el.setAttribute(SKIP_ATTR, '1');
          log.warn(`这一章展开不出来，跳过去：${step.name}`);
          break;
        }
        await sleep(waitBeforeMs(), t);
        break;
      }

      case 'expand-section': {
        setStatus(`连播中：正在展开 ${step.name}`);
        cursor = rowAt(step.chapterId, step.sectionId, -1);
        rowMark = null;
        const ok = await clickNav(step.el, t);
        if (!ok) {
          step.el.setAttribute(SKIP_ATTR, '1');
          log.warn(`这一节点不动，跳过去：${step.name}`);
          break;
        }
        const shown = await waitFor(() => {
          const chap = findChapterById(step.chapterId);
          if (chap === null) return false;
          const li = findSectionById(chap, step.sectionId);
          return li !== null && resourceList(li) !== null;
        }, NAV_WAIT_MS, t);
        if (!shown) {
          step.el.setAttribute(SKIP_ATTR, '1');
          log.warn(`这一节展开不出来，跳过去：${step.name}`);
          break;
        }
        await sleep(waitBeforeMs(), t);
        break;
      }

      case 'click-row': {
        setStatus(`连播中：正在进入「${step.name}」`);
        const c = rowAt(step.chapterId, step.sectionId, step.resourceIdx);
        cursor = c;
        rowMark = { key: keyOf(c), phase: 'clicked' };
        const ok = await clickNav(step.row, t);
        if (!ok) {
          step.row.setAttribute(SKIP_ATTR, '1');
          rowMark = null;
          log.warn(`这一项点不动，跳过：${step.name}`);
          break;
        }
        await sleep(waitBeforeMs(), t);
        break;
      }

      case 'handle': {
        const c = rowAt(step.chapterId, step.sectionId, step.resourceIdx);
        cursor = c;
        await handleRow(step.row, step.name, t);
        handled.add(keyOf(c));
        rowMark = { key: keyOf(c), phase: 'done' };
        if (!running || t.cancelled) return;
        break;
      }
    }
  }
}

/**
 * 把「当前位置 index / 总数」写进监视页（需求细则拍板口径：当前位置 index / 总数）。
 *
 * 粒度取能确定的最细一层：有当前资源就报「本节第几个资源 / 本节资源数」，
 * 有当前节就报「本章第几节 / 本章节数」，否则报「第几章 / 总章数」。
 */
function publishCourseProgress(s: Snap): void {
  if (s.chapLi === null) {
    setCourseProgress(null);
    return;
  }
  const chapName = textOf(chapterTitle(s.chapLi));
  const parts: string[] = [];
  if (chapName !== '') parts.push(chapName);

  if (s.secLi === null) {
    setCourseProgress({ index: s.ci + 1, total: s.chs.length, label: parts.join(' ') });
    return;
  }
  const secName = textOf(sectionTitle(s.secLi));
  if (secName !== '') parts.push(secName);

  const rows = s.rows;
  let ri =
    cursor !== null && cursor.chapterId === s.chapterId && cursor.sectionId === s.sectionId
      ? cursor.resourceIdx
      : -1;
  if (ri < 0) ri = rows.findIndex((r) => isActive(r));
  if (ri >= 0 && rows[ri] !== undefined) {
    const nm = rowName(rows[ri] as HTMLElement);
    if (nm !== '') parts.push(`「${nm}」`);
    setCourseProgress({ index: ri + 1, total: rows.length, label: parts.join(' ') });
    return;
  }
  setCourseProgress({ index: s.si + 1, total: s.secs.length, label: parts.join(' ') });
}

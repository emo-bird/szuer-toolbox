/**
 * UOOC 学习页「目录推进器」—— U3 自动连播的定位层。
 *
 * === 为什么走 DOM 点击（v1 读 scope 的路线已被实测推翻） ===
 *
 * v1 顺着 `$parent` 爬 Angular scope，想读到「整份目录」再自己挑下一个视频。
 * 实测失败，原因**不是**选择器，而是**数据源本身残缺**：
 *   - 旧版：`sectionItem` 的 own 键是
 *     `[id,name,desc,parent,status,task_id,order_id,learn_mode,learn_task_cnt,is_pay,
 *       number,pid,finished,learning,icon_list,_level,hide,$$hashKey]`
 *     —— **根本没有 `unitSource`**（`local/capture/dom-uooc-catalog-旧.txt` L120）。
 *     只有「当前打开的那一节」才会临时挂上 `unitSource`，其余节的资源**不在内存里**。
 *   - 新版：`sectionItem` 带 `unitSource`（`-新.txt` L141），但同样只在展开时填充。
 *   于是拍平出来的数组里「当前资源之后」经常是空的，连播直接停在
 *   `目录里后面没有视频了`。
 *
 * 改成**点目录里真实的节点**之后，这些问题全部消失，而且带来三个好处：
 *   1. 走的是站点自己的 `goSource(source, 'section')` —— 行为与用户手点逐字节一致
 *      （播放器接管、进度上报、路由都由站点负责）；
 *   2. 站点按需渲染的那部分由站点自己负责，我们不需要预知整份目录；
 *   3. 点到的那个节点上就挂着 `source`，`type` / `finished` / `video_pos` 全都在，
 *      用来判断「这个是不是看过了」是白送的。
 *
 * === 跨版本锚点（一个类名都不用猜） ===
 *
 * `tools/dom-probe-uooc-catalog.js` 在两个版本上各跑一次，实测到三处**逐字相同**的
 * Angular 指令，本文件只认它们：
 *   - 资源项：`ng-click="goSource(source, 'section')"`
 *     （旧版 `div.basic` / 新版 `div…level_2_resourcelist`，类名不同、指令相同）
 *   - 章标题：`ng-click="toggleChapter(chapterItem)"`
 *     （旧版 `div.basic.chapter` / 新版 `div.level_1_title`）
 *   - 节标题：`ng-click="toggleChapter(sectionItem)"`
 *     （旧版 `div.basic` / 新版 `div.level_2_title`）
 * 另外两版的 `ng-repeat` 表达式也逐字相同：
 *   - 章：`chapterItem in chapterList`
 *   - 节：`sectionItem in chapterItem.children`
 *
 * === 按需渲染的两条硬约束（决定了推进器的形状） ===
 *
 *   1. 非当前章的节**不在 DOM 里**（旧版节 `li` 带
 *      `ng-if="stateParams.chapterId == chapterItem.id"`，新版 `ul.level_2` 同款），
 *      所以跨章必须先点**章标题**；
 *   2. 只有被打开的那一节会渲染资源，所以「本节没有下一个了」不等于「全课没有下一个了」，
 *      必须再多点一次**节标题**。
 * 推进器因此是「一次只走一步、走完回来看页面」的状态机，而不是一次算到底。
 *
 * === 当前位置以 hash 为准 ===
 *
 * 路由形如 `#/{cid}/{chapterId}/{sectionId}/{resourceId}/section`（两版同构），
 * 只到节时是 `#/{cid}/{chapterId}/{sectionId}`，只到章时是 `#/{cid}/{chapterId}`。
 * 比「找 `.active` 元素」可靠：空节里根本没有 `.active` 可找。
 */

import { scoped } from '../../common/core/log.ts';
import { pageOrSelf } from '../../common/utils/page.ts';

const log = scoped('uooc/catalog');

/** 站点资源类型编码（DOM 侧证据：旧版资源项的 `ng-if` 原文就是 `source.type == 10`） */
export const RESOURCE_TYPE_VIDEO = 10;
/** 附件 */
export const RESOURCE_TYPE_FILE = 50;
/** 文本 / 文档 */
export const RESOURCE_TYPE_DOC = 60;
/** 测验（这种节点上还带着 `task_id`） */
export const RESOURCE_TYPE_QUIZ = 80;

// ------------------------------------------------------------ 跨版本选择器

const RESOURCE_ITEM_SELECTOR = '[ng-click="goSource(source, \'section\')"]';
const CHAPTER_TITLE_SELECTOR = '[ng-click="toggleChapter(chapterItem)"]';
const SECTION_TITLE_SELECTOR = '[ng-click="toggleChapter(sectionItem)"]';
const CHAPTER_ITEM_SELECTOR = 'li[ng-repeat="chapterItem in chapterList"]';
const SECTION_ITEM_SELECTOR = 'li[ng-repeat="sectionItem in chapterItem.children"]';

// ------------------------------------------------------------------ 工具

const NUMERIC = /^\d+$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asString(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function asNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : -1;
}

function asBool(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

function asElement(el: Element | null): HTMLElement | null {
  return el instanceof HTMLElement ? el : null;
}

function queryAll(selector: string, root: ParentNode = document): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of root.querySelectorAll(selector)) {
    if (el instanceof HTMLElement) out.push(el);
  }
  return out;
}

function queryOne(selector: string, root: ParentNode): HTMLElement | null {
  return asElement(root.querySelector(selector));
}

/**
 * 模拟一次点击。
 *
 * 用 `dispatchEvent` 而不是裸 `el.click()`：显式带上 `bubbles: true`，
 * 这样既走站点挂在节点自己的 `ng-click`，也走可能存在的父级委托监听。
 * 与手点的差别只剩 `isTrusted`（AngularJS 1.x 不看这个）。
 * 万一 `MouseEvent` 构造不可用（极老的宿主）再退回 `el.click()`。
 */
function clickElement(el: HTMLElement): void {
  try {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  } catch {
    el.click();
  }
}

/**
 * 取章 `li` / 节 `li` 的业务 id。
 *
 * **不能用 `getAttribute('id')` 就完事**：新版学习页的这两层 `li` 上 `id` 属性
 * **是空的**（实测 7 个章、12 个节全是 `id=""`），只有 Angular scope 上的
 * `chapterItem.id` / `sectionItem.id` 才有值。旧版则是反过来 —— 属性上有，
 * 所以先读属性、属性为空再读 scope，两版都能对上。
 *
 * 踩过的坑：v1 只比对属性 → 新版 `findSectionIndex()` 永远返回 -1，
 * 于是连播报「章 X 里找不到节 Y」；`goNextChapter()` 也永远返回 false，跨章必挂。
 */
function idOfItem(li: HTMLElement, key: 'chapterItem' | 'sectionItem'): string {
  const attr = li.getAttribute('id');
  if (attr !== null && attr !== '') return attr;
  const item = scopeOf(li)?.[key];
  return isObject(item) ? asString(item['id']) : '';
}

function chapterIdOf(li: HTMLElement): string {
  return idOfItem(li, 'chapterItem');
}

function sectionIdOf(li: HTMLElement): string {
  return idOfItem(li, 'sectionItem');
}

// --------------------------------------------------------------- Angular

interface Scope {
  [key: string]: unknown;
  $parent?: Scope;
}

interface AngularLike {
  element(el: Element): { scope(): Scope | null } | null;
}

/**
 * 页面 realm 里的 `angular`。
 *
 * 沙箱里 `window` 是被包装过的，`angular` 只挂在页面自己的 window 上，
 * 所以必须走 `pageOrSelf()`（拿 `unsafeWindow`）。
 */
function angular(): AngularLike | null {
  const w = pageOrSelf() as { angular?: unknown };
  const ng = w['angular'];
  if (!isObject(ng)) return null;
  if (typeof ng['element'] !== 'function') return null;
  return ng as unknown as AngularLike;
}

/** 某个 DOM 节点上的 Angular scope；拿不到返回 null（不是 Angular 节点 / 页面没有 angular） */
function scopeOf(el: Element): Scope | null {
  const ng = angular();
  if (ng === null) return null;
  try {
    const jq = ng.element(el);
    if (jq === null || jq === undefined) return null;
    const s = jq.scope();
    return isObject(s) ? (s as Scope) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ hash

export interface UoocHashParts {
  /** 课程 id */
  cid: string;
  /** 章 id（路由没给到这一层时是空串） */
  chapterId: string;
  /** 节 id（空串＝只定位到章） */
  sectionId: string;
  /** 资源 id（空串＝只定位到节） */
  resourceId: string;
}

/**
 * 解析学习页 hash。
 *
 * 只取**纯数字**的段（站点所有 id 都是数字），这样
 * `#/cid/ch/sec/resource/section` 末尾那个字面量 `section` 不会被误当成 id。
 */
export function parseHash(hash: string = location.hash): UoocHashParts | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const parts = raw.split('/').filter((p) => p !== '');
  const pick = (i: number): string => {
    const v = parts[i];
    return v !== undefined && NUMERIC.test(v) ? v : '';
  };
  const cid = pick(0);
  if (cid === '') return null;
  return { cid, chapterId: pick(1), sectionId: pick(2), resourceId: pick(3) };
}

// -------------------------------------------------------------- 资源项

export interface UoocSource {
  id: string;
  /** 10 视频 / 50 附件 / 60 文本 / 80 测验 */
  type: number;
  /** 是不是「任务点」（站点用 `taskpoint` 类标出来） */
  isTask: boolean;
  /** 测验的 tid；其它类型是 `'0'` */
  taskId: string;
  title: string;
  /** 站点自己标记的「已完成」 */
  finished: boolean;
  /** 已有的播放进度（秒）；> 0 说明看过一部分 */
  videoPos: number;
}

/** 读某个资源项节点上的 `scope.source` */
export function readSourceOf(el: Element): UoocSource | null {
  const scope = scopeOf(el);
  const raw = scope?.['source'];
  if (!isObject(raw)) return null;
  const id = asString(raw['id']);
  const type = asNumber(raw['type']);
  if (id === '' || type < 0) return null;
  const pos = asNumber(raw['video_pos']);
  return {
    id,
    type,
    isTask: asBool(raw['is_task']),
    taskId: asString(raw['task_id']),
    title: asString(raw['title']),
    finished: asBool(raw['finished']),
    videoPos: pos > 0 ? pos : 0,
  };
}

/** 页面上所有已渲染的资源项（**文档顺序** ＝ 站点的资源顺序） */
export function resourceItems(): HTMLElement[] {
  return queryAll(RESOURCE_ITEM_SELECTOR);
}

/** 目录里所有已渲染的章节点、节节点 */
function chapterItems(): HTMLElement[] {
  return queryAll(CHAPTER_ITEM_SELECTOR);
}

function sectionItems(chapterLi: ParentNode): HTMLElement[] {
  return queryAll(SECTION_ITEM_SELECTOR, chapterLi);
}

/**
 * 按 id 找章节点。
 *
 * 章 `li` 上带着 `id="<chapterId>"`（旧版 `li.catalogItem[id=60253051]`），
 * 但为了不依赖这个约定，取不到时退回读 `scope.chapterItem.id`。
 */
function findChapterItem(chapterId: string): HTMLElement | null {
  if (chapterId === '') return null;
  for (const li of chapterItems()) {
    if (chapterIdOf(li) === chapterId) return li;
  }
  return null;
}

function findSectionIndex(sections: readonly HTMLElement[], sectionId: string): number {
  if (sectionId === '') return -1;
  for (let i = 0; i < sections.length; i++) {
    if (sectionIdOf(sections[i]!) === sectionId) return i;
  }
  return -1;
}

// ------------------------------------------------------------- 推进一步

export type AdvanceStep =
  /** 已经点开了下一个资源；调用方按 `type` / `finished` 决定怎么收尾 */
  | { kind: 'clicked'; id: string; title: string; type: number; finished: boolean }
  /** 撞上一道**没做过**的测验；`url` 非空时应该**整页跳过去**，为空表示已点开 */
  | { kind: 'quiz'; resourceId: string; taskId: string; title: string; url: string }
  /** 本节一个资源项都没有（空节，或还没渲染）——调用方决定等多久再往后跳 */
  | { kind: 'blank' }
  /** 点了节 / 章标题，页面正在按需渲染；调用方稍后再走一步 */
  | { kind: 'rendered' }
  /** 本章资源已经走到头（要不要跨章由调用方按「连播范围」决定） */
  | { kind: 'chapter-end' }
  /** 走不下去了（读不到目录 / hash 对不上 / 页面异常） */
  | { kind: 'stop'; reason: string };

/** 类型的中文名（只用于日志，两版的 DOM 文案不一样，不能拿 DOM 文本当类型） */
export function labelOf(type: number): string {
  if (type === RESOURCE_TYPE_VIDEO) return '视频';
  if (type === RESOURCE_TYPE_DOC) return '文档';
  if (type === RESOURCE_TYPE_FILE) return '附件';
  if (type === RESOURCE_TYPE_QUIZ) return '测验';
  return `资源(type=${type})`;
}

/**
 * 测验页地址，用来**整页跳过去**（用户 m01058 第 4 条的方案）。
 *
 * 新版是 `/exam/{tid}` —— 实测 `local/capture/dom-uooc-quiz-新-提交通过.txt`
 * 的 url 就是 `https://www.uooc.net.cn/exam/702751707`，`702751707` 正是目录里
 * 那一项的 `task_id`。
 *
 * 旧版**不给地址**（返回空串）：它的答题界面是嵌在学习页里的 iframe
 * （`/exam/paper?cid=&tid=`），整页跳过去不一定能用，交给调用方退回「点元素」。
 */
function quizUrlFor(taskId: string): string {
  if (taskId === '' || taskId === '0') return '';
  if (!location.pathname.startsWith('/home/learn/new/')) return '';
  return `/exam/${taskId}`;
}

/**
 * 「已经点过章标题催渲染」的那个节。
 *
 * 当前章的节是按需渲染的：切章之后、或刚做完测验跳回来时，目标节的 `li` 可能
 * 还没进 DOM。这时点一次章标题催一下即可，但**同一个节只催一次** —— 否则
 * `rendered` → 再走一步 → 还是找不到 → 再点，会空转到跳步上限。
 */
let expandTriedFor = '';

/**
 * 已经报过「本节是空白」的那一节。
 *
 * 报过一次之后就不再报，直接往下跳 —— 否则「空 → 提醒 → 等 N 秒 → 再走一步 →
 * 还是空」会原地打转，永远出不去。和 `expandTriedFor` 同一套路。
 */
let blankSeenFor = '';

/**
 * 已经点过一次「展开这个折叠的节」的那一节。
 *
 * ⚠️ 这是**旧版空白页的真因**（实测 `local/capture/dom-uooc-blank-section-旧.txt`）：
 * 节标题上那个 `ng-click="toggleChapter(sectionItem)"` 是**开合开关**，
 * 而资源列表容器写着 `ng-if="!sectionItem.hide && stateParams.sectionId == sectionItem.id"`。
 * 那一份采样里 `sectionItem.hide = true`、节 `li` 只剩标题一个子元素、
 * `resource` 命中 **0** —— 也就是说「空白的节」根本不是没内容，
 * 而是**被折叠了**（该节 scope 里的 `unitSource` 长度明明是 4）。
 * 所以遇到这种要先点一次标题把它展开，而不是往下跳。
 */
let sectionExpandTriedFor = '';

/**
 * 相对**当前 hash 所处的位置**往后走一步。
 *
 * 只走一步就返回，调用方按返回的 `kind` 决定「等一下再来」还是「收工」。
 * 这样即使站点是异步渲染的（点完节标题要等一个请求才出资源），也不会读空。
 */
export function stepForward(afterId = ''): AdvanceStep {
  if (angular() === null) {
    return { kind: 'stop', reason: '页面上没有 angular，读不到目录' };
  }

  const parts = parseHash();
  if (parts === null || parts.chapterId === '') {
    return { kind: 'stop', reason: '当前不在学习页的资源路由上' };
  }

  const chapterLi = findChapterItem(parts.chapterId);
  if (chapterLi === null) {
    return { kind: 'stop', reason: `目录里找不到章 ${parts.chapterId}（目录可能还没加载完）` };
  }

  const sections = sectionItems(chapterLi);

  // 只在章这一层（刚跨完章，或 hash 停在章上）→ 展开：先点第一节，没有节就点章标题
  if (parts.sectionId === '') {
    const first = sections[0];
    if (first !== undefined) {
      const title = queryOne(SECTION_TITLE_SELECTOR, first);
      if (title !== null) {
        log.info('连播：进入下一章的第一节');
        clickElement(title);
        return { kind: 'rendered' };
      }
    }
    const chapterTitle = queryOne(CHAPTER_TITLE_SELECTOR, chapterLi);
    if (chapterTitle === null) {
      return { kind: 'stop', reason: `章 ${parts.chapterId} 上没有可点的标题节点` };
    }
    clickElement(chapterTitle);
    return { kind: 'rendered' };
  }

  const secIndex = findSectionIndex(sections, parts.sectionId);
  if (secIndex < 0) {
    // 当前章的节是**按需渲染**的（切章之后、刚做完测验跳回来时都可能还没进 DOM）。
    // 先点一次章标题催它渲染，下一次再来看；同一个节只催一次，免得空转。
    const key = `${parts.chapterId}/${parts.sectionId}`;
    if (expandTriedFor !== key) {
      expandTriedFor = key;
      const expandable = queryOne(CHAPTER_TITLE_SELECTOR, chapterLi);
      if (expandable !== null) {
        log.info(`连播：当前章里还看不到节 ${parts.sectionId}，先点章标题催它展开`);
        clickElement(expandable);
        return { kind: 'rendered' };
      }
    }
    return { kind: 'stop', reason: `章 ${parts.chapterId} 里找不到节 ${parts.sectionId}（已尝试展开）` };
  }
  expandTriedFor = '';
  const secLi = sections[secIndex]!;

  // 资源池：优先取「归属当前节」的那些；归属判不出来时退回全页（旧版只渲染当前节，
  // 全页就是本节）。两者都按文档顺序，也就是站点的资源顺序。
  const all = resourceItems();
  let pool = all;
  const owned = all.filter((el) => el.closest(SECTION_ITEM_SELECTOR) === secLi);
  if (owned.length > 0) pool = owned;
  // 这一节有资源 → 忘掉「它是空白 / 要点开」的旧记录
  if (pool.length > 0) {
    blankSeenFor = '';
    sectionExpandTriedFor = '';
  }

  let cursor = -1;
  // 起点的选择：**优先用「上一次真的点开的那个资源」**。
  // 因为这里要防一种死循环 —— 如果站点点了资源项却没换 hash（或者换得慢），
  // 只按 hash 定位的话每一轮都会重新扫到同一个资源、再点一次，
  // 一路空转到跳步上限。`afterId` 由调用方在每次成功点击后带上。
  const anchor = afterId !== '' ? afterId : parts.resourceId;
  if (anchor !== '') {
    for (let i = 0; i < pool.length; i++) {
      const s = readSourceOf(pool[i]!);
      if (s !== null && s.id === anchor) {
        cursor = i;
        break;
      }
    }
    if (cursor < 0) {
      log.warn(`起点资源 ${anchor} 不在已渲染的目录里，从本节开头重新找`);
    }
  }

  for (let i = cursor + 1; i < pool.length; i++) {
    const el = pool[i]!;
    const src = readSourceOf(el);
    if (src === null) continue;

    // 测验：交给调用方**整页跳过去**（新版 `/exam/{tid}`），做完由测验页跳回来。
    // 旧版给不出这种地址（它的答题界面是学习页里的 iframe），于是 url 为空，
    // 退回「点元素」让站点自己决定怎么开。
    if (src.type === RESOURCE_TYPE_QUIZ && !src.finished) {
      const url = quizUrlFor(src.taskId);
      if (url !== '') {
        log.info(`连播：去测验 ${src.taskId}${src.title === '' ? '' : `（${src.title}）`}`);
        return { kind: 'quiz', resourceId: src.id, taskId: src.taskId, title: src.title, url };
      }
      log.info(`连播：打开测验 ${src.id}${src.title === '' ? '' : `（${src.title}）`}`);
      clickElement(el);
      return { kind: 'quiz', resourceId: src.id, taskId: src.taskId, title: src.title, url: '' };
    }

    // 其余的**一律点开**，包含已经完成的那些 ——
    // 用户 m01058 第 2 条：「不要直接就跳过已完成内容，你必须点那一章节等待 5 秒」。
    // 所以这里没有任何「跳过」分支了；是等它播完（视频）还是直接进等待，
    // 由调用方按 `finished` / `type` 决定。
    log.info(
      `连播：打开${src.finished ? '已完成的' : ''}${labelOf(src.type)} ${src.id}` +
        `${src.title === '' ? '' : `（${src.title}）`}`,
    );
    clickElement(el);
    return {
      kind: 'clicked',
      id: src.id,
      title: src.title,
      type: src.type,
      finished: src.finished,
    };
  }

  // 本节一个资源项都没渲染出来，两种可能，按顺序试：
  //   ① 节被折叠了（`sectionItem.hide === true`，站点用它把资源列表整个 ng-if 掉）
  //      —— 点一次标题展开，再回来看；
  //   ② 真的是空节 —— 报一次 blank，让调用方提醒 + 等 N 秒再往下跳。
  if (pool.length === 0) {
    const sectionKey = `${parts.chapterId}/${parts.sectionId}`;

    if (isSectionCollapsed(secLi) && sectionExpandTriedFor !== sectionKey) {
      const title = queryOne(SECTION_TITLE_SELECTOR, secLi);
      if (title !== null) {
        sectionExpandTriedFor = sectionKey;
        log.info(`连播：节 ${parts.sectionId} 是折叠的（hide=true），点开它`);
        clickElement(title);
        return { kind: 'rendered' };
      }
    }

    if (blankSeenFor !== sectionKey) {
      blankSeenFor = sectionKey;
      return { kind: 'blank' };
    }
  }

  // 本节走到头 → 点下一个节（它的资源要等站点渲染出来，所以只走一步）
  if (secIndex + 1 < sections.length) {
    const next = sections[secIndex + 1]!;
    const title = queryOne(SECTION_TITLE_SELECTOR, next);
    if (title === null) {
      return { kind: 'stop', reason: '下一个节上没有可点的标题节点' };
    }
    log.info(`连播：本节没有可播的资源，进入下一个节 ${next.getAttribute('id') ?? ''}`);
    title.click();
    return { kind: 'rendered' };
  }

  return { kind: 'chapter-end' };
}

/**
 * 跨到下一章（「连播范围＝跨章继续」时才调用）。
 *
 * 只点章标题。点完 hash 会变成 `#/{cid}/{chapterId}`，下一次 `stepForward()`
 * 会自己把这一章的第一节展开。
 */
export function goNextChapter(): boolean {
  const parts = parseHash();
  if (parts === null) return false;
  const all = chapterItems();
  const idx = all.findIndex((li) => chapterIdOf(li) === parts.chapterId);
  if (idx < 0 || idx + 1 >= all.length) return false;
  const next = all[idx + 1]!;
  const title = queryOne(CHAPTER_TITLE_SELECTOR, next);
  if (title === null) return false;
  log.info(`连播：跨到下一章 ${next.getAttribute('id') ?? ''}`);
  clickElement(title);
  return true;
}

// ------------------------------------------------ 跨时间的观察（等测验做完）

/**
 * 按资源 id 找目录里那一项。
 *
 * 连播撞上没做过的测验会停下来，之后要靠它回头确认「做完了没有」——
 * 那时页面可能已经换过一轮（测验开在别的路由上），所以只能按 id 重新找。
 */
export function findResourceItem(id: string): HTMLElement | null {
  if (id === '') return null;
  for (const el of resourceItems()) {
    const src = readSourceOf(el);
    if (src !== null && src.id === id) return el;
  }
  return null;
}

/** 这一项站点标记为完成了吗：scope 的 `finished`，或目录项上的 `complete` 类 */
export function isResourceFinished(el: Element): boolean {
  const src = readSourceOf(el);
  if (src !== null && src.finished) return true;
  return el.classList.contains('complete');
}

/**
 * 这一节是不是**被折叠**了。
 *
 * 站点自己的资源列表容器写着
 * `ng-if="!sectionItem.hide && stateParams.sectionId == sectionItem.id"`，
 * 所以 `sectionItem.hide === true` 时整份资源列表根本不在 DOM 里 ——
 * 看起来就是「空白节」，其实只是折叠了（`unitSource` 里数据好好的）。
 * 旧版节标题那个 `ng-click="toggleChapter(sectionItem)"` 就是开合开关。
 */
export function isSectionCollapsed(secLi: Element): boolean {
  const item = scopeOf(secLi)?.['sectionItem'];
  return isObject(item) && item['hide'] === true;
}

/**
 * 连播诊断快照（手测用）。
 *
 * 连播是「点一下、等页面反应、再看一眼」的状态机，出问题时最缺的就是
 * 「此刻目录到底长什么样」。这里把判定要用到的每一项都数出来，
 * **不改任何东西、不点任何东西**，可以随便在 Console 里反复调。
 */
export interface UoocDiag {
  hasAngular: boolean;
  hash: UoocHashParts | null;
  selectorHits: {
    chapterItem: number;
    chapterTitle: number;
    sectionItem: number;
    sectionTitle: number;
    resourceItem: number;
  };
  chapterIds: string[];
  currentChapterFound: boolean;
  sectionIds: string[];
  currentSectionFound: boolean;
  resources: {
    id: string;
    type: number;
    /** 站点数据层的「任务点」标记 —— 新版页面上看不到任何 UI 标注，只能从数据层看 */
    isTask: boolean;
    taskId: string;
    finished: boolean;
    videoPos: number;
  }[];
  resourceReadFailures: number;
}

export function collectDiag(): UoocDiag {
  const parts = parseHash();
  const chapters = chapterItems();
  const chapterIds = chapters.map((li) => chapterIdOf(li));
  const currentChapter = parts === null ? null : findChapterItem(parts.chapterId);
  const sections = currentChapter === null ? [] : sectionItems(currentChapter);
  const sectionIds = sections.map((li) => sectionIdOf(li));
  const items = resourceItems();

  const resources: UoocDiag['resources'] = [];
  let failures = 0;
  for (const el of items) {
    const src = readSourceOf(el);
    if (src === null) {
      failures += 1;
      continue;
    }
    resources.push({
      id: src.id,
      type: src.type,
      isTask: src.isTask,
      taskId: src.taskId,
      finished: src.finished,
      videoPos: src.videoPos,
    });
  }

  return {
    hasAngular: angular() !== null,
    hash: parts,
    selectorHits: {
      chapterItem: chapters.length,
      chapterTitle: queryAll(CHAPTER_TITLE_SELECTOR).length,
      sectionItem: queryAll(SECTION_ITEM_SELECTOR).length,
      sectionTitle: queryAll(SECTION_TITLE_SELECTOR).length,
      resourceItem: items.length,
    },
    chapterIds,
    currentChapterFound: currentChapter !== null,
    sectionIds,
    currentSectionFound: parts !== null && parts.sectionId !== '' && findSectionIndex(sections, parts.sectionId) >= 0,
    resources,
    resourceReadFailures: failures,
  };
}

// ------------------------------------------------- 学习上下文（供进度上报用）

/** scope 链上最多上爬几层找站点函数 */
const SCOPE_MAX_DEPTH = 15;

export interface UoocLearnContext {
  /** 课程 id */
  cid: string;
  /** 章 id（取 DOM 上 `li` 的 `id`，与站点自己上报的 `chapter_id` 同源） */
  chapterId: string;
  /** 节 id（同上） */
  sectionId: string;
  /** 资源 id */
  resourceId: string;
}

/** 当前正在学的资源项 —— 目录里带 `active` 的那个 */
export function activeResourceItem(): HTMLElement | null {
  return queryOne(`${RESOURCE_ITEM_SELECTOR}.active`, document);
}

/**
 * 从「资源项」元素反推学习上下文。
 *
 * 章 / 节一律走 **DOM 祖先上的 `li[id]`**，不走 hash ——
 * 抓包里的 `chapter_id`（例 57920722）与地址栏 hash 里的章 id 是两套号，
 * 只有站点自己渲染出来的 `li[id]` 才与它发的报文对得上。
 * 课程 id 与资源 id 则取 hash / scope（这两处两套号是一致的）。
 */
export function readLearnContext(el: Element): UoocLearnContext | null {
  const hash = parseHash();
  if (hash === null) return null;
  const chapterLi = asElement(el.closest(CHAPTER_ITEM_SELECTOR));
  const sectionLi = asElement(el.closest(SECTION_ITEM_SELECTOR));
  const chapterId = chapterLi?.getAttribute('id') ?? hash.chapterId;
  const sectionId = sectionLi?.getAttribute('id') ?? hash.sectionId;
  const resourceId = readSourceOf(el)?.id ?? hash.resourceId;
  if (chapterId === '' || sectionId === '' || resourceId === '') return null;
  return { cid: hash.cid, chapterId, sectionId, resourceId };
}

/**
 * 在节点所在的 scope 链上找站点自己的方法（例如提交视频进度的 `LearnMark`）。
 *
 * 站点把「提交视频进度」实现成控制器 scope 上的函数，但打包后的 JS 里
 * **只有接口声明表、没有调用点**，签名拿不到 —— 所以这里只负责「找出来交出去」，
 * 怎么调、调不通怎么办由调用方决定。
 */
export function findScopeFunction(
  el: Element,
  names: readonly string[],
): ((...args: unknown[]) => unknown) | null {
  let scope: Scope | null = scopeOf(el);
  for (let depth = 0; scope !== null && depth < SCOPE_MAX_DEPTH; depth += 1) {
    for (const name of names) {
      const fn = scope[name];
      if (typeof fn === 'function') return fn as (...args: unknown[]) => unknown;
    }
    const parent = scope['$parent'];
    scope = isObject(parent) ? (parent as Scope) : null;
  }
  return null;
}

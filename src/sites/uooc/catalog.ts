/**
 * UOOC 学习页「目录模型」—— U3 自动连播的定位层。
 *
 * === 这一层为什么存在 ===
 *
 * 连播要回答的唯一问题是：**现在这一集播完了，下一集是哪一个**。
 * 有三种可能的实现路子：
 *
 *   A. 爬 DOM 目录树（两个参考脚本都这么做：找 `.basic.active` → `span.icon-video`
 *      → 上下走 `UL`/`LI` 找下一个视频项）。**这条路我们走不通**，原因是实测的：
 *      - `local/capture/dom-uooc-learn-旧-视频播放中.txt` 里 `span.icon-video` 全页
 *        只命中 **1 次**（就是正在播的那一项），别的资源项图标类名拿不到；
 *      - 更要命的是目录树是**按需渲染**的：节节点的 `li` 上写着
 *        `ng-if="stateParams.chapterId == chapterItem.id"`，也就是非当前章的节
 *        根本不在 DOM 里，所以「下一个视频」很可能压根没有 DOM 节点可爬。
 *      - 新版学习页（`local/capture/dom-uooc-learn-新-视频播放中.txt`）`.basic`、
 *        `.catalogItem`、`.chapter`、`icon-video` 命中数**全是 0** —— 目录树结构
 *        与旧版完全不同，没有任何可照抄的选择器。
 *
 *   B. 调接口。技术上可行（`/home/learn/getCatalogList` 给树 + `getUnitLearn` 给资源），
 *      但连播是「播完就动」的热路径，每次换集打一串请求既撞 N2 的请求间隔约束，
 *      又平白多出一堆可被风控看到的流量。
 *
 *   C. **读 Angular scope（本文件的选法）**。站点两个版本都是 AngularJS 1.x
 *      （旧版采样 `angular: object`，新版同样有 `ng-*` 满屏），而目录树正是靠
 *      `ng-repeat` 渲染的 —— 单个节点上只看得到 `source`，但顺着 `$parent`
 *      往上爬，一定能爬到持有**整份目录**的那个 scope。那份数据是站点自己已经
 *      从接口拿到并存在内存里的，我们只是读它：**零请求、与版本无关、
 *      且天然带着 `source.type`**（不需要猜图标类名）。
 *
 * 所以本文件**只读 Angular scope**，不爬类名、不发请求。爬不到就如实上报
 * （返回 null 并打 warn），绝不瞎猜一个节点点下去 —— 目录里混着测验与附件，
 * 点错的代价是把用户推进一张试卷。
 *
 * === 数据形状的两处「防御性发现」 ===
 *
 * 站点的 scope 字段名我们**没有权威清单**（采样只拿到 `body` 上那个 header 控制器）。
 * 因此本文件不去硬编码 `chapterList` / `unitSource` 这种名字，而是**按形状找**：
 *   - 目录数组：某个 own 属性的值是以「带 `children` 数组的对象」为元素的数组；
 *   - 资源数组：某个 own 属性的值是以「同时带 `id` 与 `type` 的对象」为元素的数组。
 * 这样字段改名或两版用不同名字都不影响。找法写在 `findCatalog` / `findUnits` 里。
 */

import { scoped } from '../../common/core/log.ts';
import { pageOrSelf } from '../../common/utils/page.ts';

const log = scoped('uooc/catalog');

/**
 * 站点资源类型编码。
 *
 * `10 = 视频`有**两处独立证据**：
 *   1. 接口侧：`/home/learn/getUnitLearn` 的响应里 `type=10` 的条目带 `video_url`
 *      /`video_play_list`，是 mp4 资源；
 *   2. DOM 侧：旧版目录树资源项的 `ng-if` 原文就是
 *      `isSocial ? (source.type == 10 || source.type == …)`，把 10 当视频筛。
 */
export const RESOURCE_TYPE_VIDEO = 10;

/** 一条可播放资源（从 scope 里读出来的最小集） */
export interface UoocResource {
  /** 资源 id（等于 hash 第四段，也是 `goSource(source, …)` 传的那个对象） */
  id: string;
  /** 资源类型，见 `RESOURCE_TYPE_VIDEO` */
  type: number;
  /** 目录里显示的名字，仅用于日志 */
  title: string;
  chapterId: string;
  sectionId: string;
}

/** hash 路由的四段（两个版本格式一致，见文件头采样） */
export interface UoocHashParts {
  cid: string;
  chapterId: string;
  sectionId: string;
  resourceId: string;
}

// ---------------------------------------------------------------- Angular 访问

interface Scope {
  $parent?: Scope | null;
  [key: string]: unknown;
}

interface AngularLike {
  element?: (el: Element) => { scope?: () => Scope | null };
}

/** 页面 realm 里的 `angular`（沙箱里 `window` 是被包装过的，必须用 unsafeWindow 那个） */
function angular(): AngularLike | null {
  const w = pageOrSelf() as { angular?: unknown };
  const ng = w['angular'];
  if (ng === null || typeof ng !== 'object') return null;
  const like = ng as AngularLike;
  return typeof like.element === 'function' ? like : null;
}

/** 取元素上的 Angular scope；取不到返回 null（新版若不用 AngularJS 就全返回 null） */
function scopeOf(el: Element): Scope | null {
  const ng = angular();
  if (ng === null || ng.element === undefined) return null;
  try {
    return ng.element(el).scope?.() ?? null;
  } catch {
    // 元素不在 Angular 管理的子树上时 jqLite 可能抛错，属正常
    return null;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** 形状判定：像一条资源（同时有 id 与 type） */
function looksLikeResource(v: unknown): v is Record<string, unknown> {
  return isObject(v) && 'id' in v && 'type' in v;
}

/** 形状判定：像一章（有 id 且有 children 数组） */
function looksLikeChapter(v: unknown): v is Record<string, unknown> {
  return isObject(v) && 'id' in v && Array.isArray(v['children']);
}

/** 形状判定：像一节（有 id） */
function looksLikeSection(v: unknown): v is Record<string, unknown> {
  return isObject(v) && 'id' in v;
}

// ---------------------------------------------------------------- 目录读取

/**
 * 从任意一个资源节点往上爬，找到持有整份目录的那个 scope。
 *
 * 爬法：逐层看 own 属性里有没有「以章为元素的数组」。不看 `$` 开头的内部字段。
 */
function findCatalog(start: Scope): unknown[] | null {
  let scope: Scope | null = start;
  for (let depth = 0; scope !== null && scope !== undefined && depth < 15; depth++) {
    for (const key of Object.keys(scope)) {
      if (key.startsWith('$')) continue;
      let value: unknown;
      try {
        value = scope[key];
      } catch {
        continue;
      }
      if (!Array.isArray(value) || value.length === 0) continue;
      let hits = 0;
      for (const item of value) {
        if (looksLikeChapter(item)) hits += 1;
      }
      // 过半元素都是「章」才认，避免把别的小数组误判成目录
      if (hits > 0 && hits * 2 >= value.length) {
        log.debug(`目录数组定位成功：scope.${key}（${value.length} 章，距起点 ${depth} 层）`);
        return value;
      }
    }
    scope = (scope.$parent ?? null) as Scope | null;
  }
  return null;
}

/** 在「节」对象上找它的资源数组（按形状找，不硬编码 `unitSource`） */
function findUnits(section: Record<string, unknown>): unknown[] | null {
  for (const key of Object.keys(section)) {
    if (key.startsWith('$')) continue;
    const value = section[key];
    if (!Array.isArray(value) || value.length === 0) continue;
    let hits = 0;
    for (const item of value) {
      if (looksLikeResource(item)) hits += 1;
    }
    if (hits > 0 && hits * 2 >= value.length) return value;
  }
  return null;
}

/**
 * 起点 scope：优先当前**正在播**的那一项（带 `active` 类），
 * 退而求其次找页面上任意一个「资源项」节点。
 */
function findStartScope(): Scope | null {
  const candidates = document.querySelectorAll('.basic.active, [ng-repeat]');
  for (const el of Array.from(candidates)) {
    const scope = scopeOf(el);
    if (scope === null) continue;
    for (const key of ['source', 'item', 'unit', 'resource']) {
      if (looksLikeResource(scope[key])) return scope;
    }
  }
  return null;
}

/**
 * 读出整份目录（按章 → 节 → 资源的顺序拍平）。
 *
 * @returns 拍平后的资源数组；**读不到时返回 null**（调用方须当作「无法连播」处理，
 *          不要退回 DOM 猜测 —— 目录里混着测验，点错代价太大）
 */
export function readCatalog(): UoocResource[] | null {
  if (angular() === null) {
    log.warn('页面上没有 angular，读不到目录（连播不可用）');
    return null;
  }

  const start = findStartScope();
  if (start === null) {
    log.warn('找不到目录里的资源节点，读不到目录（连播不可用）');
    return null;
  }

  const chapters = findCatalog(start);
  if (chapters === null) {
    log.warn('从资源节点往上爬不到目录数组，读不到目录（连播不可用）');
    return null;
  }

  const out: UoocResource[] = [];
  for (const chapter of chapters) {
    if (!looksLikeChapter(chapter)) continue;
    const chapterId = String(chapter['id']);
    const children = chapter['children'] as unknown[];
    for (const section of children) {
      if (!looksLikeSection(section)) continue;
      const sectionId = String(section['id']);
      const units = findUnits(section);
      if (units === null) continue;
      for (const unit of units) {
        if (!looksLikeResource(unit)) continue;
        const rec = unit as Record<string, unknown>;
        const id = rec['id'];
        const type = rec['type'];
        if (id === undefined || id === null) continue;
        out.push({
          id: String(id),
          type: typeof type === 'number' ? type : Number(type),
          title: String(rec['title'] ?? rec['name'] ?? ''),
          chapterId,
          sectionId,
        });
      }
    }
  }

  log.debug(`目录读出 ${out.length} 条资源（${chapters.length} 章）`);
  return out.length > 0 ? out : null;
}

// ---------------------------------------------------------------- hash 路由

/** 解析 `#/{cid}/{chapterId}/{sectionId}/{resourceId}/section` */
export function parseHash(hash: string = location.hash): UoocHashParts | null {
  const m = /^#\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)/.exec(hash);
  if (m === null) return null;
  const [, cid, chapterId, sectionId, resourceId] = m;
  if (cid === undefined || chapterId === undefined || sectionId === undefined || resourceId === undefined) {
    return null;
  }
  return { cid, chapterId, sectionId, resourceId };
}

// ---------------------------------------------------------------- 跳转

/** 在页面上找到某个资源对应的**可点节点**（没渲染出来就返回 null） */
export function findResourceElement(resource: UoocResource): HTMLElement | null {
  // 先在其所属节的 `li` 里找（节节点带 id，旧版实测 `li[id="1243934256"]`）
  const roots: ParentNode[] = [];
  const sectionEl = document.getElementById(resource.sectionId);
  if (sectionEl !== null) roots.push(sectionEl);
  roots.push(document);

  for (const root of roots) {
    const nodes = root.querySelectorAll('[ng-repeat], .basic, .resourcelist > *');
    for (const node of Array.from(nodes)) {
      const scope = scopeOf(node);
      if (scope === null) continue;
      for (const key of ['source', 'item', 'unit', 'resource']) {
        const value = scope[key];
        if (looksLikeResource(value) && String((value as Record<string, unknown>)['id']) === resource.id) {
          return node as HTMLElement;
        }
      }
    }
  }
  return null;
}

/**
 * 跳到某个资源。
 *
 * 两种手法，优先第一种：
 *   1. **点页面上真实的节点** —— 走站点自己的 `goSource(source, 'section')`，
 *      行为与用户手点完全一致（播放器接管、进度上报都交给站点）；
 *   2. 节点没渲染（在别的章里，被 `ng-if` 挡掉了）时退化为**改 hash**。
 *      两个版本的 hash 格式一致，ui-router 会自己渲染过去。
 *
 * @returns 采用了哪种手法（供日志与手测判断）
 */
export function navigateToResource(resource: UoocResource, cid: string): 'click' | 'hash' | 'none' {
  const el = findResourceElement(resource);
  if (el !== null) {
    el.click();
    return 'click';
  }

  const parts = parseHash();
  const courseId = parts?.cid ?? cid;
  if (courseId === '') return 'none';

  const next = `#/${courseId}/${resource.chapterId}/${resource.sectionId}/${resource.id}/section`;
  if (location.hash === next) return 'none';
  location.hash = next;
  return 'hash';
}

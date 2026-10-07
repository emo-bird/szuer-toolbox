/**
 * UOOC 目录模型（纯函数，可单测）。
 *
 * 背景：连播的本质是「按目录顺序走一遍」。但站点的 DOM 只渲染**当前路径**
 * （旧版 `ul.rank-3` 上挂着 `ng-if="!sectionItem.hide && stateParams.sectionId == sectionItem.id"`），
 * 跨节/跨章时 DOM 里根本没有「下一个」的素材，所以必须自己拿一份地图。
 *
 * 地图有两个来源，都已实测：
 *   - `GET /home/learn/getCatalogList?cid={cid}` → 整棵树（104 节点，**不含资源**）
 *   - `GET /home/learn/getUnitLearn?catalog_id={节点id}&...` → **单个节点挂的资源**
 *
 * 实测出来的两条硬结论（见 `docs/UOOC-双版目录结构底图.md`）：
 *   1. **资源只挂叶子**。带 children 的节点 `getUnitLearn` 返回 `data: []`。
 *      ⇒ 播放队列 = 目录树按深度优先展平的叶子序列。
 *   2. **存在「空叶子」**（如 `733704712` → `data: []`）。⇒ 必须能跳过无资源的叶子。
 *
 * 本文件只做「解析 + 展平 + 拼 URL」，不碰网络、不碰 DOM、不碰设置 —— 这样能秒级单测。
 */

// --------------------------------------------------------------- 资源类型

/** `unitSource[i].type` 的取值字典 */
export const SOURCE_TYPE = {
  VIDEO: '10',
  ATTACH: '50',
  TEXT: '60',
  DISCUSSION: '70',
  QUIZ: '80',
} as const;

export type SourceKind = 'video' | 'attach' | 'text' | 'discussion' | 'quiz' | 'unknown';

/**
 * 把资源类型归一化成动作分派用的种类。
 *
 * ⚠️ `type` 有时是数字 `50`、有时是字符串 `"80"`（同一份响应里两种都实测到过），
 * 所以入参一律先 `String()`。
 */
export function classifySource(type: unknown): SourceKind {
  switch (String(type)) {
    case SOURCE_TYPE.VIDEO:
      return 'video';
    case SOURCE_TYPE.ATTACH:
      return 'attach';
    case SOURCE_TYPE.TEXT:
      return 'text';
    case SOURCE_TYPE.DISCUSSION:
      return 'discussion';
    case SOURCE_TYPE.QUIZ:
      return 'quiz';
    default:
      return 'unknown';
  }
}

// --------------------------------------------------------------- 目录树

/** `getCatalogList.data[]` 里的一个节点（`children` 缺省 = 叶子，或空 children） */
export interface CatalogNode {
  id: number;
  name: string;
  children?: CatalogNode[];
  /** 站点自己的完成标记：1=已完成。**每个节点都有**，不只是叶子 */
  finished?: number;
  /**
   * 站点自己的「你正学到这儿」指针：1=当前定位。
   *
   * 实测（2026-10，`local/capture/catalog-list.json`）整棵树里**只有 2 个**节点
   * 是 `learning=1` —— 一个章、一个它下面的节，正好是用户当时看到的位置。
   * 连播的起点以它为准（用户 m03919 拍板）。
   */
  learning?: number;
  status?: string;
}

/** 叶子：连播的最小单位 */
export interface CatalogLeaf {
  /** 该叶子的目录节点 id，即 `getUnitLearn` 的 `catalog_id` */
  nodeId: number;
  title: string;
  /** 从章到本叶子的 id 链（含叶子自己）：长度 1（章）/ 2（节）/ 3（三级点） */
  chain: number[];
  /** 与 `chain` 平行的标题链，用来打日志 */
  titles: string[];
  /** 原样带上来的完成标记（1=已完成）；缺省表示站点没给 */
  finished?: number;
  /**
   * `1` = 本叶子在「站点说用户正在这里」的那条链上。
   *
   * 注意是**链**不是点：站点实测只把 `learning=1` 标在章和节上，叶子自己没标，
   * 所以 `flattenLeaves` 会把它沿链往下传。
   */
  learning?: number;
}

function normalizeNode(raw: unknown): CatalogNode | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = Number(o['id']);
  if (!Number.isFinite(id)) return null;

  const node: CatalogNode = { id, name: String(o['name'] ?? '') };
  if (typeof o['finished'] === 'number') node.finished = o['finished'];
  if (typeof o['learning'] === 'number') node.learning = o['learning'];
  if (typeof o['status'] === 'string') node.status = o['status'];

  if (Array.isArray(o['children'])) {
    const kids = o['children'].map(normalizeNode).filter((n): n is CatalogNode => n !== null);
    if (kids.length > 0) node.children = kids;
  }
  return node;
}

/** 解析 `getCatalogList` 的响应体（宽容：结构不对就返回空数组，不抛） */
export function parseCatalogTree(raw: unknown): CatalogNode[] {
  if (raw === null || typeof raw !== 'object') return [];
  const data = (raw as Record<string, unknown>)['data'];
  if (!Array.isArray(data)) return [];
  return data.map(normalizeNode).filter((n): n is CatalogNode => n !== null);
}

/**
 * 深度优先展平成叶子序列。
 *
 * 顺序即「站点目录从上到下」的顺序 —— 这也是连播顺序。
 * 展平**不查资源**（那要发请求），空叶子留到运行时用 `getUnitLearn` 的结果跳过。
 */
export function flattenLeaves(tree: readonly CatalogNode[]): CatalogLeaf[] {
  const out: CatalogLeaf[] = [];

  const walk = (
    node: CatalogNode,
    ids: number[],
    titles: string[],
    onLearningPath: boolean,
  ): void => {
    const chain = [...ids, node.id];
    const chainTitles = [...titles, node.name];
    // `learning` 可能只标在章/节上（实测就是如此），所以要**往下传**：
    // 叶子自己没标，但它在「站点说用户正在这里」的那条链上。
    const learningHere = node.learning === 1;
    const learningPath = onLearningPath || learningHere;

    if (node.children === undefined || node.children.length === 0) {
      const leaf: CatalogLeaf = { nodeId: node.id, title: node.name, chain, titles: chainTitles };
      if (node.finished !== undefined) leaf.finished = node.finished;
      if (learningPath) leaf.learning = 1;
      out.push(leaf);
      return;
    }
    for (const child of node.children) walk(child, chain, chainTitles, learningPath);
  };

  for (const node of tree) walk(node, [], [], false);
  return out;
}

// --------------------------------------------------------------- 资源

/** 附件（type 50）里的文件本体 */
export interface UnitDocument {
  id: string;
  title: string;
  uri: string;
}

/** `getUnitLearn.data[]` 里的一项资源 */
export interface UnitSource {
  id: number;
  type: string;
  title: string;
  /** 站点用 `1` / `"1"` 表示已完成 */
  finished: boolean;
  /** 测验（type 80）的答题页 `tid` */
  taskId: number | null;
  /** 附件（type 50）的文件列表 */
  documents: UnitDocument[];
}

function toBoolFlag(v: unknown): boolean {
  return Number(v) === 1;
}

function parseDocuments(raw: unknown): UnitDocument[] {
  if (!Array.isArray(raw)) return [];
  const out: UnitDocument[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    out.push({
      id: String(o['id'] ?? ''),
      title: String(o['title'] ?? ''),
      uri: String(o['uri'] ?? ''),
    });
  }
  return out;
}

/** 解析 `getUnitLearn` 的响应体（宽容：结构不对就返回空数组） */
export function parseUnitSources(raw: unknown): UnitSource[] {
  if (raw === null || typeof raw !== 'object') return [];
  const data = (raw as Record<string, unknown>)['data'];
  if (!Array.isArray(data)) return [];

  const out: UnitSource[] = [];
  for (const item of data) {
    if (item === null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const taskId = Number(o['task_id']);
    out.push({
      id: Number(o['id'] ?? 0),
      // ⚠️ 同一份响应里 type 出现过数字 50 与字符串 "80" 两种，统一成字符串
      type: String(o['type'] ?? ''),
      title: String(o['title'] ?? ''),
      finished: toBoolFlag(o['finished']),
      taskId: Number.isFinite(taskId) && taskId > 0 ? taskId : null,
      documents: parseDocuments(o['document']),
    });
  }
  return out;
}

// --------------------------------------------------------------- URL 拼装

/** `getCatalogList` 的地址（相对站点根，同源） */
export function catalogListUrl(cid: string): string {
  return `/home/learn/getCatalogList?cid=${encodeURIComponent(cid)}&hidemsg_=true`;
}

/**
 * `getUnitLearn` 的地址。
 *
 * 实测：`catalog_id` 是真正起作用的键；`chapter_id` / `section_id` 传当前所在节的值也能查到
 * **其它**节点的资源。这里按叶子自己的祖先链传，语义更正确。
 */
export function unitLearnUrl(cid: string, leaf: CatalogLeaf): string {
  const chapterId = leaf.chain[0] ?? leaf.nodeId;
  const sectionId = leaf.chain[1] ?? chapterId;
  const params = [
    `catalog_id=${leaf.nodeId}`,
    `chapter_id=${chapterId}`,
    `section_id=${sectionId}`,
    `cid=${encodeURIComponent(cid)}`,
    'hidemsg_=true',
  ];
  return `/home/learn/getUnitLearn?${params.join('&')}`;
}

/**
 * 叶子内某个资源的 hash（ui-router 的地址）。
 *
 * 实测的 ui-router 状态机（`local/capture/uirouter-states.json`）：
 *   - 二级叶子资源 `main.chapter.section.source`      `#/{cid}/{chapterId}/{sectionId}/{sourceId}/section`
 *   - 三级叶子资源 `main.chapter.section.point.source` `#/{cid}/{chapterId}/{sectionId}/{pointId}/{sourceId}/subsection`
 *
 * 两版（`/home/learn/index` 与 `/home/learn/new/{cid}`）URL 形状完全一致，只差 pathname 前缀，
 * 所以这一段可以两版共用。
 *
 * ⚠️ 附件（type 50）的资源 `id` **恒为 0**，所以拼出来的 `sourceId` 就是 0。
 * 它在实测中确实能区分（因为 chain 不同），但没有独立验证过站点自己的 DOM 是不是也用 0。
 */
export function sourceHash(cid: string, leaf: CatalogLeaf, sourceId: number | string): string {
  const c = leaf.chain;
  if (c.length >= 3) return `#/${cid}/${c[0]}/${c[1]}/${c[2]}/${sourceId}/subsection`;
  if (c.length === 2) return `#/${cid}/${c[0]}/${c[1]}/${sourceId}/section`;
  if (c.length === 1) return `#/${cid}/${c[0]}`;
  return `#/${cid}`;
}

/**
 * 测验（type 80）的答题页地址 —— **不在 SPA 里**，是整页跳转。
 *
 * 实测：资源里的 `task_id` 就是答题页的 `tid`。
 * 用户给的样本：`https://www.uooc.net.cn/exam/paper?cid=2005836044&tid=153728628`
 */
export function examUrl(cid: string, taskId: number): string {
  return `/exam/paper?cid=${encodeURIComponent(cid)}&tid=${taskId}`;
}

// --------------------------------------------------------------- 地址反查

/**
 * 从 `location.hash` 反推「当前在哪个叶子」。
 *
 * hash 里只有 cid / chapterId / sectionId / pointId / sourceId，**没有目录节点 id**。
 * 但叶子的节点 id 恰好就是链上最后一环（二级叶 = sectionId，三级叶 = pointId），
 * 所以把 `sourceId` 与末尾的 `section|subsection` 标记剥掉即可。
 */
export function currentChainFromHash(hash: string): number[] | null {
  const parts = hash.replace(/^#\/?/, '').split('/').filter((s) => s.length > 0);
  if (parts.length < 2) return null;

  let body = parts.slice(1); // 去掉 cid
  const tail = body[body.length - 1];
  if (tail === 'section' || tail === 'subsection') {
    body = body.slice(0, -1); // 去掉末尾的 kind
    body = body.slice(0, -1); // 去掉 sourceId
  }
  if (body.length === 0) return null;

  const nums = body.map((s) => Number(s));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

/**
 * 从地址栏取课程 id。
 *
 * - 新版：`/home/learn/new/2005836044#/...` → pathname 里
 * - 旧版：`/home/learn/index#/2005836044/...` → hash 里
 */
export function courseIdFromLocation(pathname: string, hash: string): string | null {
  const fromPath = /^\/home\/learn\/new\/(\d+)/.exec(pathname);
  if (fromPath !== null) return fromPath[1] ?? null;

  const fromHash = /^#\/(\d+)(?:\/|$)/.exec(hash);
  if (fromHash !== null) return fromHash[1] ?? null;

  return null;
}

function sameChain(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** 在叶子序列里找「当前所在的那个叶子」；找不到返回 -1 */
export function findLeafIndex(leaves: readonly CatalogLeaf[], chain: readonly number[]): number {
  return leaves.findIndex((leaf) => sameChain(leaf.chain, chain));
}


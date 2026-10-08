/**
 * UOOC 目录树：「资源类型字典」+「任务点展平 / 拼 hash」的**纯函数**（可单测）。
 *
 * ⚠️ **2026-10-08 方向反转**：新方案（唯一口径见 `docs/UOOC-API驱动连播-需求.md`）
 * 是 **API 驱动**的 —— 一次 `getCatalogList` 拿整棵树、自己算「第一个未完成任务点」、
 * 自己拼 `location.hash` 跳过去；DOM 只用来**读**（等 `ended`、等测验 iframe）。
 * 所以「展平 + 拼 URL」这一套又回来了。
 *
 * ⚠️ **与旧实现不是同一套模型，不要从 git 历史搬**：旧实现认为「树里只有章节点，
 * 资源得另外打 `getUnitLearn` 才查得到」；新模型是
 * 「**节点自己的 `icon_list` 非空 = 这个节点就是一个任务点**」，
 * `sourceId = icon_list[0].id`。两者不可互换（旧实现取样命令见需求文档 §G）。
 *
 * 本文件**只放纯函数**：不碰 DOM、不碰网络、不碰 `location`，全部可单测。
 * 网络与重试在 `fetch-catalog.ts`，主循环在 `takeover.ts`。
 */

// --------------------------------------------------------------- 资源类型

/** `source.type` 的取值字典（接口与 DOM 里是同一套号） */
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

// --------------------------------------------------------------- 目录树 → 任务点

/**
 * 任务点的**路径形态** —— 决定拼出来的 hash 长什么样。
 *
 * 站点自己的 ui-router 状态表（`local/capture/uirouter-states.json`）里只有两条资源状态：
 *
 * | 状态 | url 模板 | 任务点挂在哪 |
 * | --- | --- | --- |
 * | `main.chapter.section.source` | `/{sourceId}/section` | 挂在「节」上（章 → 节 → 资源） |
 * | `main.chapter.section.point.source` | `/{sourceId}/subsection` | 挂在「点」上（章 → 节 → 点 → 资源） |
 *
 * 判据是**祖先链长度**（不含自己）：`1` ⇒ `section`；`2` ⇒ `subsection`。
 * 其余长度站点没有对应状态，归 `unsupported`（本课 cid `2005836044` 未出现）。
 *
 * ⚠️ `subsection` 这条**是按同族状态类推出来的，没有任何真实页面实证**
 * （2026-10-08 全量扫过 `local/` 无一条真实 `/subsection` 页面 URL）。
 * 用户已知悉并拍板照跳 —— 理由与现场验证点见需求文档 §A.2 / §F.1-1。
 */
export type PointForm = 'section' | 'subsection' | 'unsupported';

/** 展平后的一个任务点。字段全部来自 `getCatalogList` 的响应，不做二次推导。 */
export interface TaskPoint {
  /** 该任务点**所在节点自己**的 id（`section` 形态里是「节」id，`subsection` 形态里是「点」id） */
  nodeId: string;
  /** 祖先 id 链，**不含自己**：`[章id]` 或 `[章id, 节id]` */
  ancestors: string[];
  /**
   * 祖先**名字**链，与 `ancestors` 一一对应（不含自己）。
   *
   * 只为状态行文案存在（§E.1 的「正在播放第 2 章「1.3 绪论」」）——
   * 光有 id 拼不出给人看的字。纯展示字段，任何判断逻辑都不许依赖它。
   */
  path: string[];
  /** 拼好的 `location.hash`；`unsupported` 时为空串 */
  hash: string;
  form: PointForm;
  /** `icon_list[0].id` —— 拼 hash 用的就是它（**不是** `task_id`，那个实测恒为 0） */
  sourceId: string;
  /** 资源类型号 `icon_list[0].type`；数字与字符串两种形态都实测到过，这里一律 `String()` */
  type: string;
  /** 站点给的类型名 `icon_list[0].type_name`，只用于日志与 UI */
  typeName: string;
  kind: SourceKind;
  name: string;
  finished: boolean;
  chapterId: string;
  sectionId: string;
  /** 只有 `subsection` 形态才有值 */
  pointId: string;
}

/** 把接口字段转成字符串。`null` / `undefined` 一律给空串，避免出现 `"undefined"` */
function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * 任务点是否已完成。
 *
 * ⚠️ 这个接口里 `finished` **数字 `1` 与字符串 `"1"` 两种形态都实测到过**
 * （`local/capture/catalog-list.json` 全量 66 个任务点都是数字，但 §B.3 有历史证据），
 * 所以一律走 `Number()`，不要用 `=== 1`。
 */
export function isFinished(value: unknown): boolean {
  return Number(value) === 1;
}

/**
 * 拼任务点的 hash（纯函数，不读 `location`）。
 *
 * - 三级：`#/{cid}/{章}/{节}/{sourceId}/section`
 * - 四级：`#/{cid}/{章}/{节}/{点}/{sourceId}/subsection`
 *
 * 实测实例（三级，来自需求文档 §A.2）：
 * `#/2005836044/766102022/1482506601/124739605/section`
 * —— `1482506601` 是「节」节点自己的 id、`124739605` 是它的 `icon_list[0].id`。
 */
export function sourceHash(
  cid: string,
  ancestors: readonly string[],
  nodeId: string,
  sourceId: string,
): { form: PointForm; hash: string } {
  if (!cid || !nodeId || !sourceId) return { form: 'unsupported', hash: '' };
  if (ancestors.length === 1) {
    return { form: 'section', hash: `#/${cid}/${ancestors[0]}/${nodeId}/${sourceId}/section` };
  }
  if (ancestors.length === 2) {
    return {
      form: 'subsection',
      hash: `#/${cid}/${ancestors[0]}/${ancestors[1]}/${nodeId}/${sourceId}/subsection`,
    };
  }
  return { form: 'unsupported', hash: '' };
}

/**
 * 把 `getCatalogList` 的树展平成**先序**任务点列表（§B.1 / §B.2）。
 *
 * 「任务点」= **`icon_list` 非空的节点**，不区分三级 / 四级。
 * 顺序就是树本身的顺序：`data` 数组顺序 → 递归 `children`。
 *
 * ⚠️ **不依赖 `parent` / `pid` 往回找祖先**（§B.2）：递归时自己把祖先链带下去，
 * 得到的就是权威的祖先链，拼 hash 直接用。
 *
 * `cid` 必须由调用方给（hash 的第一段），不从树里读。
 * 入参按 `unknown` 处理：接口抽风给 `null` / 非数组时**返回空列表而不是抛错**。
 */
export function flattenTaskPoints(tree: unknown, cid: string): TaskPoint[] {
  const out: TaskPoint[] = [];
  collectTaskPoints(tree, cid, [], [], out);
  return out;
}

function collectTaskPoints(
  nodes: unknown,
  cid: string,
  ancestors: string[],
  names: string[],
  out: TaskPoint[],
): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (raw === null || typeof raw !== 'object') continue;
    const node = raw as Record<string, unknown>;
    const nodeId = text(node['id']);
    const nodeName = text(node['name']);
    const icons = node['icon_list'];

    // 一个节点可以「自己就是任务点」**同时**「还有子节点」（实测有这种），所以
    // 这里不是 else —— 先登记自己，再照常往下递归。
    if (nodeId && Array.isArray(icons) && icons.length > 0) {
      const icon = (icons[0] ?? {}) as Record<string, unknown>;
      const sourceId = text(icon['id']);
      const { form, hash } = sourceHash(cid, ancestors, nodeId, sourceId);
      out.push({
        nodeId,
        ancestors: [...ancestors],
        path: [...names],
        hash,
        form,
        sourceId,
        type: text(icon['type']),
        typeName: text(icon['type_name']),
        kind: classifySource(icon['type']),
        name: nodeName,
        finished: isFinished(node['finished']),
        chapterId: ancestors[0] ?? '',
        sectionId: ancestors.length === 1 ? nodeId : (ancestors[1] ?? ''),
        pointId: ancestors.length === 2 ? nodeId : '',
      });
    }

    if (nodeId) collectTaskPoints(node['children'], cid, [...ancestors, nodeId], [...names, nodeName], out);
  }
}

/**
 * 起点：**第一个未完成任务点**（§B.3）。
 *
 * 固定从第一个未完成开始，而不是从「当前停留在哪」开始 —— 用户拍板：
 * 少一个状态来源，少一类 bug。手动跳着看是另一回事，下次启动仍从头扫。
 *
 * @param skipped 本次运行里**已判定「本站不自动处理」而跳过**的节点 id（附件 / 讨论 /
 *   文本 / 未知类型 / `unsupported` 形态）。**这个参数是必需的**：这些点不会被打开，
 *   也就永远不会变成 `finished`，不给跳过集合就会每轮都挑中同一个点 → **死循环**。
 *   旧 DOM 方案靠自己那份 `handled` 集合绕开了，新方案没有那层，必须显式传。
 */
export function firstUnfinished(
  points: readonly TaskPoint[],
  skipped: ReadonlySet<string> = new Set<string>(),
): TaskPoint | null {
  for (const point of points) {
    if (point.finished) continue;
    if (skipped.has(point.nodeId)) continue;
    return point;
  }
  return null;
}

/**
 * 从地址栏认出「这是哪门课」（cid）；认不出返回 `null`。
 *
 * 两条来源，**pathname 优先**（新版学习页 `/home/learn/new/{cid}` 一定带）；
 * pathname 认不出才退回 hash（旧版学习页 `/home/learn/index#/{cid}/...`）。
 * 顺序照抄 `b701b6b` 里那份实测过的实现 —— 两边都命中时给的是同一个 cid，
 * 不存在分歧，纯粹是「哪个先试」。
 */
export function courseIdFromLocation(pathname: string, hash: string): string | null {
  const fromPath = /^\/home\/learn\/new\/(\d+)/.exec(pathname);
  if (fromPath !== null) return fromPath[1] ?? null;

  const fromHash = /^#\/(\d+)(?:\/|$)/.exec(hash);
  if (fromHash !== null) return fromHash[1] ?? null;

  return null;
}

export interface TaskPointSummary {
  total: number;
  done: number;
}

/** 进度汇总，给【监视】页的进度条用（§E.2）。分母不用等 DOM，这是新方案白捡的 */
export function summarizeTaskPoints(points: readonly TaskPoint[]): TaskPointSummary {
  let done = 0;
  for (const point of points) {
    if (point.finished) done += 1;
  }
  return { total: points.length, done };
}

// ------------------------------------------------------------- §E.2 分层列表

/** 任务点分层列表里的一行（章 / 节 / 任务点） */
export interface CourseRow {
  /** 节点 id；任务点行有两个 id 可对，「当前项」比对用的是 `ids` 里的任意一个 */
  ids: string[];
  /** 缩进层级：0 = 章，1 = 节，2 = 任务点 */
  depth: number;
  label: string;
  /** 类型文字（`视频` / `测验` …）；章、节为空串 */
  typeName: string;
  /** 是否已完成；章、节这类**不是任务点**的行给 `null`（界面不画勾） */
  done: boolean | null;
}

/**
 * 把展平的任务点还原成「章 → 节 → 任务点」三层列表（§E.2）。
 *
 * 为什么能从 `TaskPoint[]` 还原：每个点都带着 `ancestors`（id 链）与 `path`（名字链），
 * 章 / 节的名字就在里面，不需要再要一份原始树。
 *
 * ⚠️ 两种形态的**行数不一样**，这是数据本身决定的（本站 66 个点里 39 个是 `section`、
 * 27 个是 `subsection`）：
 *   - `section` 形态：那个「节」自己就是任务点 ⇒ 只出 **节（depth 1）** 一行，勾打在这一行；
 *   - `subsection` 形态：「节」只是容器 ⇒ 出 **节（depth 1，不画勾）** + **任务点（depth 2）** 两行。
 * 所以同一个「节」下面可能既有直接打勾的节行、又有缩进去的点行，那不是 bug。
 *
 * 反过来也有：一个节**自己带 `icon_list`（是个任务点）、同时又有子任务点**（实测
 * `836508569` 就是这样）。先序保证这个节行先落地（勾 = 它自己的 `finished`），
 * 它的子任务点再作为 `depth 2` 追加在后面。
 */
export function buildCourseRows(points: readonly TaskPoint[]): CourseRow[] {
  const rows: CourseRow[] = [];
  /** 已经画过的章、节，用来去重（同一个章/节会跟着它的每个任务点被访问到） */
  const seenChapter = new Set<string>();
  const seenSection = new Set<string>();

  for (const point of points) {
    const chapterId = point.ancestors[0];
    const chapterName = point.path[0];
    if (chapterId !== undefined && !seenChapter.has(chapterId)) {
      seenChapter.add(chapterId);
      rows.push({
        ids: [chapterId],
        depth: 0,
        label: chapterName === undefined || chapterName === '' ? `（未命名章 ${chapterId}）` : chapterName,
        typeName: '',
        done: null,
      });
    }

    const isSub = point.ancestors.length >= 2;
    const sectionName = isSub ? point.path[1] : point.name;
    if (!seenSection.has(point.sectionId)) {
      seenSection.add(point.sectionId);
      rows.push({
        ids: [point.sectionId],
        depth: 1,
        label: sectionName === undefined || sectionName === '' ? `（未命名节 ${point.sectionId}）` : sectionName,
        typeName: isSub ? '' : point.typeName,
        done: isSub ? null : point.finished,
      });
    }

    if (isSub) {
      rows.push({
        ids: [point.nodeId, point.sourceId],
        depth: 2,
        label: point.name === '' ? `（未命名任务点 ${point.nodeId}）` : point.name,
        typeName: point.typeName,
        done: point.finished,
      });
    }
  }

  return rows;
}

/** 这一行是不是「当前正在处理的那一项」（【监视】页高亮用） */
export function isCurrentRow(row: CourseRow, currentId: string | null): boolean {
  if (currentId === null) return false;
  return row.ids.includes(currentId);
}

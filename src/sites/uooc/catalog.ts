/**
 * UOOC 目录树「视图层」：把展平的任务点还原成【监视】页的「章 → 节 → 任务点」分层列表。
 *
 * 纯模型（展平 / 拼 hash / 资源层）在 `catalog-model.ts`；本文件通过 `export *`
 * 原样转出它，**保持全部现有消费者（tests / takeover / fetch-catalog / 监视页）的入口不变**。
 */

import type { TaskPoint } from './catalog-model.ts';

export * from './catalog-model.ts';

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


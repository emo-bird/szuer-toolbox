/**
 * 自定义课程（**跨站点通用数据**）。
 *
 * 【为什么住在 `common/`】用户要求（`docs/需求文档.md` §5）：
 * 「通用信息跨站点存储（例如，本科选课的自定义课程同时也要能被办事大厅我的课程表读取）」
 * ⇒ 它不属于 bkxk，键也不带站点前缀（`custom:courses`，storage 层再加 `sztb:`）。
 * bkxk 的冲突追加 / 课表注入要用它，将来 ehall 的「我的课程表」也要读它。
 *
 * 【本模块做「存 + 清洗 + 读写」】增删改的**界面**在 `sites/bkxk/tabs/custom.ts`
 * （原定批 4，用户提前到本轮做，理由是批 3 的 `hijack` / `timetable` 没数据可验）。
 * 但写入规则留在本模块：`custom:courses` 是跨站点通用数据，将来 ehall 也要加课。
 *
 * 【为什么不存 `segs`】与旧仓库 `custom.js:85-94` 同款理由：**不存派生数据**。
 * 只落 `place` 原文，时段一律现场解析 —— 解析口径变了（例如 `time.ts` 修了正则）
 * 时，历史数据自动跟着变，不用做数据迁移。解析用 bkxk 的 `sites/bkxk/time.ts`，
 * 见 `sites/bkxk/custom.ts`。
 */

import { read, write } from '../core/storage.ts';

/** 存储键（`storage` 层会自动补 `sztb:` 前缀 ⇒ 实际全名 `sztb:custom:courses`） */
export const CUSTOM_COURSES_KEY = 'custom:courses';

/**
 * ⚠️ **批 1 的旧落点，不要往里写**。
 *
 * 批 1 的旧数据迁移把自定义课程写进了站点命名空间（`sztb:bkxk:customCourses`），
 * 而迁移标记 `migrate:bkxk:v2` 是一次性的 —— 已经跑过迁移的装机会出现
 * 「通用键为空 + 标记已置位」⇒ 旧课程静默消失。
 * 所以 `sites/bkxk/legacy.ts` 里有一次性的搬运逻辑读这个键。
 */
export const LEGACY_SITE_CUSTOM_KEY = 'bkxk:customCourses';

/** 一条自定义课程（**原始字段**，不含从 `place` 派生的 `segs`） */
export interface CustomCourse {
  readonly id: string;
  readonly name: string;
  /** 教师；可空串 */
  readonly teacher: string;
  /**
   * 时间地点原文，与站点同格式，例如
   * `5-18周 星期二 3-4节 致理楼L1-707`，多段用 `,` 分隔。
   */
  readonly place: string;
  /** 显示配色；只用于区分，不参与任何逻辑 */
  readonly color: string;
  /** 关掉的课程仍然留在列表里，但不参与冲突计算与课表注入 */
  readonly enabled: boolean;
}

/** 配色循环（取自旧仓库 `custom.js:80`） */
export const CUSTOM_COLORS: readonly string[] = [
  '#e8f2fd',
  '#fdf0e8',
  '#e8fdf0',
  '#f2e8fd',
  '#fdfde8',
  '#fde8f0',
];

/** 第 `index` 门课该用的配色（负数与小数都归一，不返回 undefined） */
export function colorAt(index: number): string {
  const n = CUSTOM_COLORS.length;
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  const picked = CUSTOM_COLORS[((i % n) + n) % n];
  return picked === undefined ? '#e8f2fd' : picked;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * 清洗一条自定义课程。
 *
 * 口径与批 1 的迁移一致（`legacy.ts` 原本内联着同一段，现已改为 import 本函数）：
 * **缺 `name` 或缺 `id` 的一律丢弃**（返回 `null`）—— 没有 id 就没法编辑 / 删除，
 * 没有名字就没法显示，留着只会在界面上变成一条空的坏数据。
 */
export function slimCustomCourse(item: unknown): CustomCourse | null {
  const o = asRecord(item);
  if (o === null) return null;
  const name = str(o['name']).trim();
  if (name === '') return null;
  const id = str(o['id']);
  if (id === '') return null;
  return {
    id,
    name,
    teacher: str(o['teacher']),
    place: str(o['place']),
    color: str(o['color']),
    // 旧仓库语义：只有显式 false 才算关（`custom.js:106`）
    enabled: o['enabled'] !== false,
  };
}

/** 把存储里的原始值清洗成课程数组；不是数组、全是坏数据都返回空数组（不抛错） */
export function parseCustomCourses(raw: unknown): readonly CustomCourse[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomCourse[] = [];
  for (const item of raw) {
    const rec = slimCustomCourse(item);
    if (rec !== null) out.push(rec);
  }
  return out;
}

/** 读当前的自定义课程（只读） */
export function readCustomCourses(): readonly CustomCourse[] {
  return parseCustomCourses(read<unknown>(CUSTOM_COURSES_KEY, []));
}

/** 从库里挑出启用中的课程（`hijack` / `timetable` 只用这些） */
export function enabledCourses(courses: readonly CustomCourse[]): readonly CustomCourse[] {
  return courses.filter((c) => c.enabled);
}

// ------------------------------------------------------------------ 写入层
//
// 【设计口径】这里是**纯变换 + 一个写盘出口**，不碰 DOM、不弹提示：
//   - 纯变换（`makeCourseId` / `appendCourse` / `updateCourse` / `removeCourse` /
//     `setCourseEnabled`）一律**返回新数组、不改入参**，方便档 1 测与界面回滚；
//   - 唯一的 IO 是 `writeCustomCourses`，界面每次改完调它一次。
// 为什么不把 CRUD 写进界面文件：`custom:courses` 是**跨站点通用数据**，
// 将来 ehall 的「我的课程表」也要能加课 —— 写入规则不能长在 bkxk 的标签页里。

/** 新建 / 修改一门课程时的用户输入（`id` 与 `color` 由数据层补，不让界面编） */
export interface CustomCourseDraft {
  readonly name: string;
  readonly teacher: string;
  readonly place: string;
}

/**
 * 生成一个课程 id。
 *
 * 形态沿用旧仓库 `custom.js` 的 `'c' + Date.now() + 三位随机`，但用 `-` 隔开两段，
 * 免得「时间戳尾数 + 随机数」粘成一个看不出边界的数字串。
 * `now` / `rand` **可注入**：档 1 才能钉住生成结果（不用假计时器）。
 */
export function makeCourseId(now: number, rand: number): string {
  const ms = Number.isFinite(now) ? Math.floor(now) : 0;
  const r = Number.isFinite(rand) ? Math.floor(Math.abs(rand) * 1000) % 1000 : 0;
  return `c${String(ms)}-${String(r).padStart(3, '0')}`;
}

/**
 * 追加一门课程：配色按**当前门数**轮转（删掉中间某门不会重排已有配色），
 * `name` / `place` 去首尾空白，`enabled` 默认开。
 */
export function appendCourse(
  courses: readonly CustomCourse[],
  draft: CustomCourseDraft,
  id: string,
): readonly CustomCourse[] {
  const created: CustomCourse = {
    id,
    name: draft.name.trim(),
    teacher: draft.teacher.trim(),
    place: draft.place.trim(),
    color: colorAt(courses.length),
    enabled: true,
  };
  return [...courses, created];
}

/**
 * 改一门课程（`id` 与 `color` 保持不变，`enabled` 也不动 —— 改文字不该顺手把它打开）。
 * `id` 不在库里时原样返回（不新插入，避免界面拿着过期 id 造出重复条目）。
 */
export function updateCourse(
  courses: readonly CustomCourse[],
  id: string,
  patch: CustomCourseDraft,
): readonly CustomCourse[] {
  return courses.map((c) =>
    c.id === id
      ? {
          ...c,
          name: patch.name.trim(),
          teacher: patch.teacher.trim(),
          place: patch.place.trim(),
        }
      : c,
  );
}

/** 删一门课程（`id` 不在库里时原样返回） */
export function removeCourse(courses: readonly CustomCourse[], id: string): readonly CustomCourse[] {
  return courses.filter((c) => c.id !== id);
}

/** 开关一门课程（关掉的仍留在列表里，只是不参与冲突计算与课表注入） */
export function setCourseEnabled(
  courses: readonly CustomCourse[],
  id: string,
  enabled: boolean,
): readonly CustomCourse[] {
  return courses.map((c) => (c.id === id ? { ...c, enabled } : c));
}

/** 唯一的写盘出口（界面每次改完调它一次；`[]` 会真的写空数组，不是删除键） */
export function writeCustomCourses(courses: readonly CustomCourse[]): void {
  write(CUSTOM_COURSES_KEY, courses);
}

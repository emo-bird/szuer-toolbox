/**
 * 自定义课程（**跨站点通用数据**）。
 *
 * 【为什么住在 `common/`】用户要求（`docs/需求文档.md` §5）：
 * 「通用信息跨站点存储（例如，本科选课的自定义课程同时也要能被办事大厅我的课程表读取）」
 * ⇒ 它不属于 bkxk，键也不带站点前缀（`custom:courses`，storage 层再加 `sztb:`）。
 * bkxk 的冲突追加 / 课表注入要用它，将来 ehall 的「我的课程表」也要读它。
 *
 * 【本模块只做「存 + 清洗 + 读」】增删改与界面是批 4（阶段 4 的「自定义」标签页）的事。
 * 现在做数据层是因为批 3 的 `hijack` / `timetable` 没有它就没东西可注入。
 *
 * 【为什么不存 `segs`】与旧仓库 `custom.js:85-94` 同款理由：**不存派生数据**。
 * 只落 `place` 原文，时段一律现场解析 —— 解析口径变了（例如 `time.ts` 修了正则）
 * 时，历史数据自动跟着变，不用做数据迁移。解析用 bkxk 的 `sites/bkxk/time.ts`，
 * 见 `sites/bkxk/custom.ts`。
 */

import { read } from '../core/storage.ts';

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

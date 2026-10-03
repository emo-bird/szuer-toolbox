/**
 * bkxk 课程列表取数与字段映射（旧仓库 `C:\Project\szu_bkxk\src\courses.js` 的移植）。
 *
 * 【结构陷阱，HAR 实测，别想当然】
 *   - `programCourse.do` / `recommendedCourse.do` 等是**嵌套结构**：`dataList[] → tcList[]`
 *     （一条课程挂多个教学班，教学班字段可能为 null）
 *   - `publicCourse.do`（校公选 / 慕课）是**扁平结构**：没有 `tcList`，一行即一个教学班
 *   - 嵌套结构里教学班字段为 null 时**不得覆盖**课程级字段 —— `pick()` 就是干这个的
 *
 * 本模块只做「取数 + 归一化」，不发写请求、不碰 DOM。
 */

import { scoped } from '../../common/core/log.ts';
import { getValue, setValue } from '../../common/core/settings.ts';
import {
  CATEGORY_EP,
  EP,
  RESP_KIND,
  endpointUrl,
  buildQueryBody,
  extractBatchCode,
  bkxkSend,
} from './api.ts';
import type { CategoryCode, RespKind, Endpoint } from './api.ts';
import { SITE_ID, VALUE } from './settings.ts';

const log = scoped('bkxk/courses');

/** 站点返回的原始标量。站点大量使用 `'0'` / `'1'` 字符串当布尔，**不要**在这里转成 boolean */
export type Raw = string | number | boolean | null;

/** 归一化后的教学班。字段全是「取不到就是 null」，不是 '' / 0 —— 0 会被误判成满课 */
export interface TeachingClass {
  readonly teachingClassID: Raw;
  readonly courseNumber: Raw;
  readonly courseName: Raw;
  readonly teacherName: Raw;
  readonly teachingPlace: Raw;
  readonly courseTotalNumber: Raw;
  readonly classCapacity: Raw;
  readonly numberOfFirstVolunteer: Raw;
  readonly courseIndex: Raw;
  readonly isMooc: Raw;
  readonly isFull: Raw;
  readonly isConflict: Raw;
  readonly isFavorite: Raw;
  readonly typeName: Raw;
  readonly courseNatureName: Raw;
  readonly departmentName: Raw;
  readonly credit: Raw;
  readonly campus: Raw;
}

/**
 * 取第一个「有效」的值：跳过 `undefined` / `null` / `''`。
 *
 * ⚠️ 只放行标量。旧版会把对象原样返回，但实测这些字段全是标量，
 * 真遇到对象说明响应结构变了，返回 null 让调用方走「未识别」路径比传下去更好。
 * 注：`0` 与 `false` **算有效值**（站点用 `'0'` / `0` 表示「没满 / 无冲突」）。
 */
export function pick(...vals: unknown[]): Raw {
  for (const v of vals) {
    if (v === undefined || v === null || v === '') continue;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return v as Raw;
  }
  return null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 归一化一个教学班（无论来自嵌套还是扁平结构） */
export function normClass(tc: unknown, course: unknown): TeachingClass {
  const t = asRecord(tc);
  const c = asRecord(course);
  return {
    teachingClassID: pick(t['teachingClassID'], t['teachingClassId'], c['teachingClassID']),
    courseNumber: pick(t['courseNumber'], c['courseNumber']),
    courseName: pick(t['courseName'], c['courseName'], t['title'], c['title']),
    teacherName: pick(t['teacherName'], c['teacherName']),
    teachingPlace: pick(t['teachingPlace'], c['teachingPlace']),
    courseTotalNumber: pick(t['courseTotalNumber'], c['courseTotalNumber']),
    classCapacity: pick(t['classCapacity'], c['classCapacity']),
    numberOfFirstVolunteer: pick(t['numberOfFirstVolunteer'], c['numberOfFirstVolunteer']),
    courseIndex: pick(t['courseIndex'], c['courseIndex']),
    isMooc: pick(t['isMooc'], c['isMooc']),
    isFull: pick(t['isFull'], c['isFull']),
    isConflict: pick(t['isConflict'], c['isConflict']),
    isFavorite: pick(t['isFavorite'], c['isFavorite']),
    typeName: pick(t['typeName'], c['typeName']),
    courseNatureName: pick(t['courseNatureName'], c['courseNatureName']),
    departmentName: pick(t['departmentName'], c['departmentName']),
    credit: pick(t['credit'], c['credit']),
    campus: pick(t['campus'], c['campus']),
  };
}

/** 单条 `dataList` 项 → 教学班数组。自动区分嵌套 / 扁平结构 */
export function classesOf(item: unknown): TeachingClass[] {
  if (item === null || typeof item !== 'object') return [];
  const tcList = (item as Record<string, unknown>)['tcList'];
  if (Array.isArray(tcList)) return tcList.map((tc) => normClass(tc, item));
  // 扁平结构：item 自己就是一个教学班
  return [normClass(item, item)];
}

/** 整个列表响应 → 扁平的教学班数组 */
export function flatten(json: unknown): TeachingClass[] {
  const data = asRecord(asRecord(json)['data']);
  const list = data['dataList'];
  if (!Array.isArray(list)) return [];
  const out: TeachingClass[] = [];
  for (const item of list) {
    for (const cls of classesOf(item)) out.push(cls);
  }
  return out;
}

/**
 * 列表行上的剩余名额 = `classCapacity - numberOfFirstVolunteer`（只读，不做请求）。
 *
 * 【与 `api.capacityRemain()` 的区别，别混用】
 *   - 本函数吃的是**列表响应**里的行数据，字段是 `classCapacity` / `numberOfFirstVolunteer`
 *   - `api.capacityRemain()` 吃的是 `capacity.do` 的 data，字段是 `mainClassCapacity` /
 *     `mainElectiveNumber`（实测列表里的前一组字段在 capacity.do 里**全是 null**）
 * 字段缺失或非法一律返回 **null**（不是 0）—— 0 会被误判成「满课」。
 */
export function remainOfRow(c: TeachingClass | null | undefined): number | null {
  if (c === null || c === undefined) return null;
  const cap = Number(c.classCapacity);
  const used = Number(c.numberOfFirstVolunteer);
  if (c.classCapacity === null || c.numberOfFirstVolunteer === null) return null;
  if (!Number.isFinite(cap) || !Number.isFinite(used)) return null;
  return cap - used;
}

/**
 * 从列表响应提取批次码，并在用户**没有手填**时写进设置。
 *
 * 「用户手填优先」是旧版行为，保留：手填值往往正是为了覆盖站点读不到的场景，
 * 被自动值盖掉会让用户困惑。
 *
 * @returns 提取到的批次码与各类别计数；响应里没有批次码时返回 null
 */
export function learnBatchCode(json: unknown): { batchCode: string | null; counts: Record<string, number> } | null {
  const got = extractBatchCode(json);
  if (got.batchCode === null || got.batchCode === '') return null;
  if (getValue<string>(SITE_ID, VALUE.BATCH_CODE) === '') {
    setValue(SITE_ID, VALUE.BATCH_CODE, got.batchCode);
    log.info(`自动获取选课批次码：${got.batchCode}`);
  }
  return got;
}

/** `fetchCategory` 的参数 */
export interface FetchCategoryOptions {
  category: CategoryCode;
  studentCode: string;
  batchCode: string;
  /** 会话 token（红线 R3：只透传，不落盘不打日志） */
  token: string;
  pageNumber?: number;
  pageSize?: number;
  /** 接口 origin，缺省取当前页面 `location.origin`（Node 测试里必须显式传） */
  origin?: string;
}

/** `fetchCategory` 的结果 */
export interface CategoryResult {
  readonly kind: RespKind;
  readonly msg: string;
  readonly classes: TeachingClass[];
  /** 原始 JSON，供需要别的字段的调用方使用 */
  readonly raw: unknown;
}

function currentOrigin(explicit: string | undefined): string {
  if (explicit !== undefined) return explicit;
  return typeof location !== 'undefined' ? location.origin : '';
}

/**
 * 拉一个类别的课程列表。
 *
 * 【端点分派】用该类别在 `CATEGORY_EP` 里的端点。列表端点是**按类别分开的**，
 * 传错类别拿到的就是另一批课 —— 调用方必须传对它自己那一栏的类别。
 *
 * 【只读，不需要写接口开关】
 */
export async function fetchCategory(o: FetchCategoryOptions): Promise<CategoryResult> {
  const ep: Endpoint = CATEGORY_EP[o.category] ?? EP.PROGRAM_COURSE;
  const body = buildQueryBody({
    studentCode: o.studentCode,
    electiveBatchCode: o.batchCode,
    teachingClassType: o.category,
    ...(o.pageNumber !== undefined ? { pageNumber: o.pageNumber } : {}),
    ...(o.pageSize !== undefined ? { pageSize: o.pageSize } : {}),
  });

  const r = await bkxkSend({
    action: `列表查询 ${o.category}`,
    url: endpointUrl(ep, currentOrigin(o.origin)),
    method: 'POST',
    body,
    token: o.token,
  });

  if (r.cls.kind === RESP_KIND.OK) learnBatchCode(r.cls.json);

  return {
    kind: r.cls.kind,
    msg: r.cls.msg,
    classes: flatten(r.cls.json),
    raw: r.cls.json,
  };
}

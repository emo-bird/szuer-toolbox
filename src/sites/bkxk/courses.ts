/**
 * bkxk 课程列表：教学班归一化 / 扁平与嵌套双结构兼容 / 按类别拉取（批 2）。
 *
 * ## 两种响应结构都得吃（站点实测）
 *
 * 1. **嵌套**（`programCourse.do` / `publicCourse.do` / `recommendedCourse.do`）：
 *    一门课一个对象，教学班在它的 `tcList` 里。
 * 2. **扁平**（`noArranged.do` 这类「已选清单」）：一行就是一个教学班，
 *    **没有 `tcList`**。
 *
 * `classesOf(item)` 就是干这个的：有 `tcList` 数组就逐条归一化，
 * 否则把这一行自己当成教学班。
 *
 * ## 取数的路径：只认**顶层** `dataList`
 *
 * ⚠️ 这是实测结论，不是抄旧代码来的。旧仓库 `courses.js` 的 `flatten` 取的是
 * `json.data.dataList`，而真实响应**没有 `data` 外壳**：
 *
 * - 三份真实样本（`tests/fixtures/bkxk-*.json`）顶层键都是
 *   `totalCount, dataList, msg, code, timestamp`；
 * - HAR `bkxk.szu.edu.cn-1.har` 里 `programCourse` / `recommendedCourse` 的响应正文是
 *   `"text":"{\"totalCount\":7,\"dataList\":[{\"selected\":true,\"tcList\":[…`；
 * - 全 HAR 检索 `\"data\":\{\"(dataList|totalCount)` **命中 0 次**。
 *
 * ⇒ 旧脚本那种写法**永远拿到空数组**（旧仓库的「类别监控」实际是坏的）。
 * 按用户拍板：**只认顶层 `dataList`**，拿不到就返回空数组 + 落一条 warn
 * （让「拿不到」在日志里可见，而不是静默变空）。
 *
 * ⚠️ 反面对照，别混：**单对象端点**（`capacity.do`）的响应**确实是** `{"data":{…}}`，
 * 所以 `capacityRemain(cls.data)` 那种写法是对的。两种形态并存，看到 `data`
 * 就以为有、或看到 `dataList` 就以为没有，都会踩坑。
 *
 * ## 字段口径（照着 33 个真实 tc 行核对过）
 *
 * - `courseName` / `credit` / `typeName` / `courseNatureName` / `departmentName`
 *   只在**课程级**有值，tc 行上要么没这个键、要么是 `null` ⇒ 先取 tc 再取课程，
 *   且 **`pick` 必须把空串也算缺失**。
 * - `classCapacity` / `numberOfFirstVolunteer` / `isFull` / `isConflict` 只在 **tc 级**有，
 *   且都是**字符串** `"0"` / `"1"`，不是布尔。
 * - `isFavorite` 在 `programCourse` 的 33 行里**全是 `null`**（站点这一栏不给值），
 *   在 `noArranged` 里是 `"0"` ⇒ 归一化后是 `boolean | null`，
 *   **看收藏要另找依据**（列表页 DOM 的星标才行）。
 * - `campus` 在 `programCourse` 的 tc 与课程级**都不存在**，`noArranged` 行里才有（`"01"`）
 *   ⇒ 归一化后可能是空串，需要校区时用会话里的 `DEFAULT_CAMPUS` 兜底。
 *
 * 本模块**只读**：不写 storage、不落盘、不发写接口；`fetchCategory` 也不写设置，
 * 「学到的批次码」用返回值交回调用方，由调用方决定要不要落盘。
 */

import { scoped } from '../../common/core/log.ts';
import {
  RESP_KIND,
  CATEGORY_EP,
  bkxkSend,
  buildQueryBody,
  endpointUrl,
  extractBatchCode,
} from './api.ts';
import type { CategoryCode, RespKind, SendOptions, SendResult } from './api.ts';
import { DEFAULT_CAMPUS } from './session.ts';

const log = scoped('bkxk/courses');

/**
 * 归一化后的教学班（18 个字段，沿用旧仓库的形状 —— 批 3/批 4 的
 * 冲突判定、自定义课程、监控都按这套字段消费）。
 */
export interface BkxkClass {
  readonly teachingClassID: string;
  readonly courseNumber: string;
  readonly courseName: string;
  readonly teacherName: string;
  /** 形如 `5-18周星期一3-5节汇德楼A508`，交给 `time.ts` 解析 */
  readonly teachingPlace: string;
  readonly courseTotalNumber: number | null;
  readonly classCapacity: number | null;
  readonly numberOfFirstVolunteer: number | null;
  readonly courseIndex: string;
  readonly isMooc: boolean | null;
  readonly isFull: boolean | null;
  readonly isConflict: boolean | null;
  /** ⚠️ `programCourse` 里这一栏全是 `null`，别拿它当收藏的判据 */
  readonly isFavorite: boolean | null;
  readonly typeName: string;
  readonly courseNatureName: string;
  readonly departmentName: string;
  readonly credit: number | null;
  readonly campus: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * 取第一个「有值」的候选。
 *
 * ⚠️ **空串也算缺失**：站点会在 tc 行上把 `courseName` 写成 `""` 而不是 `null`，
 * 按 `null` 判断就会拿到空课程名。这条是旧仓库踩过的坑。
 */
export function pick(...values: readonly unknown[]): unknown {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v === '') continue;
    return v;
  }
  return null;
}

/** `pick` 之后转字符串；拿不到给空串（不抛错）。 */
export function pickString(...values: readonly unknown[]): string {
  const v = pick(...values);
  if (v === null) return '';
  return typeof v === 'string' ? v : String(v);
}

/** 转数字；非法 / 空串 / 布尔都给 `null`（`"0"` 是合法的 0）。 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * 转布尔开关。站点用字符串 `"0"` / `"1"`，少数地方给真布尔。
 * **给不出结论时返回 `null`（不是 `false`）** —— `null` 表示「站点这一栏没给值」，
 * 与「站点说是 0」是两回事。
 */
export function toFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
  }
  return null;
}

/** 取第一个能转成数字的候选。 */
export function pickNumber(...values: readonly unknown[]): number | null {
  for (const v of values) {
    const n = toNumber(v);
    if (n !== null) return n;
  }
  return null;
}

/** 取第一个能给出结论的开关候选。 */
export function pickFlag(...values: readonly unknown[]): boolean | null {
  for (const v of values) {
    const b = toFlag(v);
    if (b !== null) return b;
  }
  return null;
}

/**
 * 把一个教学班归一化成 `BkxkClass`。
 *
 * `tc` 是教学班所在的对象，`course` 是课程级对象；
 * 扁平结构里两者是**同一个对象**（传两次自己即可）。
 */
export function normClass(tc: unknown, course: unknown): BkxkClass {
  const t = asRecord(tc);
  const c = asRecord(course);
  return {
    teachingClassID: pickString(t['teachingClassID'], c['teachingClassID']),
    courseNumber: pickString(t['courseNumber'], c['courseNumber']),
    courseName: pickString(t['courseName'], c['courseName']),
    teacherName: pickString(t['teacherName'], c['teacherName']),
    teachingPlace: pickString(t['teachingPlace'], c['teachingPlace']),
    courseTotalNumber: pickNumber(t['courseTotalNumber'], c['courseTotalNumber']),
    classCapacity: pickNumber(t['classCapacity'], c['classCapacity']),
    numberOfFirstVolunteer: pickNumber(t['numberOfFirstVolunteer'], c['numberOfFirstVolunteer']),
    courseIndex: pickString(t['courseIndex'], c['courseIndex']),
    isMooc: pickFlag(t['isMooc'], c['isMooc']),
    isFull: pickFlag(t['isFull'], c['isFull']),
    isConflict: pickFlag(t['isConflict'], c['isConflict']),
    isFavorite: pickFlag(t['isFavorite'], c['isFavorite']),
    typeName: pickString(t['typeName'], c['typeName']),
    courseNatureName: pickString(t['courseNatureName'], c['courseNatureName']),
    departmentName: pickString(t['departmentName'], c['departmentName']),
    credit: pickNumber(t['credit'], c['credit']),
    campus: pickString(t['campus'], c['campus']),
  };
}

/**
 * 一项列表条目 → 若干教学班（嵌套 / 扁平双结构兼容）。
 *
 * ⚠️ `tcList` 是**空数组**时返回空数组（这门课一个教学班都没有，没有可操作的
 * `teachingClassID`，不该凭空造一行）。这是沿用旧仓库的行为。
 */
export function classesOf(item: unknown): readonly BkxkClass[] {
  const obj = asRecord(item);
  const list = obj['tcList'];
  if (Array.isArray(list)) {
    return list.map((tc) => normClass(tc, item));
  }
  return [normClass(item, item)];
}

/**
 * 从响应里取列表数组：**只认顶层 `dataList`**（见文件头「取数的路径」）。
 * 拿不到（不是对象 / 没有这个键 / 不是数组）返回 `null`，由调用方决定怎么表达。
 */
export function listFrom(json: unknown): readonly unknown[] | null {
  const list = asRecord(json)['dataList'];
  return Array.isArray(list) ? list : null;
}

/**
 * 列表响应 → 全部教学班。
 *
 * 拿不到顶层 `dataList` 时**返回空数组 + 落一条 warn**（用户拍板 A）：
 * 站点改版或端点形态变了，日志里必须留痕，不能静默返回空。
 */
export function flatten(json: unknown): readonly BkxkClass[] {
  const list = listFrom(json);
  if (list === null) {
    log.warn('列表响应里没有顶层 dataList，返回空列表（站点改版？端点形态变了？）');
    return [];
  }
  const out: BkxkClass[] = [];
  for (const item of list) out.push(...classesOf(item));
  log.info(`列表响应 ${list.length} 项 → ${out.length} 个教学班`);
  return out;
}

/**
 * 剩余名额 = `classCapacity - numberOfFirstVolunteer`。
 *
 * ⚠️ 这两个字段**只在列表响应里有效**；`capacity.do` 的同名字段实测**全是 `null`**，
 * 那边要用 `api.capacityRemain(cls.data)` 读 `mainClassCapacity` / `mainElectiveNumber`。
 * 拿不到或非法时返回 **`null`（不是 0）** —— 0 会被误判成「满课」。
 */
export function remainOf(c: Pick<BkxkClass, 'classCapacity' | 'numberOfFirstVolunteer'>): number | null {
  if (c.classCapacity === null || c.numberOfFirstVolunteer === null) return null;
  return c.classCapacity - c.numberOfFirstVolunteer;
}

/** 发请求的函数形状（与 `api.bkxkSend` 一致），便于档 1 注入假 send */
export type SendFn = (o: SendOptions) => Promise<SendResult>;

export interface FetchCategoryParams {
  /** 类别码，同时也是请求里的 `teachingClassType` */
  readonly category: CategoryCode;
  readonly studentCode: string;
  /** 选课批次码；为 `null` / 空串时直接失败（不发出请求） */
  readonly batchCode: string | null;
  readonly campus?: string;
  readonly pageSize?: number;
  readonly pageNumber?: number;
  /** 会话 token；只在这里交给 `send`，不会被记进日志或返回值 */
  readonly token?: string;
  /** 缺省取 `location.origin`；测试里显式传 */
  readonly origin?: string;
  /** 缺省 `bkxkSend`；档 1 注入假 send 用 */
  readonly send?: SendFn;
}

export interface CategoryResult {
  readonly ok: boolean;
  readonly kind: RespKind;
  readonly code: string | null;
  readonly msg: string;
  readonly classes: readonly BkxkClass[];
  /** 本次响应里学到的批次码（站点有时会换个新的），由调用方决定要不要落盘 */
  readonly batchCode: string | null;
  /** HTTP 状态码；`0` 表示**根本没发请求**（参数不全 / 取不到 origin） */
  readonly status: number;
  /** 原始结果，供调用方取 finalUrl / 落档；没发请求时为 `null` */
  readonly raw: SendResult | null;
}

function currentOrigin(): string {
  // 抠成函数是为了在 Node 里跑测试时不会因为 location 不存在而炸
  return typeof location !== 'undefined' && typeof location.origin === 'string' ? location.origin : '';
}

/**
 * 拉一个类别的课程列表（只读）。
 *
 * 不写任何 storage、不动设置：学到的批次码从返回值的 `batchCode` 交回调用方。
 * `send` 可注入 —— 档 1 用假 send 覆盖全部分支，不需要真机。
 */
export async function fetchCategory(p: FetchCategoryParams): Promise<CategoryResult> {
  const denied = (msg: string): CategoryResult => ({
    ok: false,
    kind: RESP_KIND.UNKNOWN,
    code: null,
    msg,
    classes: [],
    batchCode: null,
    status: 0,
    raw: null,
  });

  const origin = p.origin ?? currentOrigin();
  if (origin === '') {
    log.warn('取不到 origin，放弃拉取课程列表');
    return denied('取不到 origin');
  }
  if (p.studentCode === '') {
    log.warn('会话里没有学号，放弃拉取课程列表');
    return denied('缺少学号');
  }
  if (p.batchCode === null || p.batchCode === '') {
    log.warn('没有选课批次码，放弃拉取课程列表');
    return denied('缺少选课批次码');
  }

  const url = endpointUrl(CATEGORY_EP[p.category], origin);
  const body = buildQueryBody({
    studentCode: p.studentCode,
    electiveBatchCode: p.batchCode,
    teachingClassType: p.category,
    campus: p.campus ?? DEFAULT_CAMPUS,
    ...(p.pageSize === undefined ? {} : { pageSize: p.pageSize }),
    ...(p.pageNumber === undefined ? {} : { pageNumber: p.pageNumber }),
  });

  const send = p.send ?? bkxkSend;
  const raw = await send({
    url,
    action: `列表:${p.category}`,
    body,
    token: p.token ?? '',
  });

  const base = {
    code: raw.cls.code,
    msg: raw.cls.msg,
    batchCode: null,
    status: raw.status,
    raw,
  };

  if (raw.cls.kind !== RESP_KIND.OK) {
    return { ok: false, kind: raw.cls.kind, classes: [], ...base };
  }

  const classes = flatten(raw.cls.json);
  return {
    ok: true,
    kind: raw.cls.kind,
    classes,
    ...base,
    batchCode: extractBatchCode(raw.cls.json).batchCode,
  };
}

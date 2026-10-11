/**
 * bkxk（本科选课）接口层：端点表 / 报文构造 / 响应分类 / 未识别落档。
 *
 * 本文件里的每一个字段顺序、参数名、有无 `timestamp`，都是照着
 * `C:\Project\szu_bkxk\docs` 下的 HAR 抓包逐字节核对过的（旧仓库踩过
 * 「照抄文档没核对抓包，抢课必失败」的坑）。**不要凭直觉调整顺序**，
 * 也不要「顺手统一」那些看起来不一致的地方。
 *
 * 红线（继承自旧仓库，见 docs/需求文档.md §8）：
 *   R1 写接口默认关闭，不得改默认值（本文件只提供 `buildVolunteerBody`，
 *      守门在 `settings.ts` 的 `isEnabled('bkxk','write-api')`）
 *   R3 凭证不落盘：`headers()` 的返回值包含 token，**只许传给发请求的一方**
 *   R4 未识别响应必须全量落档
 */

import { request } from '../../common/core/http.ts';
import type { HttpRequest, HttpResponse } from '../../common/core/http.ts';
import { scoped } from '../../common/core/log.ts';

const log = scoped('bkxk/api');

/** 站点所有接口的基路径 */
export const BASE_PATH = '/xsxkapp/sys/xsxkapp/';

// ------------------------------------------------------------------ 端点表

export const EP = {
  // 只读：课程查询（按类别分派）
  PROGRAM_COURSE: 'elective/programCourse.do',
  PUBLIC_COURSE: 'elective/publicCourse.do',
  RECOMMENDED_COURSE: 'elective/recommendedCourse.do',
  QUERY_COURSE: 'elective/queryCourse.do',
  // 只读：其它
  COURSE_RESULT: 'elective/courseResult.do',
  CAPACITY: 'elective/teachingclass/capacity.do',
  TEACHING_TIME: 'elective/teachingTime.do',
  NO_ARRANGED: 'elective/noArranged.do',
  // 写：默认关闭（红线 R1）
  VOLUNTEER: 'elective/volunteer.do',
} as const;

export type Endpoint = (typeof EP)[keyof typeof EP];

/** 全部类别代码（顺序对应选课页的页签） */
export const CATEGORIES = [
  'FANKC',
  'FAWKC',
  'TJKC',
  'XGXK',
  'CXKC',
  'TYKC',
  'FXKC',
  'MOOC',
] as const;

export type CategoryCode = (typeof CATEGORIES)[number];

export const CATEGORY_NAME: Record<CategoryCode, string> = {
  FANKC: '方案内',
  FAWKC: '方案外',
  // 显示名（用户 m00846 口径：这个页签叫「本班」）。
  // ⚠️ 只改这个字符串，**请求里的 teachingClassType 仍然是 TJKC** —— 那是站点自己的码。
  TJKC: '本班',
  XGXK: '校公选',
  CXKC: '重修',
  TYKC: '体育',
  FXKC: '辅修',
  MOOC: '慕课',
};

/**
 * 类别代码 → 列表端点。
 * 【来源】站点 `grablessons.js` 的 reloadCourseList 映射 + `grablessonsBS.js` 的端点定义。
 * 注：`CXKC`（重修）不在旧开发文档 §五 的列表里，是读站点源码补上的。
 * **标了「未实测」的分支必须在真机上确认过再把注释删掉。**
 */
export const CATEGORY_EP: Record<CategoryCode, Endpoint> = {
  FANKC: EP.PROGRAM_COURSE,
  FAWKC: EP.PROGRAM_COURSE, // 未实测
  TJKC: EP.RECOMMENDED_COURSE,
  XGXK: EP.PUBLIC_COURSE,
  CXKC: EP.PROGRAM_COURSE, // 未实测
  TYKC: EP.PROGRAM_COURSE, // 未实测
  FXKC: EP.PROGRAM_COURSE, // 未实测
  MOOC: EP.PUBLIC_COURSE,
};

// -------------------------------------------------------------- 响应分类

export const RESP_KIND = {
  OK: 'ok',
  BUSINESS: 'business',
  UNAUTHENTICATED: 'unauthenticated',
  UNKNOWN: 'unknown',
} as const;

export type RespKind = (typeof RESP_KIND)[keyof typeof RESP_KIND];

const RESP_CODE = {
  SUCCESS: '1',
  BUSINESS_ERROR: '2',
  UNAUTHENTICATED: '302',
} as const;

/** 登录失效的文案特征（仅 code 无法判定时兜底） */
export const AUTH_MSG = /登录|认证/;

/** extractBatchCode 扫描整棵响应树时的节点预算（防病态响应把主线程拖住） */
const MAX_BATCH_SCAN_NODES = 20000;

export interface Classified {
  readonly kind: RespKind;
  readonly code: string | null;
  readonly msg: string;
  readonly data: unknown;
  readonly json: unknown;
}

export interface ClassifyInput {
  status: number;
  text: string;
}

/** HTTP 状态码是否表示登录态失效 */
function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

/**
 * 分类一次响应。判定顺序**不要调整**（按实测行为定的）：
 *   1. HTTP 401/403 → 登录失效
 *   2. 非 JSON / 顶层不是对象 → 未识别
 *   3. code=1 成功 / code=2 业务拒绝 / code=302 登录失效
 *   4. code 无法判定 → msg 含「登录」「认证」→ 登录失效
 *   5. 其余 → 未识别（调用方必须全量落档，红线 R4）
 */
export function classify(input: ClassifyInput): Classified {
  const out = {
    kind: RESP_KIND.UNKNOWN as RespKind,
    code: null as string | null,
    msg: '',
    data: null as unknown,
    json: null as unknown,
  };

  if (isAuthStatus(input.status)) {
    return { ...out, kind: RESP_KIND.UNAUTHENTICATED, msg: `HTTP ${input.status}` };
  }

  let json: unknown = null;
  try {
    json = JSON.parse(input.text);
  } catch {
    return { ...out, kind: RESP_KIND.UNKNOWN, msg: '响应不是 JSON' };
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return { ...out, kind: RESP_KIND.UNKNOWN, msg: 'JSON 顶层不是对象' };
  }

  const obj = json as Record<string, unknown>;
  const rawCode = obj['code'];
  const code = rawCode === undefined || rawCode === null ? null : String(rawCode);
  const msg = obj['msg'] === undefined || obj['msg'] === null ? '' : String(obj['msg']);

  let kind: RespKind;
  if (code === RESP_CODE.SUCCESS) kind = RESP_KIND.OK;
  else if (code === RESP_CODE.BUSINESS_ERROR) kind = RESP_KIND.BUSINESS;
  else if (code === RESP_CODE.UNAUTHENTICATED) kind = RESP_KIND.UNAUTHENTICATED;
  else if (AUTH_MSG.test(msg)) kind = RESP_KIND.UNAUTHENTICATED;
  else kind = RESP_KIND.UNKNOWN;

  return { kind, code, msg, data: obj['data'] === undefined ? null : obj['data'], json };
}

// -------------------------------------------------------------- 报文构造

/** 接口 URL。`origin` 由调用方从 `location.origin` 取，便于测试 */
export function endpointUrl(ep: Endpoint | string, origin: string): string {
  return `${origin}${BASE_PATH}${ep}`;
}

/**
 * 给接口 URL 追加 `?timestamp=<13位毫秒>`。
 *
 * ⚠️ **不要默认加**：HAR 实测 `volunteer.do` / `capacity.do` / `programCourse.do` /
 * `publicCourse.do` / `recommendedCourse.do` **都没有** query；只有
 * `courseResult.do` 等少数端点带。
 */
export function appendTimestamp(url: string, nowMs?: number): string {
  const ts = typeof nowMs === 'number' ? nowMs : Date.now();
  return `${url}${url.includes('?') ? '&' : '?'}timestamp=${ts}`;
}

/** 编码为 application/x-www-form-urlencoded */
export function formBody(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v === undefined || v === null ? '' : String(v))}`);
  }
  return parts.join('&');
}

export interface VolunteerParams {
  studentCode: string;
  electiveBatchCode: string;
  teachingClassId: string;
  /** **必须**是该教学班所属列表的类别，不能用全局设置（旧仓库踩过） */
  teachingClassType: string;
  isMajor?: string;
  campus?: string;
}

/**
 * 构造抢课请求体（🔴 写接口）。
 *
 * 【实测形状】必须包一层 `{"data":{…}}`（HAR 核对，漏了外层必失败）：
 *   `addParam={"data":{"operationType":"1",…}}`
 * 内层字段顺序固定：operationType / studentCode / electiveBatchCode /
 * teachingClassId / isMajor / campus / teachingClassType。
 */
export function buildVolunteerBody(p: VolunteerParams): string {
  const payload = {
    data: {
      operationType: '1',
      studentCode: String(p.studentCode),
      electiveBatchCode: String(p.electiveBatchCode),
      teachingClassId: String(p.teachingClassId),
      isMajor: p.isMajor === undefined || p.isMajor === null ? '1' : String(p.isMajor),
      campus: p.campus === undefined || p.campus === null ? '01' : String(p.campus),
      teachingClassType: String(p.teachingClassType),
    },
  };
  return `addParam=${encodeURIComponent(JSON.stringify(payload))}`;
}

/** 构造查容量请求体（只读，监控轮询首选 —— 比拉整页列表轻得多） */
export function buildCapacityBody(teachingClassId: string, batchCode: string): string {
  return formBody({ teachingClassId, batchCode });
}

/** 构造查规则课表请求体 */
export function buildTeachingTimeBody(studentCode: string): string {
  return formBody({ studentCode });
}

export interface QueryParams {
  studentCode: string;
  electiveBatchCode: string;
  /** **必须**是该列表对应的类别 */
  teachingClassType: string;
  campus?: string;
  isMajor?: string;
  pageSize?: number | string;
  pageNumber?: number | string;
  order?: string;
  orderBy?: string;
  queryContent?: string;
}

/**
 * 构造列表查询请求体。
 * HAR 实测形态：`querySetting=<urlencode(JSON)>`，内层 `data` + 分页。
 */
export function buildQueryBody(p: QueryParams): string {
  const setting = {
    data: {
      studentCode: String(p.studentCode),
      campus: p.campus === undefined || p.campus === null ? '01' : String(p.campus),
      electiveBatchCode: String(p.electiveBatchCode),
      isMajor: p.isMajor === undefined || p.isMajor === null ? '1' : String(p.isMajor),
      teachingClassType: String(p.teachingClassType),
      checkConflict: '2',
      checkCapacity: '2',
      queryContent: p.queryContent === undefined ? 'YCJX:2,MOOC:2,' : String(p.queryContent),
    },
    pageSize: String(p.pageSize === undefined ? 10 : p.pageSize),
    pageNumber: String(p.pageNumber === undefined ? 0 : p.pageNumber),
    order: p.order === undefined ? '' : String(p.order),
    orderBy: p.orderBy === undefined ? 'courseNumber' : String(p.orderBy),
  };
  return `querySetting=${encodeURIComponent(JSON.stringify(setting))}`;
}

/**
 * 请求头。
 * ⚠️ 返回值**包含 token**，只允许直接交给 `bkxkSend`；**严禁写入日志或持久化**。
 * cookie 不在此设置 —— 页面 fetch 由浏览器自动附带（`credentials: 'include'`）。
 */
export function headers(token: string): Record<string, string> {
  return { token: String(token), 'X-Requested-With': 'XMLHttpRequest' };
}

// -------------------------------------------------------------- 数据提取

/**
 * 从 `capacity.do` 的 data 算剩余名额。
 *
 * 【重要】实测 `classCapacity` / `numberOfFirstVolunteer` / `isFull` **全是 null**，
 * 只有 `mainClassCapacity` / `mainElectiveNumber` 有效。
 * 字段缺失或非法时返回 **null**（不是 0）—— 0 会被误判成「满课」。
 */
export function capacityRemain(data: unknown): number | null {
  if (data === null || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d['mainClassCapacity'] === undefined || d['mainClassCapacity'] === null) return null;
  if (d['mainElectiveNumber'] === undefined || d['mainElectiveNumber'] === null) return null;
  const cap = Number(d['mainClassCapacity']);
  const used = Number(d['mainElectiveNumber']);
  if (!Number.isFinite(cap) || !Number.isFinite(used)) return null;
  return cap - used;
}

/**
 * 从任意列表响应里挖出 electiveBatchCode（batchCode 的真实来源）。
 *
 * `counts` 用于判断「同一响应里出现了多个不同批次码」这种可疑情况，
 * 所以**必须走完整棵树**——早期版本在 `found !== null` 时直接短路，
 * `counts` 因此永远只有一个键，等于没有计数。代价用节点预算兜住。
 */
export function extractBatchCode(json: unknown): { batchCode: string | null; counts: Record<string, number> } {
  let found: string | null = null;
  const counts: Record<string, number> = {};
  let budget = MAX_BATCH_SCAN_NODES;

  function walk(node: unknown, depth: number): void {
    if (budget <= 0 || depth > 6 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    budget -= 1;
    const obj = node as Record<string, unknown>;
    const bc = obj['electiveBatchCode'];
    if (typeof bc === 'string' && bc !== '') {
      counts[bc] = (counts[bc] ?? 0) + 1;
      if (found === null) found = bc;
    }
    for (const v of Object.values(obj)) walk(v, depth + 1);
  }

  walk(json, 0);
  return { batchCode: found, counts };
}

// -------------------------------------------------------------- 落档

export interface UnknownDumpInput {
  action: string;
  url: string;
  body?: string;
  text: string;
  code: string | null;
  msg: string;
}

/**
 * 未识别响应全量落档（红线 R4）。
 *
 * 「看不懂就留下，便于事后补分支」—— 走站点改版时，这段输出就是唯一线索，
 * 所以**原文不裁剪**。日志行里同时提一下 code/msg，便于一眼看出服务端在抱怨什么。
 */
function dumpUnknown(input: UnknownDumpInput): string {
  const text = input.text ?? '';
  const block =
    '\n──────── [未识别返回] ────────\n' +
    `action: ${input.action}\n` +
    `url: ${input.url}\n` +
    `body: ${input.body ?? ''}\n` +
    `code: ${input.code ?? ''} | msg: ${input.msg}\n` +
    `长度: ${text.length} 字符\n` +
    `原文:\n${text}\n` +
    '──────────────────────────────\n';

  log.error(
    `未识别返回（已全量落档） code=${input.code ?? ''}${input.msg !== '' ? ` msg=${input.msg}` : ''}`,
  );
  console.log(`%c${block}`, 'color:#c00');
  return block;
}

// -------------------------------------------------------------- 发送

export interface SendOptions {
  /** 完整 URL；用 `endpointUrl(EP.X, origin())` 构造 */
  url: string;
  /** 请求动作名，只用于日志与落档（**不要**把参数塞进来） */
  action: string;
  method?: HttpRequest['method'];
  body?: string;
  /** 会话 token；缺省时由 `session.ts` 提供 */
  token?: string;
  /** 出队优先级 */
  priority?: number;
  /** 是否追加 `?timestamp=`。**默认 false**，只有实测带 timestamp 的端点才传 true */
  timestamp?: boolean;
  /** 额外请求头（合并进 `headers(token)`） */
  extraHeaders?: Record<string, string>;
}

export interface SendResult {
  readonly status: number;
  readonly text: string;
  readonly cls: Classified;
  /** 原始响应对象，供需要 finalUrl / elapsedMs 的调用方使用 */
  readonly raw: HttpResponse;
}

/**
 * 发一次 bkxk 请求。**唯一出口**，不要绕过（绕过就绕过了串行队列）。
 *
 * 三件实测结论，别改错：
 *   1. token 必须带：站点要求 cookie + 请求头 `token` 缺一不可，
 *      否则服务端会报 `value sent to redis cannot be null` 这类错误。
 *   2. **不自动追加 timestamp**（见 `appendTimestamp` 注释）。
 *   3. 未识别响应必须落档（红线 R4）。
 */
export async function bkxkSend(o: SendOptions): Promise<SendResult> {
  const token = o.token ?? '';
  const extra = o.extraHeaders ?? {};
  const requestHeaders: Record<string, string> = token !== '' ? { ...headers(token), ...extra } : { ...extra };
  if (o.body !== undefined) requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded';

  const url = o.timestamp === true ? appendTimestamp(o.url) : o.url;

  // ⚠️ 只记动作名与路径：URL 与 body 都可能含学号/批次码（红线 R3）
  log.info(`[请求] ${o.action} ${o.url}`);

  const raw = await request({
    url,
    method: o.method ?? 'POST',
    headers: requestHeaders,
    ...(o.body !== undefined ? { data: o.body } : {}),
    ...(o.priority !== undefined ? { priority: o.priority } : {}),
  });

  const cls = classify({ status: raw.status, text: raw.text });

  if (cls.kind === RESP_KIND.UNKNOWN) {
    dumpUnknown({
      action: o.action,
      url,
      body: o.body ?? '',
      text: raw.text,
      code: cls.code,
      msg: cls.msg,
    });
  }

  return { status: raw.status, text: raw.text, cls, raw };
}

/**
 * bkxk 会话读取：从页面 sessionStorage 里取学号 / 批次码 / 校区 / token。
 *
 * 严格按实测形状读（旧仓库踩过「取错来源」的坑）：
 *   - `sessionStorage.studentInfo` → `{ code: 学号, electiveBatch: { code: 批次码 }, … }`
 *     ⚠️ 批次码在 `electiveBatch.code` 里，**不是** `currentBatch`
 *   - `sessionStorage.currentCampus` → `{ code: 校区码 }`
 *   - `sessionStorage.token` → 令牌字符串
 *
 * 红线 R3：本模块读出来的 `token` **只许存活在内存里**，
 * 不得写 storage、不得写日志、不得拼进任何持久化结构。
 */

import { scoped } from '../../common/core/log.ts';
import { pageSessionStorage } from '../../common/utils/page.ts';

const log = scoped('bkxk/session');

/** 校区码缺省值（HAR 里所有请求都是 `01`） */
export const DEFAULT_CAMPUS = '01';

export interface BkxkSession {
  /** 学号；读不到时为空串 */
  readonly studentCode: string;
  /** 选课批次码；sessionStorage 里没有时为 null（可从列表响应里补，见 `extractBatchCode`） */
  readonly batchCode: string | null;
  /** 校区码；读不到时为 `DEFAULT_CAMPUS` */
  readonly campus: string;
  /** 会话令牌。**含敏感信息，勿落盘勿打日志** */
  readonly token: string;
  /** 学号与 token 都在，才认为登录态可用 */
  readonly loggedIn: boolean;
}

/** 空会话（读不到 sessionStorage 时） */
export const EMPTY_SESSION: BkxkSession = {
  studentCode: '',
  batchCode: null,
  campus: DEFAULT_CAMPUS,
  token: '',
  loggedIn: false,
};

/**
 * 解析 `sessionStorage.studentInfo`。
 * 兼容两种批次码落点：`electiveBatch.code`（实测）与顶层 `electiveBatchCode`（兜底）。
 */
export function parseStudentInfo(raw: string | null): {
  studentCode: string;
  batchCode: string | null;
  data: unknown;
} | null {
  if (raw === null || raw === '') return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;

  const obj = json as Record<string, unknown>;
  const studentCode = typeof obj['code'] === 'string' ? obj['code'] : obj['code'] !== undefined && obj['code'] !== null ? String(obj['code']) : '';

  let batchCode: string | null = null;
  const batch = obj['electiveBatch'];
  if (batch !== null && typeof batch === 'object' && !Array.isArray(batch)) {
    const bc = (batch as Record<string, unknown>)['code'];
    if (bc !== undefined && bc !== null && String(bc) !== '') batchCode = String(bc);
  }
  if (batchCode === null) {
    const bc = obj['electiveBatchCode'];
    if (bc !== undefined && bc !== null && String(bc) !== '') batchCode = String(bc);
  }

  return { studentCode, batchCode, data: json };
}

/** 解析 `sessionStorage.currentCampus`，只取 `code` */
export function parseCampusCode(raw: string | null): string {
  if (raw === null || raw === '') return DEFAULT_CAMPUS;
  try {
    const json: unknown = JSON.parse(raw);
    if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
      const code = (json as Record<string, unknown>)['code'];
      if (code !== undefined && code !== null && String(code) !== '') return String(code);
    }
  } catch {
    /* 落回默认校区 */
  }
  return DEFAULT_CAMPUS;
}

/** 组装会话对象（纯函数，便于测试） */
export function buildSession(input: {
  studentInfo: string | null;
  campus: string | null;
  token: string | null;
}): BkxkSession {
  const info = parseStudentInfo(input.studentInfo);
  const studentCode = info?.studentCode ?? '';
  const token = input.token ?? '';
  return {
    studentCode,
    batchCode: info?.batchCode ?? null,
    campus: parseCampusCode(input.campus),
    token,
    loggedIn: studentCode !== '' && token !== '',
  };
}

/** 从页面读取当前会话。读不到 sessionStorage 时返回空会话（不抛错） */
export function readSession(): BkxkSession {
  const ss = pageSessionStorage();
  if (ss === null) {
    log.warn('读不到 sessionStorage，按未登录处理');
    return EMPTY_SESSION;
  }
  try {
    return buildSession({
      studentInfo: ss.getItem('studentInfo'),
      campus: ss.getItem('currentCampus'),
      token: ss.getItem('token'),
    });
  } catch (err) {
    log.warn('读取会话失败，按未登录处理', err);
    return EMPTY_SESSION;
  }
}

/**
 * 会话的**可安全落盘**摘要：用于日志面板与状态页显示。
 * 刻意不带 token，也不带学号全量（只留末 4 位）。
 */
export function sessionSummary(s: BkxkSession): string {
  if (!s.loggedIn) return '未登录（学号或 token 缺失）';
  const tail = s.studentCode.length > 4 ? s.studentCode.slice(-4) : s.studentCode;
  return `已登录（学号 ****${tail}，批次 ${s.batchCode ?? '未知'}，校区 ${s.campus}）`;
}

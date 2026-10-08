/**
 * UOOC 课程目录树的**取数封装**：`GET /home/learn/getCatalogList` + 重试。
 *
 * 唯一口径见 `docs/UOOC-API驱动连播-需求.md` §E.6 / §F.1-4，拍板内容：
 *
 * | 项 | 值 |
 * | --- | --- |
 * | 适用范围 | **只做在 UOOC 自己的取数封装里**；**不改** `common/core/http.ts` 的 `request()` |
 * | 方法限制 | **只对 GET 重试**（幂等）；POST 一律不重试 |
 * | 次数 | **共 3 次请求**（首次 + 2 次重试） |
 * | 重试间隔 | **2 秒**（固定，不退避） |
 * | 单次超时 | **30 秒** |
 * | 全部失败 | 调用方停止接管 + 全屏 `showModalAlert` |
 *
 * ⚠️ **刻意不做成全站 `core/http` 的全局重试**：bkxk 的抢课 / 选课走的是同一个
 * `request()`，且都是**非幂等 POST**，在那儿加重试会带来重复提交。
 * 这条理由写在这里，**以后别再「顺手统一」**。
 *
 * 本文件的「重试循环 + 响应判定」是纯逻辑，网络与计时都能注入，所以能跑档 1 单测
 * （见 `tests/suites/uooc-fetch-catalog.test.ts`）。
 */

import { request, PRIORITY } from '../../common/core/http.ts';
import { scoped } from '../../common/core/log.ts';
import { flattenTaskPoints, type TaskPoint } from './catalog.ts';

const log = scoped('uooc/fetch-catalog');

// ------------------------------------------------------------------ 常量

/** 目录树接口路径（拼接见 `catalogListUrl`） */
export const CATALOG_PATH = '/home/learn/getCatalogList';

/** 没拿到页面 origin 时的兜底（脚本本来就只在 uooc 域上跑） */
export const FALLBACK_ORIGIN = 'https://www.uooc.net.cn';

/** **总请求次数**（含首次）。§E.6 拍板 3 次 */
export const CATALOG_ATTEMPTS = 3;

/** 两次请求之间的固定间隔（ms）。§E.6 拍板 2 秒，**不做指数退避** */
export const CATALOG_RETRY_DELAY_MS = 2000;

/** 单次请求的超时（ms）。§E.6 拍板 30 秒 */
export const CATALOG_TIMEOUT_MS = 30_000;

/** 失败 detail 里回显响应正文的截断长度（错误页可能是整页 HTML） */
export const DETAIL_MAX_CHARS = 200;

// ------------------------------------------------------------------ URL

/** 当前页面的 origin；取不到时回退到 `FALLBACK_ORIGIN` */
export function defaultOrigin(): string {
  const loc = (globalThis as { location?: { origin?: unknown } }).location;
  const origin = loc?.origin;
  return typeof origin === 'string' && origin !== '' ? origin : FALLBACK_ORIGIN;
}

/**
 * 目录树接口 URL。**同源**请求，出口是页面自己的 `fetch`（`channel: 'page'`），
 * 携带与站点自己发的请求完全一样的 cookie 与请求头。
 *
 * `hidemsg_=true` 与站点自己调用时一致（§A.1 实测）。
 */
export function catalogListUrl(cid: string, origin: string = defaultOrigin()): string {
  return `${origin}${CATALOG_PATH}?cid=${encodeURIComponent(cid)}&hidemsg_=true`;
}

// ------------------------------------------------------------------ 失败分类

/**
 * 取数失败的分类。**区分 `aborted` 与其它**：用户主动停止不算失败，
 * 主循环不该为它弹窗（§D）。
 */
export type CatalogFailure =
  /** 网络层直接抛错（断网、DNS、CORS……），连状态码都没有 */
  | { kind: 'network'; detail: string }
  /** 拿到了响应但状态码不是 2xx */
  | { kind: 'http'; status: number; detail: string }
  /** 状态码正常，但业务码不是 1（例如登录态过期） */
  | { kind: 'business'; code: unknown; detail: string }
  /** 业务码正常，但结构不是树（`data` 不是数组） */
  | { kind: 'shape'; detail: string }
  /** 用户在等待期间按了停止 —— 不是错误，不要弹窗 */
  | { kind: 'aborted'; detail: string };

/** 请求出口的返回形状（故意比 `HttpResponse` 窄，方便测试伪造） */
export interface RawCatalogResponse {
  status: number;
  /** 原始响应文本（未识别返回要能全量落档） */
  text: string;
  /** `responseType: 'json'` 的解析结果 */
  json: unknown;
}

/** 发一次请求；测试里注入假实现 */
export type CatalogSender = (url: string, timeoutMs: number) => Promise<RawCatalogResponse>;

const defaultSender: CatalogSender = async (url, timeoutMs) => {
  const res = await request({
    url,
    method: 'GET',
    responseType: 'json',
    timeoutMs,
    priority: PRIORITY.NORMAL,
    channel: 'page',
  });
  return { status: res.status, text: res.text, json: res.json };
};

// ------------------------------------------------------------------ 响应判定（纯函数）

export type CatalogParseResult =
  | { ok: true; points: TaskPoint[]; raw: unknown }
  | { ok: false; failure: CatalogFailure };

/** 把可能很长的正文截断，只用于日志与弹窗 */
export function truncateDetail(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= DETAIL_MAX_CHARS ? flat : `${flat.slice(0, DETAIL_MAX_CHARS)}…`;
}

/** 把任意抛出物转成一行文本 */
export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 判定一份目录树响应，顺带展平成任务点。
 *
 * 只认「`code == 1` 且 `data` 是数组」。业务码按数字比较（站点在别处会混用
 * 字符串与数字），失败时把 `code` 与 `msg` 原样留在 detail 里，便于落档。
 */
export function parseCatalogResponse(json: unknown, cid: string): CatalogParseResult {
  if (json === null || typeof json !== 'object') {
    return { ok: false, failure: { kind: 'shape', detail: '响应不是对象' } };
  }
  const root = json as { code?: unknown; msg?: unknown; data?: unknown };
  if (Number(root.code) !== 1) {
    return {
      ok: false,
      failure: {
        kind: 'business',
        code: root.code,
        detail: `code=${String(root.code)} msg=${String(root.msg ?? '')}`,
      },
    };
  }
  if (!Array.isArray(root.data)) {
    return { ok: false, failure: { kind: 'shape', detail: 'code=1 但 data 不是数组' } };
  }
  return { ok: true, points: flattenTaskPoints(root.data, cid), raw: json };
}

/** 可读的失败描述，用于日志与弹窗文案 */
export function describeFailure(failure: CatalogFailure): string {
  switch (failure.kind) {
    case 'network':
      return `网络错误：${failure.detail}`;
    case 'http':
      return `HTTP ${failure.status}：${failure.detail}`;
    case 'business':
      return `业务码异常：${failure.detail}`;
    case 'shape':
      return `响应结构异常：${failure.detail}`;
    case 'aborted':
      return `已中止：${failure.detail}`;
    default:
      return '未知失败';
  }
}

// ------------------------------------------------------------------ 取数

/** 只回「有没有取到」；`aborted` 与真失败要分得开 */
export type CatalogFetchResult =
  | { ok: true; attempts: number; points: TaskPoint[]; raw: unknown }
  | { ok: false; attempts: number; failure: CatalogFailure };

export interface CatalogFetchOptions {
  cid: string;
  /** 注入用（测试）；默认走 `request()` */
  send?: CatalogSender;
  /** 注入用（测试）；默认 `setTimeout` */
  sleep?: (ms: number) => Promise<void>;
  /** 每次重试**之前**问一句：用户按了停止就别再发了 */
  shouldAbort?: () => boolean;
  /** 覆盖 URL 的 origin（测试用） */
  origin?: string;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 单次尝试的结果 */
type AttemptResult = { ok: true; points: TaskPoint[]; raw: unknown } | { ok: false; failure: CatalogFailure };

/** 发一次并判定；**任何抛出都归到 `network`**，不往外抛 */
async function attemptOnce(send: CatalogSender, url: string, cid: string): Promise<AttemptResult> {
  let res: RawCatalogResponse;
  try {
    res = await send(url, CATALOG_TIMEOUT_MS);
  } catch (err) {
    return { ok: false, failure: { kind: 'network', detail: errorText(err) } };
  }
  if (res.status < 200 || res.status >= 300) {
    return {
      ok: false,
      failure: { kind: 'http', status: res.status, detail: truncateDetail(res.text) },
    };
  }
  return parseCatalogResponse(res.json, cid);
}

/**
 * 拉一次课程目录树，最多 `CATALOG_ATTEMPTS` 次。
 *
 * 每次失败都 `warn`（含第几次 / 失败分类），成功记一条 `info`（含实际用了几次）——
 * 这样「是不是在重试」从日志一眼能看出来。
 *
 * 用户在两次请求之间按了停止，返回 `kind: 'aborted'`，**不算失败**。
 */
export async function fetchCatalogPoints(options: CatalogFetchOptions): Promise<CatalogFetchResult> {
  const { cid } = options;
  const send = options.send ?? defaultSender;
  const sleep = options.sleep ?? defaultSleep;
  const url = catalogListUrl(cid, options.origin);

  let attempts = 0;
  let lastFailure: CatalogFailure = { kind: 'network', detail: '一次都没发出去' };

  const aborted = (): CatalogFetchResult => ({
    ok: false,
    attempts,
    failure: { kind: 'aborted', detail: '等待重试期间用户停止了接管' },
  });

  for (let attempt = 1; attempt <= CATALOG_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    if (attempt > 1 && options.shouldAbort?.() === true) return aborted();

    const outcome = await attemptOnce(send, url, cid);
    if (outcome.ok) {
      log.info(`取到课程树：${outcome.points.length} 个任务点（第 ${attempt}/${CATALOG_ATTEMPTS} 次）`);
      return { ok: true, attempts: attempt, points: outcome.points, raw: outcome.raw };
    }

    lastFailure = outcome.failure;
    log.warn(`取课程树第 ${attempt}/${CATALOG_ATTEMPTS} 次失败 —— ${describeFailure(lastFailure)}`);

    if (attempt >= CATALOG_ATTEMPTS) break;
    if (options.shouldAbort?.() === true) return aborted();

    await sleep(CATALOG_RETRY_DELAY_MS);
    if (options.shouldAbort?.() === true) return aborted();
  }

  log.error(`取课程树彻底失败（共 ${attempts} 次）—— ${describeFailure(lastFailure)}`);
  return { ok: false, attempts, failure: lastFailure };
}

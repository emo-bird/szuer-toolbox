/**
 * HTTP 出口：全站唯一的请求通道。
 *
 * 四条硬约束：
 *   1. **串行队列**：同一时刻只有 1 条在飞；相邻两条的**开始时刻**至少间隔 `intervalMs`。
 *   2. **限流只有软提示**（见 `limits.ts`）：低于建议下限（200ms）会 warn，但**不改用户的值**。
 *      校园站对高频请求零容忍（实测会被直接终止会话），所以默认值保守、提示醒目，
 *      但「要不要冒险」这个决定权归用户。红线 R2 的这一处放松由用户显式拍板（需求文档 Q-AF）。
 *   3. **凭证不落盘**（红线 R3）：本模块只记录 方法 / 路径 / 状态码 / 耗时 / 响应长度，
 *      绝不记录请求头与请求体。`Cookie` 与 `token` 只作为**参数**流经，不写日志。
 *   4. **未识别返回落档**（红线 R4）：由调用方通过 `classify` 决定落档策略，
 *      本模块只负责把原始响应文本原样交出去。
 *
 * ## 传输层：统一走**页面** fetch（用户拍板 Q-AE）
 *
 * 用 `unsafeWindow.fetch` 而不是 `GM_xmlhttpRequest`，理由：本站点鉴权是
 * 「页面 cookie + 请求头 token 缺一不可」，用页面自己的 fetch 发出的请求，
 * 其 Origin / Referer / Cookie / Sec-Fetch-* 与站点自身请求**逐字节一致**，
 * 不存在「服务端认不出这是谁」的可能。为此脚本必须 `@grant unsafeWindow`
 * 并以 `@run-at document-start` 启动。
 *
 * 代价（已知并接受）：我们的请求受页面 CSP 约束，且会被页面上的其它脚本看见。
 * 将来若要做跨域（例如 UOOC 的 LLM 调用），需要另开出口，不要在调用方偷偷绕。
 */

import { scoped } from './log.ts';
import { LIMITS, clampLimit, isBelowRecommended } from './limits.ts';

const log = scoped('core/http');

/** 建议下限（**不是**硬钳制值）：低于它可用但会 warn。见 limits.ts */
export const RECOMMENDED_MIN_INTERVAL_MS = LIMITS.intervalMs.recommended;

/** 默认间隔 */
export const DEFAULT_INTERVAL_MS = LIMITS.intervalMs.def;

/** 队列长度上限：积压过多说明调用方在失控，早点拒绝比雪崩好 */
const MAX_QUEUE_SIZE = 10;

/** 优先级：数字越小越先出队（沿用旧仓库 szu_bkxk 的语义） */
export const PRIORITY = {
  /** 监控命中：抢课窗口内必须插到所有普通请求前面 */
  MONITOR_HIT: -10,
  HIGH: 0,
  NORMAL: 10,
} as const;

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  /** 字符串或 URLSearchParams；对象会被 JSON 序列化并由调用方自行设置 Content-Type */
  data?: string | URLSearchParams | Record<string, unknown>;
  timeoutMs?: number;
  /** 响应解析方式，默认 'text'；'json' 会在解析失败时抛错 */
  responseType?: 'text' | 'json';
  /** 出队优先级，默认 PRIORITY.NORMAL */
  priority?: number;
  /**
   * 用哪个出口发这个请求，默认 `'page'`。
   *
   *  - `'page'` —— 页面自己的 `fetch`（`unsafeWindow.fetch`）。**同源请求走这个**：
   *    凭证、请求头、`Referer` 与站点自己发的请求完全一致，站点分不出来。
   *  - `'gm'`  —— `GM_xmlhttpRequest`。**只有跨域请求才用它**（当前唯一用户是
   *    「调用用户自己配置的大模型接口」，域名是用户填的，不可能预先知道）。
   *    ⚠️ 它**不带页面 cookie**（这是特性不是缺陷：不该把优课的登录态发给第三方模型）。
   *
   * 出口仍然是本函数一处决定的 —— 不要在调用方自己写 `GM_xmlhttpRequest`。
   */
  channel?: 'page' | 'gm';
}

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  /** 原始响应文本，永不裁剪（未识别返回要能全量落档） */
  readonly text: string;
  /** responseType 为 'json' 时的解析结果，否则为 null */
  readonly json: unknown;
  /** 重定向后的最终 URL（可用时） */
  readonly finalUrl: string;
  /** 耗时（毫秒，从入队算到响应返回，含排队等待） */
  readonly elapsedMs: number;
}

export class HttpError extends Error {
  // 注意：这里不能用 TS 的「构造函数参数属性」语法
  // （node 的类型擦除模式不支持，测试要能直接跑源码）
  readonly status: number;
  readonly responseText: string;

  constructor(message: string, status: number, responseText: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.responseText = responseText;
  }
}

// -------------------------------------------------------------- 串行队列

interface QueueItem {
  readonly task: () => Promise<unknown>;
  readonly priority: number;
  readonly seq: number;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

let intervalMs: number = DEFAULT_INTERVAL_MS;
let items: QueueItem[] = [];
let seq = 0;
let inflight = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextAt = 0;

/**
 * 调整请求间隔。
 * `clampLimit` 只防非法值（上限 60s）；低于建议下限时 **warn 但不改值**。
 */
export function setIntervalMs(ms: number): void {
  const clamped = clampLimit('intervalMs', ms);
  if (clamped !== ms) {
    log.warn(`请求间隔 ${ms} 超出可接受范围，已夹到 ${clamped}ms`);
  }
  if (isBelowRecommended('intervalMs', clamped)) {
    log.warn(
      `请求间隔 ${clamped}ms 低于建议下限 ${RECOMMENDED_MIN_INTERVAL_MS}ms；` +
        `校园站对高频请求零容忍，实测会被直接终止会话，请自行确认风险`,
    );
  }
  intervalMs = clamped;
}

export function getIntervalMs(): number {
  return intervalMs;
}

/** 队列中排队中的请求数（不含正在执行的） */
export function queueDepth(): number {
  return items.length;
}

function schedule(): void {
  if (timer !== null || inflight) return;
  if (items.length === 0) return;
  const delay = Math.max(0, nextAt - Date.now());
  timer = setTimeout(() => {
    timer = null;
    runOne();
  }, delay);
}

function runOne(): void {
  if (inflight || items.length === 0) return;

  // 取优先级最高者；同级按入队先后
  let idx = 0;
  for (let i = 1; i < items.length; i += 1) {
    const a = items[i]!;
    const b = items[idx]!;
    if (a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq)) idx = i;
  }
  const item = items.splice(idx, 1)[0]!;

  inflight = true;
  nextAt = Date.now() + intervalMs;

  Promise.resolve()
    .then(() => item.task())
    .then(
      (value) => item.resolve(value),
      (err: unknown) => item.reject(err),
    )
    .then(() => {
      inflight = false;
      schedule();
    });
}

/**
 * 把任务排进全局串行队列。
 * 队列满时立即 reject（不排队、不静默丢弃）。
 */
function enqueue<T>(task: () => Promise<T>, priority?: number): Promise<T> {
  if (items.length >= MAX_QUEUE_SIZE) {
    return Promise.reject(new Error(`请求队列已满（上限 ${MAX_QUEUE_SIZE}），本条已丢弃`));
  }
  return new Promise<T>((resolve, reject) => {
    items.push({
      task: task as () => Promise<unknown>,
      priority: typeof priority === 'number' && Number.isFinite(priority) ? priority : PRIORITY.NORMAL,
      seq: seq++,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    schedule();
  });
}

// -------------------------------------------------------------- 传输层

function toBody(data: HttpRequest['data']): string | undefined {
  if (data === undefined) return undefined;
  if (typeof data === 'string') return data;
  if (data instanceof URLSearchParams) return data.toString();
  return JSON.stringify(data);
}

interface FetchOwner {
  fn: typeof fetch;
  /** 调用 fetch 时的 this（页面 fetch 需要挂在页面上才不会被判定为非法调用） */
  owner: unknown;
}

/**
 * 解析该用哪个 fetch。
 * 优先 `unsafeWindow.fetch`（页面自己的 fetch，凭证/头与站点请求一致），
 * 没有 unsafeWindow 时（纯 node 测试、本地 mock）退回 `globalThis.fetch`。
 */
function resolveFetch(): FetchOwner | null {
  const g = globalThis as Record<string, unknown>;
  const uw = g['unsafeWindow'];
  if (uw !== null && typeof uw === 'object') {
    const f = (uw as Record<string, unknown>)['fetch'];
    if (typeof f === 'function') return { fn: f as typeof fetch, owner: uw };
  }
  if (typeof fetch === 'function') return { fn: fetch, owner: globalThis };
  return null;
}

interface RawResult {
  status: number;
  statusText: string;
  text: string;
  finalUrl: string;
}

async function viaFetch(req: HttpRequest, body: string | undefined): Promise<RawResult> {
  const target = resolveFetch();
  if (target === null) throw new Error('当前环境没有可用的 fetch');

  const init: RequestInit & { __szuSkip?: boolean } = {
    method: req.method ?? 'GET',
    // 页面 fetch 的默认 credentials 是 same-origin，这里显式写出来，
    // 免得将来有人把出口挪到别的上下文时 cookie 静默丢失。
    credentials: 'include',
    ...(req.headers !== undefined ? { headers: req.headers } : {}),
    ...(body !== undefined ? { body } : {}),
    // 标记「本脚本发出」：响应接管（sites/bkxk/hijack）据此跳过我们自己的请求，
    // 只接管站点自己发出的那些。**改这里要同步改 hijack。**
    __szuSkip: true,
  };

  const res = await target.fn.call(target.owner, req.url, init);
  const text = await res.text();
  return { status: res.status, statusText: res.statusText, text, finalUrl: res.url };
}

// -------------------------------------------------------------- GM 出口

interface GmResponse {
  status: number;
  statusText: string;
  responseText: string;
  finalUrl?: string;
}

interface GmDetails {
  method: string;
  url: string;
  headers?: Record<string, string>;
  data?: string;
  timeout?: number;
  onload?: (r: GmResponse) => void;
  onerror?: (e: unknown) => void;
  ontimeout?: () => void;
}

type GmXhr = (details: GmDetails) => { abort(): void } | undefined;

/**
 * 取 `GM_xmlhttpRequest`。
 *
 * ⚠️ 它在油猴沙箱里是**真全局**，不在 `unsafeWindow` 上 —— 页面里当然也没有。
 * 所以这里读 `globalThis`，读不到就说明清单里没声明 `@grant GM_xmlhttpRequest`
 * （或者当前环境是纯 node 测试），此时**如实报错**，不要静默退回 fetch：
 * 静默退回的后果是「跨域请求被浏览器 CORS 拦掉」，报错信息会指向 CORS，
 * 让人往完全错误的方向查。
 */
function resolveGm(): GmXhr | null {
  const g = globalThis as Record<string, unknown>;
  const fn = g['GM_xmlhttpRequest'];
  return typeof fn === 'function' ? (fn as GmXhr) : null;
}

function viaGm(req: HttpRequest, body: string | undefined): Promise<RawResult> {
  const gm = resolveGm();
  if (gm === null) {
    return Promise.reject(new Error('GM_xmlhttpRequest 不可用：油猴清单里缺少 @grant GM_xmlhttpRequest'));
  }
  return new Promise<RawResult>((resolve, reject) => {
    const handle = gm({
      method: req.method ?? 'GET',
      url: req.url,
      ...(req.headers !== undefined ? { headers: req.headers } : {}),
      ...(body !== undefined ? { data: body } : {}),
      ...(req.timeoutMs !== undefined ? { timeout: req.timeoutMs } : {}),
      onload: (r) => {
        resolve({
          status: r.status,
          statusText: r.statusText,
          text: r.responseText ?? '',
          finalUrl: r.finalUrl ?? req.url,
        });
      },
      onerror: () => reject(new Error('GM_xmlhttpRequest 网络错误')),
      ontimeout: () => reject(new Error('GM_xmlhttpRequest 超时')),
    });
    // gm() 可能返回 undefined（部分实现），此时没法主动 abort —— 靠 timeout 兜底
    if (handle === undefined) log.debug('GM_xmlhttpRequest 未返回句柄，abort 不可用');
  });
}

// -------------------------------------------------------------- 公开 API

/**
 * 发一个请求。**必须**通过本函数，不要自己 fetch / XHR —— 否则绕过串行队列。
 */
export async function request(req: HttpRequest): Promise<HttpResponse> {
  const body = toBody(req.data);
  const started = Date.now();

  const send = req.channel === 'gm' ? () => viaGm(req, body) : () => viaFetch(req, body);
  const raw = await enqueue<RawResult>(send, req.priority);

  const elapsedMs = Date.now() - started;
  let json: unknown = null;
  if (req.responseType === 'json') {
    try {
      json = JSON.parse(raw.text);
    } catch {
      log.error(`期望 JSON 但解析失败 ${req.method ?? 'GET'} ${safePath(req.url)} → ${raw.status}`);
      throw new HttpError('响应不是合法 JSON', raw.status, raw.text);
    }
  }

  // 只记路径，不记 query（query 里可能有 token），绝不记 header / body
  const via = req.channel === 'gm' ? ' [gm]' : '';
  log.debug(
    `${req.method ?? 'GET'}${via} ${safePath(req.url)} → ${raw.status} (${elapsedMs}ms, ${raw.text.length}B)`,
  );

  return { ...raw, elapsedMs, json };
}

/** 从 URL 里剥掉 query 与 hash，只留 origin + pathname，避免把 token 写进日志 */
export function safePath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.hash}`;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

/** 组装 query string，跳过 undefined / null */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

/** 测试用：把队列与限流状态复位 */
export function resetQueueForTest(): void {
  items = [];
  seq = 0;
  inflight = false;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  nextAt = 0;
  intervalMs = DEFAULT_INTERVAL_MS;
}

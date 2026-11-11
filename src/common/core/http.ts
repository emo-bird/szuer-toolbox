/**
 * HTTP 出口：全站唯一的请求通道。
 *
 * 四条硬约束：
 *   1. **校园站串行队列**：相邻请求的开始时刻至少间隔 `intervalMs`。
 *      模型请求使用独立的有限并发队列，不占校园站请求的名额。
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
 * 跨域模型调用由本模块的 GM 通道处理。
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
const MAX_GM_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_TIMER_DELAY_MS = 2147483647;

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
  /** 从出队起计时，覆盖读取响应正文。默认 60 秒。 */
  timeoutMs?: number;
  /** 可取消排队中或执行中的请求。 */
  signal?: AbortSignal;
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
  /** 等待后重试的建议值（响应头 Retry-After，接口未提供时为空）。 */
  readonly retryAfter?: string;
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

// -------------------------------------------------------------- 请求队列

interface QueueItem {
  readonly task: () => Promise<unknown>;
  readonly priority: number;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly detach: () => void;
}

interface Queue {
  readonly items: QueueItem[];
  readonly concurrency: number;
  inflight: number;
  timer: ReturnType<typeof setTimeout> | null;
  nextAt: number;
}

function makeQueue(concurrency: number): Queue {
  return { items: [], concurrency, inflight: 0, timer: null, nextAt: 0 };
}

let pageQueue = makeQueue(1);
let gmQueue = makeQueue(MAX_GM_CONCURRENCY);
let intervalMs: number = DEFAULT_INTERVAL_MS;

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
  return pageQueue.items.length + gmQueue.items.length;
}

function schedule(queue: Queue): void {
  if (queue.timer !== null || queue.inflight >= queue.concurrency || queue.items.length === 0) return;
  const delay = Math.max(0, queue.nextAt - Date.now());
  queue.timer = setTimeout(() => {
    queue.timer = null;
    while (queue.inflight < queue.concurrency && queue.items.length > 0) runOne(queue);
  }, delay);
}

function runOne(queue: Queue): void {
  // 取优先级最高者；同级按入队先后
  let idx = 0;
  for (let i = 1; i < queue.items.length; i += 1) {
    if (queue.items[i]!.priority < queue.items[idx]!.priority) idx = i;
  }
  const item = queue.items.splice(idx, 1)[0]!;
  item.detach();

  queue.inflight += 1;
  if (queue === pageQueue) queue.nextAt = Date.now() + intervalMs;

  void Promise.resolve()
    .then(() => item.task())
    .then(
      (value) => item.resolve(value),
      (err: unknown) => item.reject(err),
    )
    .then(() => {
      queue.inflight -= 1;
      schedule(queue);
    });
}

/**
 * 排队期间取消会立即移除对应任务，不占用队列名额。
 * 队列满时立即 reject（不排队、不静默丢弃）。
 */
function enqueue<T>(queue: Queue, task: () => Promise<T>, req: HttpRequest): Promise<T> {
  const { signal, priority } = req;
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (queue.items.length >= MAX_QUEUE_SIZE) {
    return Promise.reject(new Error(`请求队列已满（上限 ${MAX_QUEUE_SIZE}），本条已丢弃`));
  }
  return new Promise<T>((resolve, reject) => {
    const cancel = (): void => {
      const index = queue.items.indexOf(item);
      if (index < 0) return;
      queue.items.splice(index, 1);
      item.detach();
      if (queue.items.length === 0 && queue.timer !== null) {
        clearTimeout(queue.timer);
        queue.timer = null;
      }
      reject(signal?.reason);
    };
    const item: QueueItem = {
      task: task as () => Promise<unknown>,
      priority: typeof priority === 'number' && Number.isFinite(priority) ? priority : PRIORITY.NORMAL,
      resolve: resolve as (value: unknown) => void,
      reject,
      detach: () => signal?.removeEventListener('abort', cancel),
    };
    queue.items.push(item);
    signal?.addEventListener('abort', cancel, { once: true });
    schedule(queue);
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
  retryAfter?: string;
}

async function viaFetch(req: HttpRequest, body: string | undefined, signal: AbortSignal): Promise<RawResult> {
  const target = resolveFetch();
  if (target === null) throw new Error('当前环境没有可用的 fetch');

  const init: RequestInit & { __szuSkip?: boolean } = {
    method: req.method ?? 'GET',
    // 页面 fetch 的默认 credentials 是 same-origin，这里显式写出来，
    // 免得将来有人把出口挪到别的上下文时 cookie 静默丢失。
    credentials: 'include',
    signal,
    ...(req.headers !== undefined ? { headers: req.headers } : {}),
    ...(body !== undefined ? { body } : {}),
    // 标记「本脚本发出」：响应接管（sites/bkxk/hijack）据此跳过我们自己的请求，
    // 只接管站点自己发出的那些。**改这里要同步改 hijack。**
    __szuSkip: true,
  };

  const res = await target.fn.call(target.owner, req.url, init);
  const text = await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    text,
    finalUrl: res.url,
    retryAfter: res.headers?.get('Retry-After') ?? undefined,
  };
}

// -------------------------------------------------------------- GM 出口

interface GmResponse {
  status: number;
  statusText: string;
  responseText: string;
  finalUrl?: string;
  responseHeaders?: string;
}

interface GmDetails {
  method: string;
  url: string;
  anonymous: boolean;
  headers?: Record<string, string>;
  data?: string;
  onload?: (r: GmResponse) => void;
  onerror?: (e: unknown) => void;
  onabort?: () => void;
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

async function viaGm(req: HttpRequest, body: string | undefined, signal: AbortSignal): Promise<RawResult> {
  const gm = resolveGm();
  if (gm === null) {
    throw new Error('GM_xmlhttpRequest 不可用：油猴清单里缺少 @grant GM_xmlhttpRequest');
  }
  let handle: ReturnType<GmXhr>;
  const abortTransport = (): void => {
    try {
      handle?.abort();
    } catch {
      // 部分管理器可能没有可用的 abort；外层仍会结束等待。
    }
  };
  let cancel: (() => void) | undefined;
  const result = new Promise<RawResult>((resolve, reject) => {
    cancel = () => {
      reject(signal.reason);
      abortTransport();
    };
    signal.addEventListener('abort', cancel, { once: true });
    handle = gm({
      method: req.method ?? 'GET',
      url: req.url,
      anonymous: true,
      ...(req.headers !== undefined ? { headers: req.headers } : {}),
      ...(body !== undefined ? { data: body } : {}),
      onload: (r) => {
        resolve({
          status: r.status,
          statusText: r.statusText,
          text: r.responseText ?? '',
          finalUrl: r.finalUrl ?? req.url,
          retryAfter: /^retry-after:[ \t]*([^\r\n]+)/im.exec(r.responseHeaders ?? '')?.[1]?.trim(),
        });
      },
      onerror: () => reject(new Error('GM_xmlhttpRequest 网络错误')),
      onabort: () => reject(signal.reason ?? new DOMException('请求已取消', 'AbortError')),
    });
    if (signal.aborted) abortTransport();
  });
  try {
    return await result;
  } finally {
    if (cancel !== undefined) signal.removeEventListener('abort', cancel);
  }
}

/** 统一计时与取消。GM 管理器可能忽略超时，也可能不触发取消回调。 */
async function sendWithDeadline(req: HttpRequest, body: string | undefined): Promise<RawResult> {
  const caller = req.signal;
  if (caller?.aborted) throw caller.reason;

  const controller = new AbortController();
  const forwardAbort = (): void => controller.abort(caller?.reason);
  caller?.addEventListener('abort', forwardAbort, { once: true });
  const configured = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ms = Number.isFinite(configured) && configured > 0
    ? Math.min(MAX_TIMER_DELAY_MS, configured)
    : DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => {
    controller.abort(new DOMException('请求超时', 'TimeoutError'));
  }, ms);

  const { signal } = controller;
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(signal.reason);
    signal.addEventListener('abort', rejectAbort, { once: true });
  });
  try {
    const sent = req.channel === 'gm' ? viaGm(req, body, signal) : viaFetch(req, body, signal);
    return await Promise.race([sent, aborted]);
  } finally {
    clearTimeout(timeout);
    if (rejectAbort !== undefined) signal.removeEventListener('abort', rejectAbort);
    caller?.removeEventListener('abort', forwardAbort);
  }
}

// -------------------------------------------------------------- 公开 API

/**
 * 发一个请求。统一由本模块控制排队、并发和超时。
 */
export async function request(req: HttpRequest): Promise<HttpResponse> {
  const body = toBody(req.data);
  const started = Date.now();

  const queue = req.channel === 'gm' ? gmQueue : pageQueue;
  const raw = await enqueue(queue, () => sendWithDeadline(req, body), req);

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

/** 只记录路径，去掉凭证、查询参数与片段。 */
export function safePath(url: string): string {
  try {
    const u = new URL(url, 'https://example.invalid');
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.pathname : '[未知地址]';
  } catch {
    return '[无效地址]';
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
  for (const queue of [pageQueue, gmQueue]) {
    if (queue.timer !== null) clearTimeout(queue.timer);
    for (const item of queue.items.splice(0)) {
      item.detach();
      item.reject(new DOMException('请求队列已重置', 'AbortError'));
    }
  }
  pageQueue = makeQueue(1);
  gmQueue = makeQueue(MAX_GM_CONCURRENCY);
  intervalMs = DEFAULT_INTERVAL_MS;
}

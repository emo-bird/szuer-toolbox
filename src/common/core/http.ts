/**
 * HTTP 出口：全站唯一的请求通道。
 *
 * 三条硬约束：
 *   1. **串行队列 + 限流**（红线 R2）：校园站对高频请求零容忍（实测会被直接终止会话）。
 *      所有请求走同一条队列，默认间隔 500ms，**200ms 是代码里写死的硬下限，不可配**。
 *   2. **凭证不落盘**（红线 R3）：本模块只记录 方法 / 路径 / 状态码 / 耗时 / 响应长度，
 *      绝不记录请求头与请求体。
 *   3. **未识别返回落档**（红线 R4）：由调用方通过 `onUnrecognized` 决定落档策略，
 *      本模块只负责把原始响应文本原样交出去。
 *
 * 传输层优先用 `GM_xmlhttpRequest`（能跨域、能带 Cookie 头），
 * 没有 GM 时降级到 `fetch`（纯 node 测试 / 本地 mock 用）。
 */

import { scoped } from './log.ts';

const log = scoped('core/http');

/** 硬下限：任何配置都不得低于这个值 */
export const MIN_INTERVAL_MS = 200;

/** 默认间隔 */
export const DEFAULT_INTERVAL_MS = 500;

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  /** 字符串或 URLSearchParams；对象会被 JSON 序列化并由调用方自行设置 Content-Type */
  data?: string | URLSearchParams | Record<string, unknown>;
  timeoutMs?: number;
  /** 响应解析方式，默认 'text'；'json' 会在解析失败时抛错 */
  responseType?: 'text' | 'json';
}

export interface HttpResponse {
  readonly status: number;
  readonly statusText: string;
  /** 原始响应文本，永不裁剪（未识别返回要能全量落档） */
  readonly text: string;
  /** responseType 为 'json' 时的解析结果，否则为惰性解析后的对象或 null */
  readonly json: unknown;
  /** 重定向后的最终 URL（可用时） */
  readonly finalUrl: string;
  /** 耗时（毫秒） */
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

let intervalMs = DEFAULT_INTERVAL_MS;
let queueTail: Promise<void> = Promise.resolve();
let lastStartedAt = 0;
let pendingCount = 0;

/** 调整请求间隔；低于硬下限会被钳到硬下限 */
export function setIntervalMs(ms: number): void {
  const clamped = Math.max(MIN_INTERVAL_MS, Math.floor(ms));
  if (clamped !== ms) {
    log.warn(`请求间隔 ${ms}ms 低于硬下限，已钳制为 ${clamped}ms`);
  }
  intervalMs = clamped;
}

export function getIntervalMs(): number {
  return intervalMs;
}

/** 队列中排队中的请求数（不含正在执行的） */
export function queueDepth(): number {
  return pendingCount;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 把任务排进全局串行队列。
 * 前一个任务无论成功失败都会释放队列；两个任务之间保证至少 `intervalMs` 的间隔。
 */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  pendingCount += 1;
  const run = queueTail.then(async () => {
    const wait = lastStartedAt + intervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();
    try {
      return await task();
    } finally {
      pendingCount -= 1;
    }
  });
  // 队列尾部永远是一条不会 reject 的链，避免一次失败把后续请求全带塌
  queueTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// -------------------------------------------------------------- 传输层

function toBody(data: HttpRequest['data']): string | undefined {
  if (data === undefined) return undefined;
  if (typeof data === 'string') return data;
  if (data instanceof URLSearchParams) return data.toString();
  return JSON.stringify(data);
}

function hasGmRequest(): boolean {
  return typeof (globalThis as Record<string, unknown>)['GM_xmlhttpRequest'] === 'function';
}

interface RawResult {
  status: number;
  statusText: string;
  text: string;
  finalUrl: string;
}

function viaGm(req: HttpRequest, body: string | undefined): Promise<RawResult> {
  return new Promise<RawResult>((resolve, reject) => {
    GM_xmlhttpRequest({
      method: req.method ?? 'GET',
      url: req.url,
      ...(req.headers !== undefined ? { headers: req.headers } : {}),
      ...(body !== undefined ? { data: body } : {}),
      ...(req.timeoutMs !== undefined ? { timeout: req.timeoutMs } : {}),
      onload: (res) => {
        resolve({
          status: res.status,
          statusText: res.statusText,
          text: res.responseText,
          finalUrl: res.finalUrl || req.url,
        });
      },
      onerror: () => reject(new Error('网络错误（GM_xmlhttpRequest onerror）')),
      ontimeout: () => reject(new Error(`请求超时（>${req.timeoutMs ?? 0}ms）`)),
      onabort: () => reject(new Error('请求被中止')),
    });
  });
}

async function viaFetch(req: HttpRequest, body: string | undefined): Promise<RawResult> {
  const init: RequestInit = {
    method: req.method ?? 'GET',
    ...(req.headers !== undefined ? { headers: req.headers } : {}),
    ...(body !== undefined ? { body } : {}),
  };
  const res = await fetch(req.url, init);
  const text = await res.text();
  return { status: res.status, statusText: res.statusText, text, finalUrl: res.url };
}

// -------------------------------------------------------------- 公开 API

/**
 * 发一个请求。**必须**通过本函数，不要自己 fetch / XHR —— 否则绕过限流。
 */
export async function request(req: HttpRequest): Promise<HttpResponse> {
  const body = toBody(req.data);
  const started = Date.now();

  const raw = await enqueue<RawResult>(() => (hasGmRequest() ? viaGm(req, body) : viaFetch(req, body)));

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
  log.debug(`${req.method ?? 'GET'} ${safePath(req.url)} → ${raw.status} (${elapsedMs}ms, ${raw.text.length}B)`);

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
  queueTail = Promise.resolve();
  lastStartedAt = 0;
  pendingCount = 0;
  intervalMs = DEFAULT_INTERVAL_MS;
}

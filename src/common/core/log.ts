/**
 * 日志：进程内环形缓冲 + 订阅，供「日志」标签页实时查看与导出。
 *
 * 红线 R3：**任何情况下不要把请求头、cookie、token、学号写进日志**。
 * 需要记录请求时只记 方法 / 路径 / 状态码 / 耗时 / 响应摘要。
 *
 * ## 等级语义（v0.9 修正）
 *
 * 等级**只作为「显示过滤」**，不作为「写入过滤」：
 *   - `push()` **一律入缓冲**（不管等级多低），所以切到更低的等级能看到**过去的**日志；
 *   - `entries()` 按当前等级过滤后返回，供日志标签页显示；
 *   - `dump()` 同样按当前等级过滤，保证「复制全文」和屏幕上看到的一致。
 *
 * 为什么改：v0.8 之前 `push()` 里就直接丢弃低等级日志，导致
 *   (a) 把等级调低看不到任何历史日志 —— 与用户直觉相反；
 *   (b) 日志页无法得知「有多少条被过滤掉了」，只能瞎猜。
 * 代价：debug 日志多的时候会把老信息挤出 500 条环形缓冲。
 * 这是刻意取舍 —— 用户切等级的动作本身就表达了「我想看更多」。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly seq: number;
  readonly time: number;
  readonly level: LogLevel;
  /** 来源模块，如 'core/http'、'site/uooc' */
  readonly scope: string;
  readonly message: string;
  readonly detail?: unknown;
}

export type LogListener = (entry: LogEntry) => void;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** 环形缓冲容量。500 条足够排查问题，且不会吃内存 */
const CAPACITY = 500;

let seq = 0;
let buffer: LogEntry[] = [];
let minLevel: LogLevel = 'info';
const listeners = new Set<LogListener>();

function push(level: LogLevel, scope: string, message: string, detail?: unknown): void {
  const entry: LogEntry = { seq: (seq += 1), time: Date.now(), level, scope, message, detail };
  buffer.push(entry);
  if (buffer.length > CAPACITY) buffer = buffer.slice(buffer.length - CAPACITY);
  // 订阅者一律收到（含低于当前等级的条目）——由订阅方决定要不要显示，
  // 否则「先把等级调低、再复现问题」这条最常用的排查路径会失效。
  for (const listener of [...listeners]) {
    // 日志本身绝不能因为监听器抛错而中断
    try {
      listener(entry);
    } catch {
      /* ignore */
    }
  }
}

/** 设置最低输出等级 */
export function setLevel(level: LogLevel): void {
  minLevel = level;
}

export function getLevel(): LogLevel {
  return minLevel;
}

/** 某个等级是否达到当前显示门槛 */
export function passesLevel(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

/** 取当前缓冲快照（浅拷贝，调用方随便改）。**已按当前等级过滤。** */
export function entries(): LogEntry[] {
  return buffer.filter((e) => passesLevel(e.level));
}

/** 缓冲里的原始条数（含被等级过滤掉的），供空态文案显示真实的数量 */
export function rawCount(): number {
  return buffer.length;
}

/** 清空缓冲 */
export function clear(): void {
  buffer = [];
}

/** 订阅新日志，返回取消订阅函数 */
export function subscribe(listener: LogListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 生成一个带 scope 的 logger */
export function scoped(scope: string) {
  return {
    debug: (message: string, detail?: unknown) => push('debug', scope, message, detail),
    info: (message: string, detail?: unknown) => push('info', scope, message, detail),
    warn: (message: string, detail?: unknown) => push('warn', scope, message, detail),
    error: (message: string, detail?: unknown) => push('error', scope, message, detail),
  };
}

const EMPTY_TIME = '';

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function formatTime(ms: number): string {
  if (ms === 0) return EMPTY_TIME;
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** 把一条日志渲染成单行文本 */
export function formatEntry(entry: LogEntry): string {
  const level = entry.level.toUpperCase().padEnd(5);
  const head = `${formatTime(entry.time)} ${level} [${entry.scope}] ${entry.message}`;
  if (entry.detail === undefined) return head;
  return `${head} ${safeStringify(entry.detail)}`;
}

/** 把整个缓冲导出成文本（日志标签页的「复制/下载」用）。与屏幕所见一致（按等级过滤）。 */
export function dump(): string {
  return entries().map(formatEntry).join('\n');
}

/** 安全序列化：循环引用、函数、DOM 节点都不会炸 */
export function safeStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_k, v: unknown) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      if (typeof v === 'function') return '[Function]';
      return v;
    }) ?? String(value);
  } catch {
    return '[Unserializable]';
  }
}

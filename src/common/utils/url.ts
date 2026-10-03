/**
 * URL 匹配工具（纯函数，无副作用，可被测试直接覆盖）。
 *
 * 语义刻意向油猴的 `@match` 靠拢，但只保留我们真正需要的那一小块：
 *   host  : `bkxk.szu.edu.cn`（精确）、`*.szu.edu.cn`（子域，**不含** szu.edu.cn 本身）
 *   page  : `/home/learn/index*`、`/exam/*`、`*`（任意页）
 */

/** 将通配模式编译为正则：`*` → 任意字符序列，其余字符字面量 */
function compileGlob(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** 编译结果缓存，避免每次匹配都重建正则 */
const globCache = new Map<string, RegExp>();

function globMatch(pattern: string, value: string): boolean {
  let re = globCache.get(pattern);
  if (re === undefined) {
    re = compileGlob(pattern);
    globCache.set(pattern, re);
  }
  return re.test(value);
}

/**
 * host 匹配。
 * - `*.szu.edu.cn` 命中 `bkxk.szu.edu.cn`、`www1.szu.edu.cn`，**不命中** `szu.edu.cn`
 * - host 比较不区分大小写
 */
export function matchHost(host: string, pattern: string): boolean {
  return globMatch(pattern.toLowerCase(), host.toLowerCase());
}

/**
 * 页面匹配。以 host 之后的整段（pathname + search + hash）为比较对象。
 * 空模式列表由调用方约定为「任意页」。
 */
export function matchPage(url: URL, pattern: string): boolean {
  const target = `${url.pathname}${url.search}${url.hash}`;
  return globMatch(pattern, target);
}

/** 任意一个模式命中即为真 */
export function matchAnyHost(host: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchHost(host, p));
}

/** 任意一个模式命中即为真。注意 `patterns` 为空时返回 false —— 「空 = 任意页」由调用方显式处理 */
export function matchAnyPage(url: URL, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchPage(url, p));
}

/**
 * 是否属于某根域（含根域本身）。
 * `isUnderDomain('szu.edu.cn', 'szu.edu.cn')` → true
 * `isUnderDomain('bkxk.szu.edu.cn', 'szu.edu.cn')` → true
 * `isUnderDomain('notszu.edu.cn', 'szu.edu.cn')` → false
 */
export function isUnderDomain(host: string, root: string): boolean {
  const h = host.toLowerCase();
  const r = root.toLowerCase();
  return h === r || h.endsWith(`.${r}`);
}

/**
 * 安全解析 URL。解析失败返回 null（例如在 about:blank、chrome:// 这类页面上）。
 * 传入相对路径时以 `base` 为基准解析。
 */
export function parseUrl(input: string, base?: string): URL | null {
  try {
    return base === undefined ? new URL(input) : new URL(input, base);
  } catch {
    return null;
  }
}

/**
 * 访问**页面**上下文的工具。
 *
 * 为什么需要它：脚本声明了非 `none` 的 `@grant`，因此跑在 Tampermonkey 的沙箱里，
 * `window` / `sessionStorage` / `fetch` 都是被包装过的代理对象。而我们要做的两件事
 * 必须用**页面原件**：
 *   1. 劫持页面自己的 `XMLHttpRequest` / `fetch`（否则站点脚本用的是另一个构造函数）
 *   2. 发出与站点请求逐字节一致的请求（cookie / Origin / Referer）
 *
 * ⚠️ 沙箱与页面之间传递对象有额外开销（TM 要对跨上下文对象做包装），
 * 所以这里只做**取用**，不要往里存东西、也不要高频调用。
 */

/** Tampermonkey 注入的页面 window（`@grant unsafeWindow` 才有） */
function pageWindow(): Record<string, unknown> | null {
  const g = globalThis as Record<string, unknown>;
  const uw = g['unsafeWindow'];
  return uw !== null && typeof uw === 'object' ? (uw as Record<string, unknown>) : null;
}

/**
 * 页面 window；没有 `unsafeWindow` 时退回 `globalThis`。
 *
 * 退回是给纯 node 测试与本地 mock 页用的 —— 真机上 `@grant unsafeWindow`
 * 一定存在，若不存在说明 header 被改坏了（`tools/verify-build.mjs` 会拦下）。
 */
export function pageOrSelf(): Record<string, unknown> {
  return pageWindow() ?? (globalThis as unknown as Record<string, unknown>);
}

/** 页面 sessionStorage；沙箱里读不到时返回 null */
export function pageSessionStorage(): Storage | null {
  try {
    const ps = pageOrSelf()['sessionStorage'];
    if (ps !== null && typeof ps === 'object') return ps as Storage;
  } catch {
    /* 某些隐私模式下访问 sessionStorage 会抛错 */
  }
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

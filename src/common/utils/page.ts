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
export function pageWindow(): Record<string, unknown> | null {
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

/**
 * 页面 origin（`https://bkxk.szu.edu.cn` 这种，**不带**尾斜杠）。
 *
 * 为什么需要它：`sites/bkxk/api.ts` 保持纯函数、不碰 DOM，所有接口 URL 都由调用方
 * 把 origin 传进 `endpointUrl(ep, origin)`。站点里不止一处要拼 URL（列表页、任务、监控），
 * 所以取 origin 这件事统一放这里，不要各模块各写一份。
 *
 * 显式值优先（方便测试与跨域复用）；沙箱里取不到时返回空串，由调用方自己判断。
 */
export function pageOrigin(explicit?: string): string {
  if (typeof explicit === 'string' && explicit !== '') return explicit;
  try {
    const loc = (globalThis as Record<string, unknown>)['location'];
    if (loc !== null && typeof loc === 'object') {
      const origin = (loc as { origin?: unknown }).origin;
      if (typeof origin === 'string') return origin;
    }
  } catch {
    /* 上层上下文（如 about:blank）访问 location 可能抛错 */
  }
  return '';
}

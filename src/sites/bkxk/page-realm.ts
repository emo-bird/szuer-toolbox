/**
 * 页面世界（page realm）的取用口。
 *
 * 【为什么单独一个文件】油猴脚本头部声明了 `@grant unsafeWindow` + `GM_*`
 * ⇒ 脚本跑在 Tampermonkey 的**沙箱**里，沙箱的 `globalThis` **不是**页面的
 * `window`。v0.24 出过一次静默事故：`installXhr()` 把包装挂到沙箱的
 * `globalThis.XMLHttpRequest` 上，页面自己的 `XMLHttpRequest` 一个字节都没动，
 * 于是响应接管**全程没有生效且不报错**（旧仓库是 `@grant none`，所以它的同款代码
 * 是真能工作的 —— 照抄旧仓库时这一点最容易漏）。
 *
 * 凡是要碰「页面自己的东西」——`XMLHttpRequest` / `fetch` / `jQuery` /
 * `CVMyCourseTable` / `performance`——一律从这里取，不要直接用 `globalThis`。
 */

/** 页面世界的全局对象；拿不到 `unsafeWindow`（比如单元测试、非油猴环境）时退回 `globalThis` */
export function pageRealm(): unknown {
  if (typeof unsafeWindow !== 'undefined') return unsafeWindow;
  return globalThis;
}

/**
 * 把页面世界当字典用（读 `jQuery` / `CV*` / `performance` 等）。
 * 不是对象/函数时给一个空字典，调用方不必每处判空。
 */
export function pageRecord(): Record<string, unknown> {
  const realm = pageRealm();
  if (realm === null || realm === undefined) return {};
  const type = typeof realm;
  if (type !== 'object' && type !== 'function') return {};
  return realm as Record<string, unknown>;
}
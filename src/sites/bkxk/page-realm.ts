/**
 * 该用哪个全局对象 —— **页面 realm 的 `window`，不是沙箱的 `globalThis`**。
 *
 * ⚠️ 这是 v0.24 修掉的真 bug：本脚本的 header 声明了 `@grant`（`GM_setValue` 等），
 * Tampermonkey 因此把脚本放进**沙箱**执行，沙箱里的 `globalThis` 不是页面那个 `window`。
 * 把包装后的 `XMLHttpRequest` 写在沙箱上，页面自己的那份**一个字节都没动** ⇒
 * 站点发请求用的还是原生 XHR ⇒ 响应永远不会被改写，而界面上只是「开关打开了但什么也没发生」，
 * **没有任何报错**。
 *
 * 旧仓库（`C:\Project\szu_bkxk`）是 `@grant none`，直接跑在页面 realm，
 * 所以它当年这样写是有效的 —— 迁移时漏掉了「本项目的运行环境已经变了」这一层。
 *
 * 凡是要「碰页面自己的东西」的代码（`XMLHttpRequest` / `fetch` / 站点自己的全局模块）
 * 都必须经过这里。响应接管（`hijack.ts`）与课表补偿（`timetable.ts`）都从这取。
 */
export function pageRealm(): unknown {
  // @types/tampermonkey 声明了 unsafeWindow；Node（档 1 测试）与 @grant none 下它是
  // undefined，用 typeof 判断不会抛 ReferenceError。
  if (typeof unsafeWindow !== 'undefined') return unsafeWindow;
  return globalThis;
}

/** 把 `pageRealm()` 当成普通对象读键用的便捷包装（读不到就是空对象） */
export function pageRecord(): Record<string, unknown> {
  const realm = pageRealm();
  if (realm === null || (typeof realm !== 'object' && typeof realm !== 'function')) return {};
  return realm as Record<string, unknown>;
}

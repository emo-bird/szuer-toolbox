/**
 * 站点装配清单。
 *
 * 这个模块的**唯一职责**：把「本脚本支持哪些站点」这件事集中在一个地方，
 * 让 `main.ts`（真正的入口，带着 CSS / DOM 依赖）和测试都能复用同一份清单。
 *
 * ⚠️ 它必须与 userscript header 的 `@match` 保持一一对应：
 *   header 里承诺 `@match` 的站点，这里就要注册对应适配器；否则
 *   `resolve()` 返回 `inject=false`，脚本在该站点**静默什么都不做**。
 *   历史事故：header 有 `*://*.uooc.net.cn/*`，但注册表没登记 uooc，
 *   导致 UOOC 上完全无反应且毫无报错（排查了很久）。
 *
 * `tests/suites/sites-registered.test.ts` 直接调用本模块的 `registerSites()`
 * 来钉住这组对应关系 —— 所以**不要**把注册逻辑挪回 main.ts。
 *
 * 本模块刻意不 import 任何 CSS / DOM，以便在 Node 下直接做纯函数测试。
 */

import { registerAdapter, allAdapters } from './registry.ts';
import { registerToggles } from '../common/core/settings.ts';
import { uoocAdapter } from './uooc/index.ts';
import { bkxkAdapter } from './bkxk/index.ts';

/**
 * 注册全部站点适配器，并把站点声明的开关灌进设置注册表。
 *
 * 依赖注入的两个 resolver 由调用方（main.ts）另行设置，
 * 因为它们要读入口模块自己的运行时状态（如当前已装载的适配器 id）。
 */
export function registerSites(): void {
  registerAdapter(uoocAdapter);
  registerAdapter(bkxkAdapter);

  for (const adapter of allAdapters()) {
    if (adapter.toggles !== undefined && adapter.toggles.length > 0) {
      registerToggles(adapter.id, adapter.name, adapter.toggles);
    }
  }
}


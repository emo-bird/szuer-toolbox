/**
 * 标签页容器。
 *
 * 需求文档 §4 定稿：标签栏是**一级平铺** —— 公共标签页（全局设置 / 日志 / 登录态）
 * 和各站点专属标签页并排放在同一条栏里，不再有「先点站点再点功能」的两级结构。
 *
 * 顺序**不在这里决定**：本模块只负责渲染 `tab-order.ts` 排好的结果
 * （站点组在前、公共组在后，两组之间一条竖线）。分组规则全部在那边，
 * 它是纯函数、能在 node 下测；本模块碰 `document`，测不了。
 *
 * 因为悬浮窗在 Shadow DOM 内，标签页拿不到页面全局 CSS，
 * 所以每个标签页注册时可以带一份自己的 `css`，由本模块塞进 shadow root。
 */

import { clear, el } from '../utils/dom.ts';
import { scoped } from '../core/log.ts';
import { planTabOrder } from './tab-order.ts';
import type { TabOrderInput } from './tab-order.ts';
import type { TabContext, TabRegistration } from '../../sites/types.ts';

const log = scoped('ui/tabs');

export interface TabViewOptions {
  /** 标签被选中时回调，供 panel 记忆「上次停留的标签」 */
  onActivate?: (tabId: string) => void;
}

export class TabView {
  readonly tabbar: HTMLElement;
  readonly body: HTMLElement;
  private readonly shadowRoot: ShadowRoot;
  private readonly options: TabViewOptions;
  /** tabId → { tab, pane, dispose } */
  private readonly mounted = new Map<
    string,
    { tab: TabRegistration; style: HTMLStyleElement; pane: HTMLElement; dispose?: () => void }
  >();
  private current: string | null = null;

  constructor(shadowRoot: ShadowRoot, options: TabViewOptions = {}) {
    this.shadowRoot = shadowRoot;
    this.options = options;
    this.tabbar = el('nav', { class: 'sztb-tabbar', attrs: { role: 'tablist' } });
    this.body = el('div', { class: 'sztb-body' });
  }

  /**
   * 重建全部标签页。先卸载旧的（调用其 dispose），再挂新的。
   * 骨架阶段沿用「整批重建」策略 —— 标签页数量是个位数，不值得做 diff。
   *
   * 入参是「标签页 + 它归属的站点 id」而不是裸的 `TabRegistration`：
   * 分组要靠 `siteId` 区分站点组与公共组（见 ./tab-order.ts）。
   */
  setTabs(entries: readonly TabOrderInput[], ctx: TabContext): void {
    this.destroyTabs();

    const planned = planTabOrder(entries);
    for (const item of planned) {
      // 站点组与公共组的交界处先插竖线，再挂该组的第一个标签页
      if (item.dividerBefore) this.tabbar.appendChild(makeSeparator());
      this.mountTab(item.entry.tab, ctx);
    }

    const first = planned[0];
    if (first !== undefined) {
      const keep = this.current !== null && this.mounted.has(this.current) ? this.current : first.entry.tab.id;
      this.activate(keep);
    }
  }

  private mountTab(tab: TabRegistration, ctx: TabContext): void {
    // 1) 样式：每个标签页一份 <style data-tab>，卸载时一并移除
    const style = document.createElement('style');
    style.dataset['tab'] = tab.id;
    style.textContent = tab.css ?? '';
    this.shadowRoot.appendChild(style);

    // 2) 标签按钮
    const button = el('button', {
      class: 'sztb-tab',
      text: tab.title,
      attrs: { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-tab': tab.id },
      on: { click: () => this.activate(tab.id) },
    });
    this.tabbar.appendChild(button);

    // 3) 内容面板
    const pane = el('div', { class: 'sztb-pane', attrs: { role: 'tabpanel' }, data: { tab: tab.id } });
    this.body.appendChild(pane);

    let dispose: (() => void) | undefined;
    try {
      const result = tab.mount(pane, ctx);
      if (typeof result === 'function') dispose = result;
    } catch (err) {
      // 一个坏掉的标签页不该把悬浮窗整体带崩
      log.error(`标签页 ${tab.id} 挂载失败`, err);
      pane.appendChild(el('div', { class: 'sztb-empty', text: `该标签页加载失败：${String(err)}` }));
    }

    this.mounted.set(tab.id, { tab, style, pane, ...(dispose !== undefined ? { dispose } : {}) });
  }

  /** 切到某个标签页 */
  activate(tabId: string): void {
    if (!this.mounted.has(tabId)) {
      log.warn(`激活了不存在的标签页 ${tabId}`);
      return;
    }
    this.current = tabId;
    for (const button of this.tabbar.querySelectorAll<HTMLElement>('.sztb-tab')) {
      button.setAttribute('aria-selected', String(button.dataset['tab'] === tabId));
    }
    for (const pane of this.body.querySelectorAll<HTMLElement>('.sztb-pane')) {
      pane.dataset['active'] = String(pane.dataset['tab'] === tabId);
    }
    this.options.onActivate?.(tabId);
  }

  activeTabId(): string | null {
    return this.current;
  }

  has(tabId: string): boolean {
    return this.mounted.has(tabId);
  }

  private destroyTabs(): void {
    for (const item of this.mounted.values()) {
      try {
        item.dispose?.();
      } catch (err) {
        log.warn(`标签页 ${item.tab.id} 卸载时抛错`, err);
      }
    }
    this.mounted.clear();
    this.current = null;
    clear(this.tabbar);
    clear(this.body);
    for (const style of this.shadowRoot.querySelectorAll('style[data-tab]')) style.remove();
  }

  destroy(): void {
    this.destroyTabs();
    this.tabbar.remove();
    this.body.remove();
  }
}

/**
 * 站点组与公共组之间的分隔线。
 *
 * `role="separator"` + 竖直朝向：标签栏会 `flex-wrap` 换行，用 `aria-orientation`
 * 说明这条线是**分组线**而不是页面里的水平分割。
 *
 * 类名刻意与 `.sztb-tab` 只差一个后缀：`activate()` 里用的是
 * `querySelectorAll('.sztb-tab')`，而 class 选择器是按**独立的 class token** 精确匹配的，
 * 不会命中 `.sztb-tab-sep`，所以这条线不会被当成标签按钮。
 */
function makeSeparator(): HTMLElement {
  return el('span', {
    class: 'sztb-tab-sep',
    attrs: { role: 'separator', 'aria-orientation': 'vertical' },
  });
}

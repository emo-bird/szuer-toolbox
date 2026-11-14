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

import { el } from '../utils/dom.ts';
import { scoped } from '../core/log.ts';
import { planTabOrder } from './tab-order.ts';
import type { TabOrderInput } from './tab-order.ts';
import type { PanelApi } from '../../sites/types.ts';

const log = scoped('ui/tabs');

export class TabView {
  readonly tabbar: HTMLElement;
  readonly body: HTMLElement;
  private readonly shadowRoot: ShadowRoot;
  private readonly onActivate: (tabId: string) => void;
  private readonly mounted = new Map<
    string,
    { button: HTMLButtonElement; style?: HTMLStyleElement; pane: HTMLElement; dispose?: () => void }
  >();
  private current: string | null = null;

  constructor(shadowRoot: ShadowRoot, onActivate: (tabId: string) => void) {
    this.shadowRoot = shadowRoot;
    this.onActivate = onActivate;
    this.tabbar = el('nav', { class: 'sztb-tabbar', attrs: { role: 'tablist' } });
    this.body = el('div', { class: 'sztb-body' });
    this.tabbar.addEventListener('keydown', (event) => {
      const tabs = [...this.tabbar.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      const index = tabs.findIndex((button) => button === event.target);
      if (index < 0) return;
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1)
        : event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
        : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] : undefined;
      const id = next?.dataset['tab'];
      if (id === undefined) return;
      event.preventDefault();
      this.activate(id);
      next?.focus();
    });
  }

  mount(entries: readonly TabOrderInput[], host: PanelApi, preferredTabId: string | null): void {
    const planned = planTabOrder(entries);
    for (const item of planned) {
      if (item.dividerBefore) this.tabbar.appendChild(makeSeparator());
      this.mountTab(item.entry, host);
    }
    const initial = preferredTabId ?? planned[0]?.entry.tab.id;
    if (initial !== undefined) this.select(initial);
  }

  private mountTab({ tab, siteId }: TabOrderInput, host: PanelApi): void {
    const id = `sztb-tab-${tab.id}`;
    const style = tab.css ? el('style', { text: tab.css }) : undefined;
    if (style) this.shadowRoot.appendChild(style);

    // 2) 标签按钮
    const button = el('button', {
      class: 'sztb-tab',
      text: tab.title,
      attrs: { type: 'button', role: 'tab', id, tabindex: -1, 'aria-selected': 'false',
        'aria-controls': `${id}-panel`, 'data-tab': tab.id },
      on: { click: () => this.activate(tab.id) },
    });
    this.tabbar.appendChild(button);

    // 3) 内容面板
    const pane = el('div', { class: 'sztb-pane',
      attrs: { role: 'tabpanel', id: `${id}-panel`, 'aria-labelledby': id, tabindex: 0 }, data: { tab: tab.id } });
    this.body.appendChild(pane);

    let dispose: (() => void) | undefined;
    try {
      const result = tab.mount(pane, { siteId, host });
      if (typeof result === 'function') dispose = result;
    } catch (err) {
      // 一个坏掉的标签页不该把悬浮窗整体带崩
      log.error(`标签页 ${tab.id} 挂载失败`, err);
      pane.appendChild(el('div', { class: 'sztb-empty', text: `该标签页加载失败：${String(err)}` }));
    }

    this.mounted.set(tab.id, { button, style, pane, dispose });
  }

  /** 切到某个标签页 */
  activate(tabId: string): void {
    if (this.select(tabId)) this.onActivate(tabId);
  }

  private select(tabId: string): boolean {
    const next = this.mounted.get(tabId);
    if (!next) {
      log.warn(`激活了不存在的标签页 ${tabId}`);
      return false;
    }
    if (this.current !== tabId) {
      const previous = this.current === null ? undefined : this.mounted.get(this.current);
      if (previous) {
        previous.button.setAttribute('aria-selected', 'false');
        previous.button.tabIndex = -1;
        previous.pane.dataset['active'] = 'false';
      }
      next.button.setAttribute('aria-selected', 'true');
      next.button.tabIndex = 0;
      next.pane.dataset['active'] = 'true';
      this.current = tabId;
    }
    return true;
  }

  destroy(): void {
    for (const [tabId, item] of this.mounted) {
      try {
        item.dispose?.();
      } catch (err) {
        log.warn(`标签页 ${tabId} 卸载时抛错`, err);
      }
      item.style?.remove();
    }
    this.mounted.clear();
    this.current = null;
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
 */
function makeSeparator(): HTMLElement {
  return el('span', {
    class: 'sztb-tab-sep',
    attrs: { role: 'separator', 'aria-orientation': 'vertical' },
  });
}

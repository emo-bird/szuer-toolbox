/**
 * 标签页容器。
 *
 * 需求文档 §4 定稿：标签栏是**一级平铺** —— 公共标签页（全局设置 / 日志 / 登录态）
 * 和各站点专属标签页并排放在同一条栏里，不再有「先点站点再点功能」的两级结构。
 *
 * 因为悬浮窗在 Shadow DOM 内，标签页拿不到页面全局 CSS，
 * 所以每个标签页注册时可以带一份自己的 `css`，由本模块塞进 shadow root。
 */

import { clear, el } from '../utils/dom.ts';
import { scoped } from '../core/log.ts';
import type { TabContext, TabRegistration } from '../../sites/types.ts';

const log = scoped('ui/tabs');

export interface TabViewOptions {
  /** 标签被选中时回调，供 panel 记忆「上次停留的标签」 */
  onActivate?: (tabId: string) => void;
}

/**
 * 标签页分组。
 *
 * 需求（用户已确认）：**站点自己的标签页排在前，公共标签页排在后，两组之间一条分割线**。
 * 分组的顺序与分割线都在 `sortTabEntries` / `TabView.setTabs` 这一处实现，
 * 各站点与 main 只负责声明自己属于哪一组。
 */
export type TabGroup = 'site' | 'common';

/** 一个待挂载的标签页 + 它归属的站点 id（公共标签页用 'common'）+ 分组 */
export interface TabEntry {
  readonly siteId: string;
  readonly tab: TabRegistration;
  readonly group: TabGroup;
}

/** 分组排序权重：站点组在前 */
const GROUP_RANK: Record<TabGroup, number> = { site: 0, common: 1 };

/**
 * 先按分组排（站点在前、公共在后），组内再按 `tab.order` 升序。
 *
 * ⚠️ 这里是「站点标签页在前」这条需求的**唯一实现处**。不能只靠 `order` 排 ——
 * 公共标签页的 order 是 10/90/92/95、站点标签页是 100/200，
 * 单看 order 公共页反而全排在前面，与需求正好相反。
 */
export function sortTabEntries(entries: readonly TabEntry[]): TabEntry[] {
  return [...entries].sort(
    (a, b) =>
      GROUP_RANK[a.group] - GROUP_RANK[b.group] || (a.tab.order ?? 1000) - (b.tab.order ?? 1000),
  );
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
   */
  setTabs(entries: readonly TabEntry[], ctx: TabContext): void {
    this.destroyTabs();

    const sorted = sortTabEntries(entries);
    let prevGroup: TabGroup | null = null;
    for (const entry of sorted) {
      // 组边界处插一条分割线。分组只有两个，所以「与上一个不同」就是「进入公共组」。
      // 没有站点标签页时 prevGroup 一直是 null，永远不会插 —— 这正是想要的。
      if (prevGroup !== null && entry.group !== prevGroup) {
        this.tabbar.appendChild(
          el('span', {
            class: 'sztb-tab-sep',
            attrs: { role: 'separator', 'aria-orientation': 'vertical' },
          }),
        );
      }
      prevGroup = entry.group;
      this.mountTab(entry, ctx);
    }

    const first = sorted[0];
    if (first !== undefined) {
      const keep = this.current !== null && this.mounted.has(this.current) ? this.current : first.tab.id;
      this.activate(keep);
    }
  }

  private mountTab(entry: TabEntry, ctx: TabContext): void {
    const { tab, group } = entry;

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
      data: { group },
      on: { click: () => this.activate(tab.id) },
    });
    this.tabbar.appendChild(button);

    // 3) 内容面板
    const pane = el('div', {
      class: 'sztb-pane',
      attrs: { role: 'tabpanel' },
      data: { tab: tab.id, group },
    });
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

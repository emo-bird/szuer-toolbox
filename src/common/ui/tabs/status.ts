/**
 * 公共标签页「状态」。
 *
 * 显示运行期信息：当前站点分派结果、存储后端、GM 能力、请求队列、构建信息。
 *
 * 注意依赖方向铁律（需求文档 §10）：`common/` 不能 import `sites/`。
 * 所以这里只声明一个 `StatusProvider` 接口，由 main 装配时把 registry 的信息喂进来。
 */

import { el } from '../../utils/dom.ts';
import { backendName, hasGmStorage } from '../../core/storage.ts';
import { getIntervalMs, queueDepth, RECOMMENDED_MIN_INTERVAL_MS } from '../../core/http.ts';
import { getLevel } from '../../core/log.ts';
import type { TabRegistration } from '../../../sites/types.ts';

export interface StatusInfo {
  resolution: string;
  adapterId: string | null;
  inject: boolean;
  autoExpand: boolean;
  tabCount: number;
  registeredAdapters: readonly string[];
  /** 构建时间戳（由 build.mjs 注入），未知为 null */
  buildTime: string | null;
  version: string;
}

let provider: (() => StatusInfo) | null = null;

/** 由 main 装配时注入 */
export function setStatusProvider(fn: () => StatusInfo): void {
  provider = fn;
}

function row(label: string, value: string | HTMLElement): HTMLElement {
  return el(
    'div',
    { class: 'sztb-row' },
    el(
      'div',
      { class: 'sztb-row-main' },
      el('span', { class: 'sztb-row-label', text: label }),
      typeof value === 'string' ? el('span', { class: 'sztb-row-desc', text: value }) : value,
    ),
  );
}

function renderTab(root: HTMLElement): void | (() => void) {
  const info = provider?.();
  if (info === undefined) {
    root.appendChild(el('div', { class: 'sztb-empty', text: '状态信息尚未注入' }));
    return;
  }

  const href = el('span', { class: 'sztb-row-desc' });
  const interval = el('span', { class: 'sztb-row-desc' });
  const depth = el('span', { class: 'sztb-row-desc' });
  const level = el('span', { class: 'sztb-row-desc' });
  function update(element: HTMLElement, value: string): void {
    if (element.textContent !== value) element.textContent = value;
  }
  function repaint(): void {
    update(href, location.href);
    update(interval, `${getIntervalMs()}ms（建议不低于 ${RECOMMENDED_MIN_INTERVAL_MS}ms）`);
    update(depth, String(queueDepth()));
    update(level, getLevel());
  }

  root.append(
    el('div', { class: 'sztb-group-title', text: '本页' }),
    row('URL', href),
    row('站点分派', info.resolution),
    row('命中适配器', info.adapterId ?? '（无，仅公共标签页）'),
    row('是否注入', info.inject ? '是' : '否'),
    row('自动展开', info.autoExpand ? '是' : '否'),
    row('标签页数量', String(info.tabCount)),
    el('div', { class: 'sztb-group-title', text: '已注册站点' }),
    row('适配器', info.registeredAdapters.join('、') || '（无）'),
    el('div', { class: 'sztb-group-title', text: '运行环境' }),
    row('脚本版本', info.version),
    row('构建时间', info.buildTime ?? '（开发模式，未注入）'),
    row('存储后端', backendName()),
    row('GM 存储可用', hasGmStorage() ? '是' : '否（已降级）'),
    row('请求间隔', interval),
    row('队列排队中', depth),
    row('日志等级', level),
    el('button', { class: 'sztb-btn', text: '刷新', attrs: { type: 'button' }, on: { click: repaint } }),
  );
  repaint();
  const timer = window.setInterval(() => {
    if (!document.hidden && root.dataset['active'] === 'true') repaint();
  }, 2000);
  return () => window.clearInterval(timer);
}

export const statusTab: TabRegistration = {
  id: 'common:status',
  title: '状态',
  order: 95,
  mount(root) {
    return renderTab(root);
  },
};

/**
 * Toast：轻提示。挂在 shadow root 内，不污染宿主页面。
 */

import { el, clear } from '../../utils/dom.ts';

export type ToastKind = 'info' | 'warn' | 'error' | 'success';

const DEFAULT_DURATION = 2600;

export class ToastStack {
  private readonly host: HTMLElement;
  private readonly root: HTMLElement;
  private readonly timers = new Set<number>();

  /** @param shadowRoot 悬浮窗所在的 shadow root */
  constructor(shadowRoot: ShadowRoot) {
    this.root = el('div', { class: 'sztb-toasts' });
    this.host = el('div', { class: 'sztb-root' }, this.root);
    shadowRoot.appendChild(this.host);
    this.reposition();
  }

  show(message: string, kind: ToastKind = 'info', durationMs = DEFAULT_DURATION): void {
    const node = el('div', { class: 'sztb-toast', data: { kind }, text: message });
    this.root.appendChild(node);
    this.reposition();
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      node.remove();
      this.reposition();
    }, durationMs);
    this.timers.add(timer);
  }

  /** 跟随悬浮球/面板位置显示（简化：固定右上角，避让面板宽度） */
  private reposition(): void {
    this.root.style.setProperty('top', '10px');
    this.root.style.setProperty('right', '10px');
  }

  destroy(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    clear(this.root);
    this.host.remove();
  }
}

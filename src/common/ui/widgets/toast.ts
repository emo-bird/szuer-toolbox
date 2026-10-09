/**
 * Toast：轻提示。挂在 shadow root 内，不污染宿主页面。
 *
 * 两种寿命：
 * - 默认：`DEFAULT_DURATION` 毫秒后自动消失（普通进度提示用这个）。
 * - sticky：**不自动消失**，右上角带一个「×」必须手动点掉（异常/失败用这个，
 *   免得一闪而过之后再也查不到）。
 *
 * sticky 是**调用方显式要求**的，不按 kind 自动升级 —— bkxk 等地也在用同一个栈，
 * 按 kind 一刀切会把它们的 toast 全变成常驻。
 */

import { el, clear } from '../../utils/dom.ts';

export type ToastKind = 'info' | 'warn' | 'error' | 'success';

const DEFAULT_DURATION = 2600;

/** sticky 最多同时留几条，超了就把最老的挤掉，免得堆满整屏 */
const MAX_STICKY = 3;

export interface ToastOptions {
  /** true = 不自动消失，右上角给「×」由用户点掉 */
  readonly sticky?: boolean;
  /** 自定义自动消失时间（仅非 sticky 时有意义） */
  readonly durationMs?: number;
}

export class ToastStack {
  private readonly host: HTMLElement;
  private readonly root: HTMLElement;
  private readonly timers = new Set<number>();
  /** 当前还留着的 sticky 节点，按出现顺序 */
  private readonly sticky: HTMLElement[] = [];

  /** @param shadowRoot 悬浮窗所在的 shadow root */
  constructor(shadowRoot: ShadowRoot) {
    this.root = el('div', { class: 'sztb-toasts' });
    this.host = el('div', { class: 'sztb-root' }, this.root);
    shadowRoot.appendChild(this.host);
    this.reposition();
  }

  show(message: string, kind: ToastKind = 'info', options: ToastOptions = {}): void {
    const isSticky = options.sticky === true;
    const node = el('div', {
      class: 'sztb-toast',
      data: { kind, sticky: isSticky ? 'true' : 'false' },
    });
    node.appendChild(el('span', { class: 'sztb-toast-text', text: message }));

    if (isSticky) {
      const close = el('button', {
        class: 'sztb-toast-close',
        text: '×',
        attrs: { type: 'button', title: '关闭' },
      });
      close.addEventListener('click', () => {
        this.dismiss(node);
      });
      node.appendChild(close);
    }

    this.root.appendChild(node);
    this.reposition();

    if (isSticky) {
      this.sticky.push(node);
      // 满了就挤掉最老的一条，避免 sticky 无限堆积占满整屏
      while (this.sticky.length > MAX_STICKY) {
        const oldest = this.sticky[0];
        if (oldest === undefined || oldest === node) break;
        this.dismiss(oldest);
      }
      return;
    }

    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      node.remove();
      this.reposition();
    }, options.durationMs ?? DEFAULT_DURATION);
    this.timers.add(timer);
  }

  /** 手动关掉一条（sticky 的「×」按钮走这里） */
  private dismiss(node: HTMLElement): void {
    const i = this.sticky.indexOf(node);
    if (i >= 0) this.sticky.splice(i, 1);
    node.remove();
    this.reposition();
  }

  /** 跟随悬浮球/面板位置显示（简化：固定右上角，避让面板宽度） */
  private reposition(): void {
    this.root.style.setProperty('top', '10px');
    this.root.style.setProperty('right', '10px');
  }

  destroy(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers.clear();
    this.sticky.length = 0;
    clear(this.root);
    this.host.remove();
  }
}

/**
 * 通用全屏模态框（灰遮罩 + 居中盒子 + N 个按钮）。
 *
 * 本文件是 `confirm.ts`（二次确认）与 `auth-alert.ts`（登录态失效）**共同的地基** ——
 * 两者原先各写一份 DOM 构造与收尾逻辑，遮罩层级、判重方式、角色分工全靠注释同步；
 * 抽到这里之后，新场景（连播测验超时提醒）只要再写一个薄包装即可，不必再抄第三份。
 *
 * ⚠️ 这里**只负责「问」**，不负责「拦」。要不要把某个操作做成不可跳过，
 * 由调用方用 `cancelKey` 决定：**不给 `cancelKey` 就是「必须点按钮才关得掉」**
 * （点遮罩、按 Esc 都无效）。`confirm.ts` 的门禁语义（需求文档 §8.1 N1）建立在这条上，
 * 任何给 danger 类操作放行 `cancelKey` 的想法都会直接违反 N1。
 */

import { el } from '../../utils/dom.ts';

const ESC_KEY = 'Escape';

/** 按钮配色：`primary` 蓝、`danger` 红、不给则中性灰 */
export type ModalActionVariant = 'primary' | 'danger';

export interface ModalAction {
  /** 用户点了这个按钮时 resolve 出来的值 */
  key: string;
  label: string;
  variant?: ModalActionVariant;
}

export interface ModalOptions {
  title: string;
  body: string;
  /**
   * 按钮，**顺序即渲染顺序**（左侧先渲染，所以主操作放最后一个）。
   * 最后一个按钮会自动获得焦点。
   */
  actions: readonly ModalAction[];
  /** 标题染红 */
  danger?: boolean;
  /**
   * 给了就允许「点遮罩空白处 / 按 Esc」关掉，并回传这个 key；
   * **不给 = 只能点按钮**（浏览器里没有任何旁路）。
   */
  cancelKey?: string;
  /**
   * 判重类名：既会被加到遮罩上，也用来判断「是不是已经弹着一个了」。
   * 给了 `dedupeClass` 时，若 shadow root 里已存在同名元素，直接 resolve `null` 不再弹。
   */
  dedupeClass?: string;
  /** 额外挂在对话框本体上的类名（`auth-alert` 用它放宽宽度） */
  boxClass?: string;
}

/**
 * 弹一个模态框。
 * @returns 用户点的按钮的 `key`；因判重没弹、或调用方给了 `cancelKey` 而被取消 → `null`
 */
export function showModalAlert(
  shadowRoot: ShadowRoot,
  options: ModalOptions,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const danger = options.danger === true;
    const cancelKey = options.cancelKey;
    const dedupeClass = options.dedupeClass ?? '';
    const boxClass = options.boxClass ?? '';

    // 判重：同一种提示同时只允许存在一个（否则遮罩会一层层叠上去）
    if (dedupeClass !== '' && shadowRoot.querySelector(`.${dedupeClass}`) !== null) {
      resolve(null);
      return;
    }

    let settled = false;

    const finish = (key: string | null): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown, true);
      mask.remove();
      resolve(key);
    };

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (cancelKey === undefined || ev.key !== ESC_KEY) return;
      ev.stopPropagation();
      finish(cancelKey);
    };

    const buttons = options.actions.map((action) =>
      el('button', {
        class: 'sztb-btn',
        text: action.label,
        attrs: { type: 'button', 'data-variant': action.variant },
        on: { click: () => finish(action.key) },
      }),
    );

    const modal = el(
      'div',
      { class: boxClass === '' ? 'sztb-modal' : `sztb-modal ${boxClass}` },
      el('div', {
        class: 'sztb-modal-title',
        text: options.title,
        data: { danger: String(danger) },
      }),
      el('div', { class: 'sztb-modal-body', text: options.body }),
      el('div', { class: 'sztb-modal-foot' }, ...buttons),
    );

    const mask = el(
      'div',
      {
        class: dedupeClass === '' ? 'sztb-modal-mask' : `sztb-modal-mask ${dedupeClass}`,
        on: {
          click: (ev) => {
            // 只有点在遮罩本身上才算取消（点在对话框里不算）
            if (cancelKey === undefined) return;
            if (ev.target === mask) finish(cancelKey);
          },
        },
      },
      modal,
    );

    shadowRoot.appendChild(mask);
    if (cancelKey !== undefined) document.addEventListener('keydown', onKeyDown, true);
    buttons[buttons.length - 1]?.focus();
  });
}

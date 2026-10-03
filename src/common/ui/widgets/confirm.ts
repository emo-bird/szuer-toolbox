/**
 * 二次确认对话框。
 *
 * 这是风险门禁的最后一道锁（需求文档 §8.1 N1）：🔴 不可逆操作
 * （提交选课 / 提交答案 / 交卷）在真正执行前必须经过用户显式确认。
 *
 * ⚠️ 严禁把本组件做成「可跳过」的。任何给 danger 类操作加 `skipConfirm` 的想法
 * 都会直接违反 N1。
 */

import { el } from '../../utils/dom.ts';
import type { ConfirmOptions } from '../../../sites/types.ts';

const ESC_KEY = 'Escape';

/**
 * 弹一个确认框。
 * @returns 用户点确认 → true；点取消 / 按 Esc / 点遮罩 → false
 */
export function showConfirm(shadowRoot: ShadowRoot, options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const danger = options.danger === true;
    let settled = false;

    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown, true);
      mask.remove();
      resolve(value);
    };

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key !== ESC_KEY) return;
      ev.stopPropagation();
      finish(false);
    };

    const confirmBtn = el('button', {
      class: 'sztb-btn',
      text: options.confirmText ?? (danger ? '我确认，执行' : '确定'),
      attrs: { type: 'button', 'data-variant': danger ? 'danger' : 'primary' },
      on: { click: () => finish(true) },
    });

    const cancelBtn = el('button', {
      class: 'sztb-btn',
      text: options.cancelText ?? '取消',
      attrs: { type: 'button' },
      on: { click: () => finish(false) },
    });

    const modal = el(
      'div',
      { class: 'sztb-modal' },
      el('div', {
        class: 'sztb-modal-title',
        text: options.title,
        data: { danger: String(danger) },
      }),
      el('div', { class: 'sztb-modal-body', text: options.body }),
      el('div', { class: 'sztb-modal-foot' }, cancelBtn, confirmBtn),
    );

    const mask = el(
      'div',
      {
        class: 'sztb-modal-mask',
        on: {
          // 只有点在遮罩本身上才算取消（点在对话框里不算）
          click: (ev) => {
            if (ev.target === mask) finish(false);
          },
        },
      },
      modal,
    );

    shadowRoot.appendChild(mask);
    document.addEventListener('keydown', onKeyDown, true);
    confirmBtn.focus();
  });
}

/**
 * 功能开关复选框行。
 *
 * 与 settings 模块配合实现风险门禁：
 *   🟢 safe        —— 直接 toggle
 *   🟠 trace       —— 直接 toggle（默认关闭由 settings 保证）
 *   🔴 irreversible —— 勾选时必须先过二次确认，取消则回弹
 */

import { el } from '../../utils/dom.ts';
import type { RiskLevel } from '../../../sites/types.ts';
import type { ConfirmOptions } from '../../../sites/types.ts';

export interface CheckboxOptions {
  id: string;
  label: string;
  desc?: string;
  checked: boolean;
  risk: RiskLevel;
  /** 需要二次确认时由调用方提供弹窗能力 */
  confirm?: (options: ConfirmOptions) => Promise<boolean>;
  /** 用户确认后的回调；返回最终应显示的状态 */
  onChange: (checked: boolean) => void | Promise<void>;
}

const RISK_TEXT: Record<Exclude<RiskLevel, 'safe'>, string> = {
  trace: '留痕',
  irreversible: '不可逆',
};

export function createToggleRow(options: CheckboxOptions): HTMLElement {
  const input = el('input', { attrs: { type: 'checkbox', id: `sztb-${options.id}` } });
  input.checked = options.checked;

  const label = el('label', {
    class: 'sztb-row-label',
    text: options.label,
    attrs: { for: `sztb-${options.id}` },
  });

  if (options.risk !== 'safe') {
    label.appendChild(
      el('span', {
        class: 'sztb-risk',
        text: RISK_TEXT[options.risk],
        data: { risk: options.risk },
      }),
    );
  }

  const main = el(
    'div',
    { class: 'sztb-row-main' },
    label,
    options.desc !== undefined ? el('span', { class: 'sztb-row-desc', text: options.desc }) : null,
  );

  let busy = false;

  input.addEventListener('change', () => {
    const desired = input.checked;
    void (async () => {
      if (busy) {
        // 上一次还在处理，回弹本次原始状态
        input.checked = !desired;
        return;
      }
      busy = true;
      try {
        if (desired && options.risk === 'irreversible' && options.confirm !== undefined) {
          const ok = await options.confirm({
            title: '开启不可逆功能',
            body: `${options.label}\n\n${options.desc ?? ''}\n\n该功能会产生无法撤销的操作，确认开启？`.trim(),
            danger: true,
            confirmText: '我确认，开启',
          });
          if (!ok) {
            input.checked = false;
            return;
          }
        }
        await options.onChange(desired);
      } catch {
        input.checked = !desired;
      } finally {
        busy = false;
      }
    })();
  });

  return el('div', { class: 'sztb-row' }, input, main);
}

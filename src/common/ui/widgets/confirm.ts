/**
 * 二次确认对话框。
 *
 * 这是风险门禁的最后一道锁（需求文档 §8.1 N1）：🔴 不可逆操作
 * （提交选课 / 提交答案 / 交卷）在真正执行前必须经过用户显式确认。
 *
 * ⚠️ 严禁把本组件做成「可跳过」的。任何给 danger 类操作加 `skipConfirm` 的想法
 * 都会直接违反 N1。落到实现上：这里**只**把 `cancelKey` 用作「遮罩 / Esc 算取消」，
 * 绝不能改成把确认按钮之外的路径也放行。
 *
 * 形态（遮罩层级、按钮样式、判重）全部由 `modal.ts` 提供，本文件只剩语义映射。
 */

import { showModalAlert } from './modal.ts';
import type { ConfirmOptions } from '../../../sites/types.ts';

/** 取消路径回传的 key —— 与「点取消按钮」同义，调用方不需要区分 */
const CANCEL_KEY = 'cancel';

/** 确认路径回传的 key */
const OK_KEY = 'ok';

/**
 * 弹一个确认框。
 * @returns 用户点确认 → true；点取消 / 按 Esc / 点遮罩 → false
 */
export function showConfirm(shadowRoot: ShadowRoot, options: ConfirmOptions): Promise<boolean> {
  const danger = options.danger === true;

  return showModalAlert(shadowRoot, {
    title: options.title,
    body: options.body,
    danger,
    cancelKey: CANCEL_KEY,
    actions: [
      { key: CANCEL_KEY, label: options.cancelText ?? '取消' },
      {
        key: OK_KEY,
        label: options.confirmText ?? (danger ? '我确认，执行' : '确定'),
        variant: danger ? 'danger' : 'primary',
      },
    ],
  }).then((key) => key === OK_KEY);
}

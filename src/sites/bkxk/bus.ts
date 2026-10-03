/**
 * bkxk 站内事件总线（模型层 → 视图层的**唯一**通路）。
 *
 * 为什么需要它：旧仓库的模型模块（`tasks.js` / `monitor.js`）直接调 `NS.ui.render()`、
 * `NS.ui.toast()`、`NS.ui.authExpired()` —— 模型和悬浮窗的 DOM 焊死在一起，
 * 所以旧版才有「面板靠 1s 轮询重绘、停止那一刻的最终状态永远显示不出来」这种问题
 * （`tasks.js:59-66` 的注释记录了它）。本框架的铁律是「站点模块不直接操作悬浮窗 DOM」，
 * 于是模型只广播事实，由适配器（`index.ts`）与标签页决定怎么展示。
 *
 * 事件语义：
 *   - `changed`     —— 数据变了，关心它的标签页应当重绘。**不发就直接改数据**是不允许的，
 *                      界面会静默停在旧状态。
 *   - `toast`       —— 想弹一条提示。由适配器转发给 `PanelApi.toast()`。
 *   - `authExpired` —— 登录态失效。由适配器统一处理（Toast + 日志 + 自动切到「登录态」标签页，
 *                      见 D3 决策）；**发起方不要自己再弹一遍**。
 */

import { Bus } from '../../common/core/bus.ts';
import { scoped } from '../../common/core/log.ts';
import type { ToastKind } from '../../common/ui/widgets/toast.ts';

const log = scoped('bkxk/bus');

/** 哪一块数据变了（标签页按此做粗粒度重绘，不做字段级 diff） */
export type BkxkChangeScope = 'tasks' | 'monitor' | 'custom';

export interface BkxkEvents {
  /** 索引签名：`Bus<Events>` 要求 `Record<string, unknown>`，同时保留各字段的精确类型 */
  [event: string]: unknown;
  changed: { what: BkxkChangeScope };
  toast: { msg: string; kind?: ToastKind };
  authExpired: { source: string };
}

export const bkxkBus = new Bus<BkxkEvents>();

/** 某个监听器抛错不能拖垮其它监听器，但也不能悄悄吞掉 —— 落到日志页 */
bkxkBus.onError = (event, err) => {
  log.error(`事件 ${event} 的监听器抛错：${err instanceof Error ? err.message : String(err)}`);
};

/** 通知视图层「这块数据变了」（模型层 save() 之后统一走它） */
export function notifyChanged(what: BkxkChangeScope): void {
  bkxkBus.emit('changed', { what });
}

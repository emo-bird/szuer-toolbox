/**
 * 全屏「登录态已失效」提示（用户 m00846 的新需求 2，形态照旧项目 `ui.js` 的 `U.authExpired()`）。
 *
 * 为什么不能只用 Toast：抢课与监控都是**循环发请求**的，会话被站点踢下线之后每一轮都会
 * 失败。Toast 一闪而过（而且只在面板里），用户很容易就让引擎这么空转一小时。这里用
 * 整页遮罩（外围灰色、中间提示）把话说死，并给一个「刷新网页重新登录」的按钮。
 *
 * 与 `confirm.ts` 的分工：
 *   - `showConfirm` 返回 Promise —— 调用方**要等用户回答**才能往下走（门禁的最后一道锁）；
 *   - 本组件没有返回值 —— 引擎在弹它之前就已经停了，这里只是让用户看清楚发生了什么，
 *     所以「稍后」不产生任何状态变化，只是把遮罩收起来。
 *
 * 一次只弹一个：靠遮罩自己的类名判重（与确认框同一套 `sztb-modal-*` 样式）。
 * 关掉之后不再复弹 —— 触发方（tasks / monitor）在登录态失效时已经停了循环，
 * 不会有第二个来源连续戳它。
 */

import { el } from '../../utils/dom.ts';

/** 本组件专属类名：`sztb-modal-mask` 之外再加一层，用于判重与层级覆盖 */
const AUTH_MASK_CLASS = 'sztb-auth-mask';

const TITLE = '登录态已失效';

const BODY =
  '选课站点已经把本次会话踢下线，继续抢课 / 监控不会成功。\n' +
  '请刷新网页并重新登录，然后回到【任务】页点【开始抢课】继续。';

/**
 * 弹出全屏提示（已存在则什么都不做）。
 * @param shadowRoot 悬浮窗的 shadow root —— 与确认框同源，遮罩挂在它下面。
 */
export function showAuthAlert(shadowRoot: ShadowRoot): void {
  if (shadowRoot.querySelector(`.${AUTH_MASK_CLASS}`) !== null) return;

  // 按钮的点击处理器在 mask 建好之后才挂（`mask` 是 const，不能在它之前引用）
  const laterBtn = el('button', {
    class: 'sztb-btn',
    text: '稍后',
    attrs: { type: 'button' },
  });

  const reloadBtn = el('button', {
    class: 'sztb-btn',
    text: '刷新网页重新登录',
    attrs: { type: 'button', 'data-variant': 'primary' },
    on: {
      click: () => {
        // 会话凭证在页面会话里，重登必须重新走站点登录页 —— 刷新是唯一动作
        location.reload();
      },
    },
  });

  const modal = el(
    'div',
    { class: 'sztb-modal sztb-auth-box' },
    el('div', { class: 'sztb-modal-title', text: TITLE, data: { danger: 'true' } }),
    el('div', { class: 'sztb-modal-body', text: BODY }),
    el('div', { class: 'sztb-modal-foot' }, laterBtn, reloadBtn),
  );

  // 遮罩**刻意不响应点击**：这不是一个「点外面就取消」的框，用户必须明确选一个按钮
  const mask = el('div', { class: `sztb-modal-mask ${AUTH_MASK_CLASS}` }, modal);
  laterBtn.addEventListener('click', () => {
    mask.remove();
  });

  shadowRoot.appendChild(mask);
  reloadBtn.focus();
}

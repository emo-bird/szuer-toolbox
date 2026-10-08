/**
 * UOOC 的【接管】标签页（文件路径沿用 `tabs/autoplay.ts`）。
 *
 * 这一页是 API 驱动接管的**控制台**（需求文档 §E.1）：**只有两个按钮 + 实时状态行**，
 * 不再渲染任何设置组 —— 三个等待设置项已整组搬到【等待】页（§E.5）。
 *
 * 标签 id **`uooc:autoplay` 故意不改**：`host.activateTab()` 的调用点和构建校验
 * 都按这个 id 找，改 id 是纯风险没收益。标题与按钮文案改成「接管」。
 *
 * 与旧实现的区别：接管循环在 `../takeover.ts`，`../autoplay.ts`（旧的 DOM 点击连播）
 * 已经不再被这一页引用；旧文件按需求文档 §G 稍后整体清掉。
 */

import { el } from '../../../common/utils/dom.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { SITE_ID } from '../settings.ts';
import { subscribeTakeover, takeoverStart, takeoverStatus, takeoverStop } from '../takeover.ts';

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const UOOC_AUTOPLAY_TAB: TabRegistration = {
  id: `${SITE_ID}:autoplay`,
  title: '接管',
  order: 210,
  mount(root: HTMLElement, ctx: TabContext): void {
    const startBtn = el('button', {
      class: 'sztb-btn',
      text: '开始接管',
      attrs: { type: 'button', 'data-variant': 'primary' },
    });
    const stopBtn = el('button', {
      class: 'sztb-btn',
      text: '停止接管',
      attrs: { type: 'button', 'data-variant': 'danger' },
    });

    startBtn.addEventListener('click', () => {
      takeoverStart(ctx.host);
    });
    // 【停止接管】立刻停（用户拍板：不等待、不留收尾）
    stopBtn.addEventListener('click', () => {
      takeoverStop();
    });

    const statusLine = el('div', { class: 'sztb-field-desc' });

    const sync = (): void => {
      const s = takeoverStatus();
      statusLine.textContent = s.text;
      // 跑着的时候别让人重复点【开始接管】；没跑的时候【停止接管】没有意义
      startBtn.disabled = s.running;
      stopBtn.disabled = !s.running;
    };
    sync();

    // 状态行跟 DOM 变；面板被拆掉时自动退订（ctx 没有卸载钩子，只能靠 isConnected）
    const off = subscribeTakeover(() => {
      if (!root.isConnected) {
        off();
        return;
      }
      sync();
    });

    root.appendChild(el('div', { class: 'sztb-toolbar' }, startBtn, stopBtn));
    root.appendChild(statusLine);
    // §E.5：设置组整组搬走了，这里**刻意不渲染** `renderSiteSettings`
  },
};

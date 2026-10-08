/**
 * UOOC 的【连播】标签页。
 *
 * 布局（用户 m04485 第一/第二轮拍板）：**两个按钮 + 实时状态行放在最上方**，
 * 下面才是 `GROUP.AUTOPLAY` 那一组设置（跳过什么、两个等待时间）。
 *
 * 原来的「自动连播」复选框（`TOGGLE.AUTO_NEXT`）已删：连播不再靠开关自动启动，
 * 而是由这里的【开始连播】/【停止连播】驱动 —— 用户能看见、能立刻停。
 *
 * 渲染设置一律走共享组件 `renderSiteSettings`（理由见 `tabs/video.ts`）。
 */

import { el } from '../../../common/utils/dom.ts';
import { renderSiteSettings } from '../../../common/ui/widgets/settings-form.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { autoplayStart, autoplayStatus, autoplayStop, subscribeAutoplay } from '../autoplay.ts';
import { GROUP, SITE_ID } from '../settings.ts';

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const UOOC_AUTOPLAY_TAB: TabRegistration = {
  id: `${SITE_ID}:autoplay`,
  title: '连播',
  order: 210,
  mount(root: HTMLElement, ctx: TabContext): void {
    const startBtn = el('button', {
      class: 'sztb-btn',
      text: '开始连播',
      attrs: { type: 'button', 'data-variant': 'primary' },
    });
    const stopBtn = el('button', {
      class: 'sztb-btn',
      text: '停止连播',
      attrs: { type: 'button', 'data-variant': 'danger' },
    });

    startBtn.addEventListener('click', () => {
      autoplayStart();
    });
    // 【停止连播】立刻停（用户拍板：不等待、不留收尾）
    stopBtn.addEventListener('click', () => {
      autoplayStop();
    });

    const statusLine = el('div', { class: 'sztb-field-desc' });

    const sync = (): void => {
      const s = autoplayStatus();
      statusLine.textContent = s.text;
      // 跑着的时候别让人重复点【开始连播】；没跑的时候【停止连播】没有意义
      startBtn.disabled = s.running;
      stopBtn.disabled = !s.running;
    };
    sync();

    // 状态行跟 DOM 变；面板被拆掉时自动退订（ctx 没有卸载钩子，只能靠 isConnected）
    const off = subscribeAutoplay(() => {
      if (!root.isConnected) {
        off();
        return;
      }
      sync();
    });

    root.appendChild(el('div', { class: 'sztb-toolbar' }, startBtn, stopBtn));
    root.appendChild(statusLine);
    root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.AUTOPLAY] }));
  },
};

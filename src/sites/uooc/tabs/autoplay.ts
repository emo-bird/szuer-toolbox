/**
 * UOOC 的【连播】标签页 —— 连播行为与节奏。
 *
 * 只渲染 `GROUP.AUTOPLAY` 那一组：自动连播开关、跳过什么（附件/文本/讨论/测验）、
 * 两个等待时间（跳转后等待、播完后停留）。
 *
 * 渲染一律走共享组件 `renderSiteSettings`（理由见 `tabs/video.ts`）。
 */

import { renderSiteSettings } from '../../../common/ui/widgets/settings-form.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { GROUP, SITE_ID } from '../settings.ts';

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const UOOC_AUTOPLAY_TAB: TabRegistration = {
  id: `${SITE_ID}:autoplay`,
  title: '连播',
  order: 210,
  mount(root: HTMLElement, ctx: TabContext): void {
    root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.AUTOPLAY] }));
  },
};

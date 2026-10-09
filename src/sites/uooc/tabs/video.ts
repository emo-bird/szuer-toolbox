/**
 * UOOC 的【视频】标签页 —— 播放器行为。
 *
 * 只渲染 `GROUP.VIDEO` 那一组（倍速 / 静音 / 防暂停）。
 * 渲染一律走共享组件 `renderSiteSettings` —— 公共【全局设置】页也调它，
 * 「风险门禁只有一处实现」这条铁律不会因为多开入口而破坏。
 *
 * ⚠️ 本页只放**播放器本身**的行为。「播完之后干什么」属于接管，在【接管】页
 * 启动、三个等待参数在【等待】页（用户 m01877 分区口径：「视频相关的倍速、禁音、
 * 焦点放在视频标签页」）。
 */

import { renderSiteSettings } from '../../../common/ui/widgets/settings-form.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { GROUP, SITE_ID } from '../settings.ts';

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const UOOC_VIDEO_TAB: TabRegistration = {
  id: `${SITE_ID}:video`,
  title: '视频',
  order: 200,
  mount(root: HTMLElement, ctx: TabContext): void {
    root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.VIDEO] }));
  },
};

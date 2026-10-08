/**
 * UOOC 的【等待】标签页（需求文档 §E.5，用户本轮拍板新开的一页）。
 *
 * 为什么单开一页：接管的三个等待时间语义完全不同（改完 hash 后固定 sleep /
 * `ended` 后停留 / 除 API 外所有等待的超时），跟【接管】页那两个按钮混在一起
 * 会让人以为它们都是「连播的开关」。
 *
 * 三个设置项**仍然注册在 `GROUP.AUTOPLAY` 这一组里**（UOOC 专属，不新增分组），
 * 只是渲染位置搬到了这里，所以存储 id 一个都没变 ⇒ **不涉及旧值迁移**：
 *   - `hold-after-ms`  播放结束后停留（默认 5000）
 *   - `wait-timeout-ms` 全局等待超时（默认 30000）
 *   - `wait-before-ms` 跳转后等待（默认 5000）
 *
 * 渲染一律走共享组件 `renderSiteSettings`（理由见 `tabs/video.ts`）。
 */

import { renderSiteSettings } from '../../../common/ui/widgets/settings-form.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { GROUP, SITE_ID } from '../settings.ts';

/** 固定 id：`ctx.host.activateTab()` 与构建校验都按它找，别在别处写裸字符串 */
export const UOOC_WAIT_TAB: TabRegistration = {
  id: `${SITE_ID}:wait`,
  title: '等待',
  order: 240,
  mount(root: HTMLElement, ctx: TabContext): void {
    root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.AUTOPLAY] }));
  },
};

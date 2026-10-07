/**
 * UOOC 的【AI 作答】标签页 —— 答题开关与接口配置。
 *
 * 只渲染 `GROUP.AI` 那一组。当前只有一个还没实现的开关占位；
 * LLM 接口（地址 / API Key / 模型名 / 超时 / 并发）与「测试连接」按钮
 * 会在这里长出来（用户 m01877 分区口径：「AI作答开关、api配置的放在AI作答标签页」）。
 *
 * 渲染一律走共享组件 `renderSiteSettings`（理由见 `tabs/video.ts`）。
 */

import { renderSiteSettings } from '../../../common/ui/widgets/settings-form.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { GROUP, SITE_ID } from '../settings.ts';

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const UOOC_AI_TAB: TabRegistration = {
  id: `${SITE_ID}:ai`,
  title: 'AI 作答',
  order: 220,
  mount(root: HTMLElement, ctx: TabContext): void {
    root.appendChild(renderSiteSettings(SITE_ID, null, ctx, { onlyGroups: [GROUP.AI] }));
  },
};

/**
 * 本科选课自己的【设置】标签页。
 *
 * 为什么要让站点自己管设置：本站有 6 个功能开关 + 7 个配置项，全塞进公共【全局设置】页
 * 会把那一页淹掉，而且用户容易看漏是哪个站点的。用户已确认「本科选课的设置都放在
 * 单独标签页更好」。
 *
 * ⚠️ 本站标签页的标题就是【设置】，而公共那页叫【全局设置】（用户 m00593 拍板改名）——
 * 两个都叫「设置」时并排在标签栏里分不清谁是谁。本文件不要跟着改标题。
 *
 * **渲染一律走共享组件 `renderSiteSettings`** —— 公共【全局设置】页也调它。这样「风险门禁只有
 * 一处实现」这条铁律不会因为多了一个入口就被破坏（两个入口各写一遍 `isEnabled`
 * 迟早会漂移）。
 *
 * 标签 id 必须等于 `settingsTabId('bkxk')`：公共【全局设置】页靠这个等式判断「本站自己管设置」，
 * 不一致的话同一个开关会在面板里出现两遍、还能从两处改。`tests/suites/sites-registered.test.ts`
 * 把这个等式钉住了。
 */

import { el } from '../../../common/utils/dom.ts';
import { renderSiteSettings } from '../../../common/ui/widgets/settings-form.ts';
import { settingsTabId } from '../../registry.ts';
import type { TabRegistration, TabContext } from '../../types.ts';

/** 本标签页的 id（= registry 约定的 `bkxk:settings`） */
const BKXK_SETTINGS_TAB_ID = settingsTabId('bkxk');

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const BKXK_SETTINGS_TAB: TabRegistration = {
  id: BKXK_SETTINGS_TAB_ID,
  title: '设置',
  order: 200,
  mount(root: HTMLElement, ctx: TabContext): void {
    root.appendChild(
      el('div', {
        class: 'sztb-note',
        text:
          '🟢 随时可开关；🟠 / 🔴 需要你显式勾选才生效，开启前请先读一遍说明。' +
          '本页参数改动即刻生效，不用刷新页面。',
      }),
    );
    root.appendChild(renderSiteSettings('bkxk', null, ctx));
  },
};

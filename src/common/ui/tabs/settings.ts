/**
 * 公共标签页「设置」。
 *
 * 渲染**没有自己设置标签页**的站点的功能开关与配置项。
 * 站点若自己注册了 `<siteId>:settings` 标签页（见 sites/registry.ts 的约定），
 * 这里就不重复列，只画一行指引 —— 同一个开关在面板里出现两遍是最容易出不一致的做法。
 *
 * ⚠️ 站点自身**不注册标签页来做设置**时，一律把 `toggles` / `values` 声明出来就够了，
 * 由本页或站点标签页统一渲染。风险门禁只有一处实现（core/settings + widgets/settings-form）。
 */

import { clear } from '../../utils/dom.ts';
import { registeredSiteIds } from '../../core/settings.ts';
import {
  renderSiteSettings,
  siteHasSettings,
  emptyHint,
  movedHint,
} from '../widgets/settings-form.ts';
import type { TabContext, TabRegistration } from '../../../sites/types.ts';

/** 站点名映射由 main 装配时注入（settings 模块不反向依赖 registry） */
let siteNameOf: (siteId: string) => string = (id) => id;

/** 「该站点有没有自己的设置标签页」同样由 main 注入 */
let ownsSettingsTabOf: (siteId: string) => boolean = () => false;

export function setSiteNameResolver(fn: (siteId: string) => string): void {
  siteNameOf = fn;
}

export function setOwnSettingsTabResolver(fn: (siteId: string) => boolean): void {
  ownsSettingsTabOf = fn;
}

function renderTab(root: HTMLElement, ctx: TabContext): void {
  clear(root);

  const sites = registeredSiteIds().filter((id) => siteHasSettings(id));
  if (sites.length === 0) {
    root.appendChild(emptyHint('当前没有已注册的功能开关'));
    return;
  }

  let rendered = 0;
  for (const siteId of sites) {
    const name = siteNameOf(siteId);
    if (ownsSettingsTabOf(siteId)) {
      root.appendChild(movedHint(name));
      continue;
    }
    root.appendChild(renderSiteSettings(siteId, name, ctx));
    rendered += 1;
  }

  if (rendered === 0) {
    root.appendChild(emptyHint('所有站点的设置都在它们自己的标签页里'));
  }
}

export const settingsTab: TabRegistration = {
  id: 'common:settings',
  title: '设置',
  order: 10,
  mount(root, ctx) {
    renderTab(root, ctx);
  },
};

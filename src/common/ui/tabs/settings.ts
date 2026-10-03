/**
 * 公共标签页「设置」。
 *
 * 渲染所有已注册站点声明的功能开关（每功能一个复选框）与普通配置项。
 *
 * ⚠️ 站点自身**不注册标签页来做设置** —— 一律把 `toggles` / `values` 声明出来，
 * 由这里统一渲染。这样风险门禁只有一处实现，不会各写各的。
 */

import { el, clear } from '../../utils/dom.ts';
import { allToggles, valuesOf, isEnabled, setEnabled, needsConfirm, getValue, setValue } from '../../core/settings.ts';
import type { ValueDef } from '../../core/settings.ts';
import { createToggleRow } from '../widgets/checkbox.ts';
import type { TabContext, TabRegistration } from '../../../sites/types.ts';

/** 站点名映射由 main 装配时注入（settings 模块不反向依赖 registry） */
let siteNameOf: (siteId: string) => string = (id) => id;

export function setSiteNameResolver(fn: (siteId: string) => string): void {
  siteNameOf = fn;
}

function renderValue(siteId: string, def: ValueDef<unknown>): HTMLElement {
  const input = el('input', {
    class: 'sztb-input',
    attrs: { type: def.kind, placeholder: def.desc ?? '' },
  });
  input.value = String(getValue(siteId, def.id) ?? '');
  input.addEventListener('change', () => {
    setValue(siteId, def.id, input.value);
  });
  return el('div', { class: 'sztb-field' }, el('span', { text: def.label }), input);
}

function renderTab(root: HTMLElement, ctx: TabContext): void {
  clear(root);

  const toggles = allToggles();
  if (toggles.length === 0) {
    root.appendChild(el('div', { class: 'sztb-empty', text: '当前没有已注册的功能开关' }));
    return;
  }

  const bySite = new Map<string, typeof toggles>();
  for (const item of toggles) {
    const list = bySite.get(item.siteId);
    if (list === undefined) bySite.set(item.siteId, [item]);
    else list.push(item);
  }

  for (const [siteId, list] of bySite) {
    root.appendChild(el('div', { class: 'sztb-group-title', text: `${list[0]?.siteName ?? siteNameOf(siteId)}` }));

    const byGroup = new Map<string, typeof list>();
    for (const item of list) {
      const g = item.group ?? '';
      const arr = byGroup.get(g);
      if (arr === undefined) byGroup.set(g, [item]);
      else arr.push(item);
    }

    for (const [group, items] of byGroup) {
      if (group !== '') {
        root.appendChild(el('div', { class: 'sztb-group-title', text: group }));
      }
      for (const item of items) {
        root.appendChild(
          createToggleRow({
            id: `${item.siteId}-${item.id}`,
            label: item.label,
            ...(item.desc !== undefined ? { desc: item.desc } : {}),
            checked: isEnabled(item.siteId, item.id),
            risk: item.risk,
            confirm: (opts) => ctx.host.confirm(opts),
            onChange: (checked) => {
              setEnabled(item.siteId, item.id, checked);
              ctx.host.toast(
                `${item.label} 已${checked ? '开启' : '关闭'}${
                  checked && needsConfirm(item.risk) ? '（不可逆功能，请谨慎使用）' : ''
                }`,
                checked ? 'success' : 'info',
              );
            },
          }),
        );
      }
    }

    // 普通配置项（API URL / API Key 之类）
    for (const def of valuesOf(siteId)) {
      root.appendChild(renderValue(siteId, def));
    }
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

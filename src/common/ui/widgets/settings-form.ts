/**
 * 站点设置表单（**共享渲染组件**）。
 *
 * 为什么要有这个文件：设置界面有**两个入口** ——
 *   1. 公共【设置】标签页（列出所有没有自己设置标签页的站点）
 *   2. 站点自己的【设置】标签页（如 bkxk）
 * 两处必须渲染同一份数据、走同一套风险门禁。把这个渲染过程抽成组件，
 * 才能保证「门禁只有一处实现」这条铁律不被两个入口各写一遍给破坏掉。
 *
 * 本组件**只负责画**，所有取值/写值/校验都调 core/settings 的纯函数。
 */

import { el } from '../../utils/dom.ts';
import {
  togglesOf,
  valuesOf,
  isEnabled,
  setEnabled,
  needsConfirm,
  getValue,
  setValue,
  coerceInput,
  checkInput,
  formatValue,
} from '../../core/settings.ts';
import type { ValueDef } from '../../core/settings.ts';
import { createToggleRow } from './checkbox.ts';
import type { TabContext } from '../../../sites/types.ts';

/**
 * 单条配置项。
 *
 * 交互约定（已与用户确认）：
 *   - 输入框为空时显示**灰色的默认值**（placeholder）；
 *   - **失焦时若为空，就把默认值真的填进去** —— 用户看到什么，存的就是什么；
 *   - 校验**只在失焦 / 回车时**跑，不边打字边报红；
 *   - 提示渲染成输入框**下面的一行独立黄字**，不是塞在输入框里。
 */
function renderValueField(siteId: string, def: ValueDef<unknown>): HTMLElement {
  const defaultText = formatValue(def.default);

  const control =
    def.kind === 'select'
      ? el('select', { class: 'sztb-select' })
      : el('input', {
          class: 'sztb-input',
          attrs: { type: def.kind, placeholder: defaultText },
        });

  if (def.kind === 'select') {
    for (const opt of def.options ?? []) {
      control.appendChild(el('option', { text: opt.label, attrs: { value: opt.value } }));
    }
  }

  const hint = el('div', { class: 'sztb-field-hint', attrs: { hidden: true } });
  const field = el(
    'div',
    { class: 'sztb-field', data: { invalid: 'false' } },
    el('label', { class: 'sztb-field-label', text: def.label }),
    def.desc !== undefined ? el('div', { class: 'sztb-field-desc', text: def.desc }) : null,
    control,
    hint,
  );

  function showHint(message: string | null): void {
    if (message === null) {
      hint.hidden = true;
      hint.textContent = '';
      field.dataset['invalid'] = 'false';
      return;
    }
    hint.hidden = false;
    hint.textContent = message;
    field.dataset['invalid'] = 'true';
  }

  function commit(): void {
    const raw = control.value;
    const value = coerceInput(def, raw);
    setValue(siteId, def.id, value);
    // 写回控件：空串被换成默认值以后必须**显示出来**，否则用户以为没生效
    control.value = formatValue(value);
    showHint(checkInput(def, raw));
  }

  // 首次渲染：无值时留空（placeholder 就是灰色默认值），但下拉要有选中项
  const initial = formatValue(getValue(siteId, def.id));
  control.value = def.kind === 'select' && initial === '' ? defaultText : initial;

  if (def.kind === 'select') {
    (control as HTMLSelectElement).addEventListener('change', commit);
  } else {
    // 收窄成 input 再挂监听：`control` 的静态类型是联合，
    // 联合上的 addEventListener 只会退化成 `Event`，`ev.key` 拿不到。
    const input = control as HTMLInputElement;
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') commit();
    });
    // 重新开始编辑时先收掉上一次的提示，免得盯着一行过期的黄字
    input.addEventListener('input', () => showHint(null));
  }

  return field;
}

/**
 * 渲染某个站点的全部设置（功能开关 + 配置项）。
 *
 * @param siteId   站点 id
 * @param siteName 站点名。传 `null` 表示不画站名标题 —— 站点自己的标签页里不用重复
 * @param ctx      标签页上下文（只为拿 `host.confirm` / `host.toast`）
 */
export function renderSiteSettings(
  siteId: string,
  siteName: string | null,
  ctx: TabContext,
): DocumentFragment {
  const frag = document.createDocumentFragment();

  if (siteName !== null) {
    frag.appendChild(el('div', { class: 'sztb-group-title', text: siteName }));
  }

  const toggles = togglesOf(siteId);
  const values = valuesOf(siteId);

  if (toggles.length > 0) {
    frag.appendChild(el('div', { class: 'sztb-group-title', text: '功能开关' }));

    // 按 group 聚合，保持 togglesOf 已排好的顺序
    const byGroup = new Map<string, typeof toggles>();
    for (const item of toggles) {
      const g = item.group ?? '';
      const arr = byGroup.get(g);
      if (arr === undefined) byGroup.set(g, [item]);
      else arr.push(item);
    }

    for (const [group, items] of byGroup) {
      if (group !== '') {
        frag.appendChild(el('div', { class: 'sztb-group-title', text: group }));
      }
      for (const item of items) {
        frag.appendChild(
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
  }

  if (values.length > 0) {
    frag.appendChild(el('div', { class: 'sztb-group-title', text: '参数设置' }));
    for (const def of values) frag.appendChild(renderValueField(siteId, def));
  }

  return frag;
}

/** 该站点有没有任何可渲染的设置（全局设置页用它决定要不要画一行指引） */
export function siteHasSettings(siteId: string): boolean {
  return togglesOf(siteId).length > 0 || valuesOf(siteId).length > 0;
}

/** 一个站点都没有时的占位文案 */
export function emptyHint(text: string): HTMLElement {
  return el('div', { class: 'sztb-empty', text });
}

/** 「设置已移到站点自己的标签页」这行指引 */
export function movedHint(siteName: string): HTMLElement {
  return el('div', {
    class: 'sztb-empty',
    text: `${siteName} 的设置已移到它自己的【设置】标签页`,
  });
}

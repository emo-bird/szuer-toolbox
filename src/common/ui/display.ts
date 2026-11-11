import { read, write } from '../core/storage.ts';
import { el } from '../utils/dom.ts';

const preferences = [
  { key: 'theme', label: '主题', choices: [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']] },
  { key: 'font', label: '字号', choices: [['normal', '标准'], ['large', '大字']] },
  { key: 'density', label: '间距', choices: [['comfortable', '舒适'], ['compact', '紧凑']] },
  { key: 'motion', label: '动画', choices: [['system', '跟随系统'], ['reduce', '减少动画']] },
] as const;

function current(pref: typeof preferences[number]): string {
  const value = read<string>(`ui:display:${pref.key}`, '');
  return pref.choices.some(([key]) => key === value) ? value : pref.choices[0][0];
}

export function applyDisplayPreferences(host: HTMLElement): void {
  for (const pref of preferences) host.dataset[pref.key] = current(pref);
}

export function renderDisplayPreferences(root: HTMLElement): HTMLElement {
  const panel = el('div', { class: 'sztb-field' }, el('div', { class: 'sztb-group-title', text: '显示偏好' }));
  for (const pref of preferences) {
    const id = `sztb-display-${pref.key}`;
    const select = el('select', { class: 'sztb-select', attrs: { id } },
      ...pref.choices.map(([value, text]) => el('option', { text, attrs: { value } })));
    select.value = current(pref);
    select.addEventListener('change', () => {
      write(`ui:display:${pref.key}`, select.value);
      const shadow = root.getRootNode() as ShadowRoot;
      if (shadow.host) applyDisplayPreferences(shadow.host as HTMLElement);
    });
    panel.append(el('label', { class: 'sztb-field-label', text: pref.label, attrs: { for: id } }), select);
  }
  return panel;
}

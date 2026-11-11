import { read, write } from '../../../common/core/storage.ts';
import { el } from '../../../common/utils/dom.ts';
import { clearAnswerCache } from './answer-cache.ts';

export interface RunnerSettings {
  readonly budget: number;
  readonly explain: boolean;
  readonly reviewModel: string;
  readonly cache: boolean;
}

const KEY = 'uooc:ai:runner-settings';
const DEFAULTS: RunnerSettings = { budget: 0, explain: false, reviewModel: '', cache: false };

export function readRunnerSettings(): RunnerSettings {
  const raw = read<Partial<RunnerSettings>>(KEY, DEFAULTS) ?? DEFAULTS;
  return {
    budget: Number.isSafeInteger(raw.budget) && raw.budget! >= 0 && raw.budget! <= 10000 ? raw.budget! : 0,
    explain: raw.explain === true,
    reviewModel: typeof raw.reviewModel === 'string' ? raw.reviewModel.trim().slice(0, 200) : '',
    cache: raw.cache === true,
  };
}

export function mountRunnerSettings(root: HTMLElement): void {
  const settings = readRunnerSettings();
  const budget = el('input', { class: 'sztb-input', attrs: { type: 'number', min: 0, max: 10000, step: 1 } });
  budget.value = String(settings.budget);
  const model = el('input', { class: 'sztb-input', attrs: { type: 'text', maxlength: 200, placeholder: '可留空' } });
  model.value = settings.reviewModel;
  const explain = el('input', { attrs: { type: 'checkbox' } });
  explain.checked = settings.explain;
  const cache = el('input', { attrs: { type: 'checkbox' } });
  cache.checked = settings.cache;
  const status = el('p', { class: 'sztb-field-desc', attrs: { role: 'status' } });

  function save(): void {
    const limit = budget.valueAsNumber;
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > 10000) {
      status.textContent = '请输入 0 到 10000 的整数。';
      return;
    }
    try {
      write(KEY, { budget: limit, explain: explain.checked, reviewModel: model.value.trim(), cache: cache.checked });
      if (!cache.checked) clearAnswerCache();
      status.textContent = '已保存，下次启动作答时生效。';
    } catch {
      status.textContent = '保存失败，请检查脚本存储权限。';
    }
  }

  root.appendChild(el('details', { class: 'sztb-field' },
    el('summary', { text: '作答策略' }),
    el('label', { class: 'sztb-field-desc' }, '每次任务最多请求次数（0 为不限）', budget),
    el('label', { class: 'sztb-field-desc' }, '复核模型 ID（同一接口，只用于有分歧的题）', model),
    el('label', { class: 'sztb-field-desc' }, explain, ' 生成简短解题说明'),
    el('label', { class: 'sztb-field-desc' }, cache, ' 缓存一致的答案（当前页面，最多 30 分钟）'),
    el('div', { class: 'sztb-modal-foot' },
      el('button', { class: 'sztb-btn', text: '保存策略', attrs: { type: 'button' }, on: { click: save } }),
      el('button', { class: 'sztb-btn', text: '清空缓存', attrs: { type: 'button' }, on: {
        click: () => { clearAnswerCache(); status.textContent = '已清空当前页面的答案缓存。'; },
      } }),
    ),
    status,
  ));
}

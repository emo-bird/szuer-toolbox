/**
 * 纯函数冒烟（档1）：风险门禁与设置注册表。
 *
 * 这是需求文档 §8.1 红线 N1 的代码落点 —— 默认关闭必须由代码保证，
 * 不能靠作者自觉。所以这里逐条钉死。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import { clearAll } from '../../src/common/core/storage.ts';
import {
  registerToggles,
  registerValue,
  togglesOf,
  allToggles,
  isEnabled,
  setEnabled,
  hasExplicitConsent,
  needsConfirm,
  valuesOf,
  getValue,
  setValue,
  storedSettingKeys,
  coerceInput,
  checkInput,
  formatValue,
  registeredSiteIds,
  resetRegistry as resetSettings,
} from '../../src/common/core/settings.ts';
import type { ValueDef } from '../../src/common/core/settings.ts';
import type { SiteToggleDef } from '../../src/sites/types.ts';

const DEMO: SiteToggleDef[] = [
  { id: 'ro', label: '只读', risk: 'safe', default: true },
  { id: 'trace', label: '留痕', risk: 'trace', default: true },
  { id: 'irr', label: '不可逆', risk: 'irreversible', default: true },
];

function fresh(): void {
  clearAll();
  resetSettings();
  registerToggles('demo', '演示站点', DEMO);
}

describe('common/core/settings —— 风险门禁', () => {
  it('未注册的开关一律为 false', () => {
    fresh();
    assertEqual(isEnabled('demo', 'not-registered'), false);
    assertEqual(isEnabled('other-site', 'ro'), false);
  });

  it('🟢 safe 且从未设置过 → 取 default', () => {
    fresh();
    assertEqual(isEnabled('demo', 'ro'), true);
  });

  it('🟠 trace 没动过时按声明的 default 走，但显式关过就不许被顶回来（v0.24 放宽）', () => {
    fresh();
    assertEqual(isEnabled('demo', 'trace'), true, '🟠 的 default=true 从 v0.24 起真的生效');
    setEnabled('demo', 'trace', false);
    assertEqual(isEnabled('demo', 'trace'), false, '用户关过一次，default 不许把它顶回来');
  });

  it('🔴 irreversible 即使 default=true，从未设置过也是 false', () => {
    fresh();
    assertEqual(isEnabled('demo', 'irr'), false, '不可逆类默认必须关闭');
  });

  it('用户显式开启后读回 true，且能记录「显式同意」', () => {
    fresh();
    assertEqual(hasExplicitConsent('demo', 'irr'), false);
    setEnabled('demo', 'irr', true);
    assertEqual(isEnabled('demo', 'irr'), true);
    assertEqual(hasExplicitConsent('demo', 'irr'), true, '应记录用户的显式同意');
  });

  it('用户显式关闭 safe 之后不被 default 顶回去', () => {
    fresh();
    setEnabled('demo', 'ro', false);
    assertEqual(isEnabled('demo', 'ro'), false, '显式关闭必须压过 default');
  });

  it('needsConfirm 只对 irreversible 为真', () => {
    assertEqual(needsConfirm('safe'), false);
    assertEqual(needsConfirm('trace'), false);
    assertEqual(needsConfirm('irreversible'), true);
  });

  it('togglesOf / allToggles 能取回注册内容', () => {
    fresh();
    assertEqual(togglesOf('demo').length, 3);
    assertEqual(allToggles().filter((t) => t.siteId === 'demo').length, 3);
    assertEqual(togglesOf('nope').length, 0);
  });

  it('存储键带命名空间前缀，便于统一清理', () => {
    fresh();
    setEnabled('demo', 'irr', true);
    const keys = storedSettingKeys();
    assert(
      keys.some((k) => k.includes('toggle') && k.includes('demo') && k.includes('irr')),
      `键列表应含 toggle/demo/irr，实际：${keys.join(', ')}`,
    );
  });
});

describe('common/core/settings —— 普通配置项', () => {
  it('取值 / 存值 往返一致', () => {
    fresh();
    registerValue({
      siteId: 'demo',
      id: 'api-url',
      label: 'API URL',
      kind: 'url',
      default: '',
    });
    assertEqual(getValue('demo', 'api-url'), '');
    setValue('demo', 'api-url', 'https://api.example.com/v1');
    assertEqual(getValue('demo', 'api-url'), 'https://api.example.com/v1');
  });

  it('未注册的配置项返回 undefined', () => {
    fresh();
    assertEqual(valuesOf('demo').length, 0);
    assertEqual(getValue('demo', 'ghost'), undefined);
  });

  it('registerValue 同 id 覆盖而不是追加', () => {
    fresh();
    registerValue({ siteId: 'demo', id: 'k', label: 'A', kind: 'text', default: '1' });
    registerValue({ siteId: 'demo', id: 'k', label: 'B', kind: 'text', default: '2' });
    assertEqual(valuesOf('demo').length, 1);
    assertEqual(valuesOf('demo')[0]?.label, 'B');
  });
});

/**
 * 输入框的「取值 / 校验 / 回显」三个纯函数。
 *
 * 背景（用户反馈驱动的需求）：输入框为空时显示灰色默认值，**失焦为空就把默认值真的填进去**。
 * 这三条就是那条需求的实现点，回归代价很低但踩过坑（`Number('') === 0` 会把请求间隔
 * 静默变成 0），所以逐条钉住。
 */
describe('common/core/settings —— 输入规范化 coerceInput', () => {
  const text: ValueDef<unknown> = { siteId: 'demo', id: 't', label: 'T', kind: 'text', default: '缺省' };
  const num: ValueDef<unknown> = { siteId: 'demo', id: 'n', label: 'N', kind: 'number', default: '500' };

  it('去掉首尾空白', () => {
    assertEqual(coerceInput(text, '  hi  '), 'hi');
  });

  it('空串回落默认值（这就是「失焦自动填默认值」）', () => {
    assertEqual(coerceInput(text, ''), '缺省');
    assertEqual(coerceInput(text, '   '), '缺省');
    assertEqual(coerceInput(num, ''), '500');
  });

  it('数字框保持用户写的原文，不转成 number', () => {
    // 存储层统一按字符串存；kind 只描述用哪个控件渲染。
    // 断言类型是有意为之：数字离开输入框就该由各站点自己 clamp。
    assertEqual(coerceInput(num, ' 200 '), '200');
    assertEqual(coerceInput(num, '200.5'), '200.5');
  });

  it('数字框写不进数字时回落默认值（而不是变成 0）', () => {
    assertEqual(coerceInput(num, 'abc'), '500');
  });

  it('文本框里的纯数字仍是字符串', () => {
    assertEqual(coerceInput(text, '42'), '42');
  });
});

describe('common/core/settings —— 校验 checkInput', () => {
  const opts: ValueDef<unknown> = {
    siteId: 'demo',
    id: 's',
    label: 'S',
    kind: 'select',
    default: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  };

  it('下拉取值在选项内时通过', () => {
    assertEqual(checkInput(opts, 'b'), null);
  });

  it('下拉取值不在选项内时报错并列出可选值', () => {
    const msg = checkInput(opts, 'zzz');
    assert(msg !== null, '非法取值必须报错');
    assert(msg.includes('A') && msg.includes('B'), `提示里应列出可选值，实际：${msg}`);
  });

  it('没有 validate 钩子时一律通过', () => {
    assertEqual(checkInput({ siteId: 'demo', id: 'x', label: 'X', kind: 'text', default: '' }, '任意'), null);
  });

  it('validate 钩子拿到的是规范化后的值', () => {
    const def: ValueDef<unknown> = {
      siteId: 'demo',
      id: 'v',
      label: 'V',
      kind: 'number',
      default: '500',
      validate: (raw) => (String(raw) === '200' ? null : `看到的是 ${String(raw)}`),
    };
    assertEqual(checkInput(def, ' 200 '), null);
    assertEqual(checkInput(def, '300'), '看到的是 300');
    // 空串先被规范化成默认值，钩子看到的是 500 而不是空串
    assertEqual(checkInput(def, ''), '看到的是 500');
  });
});

describe('common/core/settings —— 回显 formatValue', () => {
  it('null / undefined 回显为空串', () => {
    assertEqual(formatValue(null), '');
    assertEqual(formatValue(undefined), '');
  });

  it('其余转字符串', () => {
    assertEqual(formatValue('x'), 'x');
    assertEqual(formatValue(0), '0');
  });
});

describe('common/core/settings —— 站点清单 registeredSiteIds', () => {
  it('开关站点与只有配置项的站点都会被列出', () => {
    fresh();
    registerValue({ siteId: 'only-values', id: 'k', label: 'K', kind: 'text', default: '' });
    const ids = registeredSiteIds();
    assert(ids.includes('demo'), `应含 demo，实际：${ids.join(', ')}`);
    assert(ids.includes('only-values'), `应含 only-values，实际：${ids.join(', ')}`);
  });

  it('未注册的站点不出现', () => {
    fresh();
    assert(!registeredSiteIds().includes('ghost'), 'ghost 不该出现');
  });
});

describe('common/core/settings —— apply 钩子', () => {
  it('setValue 会调用 apply，用户不用刷新就生效', () => {
    fresh();
    const seen: string[] = [];
    registerValue({
      siteId: 'demo',
      id: 'live',
      label: 'L',
      kind: 'number',
      default: '500',
      apply: (v) => seen.push(String(v)),
    });
    setValue('demo', 'live', '700');
    assertEqual(seen.join('|'), '700');
    assertEqual(getValue('demo', 'live'), '700', '值本身也必须写进去');
  });

  it('apply 抛错不影响值被写入', () => {
    fresh();
    registerValue({
      siteId: 'demo',
      id: 'boom',
      label: 'B',
      kind: 'text',
      default: '',
      apply: () => {
        throw new Error('故意炸');
      },
    });
    setValue('demo', 'boom', 'v');
    assertEqual(getValue('demo', 'boom'), 'v');
  });
});

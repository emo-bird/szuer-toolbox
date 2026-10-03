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
  resetRegistry as resetSettings,
} from '../../src/common/core/settings.ts';
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

  it('🟠 trace / 🔴 irreversible 即使 default=true，从未设置过也是 false', () => {
    fresh();
    assertEqual(isEnabled('demo', 'trace'), false, '留痕类默认必须关闭');
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

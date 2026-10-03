/**
 * 标签页分组排序（用户需求：**站点自己的标签页在前，公共标签页在后**，
 * 两组之间一条分割线）。
 *
 * 为什么要单独钉住：光靠 `tab.order` 排不出这个结果 ——
 * 公共标签页的 order 是 10 / 90 / 92 / 95，bkxk 的设置页是 200、demo 是 100，
 * 单看 order 公共页反而**全都排在站点页前面**，与需求正好相反。
 * 所以分组权重必须优先于 order，这条断言就是防止有人把 group 那一段删掉。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import { sortTabEntries } from '../../src/common/ui/tabs.ts';
import type { TabEntry } from '../../src/common/ui/tabs.ts';
import type { TabRegistration } from '../../src/sites/types.ts';

function entry(siteId: string, id: string, group: 'site' | 'common', order?: number): TabEntry {
  const tab: TabRegistration = {
    id,
    title: id,
    ...(order !== undefined ? { order } : {}),
    mount: () => undefined,
  };
  return { siteId, group, tab };
}

/** 真实 order 值：公共 10/90/92/95，站点 100/200 —— 故意让公共的 order 更小 */
const common = [
  entry('common', 'common:settings', 'common', 10),
  entry('common', 'common:log', 'common', 90),
  entry('common', 'common:login', 'common', 92),
  entry('common', 'common:status', 'common', 95),
];
const site = [
  entry('bkxk', 'bkxk:task', 'site', 100),
  entry('bkxk', 'bkxk:settings', 'site', 200),
];

describe('标签页分组排序', () => {
  it('站点标签页全部排在公共标签页之前（即使公共的 order 更小）', () => {
    const ids = sortTabEntries([...common, ...site]).map((e) => e.tab.id);
    assertEqual(ids.join(','), 'bkxk:task,bkxk:settings,common:settings,common:log,common:login,common:status');
  });

  it('乱序输入也能得到同样结果', () => {
    const shuffled = [common[3]!, site[1]!, common[0]!, site[0]!, common[2]!, common[1]!];
    const ids = sortTabEntries(shuffled).map((e) => e.tab.id);
    assertEqual(ids.join(','), 'bkxk:task,bkxk:settings,common:settings,common:log,common:login,common:status');
  });

  it('组内按 order 升序', () => {
    const ids = sortTabEntries([...site, ...common]).map((e) => e.tab.id);
    assert(!ids.includes('bkxk:settings,bkxk:task'), '站点组内 order 200 不应排在 100 前面');
    assertEqual(ids.slice(2).join(','), 'common:settings,common:log,common:login,common:status');
  });

  it('order 缺省时按 1000 处理（排在显式 order 之后，不抛错）', () => {
    const ids = sortTabEntries([
      entry('bkxk', 'bkxk:noorder', 'site'),
      entry('bkxk', 'bkxk:order100', 'site', 100),
    ]).map((e) => e.tab.id);
    assertEqual(ids.join(','), 'bkxk:order100,bkxk:noorder');
  });

  it('没有站点标签页时只剩公共组（此时不应产生分割线）', () => {
    const sorted = sortTabEntries(common);
    assertEqual(sorted.length, 4);
    assert(
      sorted.every((e) => e.group === 'common'),
      '没有站点标签页时不应混进 site 组',
    );
  });

  it('不修改入参（排序在副本上进行）', () => {
    const input = [...common, ...site];
    const before = input.map((e) => e.tab.id).join(',');
    sortTabEntries(input);
    assertEqual(input.map((e) => e.tab.id).join(','), before, 'sortTabEntries 不应改动原数组');
  });

  it('只有一个分组时不因组边界判定而崩溃', () => {
    assertEqual(sortTabEntries([]).length, 0);
    assertEqual(sortTabEntries(site).map((e) => e.tab.id).join(','), 'bkxk:task,bkxk:settings');
  });
});

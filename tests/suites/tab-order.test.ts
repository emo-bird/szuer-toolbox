/**
 * 纯函数冒烟（档1）：标签栏的分组与排序。
 *
 * 背景：此前顺序**全局**按 `TabRegistration.order` 一个数字排，
 * 「公共占用 0–99、站点从 100 起」只是注释里的一句约定。
 * 用户拍板要「站点标签页在前、公共在后 + 中间一条分隔线」，
 * 于是把规则钉进 `common/ui/tab-order.ts` 并在这里锁住三条不变量：
 *   1. 站点组永远在公共组之前 —— **与 order 的具体数值无关**；
 *   2. order 只在组内生效；
 *   3. 分隔线只在「两组都非空」时出现，且恰好一条。
 *
 * `TabView` 自己碰 `document`、测不了（渲染正确性走档3 手测清单），
 * 所以判定逻辑必须留在这类纯函数里。
 */

import { describe, it, assertEqual, assertDeepEqual } from '../harness.ts';
import { planTabOrder, COMMON_SITE_ID, DEFAULT_ORDER } from '../../src/common/ui/tab-order.ts';
import type { TabOrderInput } from '../../src/common/ui/tab-order.ts';
import type { TabRegistration } from '../../src/sites/types.ts';

/** 造一个只带 id / title / order 的标签页声明，mount 不需要真的挂东西 */
function tab(id: string, order?: number): TabRegistration {
  return { id, title: id, ...(order !== undefined ? { order } : {}), mount: () => undefined };
}

function common(id: string, order?: number): TabOrderInput {
  return { siteId: COMMON_SITE_ID, tab: tab(id, order) };
}

function site(siteId: string, id: string, order?: number): TabOrderInput {
  return { siteId, tab: tab(id, order) };
}

/** 把结果压成 `id` 序列，便于断言顺序 */
function ids(entries: readonly TabOrderInput[]): string[] {
  return planTabOrder(entries).map((p) => p.entry.tab.id);
}

/** 分隔线落在哪些下标上 */
function dividerIndexes(entries: readonly TabOrderInput[]): number[] {
  const out: number[] = [];
  planTabOrder(entries).forEach((p, i) => {
    if (p.dividerBefore) out.push(i);
  });
  return out;
}

describe('common/ui/tab-order —— 分组与排序', () => {
  it('站点组在前、公共组在后（这是本次需求的核心）', () => {
    assertDeepEqual(ids([common('settings', 10), site('bkxk', 'bkxk:settings', 200)]), [
      'bkxk:settings',
      'settings',
    ]);
  });

  it('站点的 order 再大也排不进公共组之前的位置 —— 组间先后与 order 数值无关', () => {
    // 站点标签页 order=999，公共 order=10：旧的全局排序会把公共排在前面
    assertDeepEqual(ids([common('settings', 10), site('bkxk', 'bkxk:tasks', 999)]), [
      'bkxk:tasks',
      'settings',
    ]);
  });

  it('order 只在组内生效（组内升序）', () => {
    assertDeepEqual(
      ids([
        common('status', 95),
        site('bkxk', 'bkxk:settings', 200),
        common('settings', 10),
        site('bkxk', 'bkxk:tasks', 100),
      ]),
      ['bkxk:tasks', 'bkxk:settings', 'settings', 'status'],
    );
  });

  it('组内 order 相同时保持注册顺序（Array#sort 稳定，这一条被显式钉住）', () => {
    assertDeepEqual(
      ids([site('bkxk', 'a', 100), site('bkxk', 'b', 100), site('bkxk', 'c', 100)]),
      ['a', 'b', 'c'],
    );
  });

  it('缺省 order 视作 1000，排在组内最后', () => {
    assertDeepEqual(ids([site('bkxk', 'no-order'), site('bkxk', 'early', 5)]), ['early', 'no-order']);
    assertEqual(DEFAULT_ORDER, 1000, '缺省权重沿用旧约定');
  });

  it('两组都非空时，恰好一条分隔线，且落在第一个公共标签页之前', () => {
    const entries = [
      common('log', 90),
      site('bkxk', 'bkxk:settings', 200),
      common('settings', 10),
    ];
    assertDeepEqual(dividerIndexes(entries), [1], '应在 index 1（公共组第一个）之前插线');
    // 顺序此时是 [bkxk:settings, settings, log]，分隔线之后紧跟着 settings
    assertDeepEqual(ids(entries), ['bkxk:settings', 'settings', 'log']);
  });

  it('只有公共标签页时**不插**分隔线 —— 否则非支持站点开头会多一条孤零零的竖线', () => {
    // 这正是 UOOC 现状：只有空壳适配器、零个站点标签页
    assertDeepEqual(dividerIndexes([common('settings', 10), common('log', 90)]), []);
    assertDeepEqual(ids([common('settings', 10), common('log', 90)]), ['settings', 'log']);
  });

  it('只有站点标签页时也不插分隔线', () => {
    assertDeepEqual(dividerIndexes([site('bkxk', 'bkxk:settings', 200)]), []);
  });

  it('空输入返回空数组（不抛错）', () => {
    assertDeepEqual(ids([]), []);
    assertDeepEqual(dividerIndexes([]), []);
  });

  it('不修改传入的数组（纯函数）', () => {
    const entries = [common('log', 90), site('bkxk', 'bkxk:settings', 200)];
    const snapshot = entries.map((e) => e.tab.id);
    planTabOrder(entries);
    assertDeepEqual(
      entries.map((e) => e.tab.id),
      snapshot,
      'planTabOrder 不许就地排序入参',
    );
  });

  it('多个站点的标签页同组处理（站内顺序仍由 order 决定）', () => {
    assertDeepEqual(
      ids([site('uooc', 'uooc:settings', 300), site('bkxk', 'bkxk:settings', 200), common('log', 90)]),
      ['bkxk:settings', 'uooc:settings', 'log'],
    );
  });
});

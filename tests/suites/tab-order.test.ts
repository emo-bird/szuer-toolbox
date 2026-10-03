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

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  planTabOrder,
  activeTabKey,
  resolveActiveTab,
  COMMON_SITE_ID,
  DEFAULT_ORDER,
} from '../../src/common/ui/tab-order.ts';
import type { TabOrderInput } from '../../src/common/ui/tab-order.ts';
import type { TabRegistration } from '../../src/sites/types.ts';

/** 造一个只带 id / title / order 的标签页声明，mount 不需要真的挂东西 */
function tab(id: string, order?: number): TabRegistration {
  return { id, title: id, ...(order !== undefined ? { order } : {}), mount: () => undefined };
}

/** 公共标签页。id 按真实约定带 `common:` 前缀（见 `common/ui/tabs/*.ts` 的注册） */
function common(name: string, order?: number): TabOrderInput {
  return { siteId: COMMON_SITE_ID, tab: tab(`common:${name}`, order) };
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
      'common:settings',
    ]);
  });

  it('站点的 order 再大也排不进公共组之前的位置 —— 组间先后与 order 数值无关', () => {
    // 站点标签页 order=999，公共 order=10：旧的全局排序会把公共排在前面
    assertDeepEqual(ids([common('settings', 10), site('bkxk', 'bkxk:tasks', 999)]), [
      'bkxk:tasks',
      'common:settings',
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
      ['bkxk:tasks', 'bkxk:settings', 'common:settings', 'common:status'],
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
    // 顺序此时是 [bkxk:settings, common:settings, common:log]，分隔线之后紧跟着 common:settings
    assertDeepEqual(ids(entries), ['bkxk:settings', 'common:settings', 'common:log']);
  });

  it('只有公共标签页时**不插**分隔线 —— 否则非支持站点开头会多一条孤零零的竖线', () => {
    // 这正是 UOOC 现状：只有空壳适配器、零个站点标签页
    assertDeepEqual(dividerIndexes([common('settings', 10), common('log', 90)]), []);
    assertDeepEqual(ids([common('settings', 10), common('log', 90)]), [
      'common:settings',
      'common:log',
    ]);
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
      ['bkxk:settings', 'uooc:settings', 'common:log'],
    );
  });
});

/** 用一张普通表冒充 storage：没写过的键读出来是 null */
function store(record: Record<string, string>): (key: string) => string | null {
  return (key) => record[key] ?? null;
}

/** 一个 bkxk 页面：一个站点标签页 + 公共标签页 */
function bkxkPage(): TabOrderInput[] {
  return [common('settings', 10), site('bkxk', 'bkxk:settings', 200), common('log', 90)];
}

describe('common/ui/tab-order —— 记忆键与恢复优先级', () => {
  it('记忆键按站点分键，且共用 storage 的 sztb: 命名空间前缀', () => {
    // storage.write 会自己加 sztb: 前缀，这里只给不带前缀的键
    assertEqual(activeTabKey('bkxk'), 'ui:active-tab:bkxk');
    assertEqual(activeTabKey('uooc'), 'ui:active-tab:uooc');
  });

  it('两个站点的键互不相同 —— 这正是「按站点分键」要防的覆写', () => {
    assert(activeTabKey('bkxk') !== activeTabKey('uooc'), 'bkxk 与 uooc 的记忆必须是两个键');
  });

  it('站点 id 里不含冒号（键结构不会被撑破），也没有空白', () => {
    for (const id of ['bkxk', 'uooc', 'demo']) {
      assert(!id.includes(':'), `${id} 不应含冒号`);
      assert(!/\s/.test(id), `${id} 不应含空白`);
    }
  });

  it('站点键命中 ⇒ 恢复那个站点标签页（用户拍板：站点组优先）', () => {
    assertEqual(
      resolveActiveTab(bkxkPage(), store({ 'ui:active-tab:bkxk': 'bkxk:settings' })),
      'bkxk:settings',
    );
  });

  it('两个键都有值时仍以站点键为准 —— 这就是「站点组优先」的全部含义', () => {
    assertEqual(
      resolveActiveTab(
        bkxkPage(),
        store({ 'ui:active-tab:bkxk': 'bkxk:settings', 'ui:active-tab:common': 'common:log' }),
      ),
      'bkxk:settings',
    );
  });

  it('站点键没值（没存过）⇒ 退到公共键', () => {
    assertEqual(
      resolveActiveTab(bkxkPage(), store({ 'ui:active-tab:common': 'common:log' })),
      'common:log',
    );
  });

  it('站点键的值已不在当前标签集里（失效）⇒ 退到公共键', () => {
    assertEqual(
      resolveActiveTab(
        bkxkPage(),
        store({ 'ui:active-tab:bkxk': 'bkxk:tasks', 'ui:active-tab:common': 'common:log' }),
      ),
      'common:log',
      'bkxk:tasks 将来被删掉后，不该因为一条失效记忆就卡在回退值上',
    );
  });

  it('两个键都失效 / 都没存过 ⇒ null（调用方回退第一个标签页，且**不写盘**）', () => {
    assertEqual(resolveActiveTab(bkxkPage(), store({})), null, '从没存过');
    assertEqual(
      resolveActiveTab(
        bkxkPage(),
        store({ 'ui:active-tab:bkxk': 'bkxk:gone', 'ui:active-tab:common': 'common:gone' }),
      ),
      null,
      '两个键都失效',
    );
  });

  it('纯公共页面（UOOC 现状：零个站点标签页）⇒ 只可能读到公共键', () => {
    const uoocPage = [common('settings', 10), common('log', 90)];
    assertEqual(
      resolveActiveTab(uoocPage, store({ 'ui:active-tab:common': 'common:log' })),
      'common:log',
    );
    assertEqual(
      resolveActiveTab(uoocPage, store({ 'ui:active-tab:uooc': 'uooc:settings' })),
      null,
      'uooc 键里的 id 不在本页标签集里，不能采用',
    );
  });

  it('查询顺序：先站点键、后公共键（公共键只在站点组全军覆没后才读）', () => {
    const seen: string[] = [];
    const spy = (key: string): string | null => {
      seen.push(key);
      return null;
    };
    resolveActiveTab(bkxkPage(), spy);
    assertDeepEqual(seen, ['ui:active-tab:bkxk', 'ui:active-tab:common']);
  });

  it('多个站点组时按 planTabOrder 的先后查（bkxk 在 uooc 之前）', () => {
    const twoSites = [site('uooc', 'uooc:settings', 300), site('bkxk', 'bkxk:settings', 200)];
    assertEqual(
      resolveActiveTab(
        twoSites,
        store({ 'ui:active-tab:uooc': 'uooc:settings', 'ui:active-tab:bkxk': 'bkxk:settings' }),
      ),
      'bkxk:settings',
    );
  });

  it('空标签集 ⇒ null（不抛错）', () => {
    assertEqual(resolveActiveTab([], store({ 'ui:active-tab:common': 'common:settings' })), null);
  });
});

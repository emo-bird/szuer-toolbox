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
 * `TabView` 自己碰 `document`、测不了（渲染正确性走真机手测），
 * 所以判定逻辑必须留在这类纯函数里。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  planTabOrder,
  activeTabKey,
  pageScopeOf,
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
    // 对应「未命中适配器的 szu.edu.cn 页面」这类场景：只有公共标签页，没有站点标签页
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

/** 一个纯公共页面（命中 szu.edu.cn 根域白名单但没命中适配器 → 零个站点标签页） */
function commonOnlyPage(): TabOrderInput[] {
  return [common('settings', 10), common('log', 90)];
}

describe('common/ui/tab-order —— 记忆键与恢复', () => {
  it('记忆键按页面分键，且不带 storage 的 sztb: 前缀（由 storage 自己加）', () => {
    assertEqual(activeTabKey('bkxk'), 'ui:active-tab:bkxk');
    assertEqual(activeTabKey('uooc'), 'ui:active-tab:uooc');
  });

  it('两个页面的键互不相同 —— 这正是「按页面分键」要防的互相覆写', () => {
    assert(activeTabKey('bkxk') !== activeTabKey('uooc'), 'bkxk 页与 uooc 页的记忆必须是两个键');
  });

  it('页面 scope：有站点标签页就取第一个站点组；纯公共页面取 common', () => {
    assertEqual(pageScopeOf(bkxkPage()), 'bkxk');
    assertEqual(pageScopeOf(commonOnlyPage()), COMMON_SITE_ID);
    assertEqual(pageScopeOf([]), COMMON_SITE_ID, '空标签集也不抛错');
  });

  it('同页面存在多个站点组时取 planTabOrder 里靠前的那个（确定性，不随注册顺序抖）', () => {
    const twoSites = [site('uooc', 'uooc:settings', 300), site('bkxk', 'bkxk:settings', 200)];
    assertEqual(pageScopeOf(twoSites), 'bkxk', 'order=200 的 bkxk 排在 order=300 的 uooc 之前');
  });

  it('站点 id 里不含冒号（键结构不会被撑破），也没有空白', () => {
    for (const id of ['bkxk', 'uooc']) {
      assert(!id.includes(':'), `${id} 不应含冒号`);
      assert(!/\s/.test(id), `${id} 不应含空白`);
    }
  });

  it('恢复站点标签页：本页键里存着 bkxk:settings', () => {
    assertEqual(
      resolveActiveTab(bkxkPage(), store({ 'ui:active-tab:bkxk': 'bkxk:settings' })),
      'bkxk:settings',
    );
  });

  it('恢复公共标签页：本页键里存着 common:log ⇒ 就回到【日志】（用户 m00593 的核心诉求）', () => {
    // 旧口径（按标签页所属站点分键 + 站点组优先）在这里当场翻车：
    // 公共标签页的值被写进另一个键，站点组那份旧值每次刷新都把用户抢回去。
    assertEqual(
      resolveActiveTab(bkxkPage(), store({ 'ui:active-tab:bkxk': 'common:log' })),
      'common:log',
      '在本科选课页面停在【日志】，刷新后必须还在【日志】',
    );
  });

  it('一次只读本页面的那一个键（多读就说明分键口径又错了）', () => {
    const seen: string[] = [];
    const spy = (key: string): string | null => {
      seen.push(key);
      return null;
    };
    resolveActiveTab(bkxkPage(), spy);
    assertDeepEqual(seen, ['ui:active-tab:bkxk']);
  });

  it('别的页面的键不参与本页面 —— 公共键里就算有值也不读', () => {
    assertEqual(
      resolveActiveTab(
        bkxkPage(),
        store({ 'ui:active-tab:bkxk': 'bkxk:settings', 'ui:active-tab:common': 'common:log' }),
      ),
      'bkxk:settings',
      '两个键都有值时，本页面的键说了算',
    );
  });

  it('值已不在本页标签集里（失效）⇒ null，调用方回退第一个标签页且**不写盘**', () => {
    assertEqual(
      resolveActiveTab(bkxkPage(), store({ 'ui:active-tab:bkxk': 'bkxk:tasks' })),
      null,
      'bkxk:tasks 将来被删掉后，不该因为一条失效记忆就卡在回退值上',
    );
  });

  it('纯公共页面（零个站点标签页）⇒ 只读公共键', () => {
    assertEqual(
      resolveActiveTab(commonOnlyPage(), store({ 'ui:active-tab:common': 'common:log' })),
      'common:log',
    );
    assertEqual(
      resolveActiveTab(commonOnlyPage(), store({ 'ui:active-tab:uooc': 'uooc:settings' })),
      null,
      'uooc 键不属于这个页面，不能采用',
    );
  });

  it('没存过 / 空标签集 ⇒ null（不抛错）', () => {
    assertEqual(resolveActiveTab(bkxkPage(), store({})), null, '从没存过');
    assertEqual(resolveActiveTab([], store({ 'ui:active-tab:common': 'common:settings' })), null);
  });
});

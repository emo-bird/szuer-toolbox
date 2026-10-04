/**
 * 纯函数冒烟（档1）：余量监控的判定规则与轮询引擎的门禁。
 *
 * 为什么不测轮询流程本身：它会真发请求（`capacity.do` / 列表接口），
 * 且**风险接口不做自动化测试**（风控类、会留痕）。所以：
 *   · 判定与落盘形状在 `monitor-model.ts` 里测；
 *   · 引擎只测**不发请求**的路径（空列表拒绝开始、停止、`grabNow` 的门禁、
 *     空列表跑一轮）；
 *   · 真实轮询与自动抢由用户手测（档3）。
 *
 * 最值得钉的：
 *   1. `remain === null`（查不到）**不是命中**，也不能当 0 —— 把 null 当 0 会让
 *      界面显示「无余量」，把 null 当命中会刷屏误报。
 *   2. 类别模式下**缺类别的项必须跳过**，不能瞎猜一个类别（会查到别的课的余量）。
 *   3. 「按类别查询未找到该教学班」与「这一类压根没查成」是两件事，不能混。
 *   4. 落盘的 9 个字段名不能漂 —— 批 1 的迁移把旧数据原样写进这个键。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import { clearAll, write } from '../../src/common/core/storage.ts';
import {
  registerToggles,
  resetRegistry as resetSettings,
  setEnabled,
} from '../../src/common/core/settings.ts';
import { BKXK_STORE_KEY } from '../../src/sites/bkxk/legacy.ts';
import { BKXK_TOGGLES, SITE_ID, TOGGLE } from '../../src/sites/bkxk/settings.ts';
import type { MonitorItem, MonitorStore } from '../../src/sites/bkxk/list-model.ts';
import {
  MAX_PAGES,
  MONITOR_MODE,
  PAGE_SIZE,
  addHitCount,
  applyCheck,
  byId,
  checkedAgoText,
  clearMonitor,
  groupByCategory,
  hitSummaryText,
  hitsOf,
  monitorModeLabel,
  normalizeMonitorMode,
  normalizeMonitorStore,
  patchMonitor,
  remainKey,
  remainText,
  removeMonitorItem,
  resetMonitorStats,
  slimMonitor,
  summaryText,
} from '../../src/sites/bkxk/monitor-model.ts';
import {
  __resetMonitorRuntime,
  bindMonitorPanel,
  grabNow,
  isPolling,
  loadMonitorStore,
  pollOnce,
  pollStats,
  startPolling,
  stopPolling,
  subscribeMonitor,
  updateMonitor,
} from '../../src/sites/bkxk/monitor.ts';
import type { PanelApi } from '../../src/sites/types.ts';

// ------------------------------------------------------------- 夹具

function mon(over: Partial<MonitorItem> = {}): MonitorItem {
  return {
    teachingClassID: '202620271520189001039',
    courseName: '高等数学',
    teacherName: '张三',
    teachingPlace: '5-18周星期一3-5节汇德楼A508',
    category: 'FANKC',
    remain: null,
    checkedAt: null,
    hits: 0,
    lastMsg: '',
    ...over,
  };
}

function store(...items: readonly MonitorItem[]): MonitorStore {
  return { items, hitCount: 0 };
}

function fakePanel(): { panel: PanelApi; toasts: string[] } {
  const toasts: string[] = [];
  const panel = {
    collapse: () => undefined,
    expand: () => undefined,
    isCollapsed: () => false,
    toast: (msg: string) => {
      toasts.push(msg);
    },
    confirm: () => Promise.resolve(false),
    activateTab: () => undefined,
  } as unknown as PanelApi;
  return { panel, toasts };
}

function bootSettings(): void {
  resetSettings();
  registerToggles(SITE_ID, '本科选课', BKXK_TOGGLES);
}

// ------------------------------------------------------------- 模式

describe('bkxk 监控 —— 模式', () => {
  it('字面值与旧仓库一致，不认识的一律回落 category', () => {
    assertEqual(MONITOR_MODE.SINGLE, 'single');
    assertEqual(MONITOR_MODE.CATEGORY, 'category');
    assertEqual(normalizeMonitorMode('single'), MONITOR_MODE.SINGLE);
    assertEqual(normalizeMonitorMode('category'), MONITOR_MODE.CATEGORY);
    assertEqual(normalizeMonitorMode(''), MONITOR_MODE.CATEGORY);
    assertEqual(normalizeMonitorMode(undefined), MONITOR_MODE.CATEGORY);
    assertEqual(normalizeMonitorMode('SINGLE'), MONITOR_MODE.CATEGORY);
  });

  it('分页预算沿用旧仓库的 4 页 × 50 条', () => {
    assertEqual(MAX_PAGES, 4);
    assertEqual(PAGE_SIZE, 50);
  });

  it('模式文案说清代价（请求少 / 请求多）', () => {
    assert(monitorModeLabel('category').includes('请求少'), '类别模式应当说明请求少');
    assert(monitorModeLabel('single').includes('请求多'), '单独模式应当说明请求多');
  });
});

// ------------------------------------------------------------- 分组

describe('bkxk 监控 —— 类别分组', () => {
  it('缺类别的项被跳过并如实计数（不瞎猜类别）', () => {
    const { groups, skipped } = groupByCategory([
      mon({ teachingClassID: 'a', category: 'FANKC' }),
      mon({ teachingClassID: 'b', category: '' }),
      mon({ teachingClassID: 'c', category: 'XGXK' }),
      mon({ teachingClassID: 'd', category: 'FANKC' }),
    ]);
    assertEqual(skipped, 1);
    assertEqual(groups.length, 2);
    const fankc = groups.find((g) => g.category === 'FANKC');
    assertEqual(fankc?.items.length, 2);
    assertEqual(groups.find((g) => g.category === 'XGXK')?.items.length, 1);
  });

  it('全都没有类别 → 没有分组（调用方据此报「无法按类别查询」）', () => {
    const { groups, skipped } = groupByCategory([mon({ category: '' }), mon({ category: '' })]);
    assertEqual(groups.length, 0);
    assertEqual(skipped, 2);
  });

  it('空列表安全', () => {
    assertEqual(groupByCategory([]).groups.length, 0);
    assertEqual(groupByCategory([]).skipped, 0);
  });
});

// ------------------------------------------------------------- 命中判定

describe('bkxk 监控 —— 命中判定', () => {
  it('null（查不到）与 0（没余量）都不算命中', () => {
    const rows = [
      { teachingClassID: 'a', remain: null, kind: 'notfound' },
      { teachingClassID: 'b', remain: 0, kind: 'ok' },
      { teachingClassID: 'c', remain: -1, kind: 'ok' },
      { teachingClassID: 'd', remain: 1, kind: 'ok' },
    ];
    assertDeepEqual(
      hitsOf(rows).map((r) => r.teachingClassID),
      ['d'],
    );
  });

  it('余量文案绝不把「未知」写成 0', () => {
    assertEqual(remainText(null), '未知');
    assertEqual(remainText(0), '无余量');
    assertEqual(remainText(3), '余 3');
    assertEqual(remainKey(null), 'unknown');
    assertEqual(remainKey(0), 'none');
    assertEqual(remainKey(5), 'has');
  });

  it('applyCheck：命中才加计数，checkedAt 每次都更新', () => {
    const s1 = store(mon({ teachingClassID: 'a' }));

    const miss = applyCheck(s1, 'a', 0, 111);
    assertEqual(miss.hit, false);
    assertEqual(miss.store.items[0]?.hits, 0);
    assertEqual(miss.store.items[0]?.checkedAt, 111);
    assertEqual(miss.store.items[0]?.remain, 0);

    const unknown = applyCheck(s1, 'a', null, 222);
    assertEqual(unknown.hit, false);
    assertEqual(unknown.store.items[0]?.remain, null);
    assertEqual(unknown.store.items[0]?.checkedAt, 222, '查不到也要更新检查时间');

    const hit = applyCheck(s1, 'a', 2, 333);
    assertEqual(hit.hit, true);
    assertEqual(hit.store.items[0]?.hits, 1);
    assertEqual(hit.store.items[0]?.remain, 2);
  });

  it('applyCheck：id 不存在时原样返回同一个引用', () => {
    const s1 = store(mon({ teachingClassID: 'a' }));
    const r = applyCheck(s1, 'zzz', 1, 1);
    assertEqual(r.store, s1);
    assertEqual(r.hit, false);
  });

  it('applyCheck：只在传了 lastMsg 时才写它', () => {
    const s1 = store(mon({ teachingClassID: 'a', lastMsg: '上一次的失败' }));
    assertEqual(applyCheck(s1, 'a', 1, 1).store.items[0]?.lastMsg, '上一次的失败');
    assertEqual(applyCheck(s1, 'a', 1, 1, '新的').store.items[0]?.lastMsg, '新的');
  });

  it('addHitCount 只在命中时累加，0 不产生新引用', () => {
    const s1 = store(mon());
    assertEqual(addHitCount(s1, 0), s1);
    assertEqual(addHitCount(s1, 3).hitCount, 3);
    assertEqual(addHitCount({ ...s1, hitCount: 3 }, 2).hitCount, 5);
  });
});

// ------------------------------------------------------------- 落盘形状

describe('bkxk 监控 —— 落盘形状', () => {
  it('恰好 9 个字段，名字与旧仓库一致', () => {
    const slim = slimMonitor(store(mon()));
    assertDeepEqual(
      Object.keys(slim.items[0] ?? {}).sort(),
      [
        'category',
        'checkedAt',
        'courseName',
        'hits',
        'lastMsg',
        'remain',
        'teacherName',
        'teachingClassID',
        'teachingPlace',
      ],
    );
    assertDeepEqual(Object.keys(slim).sort(), ['hitCount', 'items']);
  });

  it('normalizeMonitorStore：非法 remain → null，负数计数 → 0', () => {
    const got = normalizeMonitorStore({
      hitCount: -5,
      items: [
        { ...mon(), remain: '不是数字' },
        { ...mon({ teachingClassID: 'b' }), remain: Number.NaN, hits: -2.7 },
        { ...mon({ teachingClassID: 'c' }), remain: 3.9, hits: 2.7 },
      ],
    });
    assertEqual(got.hitCount, 0);
    assertEqual(got.items.length, 3);
    assertEqual(got.items[0]?.remain, null);
    assertEqual(got.items[1]?.remain, null);
    assertEqual(got.items[1]?.hits, 0);
    assertEqual(got.items[2]?.remain, 3.9, '合法的余量值不该被动');
    assertEqual(got.items[2]?.hits, 2);
  });

  it('坏数据不炸：非对象 / 非数组 / 缺 tcId', () => {
    assertDeepEqual(normalizeMonitorStore(null), { items: [], hitCount: 0 });
    assertDeepEqual(normalizeMonitorStore('x'), { items: [], hitCount: 0 });
    assertDeepEqual(normalizeMonitorStore({ items: 'no' }), { items: [], hitCount: 0 });
    const got = normalizeMonitorStore({ items: [{ teachingClassID: '' }, { courseName: '无 id' }] });
    assertEqual(got.items.length, 0, '缺教学班 ID 的条目应当被丢掉');
  });
});

// ------------------------------------------------------------- 变更

describe('bkxk 监控 —— 变更', () => {
  it('removeMonitorItem 移除成功 / 未命中返回同一引用', () => {
    const s1 = store(mon({ teachingClassID: 'a' }), mon({ teachingClassID: 'b' }));
    const r = removeMonitorItem(s1, 'a');
    assertEqual(r.removed, true);
    assertEqual(r.store.items.length, 1);
    assertEqual(removeMonitorItem(s1, 'zzz').store, s1);
    assertEqual(removeMonitorItem(s1, 'zzz').removed, false);
  });

  it('patchMonitor 改一条 / 未命中返回同一引用', () => {
    const s1 = store(mon({ teachingClassID: 'a', lastMsg: '' }));
    assertEqual(patchMonitor(s1, 'a', { lastMsg: '满了' }).items[0]?.lastMsg, '满了');
    assertEqual(patchMonitor(s1, 'zzz', { lastMsg: '满了' }), s1);
  });

  it('resetMonitorStats 只清计数与检查结果，不动监控列表', () => {
    const s1 = { items: [mon({ remain: 3, hits: 5, checkedAt: 9, lastMsg: 'x' })], hitCount: 7 };
    const r = resetMonitorStats(s1);
    assertEqual(r.hitCount, 0);
    assertEqual(r.items.length, 1);
    assertEqual(r.items[0]?.remain, null);
    assertEqual(r.items[0]?.hits, 0);
    assertEqual(r.items[0]?.checkedAt, null);
    assertEqual(r.items[0]?.lastMsg, '');
    assertEqual(r.items[0]?.teachingClassID, s1.items[0]?.teachingClassID);
  });

  it('clearMonitor 清空', () => {
    assertDeepEqual(clearMonitor(), { items: [], hitCount: 0 });
  });
});

// ------------------------------------------------------------- 文案

describe('bkxk 监控 —— 展示文案', () => {
  it('「多久之前」的档位', () => {
    const now = 1_000_000_000_000;
    assertEqual(checkedAgoText(null, now), '从未');
    assertEqual(checkedAgoText(0, now), '从未');
    assertEqual(checkedAgoText(now, now), '刚刚');
    assertEqual(checkedAgoText(now - 2_000, now), '刚刚');
    assertEqual(checkedAgoText(now - 12_000, now), '12 秒前');
    assertEqual(checkedAgoText(now - 180_000, now), '3 分钟前');
    assertEqual(checkedAgoText(now - 7_200_000, now), '2 小时前');
    assertEqual(checkedAgoText(now + 5_000, now), '刚刚', '时钟回拨也不能显示负数');
  });

  it('摘要与命中一句话', () => {
    assertEqual(summaryText(store(), 0), '监控列表为空');
    const s1 = { items: [mon({ teachingClassID: 'a', checkedAt: 5_000 })], hitCount: 2 };
    const t = summaryText(s1, 17_000);
    assert(t.includes('1 条监控'), t);
    assert(t.includes('累计命中 2 次'), t);
    assert(t.includes('12 秒前'), t);

    const line = hitSummaryText(
      [
        { teachingClassID: 'a', remain: 3, kind: 'ok' },
        { teachingClassID: 'b', remain: 1, kind: 'ok' },
      ],
      (tcId) => (tcId === 'a' ? '高等数学' : '大学物理'),
    );
    assertEqual(line, '高等数学 余 3；大学物理 余 1');
  });

  it('byId 找得到 / 找不到', () => {
    const s1 = store(mon({ teachingClassID: 'a' }));
    assertEqual(byId(s1, 'a')?.teachingClassID, 'a');
    assertEqual(byId(s1, 'b'), null);
  });
});

// ------------------------------------------------------------- 引擎

describe('bkxk 监控引擎 —— 不发请求的那几条路径', () => {
  it('监控列表为空 → 拒绝开始轮询', () => {
    clearAll();
    bootSettings();
    __resetMonitorRuntime();
    const { panel, toasts } = fakePanel();
    bindMonitorPanel(panel);
    write(BKXK_STORE_KEY.MONITOR, { items: [], hitCount: 0 });

    assertEqual(startPolling(), false);
    assertEqual(isPolling(), false);
    assert(toasts.some((m) => m.includes('监控列表为空')), '应当 toast 说明怎么加监控');
    assertEqual(pollStats().pollCount, 0);
  });

  it('没在跑时 stopPolling 返回 false', () => {
    clearAll();
    bootSettings();
    __resetMonitorRuntime();
    const { panel, toasts } = fakePanel();
    bindMonitorPanel(panel);
    assertEqual(stopPolling(), false);
    assertEqual(toasts.length, 0);
  });

  it('空列表跑一轮：不发请求，只计数', async () => {
    clearAll();
    bootSettings();
    __resetMonitorRuntime();
    bindMonitorPanel(fakePanel().panel);
    write(BKXK_STORE_KEY.MONITOR, { items: [], hitCount: 0 });

    const res = await pollOnce();
    assertEqual(res.checked, 0);
    assertEqual(res.hits.length, 0);
    assertEqual(pollStats().pollCount, 1);
    assert(pollStats().lastPollAt !== null, '应当记下上次检查时间');
  });

  it('grabNow：写开关未开 → write-disabled，且不上网', async () => {
    clearAll();
    bootSettings();
    __resetMonitorRuntime();
    const r = await grabNow(mon());
    assertEqual(r.ok, false);
    assertEqual(r.reason, 'write-disabled');
  });

  it('grabNow：写开关已开但拿不到会话 → no-session，且不上网', async () => {
    clearAll();
    bootSettings();
    __resetMonitorRuntime();
    setEnabled(SITE_ID, TOGGLE.WRITE_API, true);
    // node 里没有 sessionStorage，学号/批次码都取不到
    const r = await grabNow(mon());
    assertEqual(r.ok, false);
    assertEqual(r.reason, 'no-session');
  });
});

describe('bkxk 监控引擎 —— 存储与订阅', () => {
  it('读 → 写一圈保形状', () => {
    clearAll();
    __resetMonitorRuntime();
    write(BKXK_STORE_KEY.MONITOR, { items: [mon({ teachingClassID: 'a', remain: 2 })], hitCount: 1 });
    const loaded = loadMonitorStore();
    assertEqual(loaded.items.length, 1);
    assertEqual(loaded.items[0]?.remain, 2);
    assertEqual(loaded.hitCount, 1);
  });

  it('updateMonitor 写盘 + 广播，退订后不再收到', () => {
    clearAll();
    __resetMonitorRuntime();
    write(BKXK_STORE_KEY.MONITOR, store(mon({ teachingClassID: 'a' })));
    let calls = 0;
    const off = subscribeMonitor(() => {
      calls += 1;
    });

    updateMonitor((s) => patchMonitor(s, 'a', { lastMsg: '满了' }));
    assertEqual(calls, 1);
    assertEqual(loadMonitorStore().items[0]?.lastMsg, '满了');

    off();
    updateMonitor((s) => patchMonitor(s, 'a', { lastMsg: '又满了' }));
    assertEqual(calls, 1);
  });

  it('一个订阅者抛错不影响另一个', () => {
    clearAll();
    __resetMonitorRuntime();
    write(BKXK_STORE_KEY.MONITOR, store(mon({ teachingClassID: 'a' })));
    let okCalls = 0;
    subscribeMonitor(() => {
      throw new Error('故意抛错');
    });
    subscribeMonitor(() => {
      okCalls += 1;
    });
    updateMonitor((s) => s);
    assertEqual(okCalls, 1);
  });
});

/**
 * 纯函数冒烟（档1）：抢课任务队列的判定规则与执行引擎的门禁。
 *
 * 为什么不测 `tasks.ts` 的抢课流程本身：它会真发请求（`bkxkSend`），
 * 在本机 node 下没有 `GM_xmlhttpRequest`，而且**风险接口不做自动化测试**
 * （风控类、会留痕、可能封号 —— 见 preset 约定）。所以：
 *   · 判定与落盘形状全部在 `tasks-model.ts` 里测；
 *   · 引擎只测**不发请求**的那几条路径（写开关门禁、空队列、停止、订阅广播）；
 *   · 真实抢课由用户手测（档3）。
 *
 * 最值得钉的：
 *   1. `classifyMsg` 的**先后顺序**。「已选人数超过课容量」同时命中两个正则，
 *      但它表达的是「满员」⇒ 必须算可重试。顺序一调，表现是「课满了却停手」。
 *   2. `smart` 对 `unknown` **继续重试**。改错会让未识别的失败静默停掉任务。
 *   3. `RUNNING` **不落盘**。改错会让刷新后任务显示成永远在跑。
 *   4. `activeTasks` 的排序方向：`priority` **小 = 先抢**，极易反转。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import { clearAll, write } from '../../src/common/core/storage.ts';
import { resetRegistry as resetSettings, registerToggles, setEnabled } from '../../src/common/core/settings.ts';
import { BKXK_STORE_KEY } from '../../src/sites/bkxk/legacy.ts';
import { BKXK_TOGGLES, SITE_ID, TOGGLE } from '../../src/sites/bkxk/settings.ts';
import type { TaskItem, TaskStore } from '../../src/sites/bkxk/list-model.ts';
import {
  AUTH_MSG,
  RETRY_MODE,
  RETRY_MODE_NAME,
  TASK_KIND,
  PRIORITY_MAX,
  PRIORITY_MIN,
  TASK_STATUS,
  activeTasks,
  byId,
  clampPriority,
  classifyMsg,
  clearStaleTasks,
  clearTasks,
  isActiveTask,
  isRetryMode,
  kindLabel,
  normalizeRetryMode,
  normalizeStatus,
  normalizeStore,
  patchTask,
  priorityHint,
  priorityLabel,
  removeTask,
  resetTasks,
  setPriority,
  setRetryMode,
  shouldRetry,
  slimTasks,
  statusKey,
  statusLabel,
  summaryText,
  toggleTask,
} from '../../src/sites/bkxk/tasks-model.ts';
import {
  __resetTaskRuntime,
  bindTaskPanel,
  isTaskRunning,
  loadTaskStore,
  saveTaskStore,
  startTasks,
  stopTasks,
  subscribeTasks,
  updateTasks,
} from '../../src/sites/bkxk/tasks.ts';
import type { PanelApi } from '../../src/sites/types.ts';

// ------------------------------------------------------------- 夹具

function task(over: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't1',
    seq: 1,
    teachingClassID: '202620271520189001039',
    courseName: '高等数学',
    teacherName: '张三',
    category: 'FANKC',
    priority: 0,
    enabled: true,
    status: TASK_STATUS.PENDING,
    retryMode: RETRY_MODE.SMART,
    attempts: 0,
    lastMsg: '',
    lastKind: '',
    addedAt: 1000,
    ...over,
  };
}

function store(...items: readonly TaskItem[]): TaskStore {
  return { seq: items.length, items };
}

/** 只实现引擎用到的方法，其余用不到就抛错（避免「默默调了别的方法」） */
function fakePanel(): { panel: PanelApi; toasts: string[]; authAlerts: () => number } {
  const toasts: string[] = [];
  let authAlerts = 0;
  const panel = {
    collapse: () => undefined,
    expand: () => undefined,
    isCollapsed: () => false,
    toast: (msg: string) => {
      toasts.push(msg);
    },
    confirm: () => Promise.resolve(false),
    alertAuthExpired: () => {
      authAlerts += 1;
    },
    activateTab: () => undefined,
  } as unknown as PanelApi;
  return { panel, toasts, authAlerts: () => authAlerts };
}

function bootSettings(): void {
  resetSettings();
  registerToggles(SITE_ID, '本科选课', BKXK_TOGGLES);
}

// ------------------------------------------------------------- 归类与策略

describe('bkxk 抢课 —— 失败归类', () => {
  it('字面值与旧仓库一致（归档值不能漂）', () => {
    assertEqual(TASK_STATUS.PENDING, 'pending');
    assertEqual(TASK_STATUS.RUNNING, 'running');
    assertEqual(TASK_STATUS.SUCCESS, 'success');
    assertEqual(TASK_STATUS.FAILED, 'failed');
    assertEqual(RETRY_MODE.SMART, 'smart');
    assertEqual(RETRY_MODE.NEVER, 'never');
    assertEqual(RETRY_MODE.ALWAYS, 'always');
    assertEqual(AUTH_MSG, '登录态失效，请刷新页面重新登录');
    assertEqual(RETRY_MODE_NAME['smart'], '智能');
    assertEqual(RETRY_MODE_NAME['never'], '失败即停');
    assertEqual(RETRY_MODE_NAME['always'], '持续重试');
  });

  it('满员类文案算「可重试」，即使它同时含「已选」', () => {
    // 这是本文件最重要的一条：「已选人数超过课容量」同时命中两个正则
    assertEqual(classifyMsg('已选人数超过课容量'), TASK_KIND.RETRYABLE);
    assertEqual(classifyMsg('该教学班已满员'), TASK_KIND.RETRYABLE);
    assertEqual(classifyMsg('余量不足，已选人数已达上限'), TASK_KIND.RETRYABLE);
  });

  it('终结性文案算「终结」，不该再打服务器', () => {
    assertEqual(classifyMsg('你已选中该教学班'), TASK_KIND.TERMINAL);
    assertEqual(classifyMsg('该课程与已有课程冲突'), TASK_KIND.TERMINAL);
    assertEqual(classifyMsg('学分超出上限'), TASK_KIND.TERMINAL);
    assertEqual(classifyMsg('不在选课时间内'), TASK_KIND.TERMINAL);
  });

  it('读不懂的文案算「未识别」，不是「终结」', () => {
    assertEqual(classifyMsg('系统繁忙'), TASK_KIND.UNKNOWN);
    assertEqual(classifyMsg(''), TASK_KIND.UNKNOWN);
    assertEqual(classifyMsg(null), TASK_KIND.UNKNOWN);
    assertEqual(classifyMsg(undefined), TASK_KIND.UNKNOWN);
  });
});

describe('bkxk 抢课 —— 重试策略', () => {
  it('smart：可重试与未识别继续，终结性停手', () => {
    assertEqual(shouldRetry(RETRY_MODE.SMART, TASK_KIND.RETRYABLE), true);
    assertEqual(shouldRetry(RETRY_MODE.SMART, TASK_KIND.UNKNOWN), true);
    assertEqual(shouldRetry(RETRY_MODE.SMART, TASK_KIND.TERMINAL), false);
  });

  it('never 一律停手，always 一律继续', () => {
    for (const k of [TASK_KIND.RETRYABLE, TASK_KIND.TERMINAL, TASK_KIND.UNKNOWN, TASK_KIND.AUTH]) {
      assertEqual(shouldRetry(RETRY_MODE.NEVER, k), false, `never 不该重试 ${k}`);
      assertEqual(shouldRetry(RETRY_MODE.ALWAYS, k), true, `always 应当重试 ${k}`);
    }
  });

  it('不认识的重试策略一律回落 smart', () => {
    assertEqual(normalizeRetryMode(''), RETRY_MODE.SMART);
    assertEqual(normalizeRetryMode('SMART'), RETRY_MODE.SMART);
    assertEqual(normalizeRetryMode('nope'), RETRY_MODE.SMART);
    assertEqual(normalizeRetryMode('always'), RETRY_MODE.ALWAYS);
    assertEqual(isRetryMode('never'), true);
    assertEqual(isRetryMode('NEVER'), false);
  });
});

// ------------------------------------------------------------- 状态与落盘

describe('bkxk 抢课 —— 状态收敛与落盘形状', () => {
  it('running 与垃圾值都收敛成 pending', () => {
    assertEqual(normalizeStatus('running'), TASK_STATUS.PENDING);
    assertEqual(normalizeStatus(''), TASK_STATUS.PENDING);
    assertEqual(normalizeStatus('乱码'), TASK_STATUS.PENDING);
    assertEqual(normalizeStatus('success'), TASK_STATUS.SUCCESS);
    assertEqual(normalizeStatus('failed'), TASK_STATUS.FAILED);
  });

  it('落盘时 running 写回 pending，且不动其它字段', () => {
    const slim = slimTasks(store(task({ status: TASK_STATUS.RUNNING, attempts: 3 })));
    assertEqual(slim.items.length, 1);
    assertEqual(slim.items[0]?.status, TASK_STATUS.PENDING);
    assertEqual(slim.items[0]?.attempts, 3);
    assertDeepEqual(Object.keys(slim.items[0] ?? {}).sort(), Object.keys(task()).sort());
  });

  it('落盘只写 {seq, items}，不带任何额外字段', () => {
    const slim = slimTasks(store(task()));
    assertDeepEqual(Object.keys(slim).sort(), ['items', 'seq']);
  });

  it('normalizeStore：清掉登录态残留并把 failed 翻回 pending', () => {
    const raw = {
      seq: 5,
      items: [
        { ...task({ id: 'a' }), status: TASK_STATUS.FAILED, lastMsg: AUTH_MSG, lastKind: TASK_KIND.AUTH },
        { ...task({ id: 'b' }), status: TASK_STATUS.FAILED, lastMsg: '课满了', lastKind: TASK_KIND.RETRYABLE },
      ],
    };
    const got = normalizeStore(raw);
    assertEqual(got.seq, 5);
    assertEqual(got.items[0]?.status, TASK_STATUS.PENDING, '登录态残留应当回到待抢');
    assertEqual(got.items[0]?.lastMsg, '');
    assertEqual(got.items[0]?.lastKind, '');
    // 非登录态的失败**必须原样保留**，否则用户看不到为什么停的
    assertEqual(got.items[1]?.status, TASK_STATUS.FAILED);
    assertEqual(got.items[1]?.lastMsg, '课满了');
  });

  it('normalizeStore：running 收敛 + 重试策略兜底 + 坏数据不炸', () => {
    const got = normalizeStore({
      seq: 2,
      items: [{ ...task(), status: TASK_STATUS.RUNNING, retryMode: 'nope' }],
    });
    assertEqual(got.items[0]?.status, TASK_STATUS.PENDING);
    assertEqual(got.items[0]?.retryMode, RETRY_MODE.SMART);

    assertDeepEqual(normalizeStore(null), { seq: 0, items: [] });
    assertDeepEqual(normalizeStore('不是对象'), { seq: 0, items: [] });
    assertDeepEqual(normalizeStore({ items: '不是数组' }), { seq: 0, items: [] });
  });
});

// ------------------------------------------------------------- 轮询选择

describe('bkxk 抢课 —— 该轮询谁、按什么顺序', () => {
  it('只挑「勾选了且还该抢」的', () => {
    const items = [
      task({ id: 'a', status: TASK_STATUS.PENDING }),
      task({ id: 'b', status: TASK_STATUS.RUNNING }),
      task({ id: 'c', status: TASK_STATUS.SUCCESS }),
      task({ id: 'd', status: TASK_STATUS.FAILED }),
      task({ id: 'e', enabled: false }),
    ];
    assertEqual(isActiveTask(items[0]!), true);
    assertEqual(isActiveTask(items[2]!), false);
    assertDeepEqual(
      activeTasks(items).map((t) => t.id),
      ['a', 'b'],
      '只该剩 pending 与 running',
    );
  });

  it('priority 小 = 先抢，同级按 seq 升序', () => {
    const items = [
      task({ id: 'a', priority: 1, seq: 1 }),
      task({ id: 'b', priority: -1, seq: 9 }),
      task({ id: 'c', priority: 0, seq: 5 }),
      task({ id: 'd', priority: 0, seq: 2 }),
    ];
    assertDeepEqual(
      activeTasks(items).map((t) => t.id),
      ['b', 'd', 'c', 'a'],
      'priority 升序 + 同级 seq 升序',
    );
  });

  it('activeTasks 不改动传入的数组', () => {
    const items = [task({ id: 'a', priority: 1 }), task({ id: 'b', priority: -1 })];
    const before = items.map((t) => t.id);
    activeTasks(items);
    assertDeepEqual(items.map((t) => t.id), before);
  });
});

// ------------------------------------------------------------- 变更

describe('bkxk 抢课 —— 变更规则', () => {
  it('优先级钳位到 [-9, 9]，非法值回 0（下界从旧仓库的 0 放宽，见 clampPriority 注释）', () => {
    assertEqual(clampPriority(-99), -9);
    assertEqual(clampPriority(99), 9);
    assertEqual(clampPriority(1.9), 1);
    assertEqual(clampPriority(-1.9), -1);
    assertEqual(clampPriority('2'), 2);
    assertEqual(clampPriority(Number.NaN), 0);
    assertEqual(clampPriority('abc'), 0);
    assertEqual(clampPriority(undefined), 0);
  });

  it('重新勾选时，停在 failed 的翻回 pending', () => {
    const s1 = store(task({ id: 'a', enabled: false, status: TASK_STATUS.FAILED }));
    const r1 = toggleTask(s1, 'a');
    assertEqual(r1.enabled, true);
    assertEqual(r1.store.items[0]?.status, TASK_STATUS.PENDING);
    assertEqual(r1.store.items[0]?.enabled, true);
  });

  it('取消勾选不改状态（成功的不该被翻回去）', () => {
    const s1 = store(task({ id: 'a', enabled: true, status: TASK_STATUS.SUCCESS }));
    const r1 = toggleTask(s1, 'a');
    assertEqual(r1.enabled, false);
    assertEqual(r1.store.items[0]?.status, TASK_STATUS.SUCCESS);
  });

  it('改不存在的 id → 原样返回同一个引用', () => {
    const s1 = store(task({ id: 'a' }));
    assertEqual(patchTask(s1, 'zzz', { enabled: false }), s1);
    assertEqual(setPriority(s1, 'zzz', 1), s1);
    assertEqual(setRetryMode(s1, 'zzz', 'never'), s1);
    assertEqual(removeTask(s1, 'zzz').removed, false);
    assertEqual(toggleTask(s1, 'zzz').store, s1);
  });

  it('setRetryMode 拒绝非法值（不写坏数据）', () => {
    const s1 = store(task({ id: 'a' }));
    assertEqual(setRetryMode(s1, 'a', 'nope'), s1);
    assertEqual(setRetryMode(s1, 'a', 'never').items[0]?.retryMode, 'never');
  });

  it('clearStaleTasks 只动「勾选了且 failed」的，成功的不动', () => {
    const s1 = store(
      task({ id: 'a', enabled: true, status: TASK_STATUS.FAILED, attempts: 7, lastMsg: '课满了', lastKind: 'retryable' }),
      task({ id: 'b', enabled: false, status: TASK_STATUS.FAILED }),
      task({ id: 'c', enabled: true, status: TASK_STATUS.SUCCESS }),
      task({ id: 'd', enabled: true, status: TASK_STATUS.PENDING }),
    );
    const r = clearStaleTasks(s1);
    assertEqual(r.cleared, 1);
    const a = byId(r.store, 'a');
    assertEqual(a?.status, TASK_STATUS.PENDING);
    assertEqual(a?.attempts, 0);
    assertEqual(a?.lastMsg, '');
    assertEqual(byId(r.store, 'b')?.status, TASK_STATUS.FAILED, '未勾选的不该被动');
    assertEqual(byId(r.store, 'c')?.status, TASK_STATUS.SUCCESS, '已抢到的不该被动');
    assertEqual(byId(r.store, 'd')?.status, TASK_STATUS.PENDING);
  });

  it('clearStaleTasks 无事可做时返回同一个引用', () => {
    const s1 = store(task({ id: 'a', status: TASK_STATUS.SUCCESS }));
    assertEqual(clearStaleTasks(s1).store, s1);
    assertEqual(clearStaleTasks(s1).cleared, 0);
  });

  it('resetTasks 把非成功的置回 pending，success 保留但清计数', () => {
    const s1 = store(
      task({ id: 'a', status: TASK_STATUS.FAILED, attempts: 4, lastMsg: 'x', lastKind: 'terminal' }),
      task({ id: 'b', status: TASK_STATUS.SUCCESS, attempts: 2 }),
    );
    const r = resetTasks(s1);
    assertEqual(byId(r, 'a')?.status, TASK_STATUS.PENDING);
    assertEqual(byId(r, 'a')?.attempts, 0);
    assertEqual(byId(r, 'a')?.lastMsg, '');
    assertEqual(byId(r, 'a')?.lastKind, 'terminal', '旧仓库 reset 不清 lastKind，这里照旧');
    assertEqual(byId(r, 'b')?.status, TASK_STATUS.SUCCESS);
    assertEqual(byId(r, 'b')?.attempts, 0);
  });

  it('clearTasks 清空队列', () => {
    assertDeepEqual(clearTasks(), { seq: 0, items: [] });
  });
});

// ------------------------------------------------------------- 文案

describe('bkxk 抢课 —— 展示文案', () => {
  it('状态文案与色档', () => {
    assertEqual(statusLabel('pending'), '待抢');
    assertEqual(statusLabel('success'), '已抢到');
    assertEqual(statusKey('success'), 'ok');
    assertEqual(statusKey('failed'), 'bad');
    assertEqual(statusKey('running'), 'run');
    assertEqual(statusKey('pending'), 'wait');
    assertEqual(kindLabel('retryable'), '可重试');
    assertEqual(kindLabel('unknown'), '未识别');
  });

  it('摘要按状态分组，空队列单独一句话', () => {
    assertEqual(summaryText([]), '队列为空');
    const t = summaryText(
      store(
        task({ id: 'a', status: TASK_STATUS.PENDING }),
        task({ id: 'b', status: TASK_STATUS.SUCCESS }),
        task({ id: 'c', status: TASK_STATUS.FAILED }),
        task({ id: 'd', enabled: false }),
      ).items,
    );
    assertEqual(t, '4 条（待抢 2 · 已抢到 1 · 已停止 1 · 未勾选 1）');
  });

  it('优先级提示不要把方向说反', () => {
    const low = priorityHint(-1);
    const high = priorityHint(1);
    assert(low.includes('先抢'), `负优先级应当说「更先抢」，实际 ${low}`);
    assert(high.includes('后抢'), `正优先级应当说「更后抢」，实际 ${high}`);
  });
});

// ---------------------------------------------------------------- 优先级

describe('bkxk 抢课 —— 优先级步进器（-9 ~ 9）', () => {
  it('默认是 0，加号减号各走一步', () => {
    const s1 = store(task({ id: 'a' }));
    assertEqual(byId(s1, 'a')?.priority, 0);
    const up = setPriority(s1, 'a', clampPriority(0 + 1));
    assertEqual(byId(up, 'a')?.priority, 1);
    const down = setPriority(s1, 'a', clampPriority(0 - 1));
    assertEqual(byId(down, 'a')?.priority, -1);
  });

  it('可以一路减到 -9，比默认更先抢 —— 这正是旧仓库按不动的那一步', () => {
    // 旧仓库 NS.util.clamp(p, -1, 1, 0) 的下界是 0，默认队列全 0 ⇒ 【−】永远 no-op。
    // 放宽到 -9 之后，「插到默认那批前面」才有手段。
    const s1 = store(task({ id: 'a' }), task({ id: 'b' }));
    const s2 = setPriority(s1, 'b', clampPriority(-9));
    assertEqual(byId(s2, 'b')?.priority, -9);
    // 排序口径：priority 小的在前 ⇒ b 真的排到了 a 前面
    assertDeepEqual(
      activeTasks(s2.items).map((t) => t.id),
      ['b', 'a'],
    );
  });

  it('两端都钳住，越界输入不会产生 -10 / 10', () => {
    const s1 = store(task({ id: 'a' }));
    assertEqual(byId(setPriority(s1, 'a', -99), 'a')?.priority, PRIORITY_MIN);
    assertEqual(byId(setPriority(s1, 'a', 99), 'a')?.priority, PRIORITY_MAX);
    assertEqual(byId(setPriority(s1, 'a', 1.7), 'a')?.priority, 1);
    assertEqual(byId(setPriority(s1, 'a', Number.NaN), 'a')?.priority, 0);
    assertEqual(byId(setPriority(s1, 'a', 'abc'), 'a')?.priority, 0);
  });

  it('钳位常量本身自洽（最小值真的比默认更先抢）', () => {
    assertEqual(PRIORITY_MIN < 0, true);
    assertEqual(PRIORITY_MAX > 0, true);
    assertEqual(clampPriority(PRIORITY_MIN - 1), PRIORITY_MIN);
    assertEqual(clampPriority(PRIORITY_MAX + 1), PRIORITY_MAX);
  });

  it('短标签把数字翻译成人话，别把方向说反', () => {
    assertEqual(priorityLabel(-9), '更先抢');
    assertEqual(priorityLabel(-1), '更先抢');
    assertEqual(priorityLabel(0), '默认');
    assertEqual(priorityLabel(1), '更后抢');
    assertEqual(priorityLabel(9), '更后抢');
  });

  it('短标签与长提示的方向一致（同一件事的两种说法）', () => {
    for (const p of [PRIORITY_MIN, -1, 0, 1, PRIORITY_MAX]) {
      const long = priorityHint(p);
      const short = priorityLabel(p);
      if (p < 0) {
        assertEqual(long.includes('更先抢'), true);
        assertEqual(short, '更先抢');
      } else if (p > 0) {
        assertEqual(long.includes('更后抢'), true);
        assertEqual(short, '更后抢');
      } else {
        assertEqual(long.includes('默认'), true);
        assertEqual(short, '默认');
      }
    }
  });

  it('id 不存在 → 同一个 store 引用（既有约定的延续）', () => {
    const s1 = store(task({ id: 'a' }));
    assertEqual(setPriority(s1, 'zzz', 3), s1);
  });
});


// ------------------------------------------------------------- 引擎门禁

describe('bkxk 抢课引擎 —— 不发请求的那几条路径', () => {
  it('写接口总开关未开 → 拒绝开始，且一条请求都不发', () => {
    clearAll();
    bootSettings();
    __resetTaskRuntime();
    const { panel, toasts } = fakePanel();
    bindTaskPanel(panel);
    clearAll();
    // 队列里明明有活，也不能开跑
    write(BKXK_STORE_KEY.TASKS, store(task()));

    const r = startTasks();
    assertEqual(r.ok, false);
    assertEqual(r.reason, 'write-disabled');
    assertEqual(r.count, 0);
    assertEqual(isTaskRunning(), false);
    assert(toasts.some((m) => m.includes('写接口总开关')), '应当 toast 提示去打开开关');
  });

  it('开关已开但队列里没有可抢的 → no-task', () => {
    clearAll();
    bootSettings();
    __resetTaskRuntime();
    const { panel, toasts } = fakePanel();
    bindTaskPanel(panel);
    setEnabled(SITE_ID, TOGGLE.WRITE_API, true);
    write(BKXK_STORE_KEY.TASKS, store(task({ status: TASK_STATUS.SUCCESS })));

    const r = startTasks();
    assertEqual(r.ok, false);
    assertEqual(r.reason, 'no-task');
    assertEqual(isTaskRunning(), false);
    assert(toasts.some((m) => m.includes('没有可抢')), '应当 toast 说明为什么没开跑');
  });

  it('空队列 + 开关已开 → no-task（不发请求）', () => {
    clearAll();
    bootSettings();
    __resetTaskRuntime();
    bindTaskPanel(fakePanel().panel);
    setEnabled(SITE_ID, TOGGLE.WRITE_API, true);
    write(BKXK_STORE_KEY.TASKS, { seq: 0, items: [] });

    const r = startTasks();
    assertEqual(r.reason, 'no-task');
    assertEqual(isTaskRunning(), false);
  });

  it('没在跑的时候 stopTasks 返回 false（不误报「已停止」）', () => {
    clearAll();
    bootSettings();
    __resetTaskRuntime();
    const { panel, toasts } = fakePanel();
    bindTaskPanel(panel);
    assertEqual(stopTasks(), false);
    assertEqual(toasts.length, 0);
  });
});

describe('bkxk 抢课引擎 —— 存储与订阅', () => {
  it('读 → 写一圈之后 running 落成 pending', () => {
    clearAll();
    __resetTaskRuntime();
    write(BKXK_STORE_KEY.TASKS, { seq: 1, items: [{ ...task(), status: TASK_STATUS.RUNNING }] });
    assertEqual(loadTaskStore().items[0]?.status, TASK_STATUS.PENDING);

    const saved = saveTaskStore(store(task({ status: TASK_STATUS.RUNNING })));
    assertEqual(saved, undefined, 'saveTaskStore 不返回 store');
    // 再读回来：写盘时已经收敛
    assertEqual(loadTaskStore().items[0]?.status, TASK_STATUS.PENDING);
  });

  it('updateTasks 是唯一变更入口：写盘 + 广播', () => {
    clearAll();
    __resetTaskRuntime();
    write(BKXK_STORE_KEY.TASKS, store(task({ id: 'a' })));
    let calls = 0;
    const off = subscribeTasks(() => {
      calls += 1;
    });

    const next = updateTasks((s) => setPriority(s, 'a', -1));
    assertEqual(next.items[0]?.priority, -1);
    assertEqual(calls, 1, '订阅者应当收到一次广播');
    assertEqual(loadTaskStore().items[0]?.priority, -1, '变更应当已落盘');

    off();
    updateTasks((s) => setPriority(s, 'a', 0));
    assertEqual(calls, 1, '退订之后不该再收到广播');
  });

  it('一个订阅者抛错不影响另一个', () => {
    clearAll();
    __resetTaskRuntime();
    write(BKXK_STORE_KEY.TASKS, store(task({ id: 'a' })));
    let okCalls = 0;
    subscribeTasks(() => {
      throw new Error('故意抛错');
    });
    subscribeTasks(() => {
      okCalls += 1;
    });
    updateTasks((s) => s);
    assertEqual(okCalls, 1);
  });
});

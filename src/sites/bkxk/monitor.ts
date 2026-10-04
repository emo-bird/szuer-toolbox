/**
 * 余量监控**轮询引擎**：按类别或逐班查余量，命中就提醒、必要时自动抢。
 *
 * 分层：判定与落盘形状在 `monitor-model.ts`（纯函数、档 1 可测）；
 * 本文件只管 storage、定时器、网络。
 *
 * ⚠️ 三条来自旧仓库 `monitor.js` 的硬约束（都踩过）：
 *   1. **登录态失效必须停轮询**。不停的话会按 `pollIntervalMs` 一直拿失效 token
 *      打服务器：空转 + 刷日志，而用户完全不知道要去重新登录（`monitor.js:149-154`）。
 *   2. **自动抢失败不在本地重试**，交给下一轮轮询重新判断余量
 *      （`monitor.js:337-371`）。否则一门抢不上的课会被死循环猛打。
 *   3. **抢到立刻移出监控**，否则下一轮还会命中同一条，并重复提交选课。
 *
 * ⚠️ 自动抢要过写接口总开关（`TOGGLE.WRITE_API`）。开关没开时**只提醒不抢** ——
 * 这条与「『开始抢课』按钮被拒」不同：监控本身是只读的，没理由不让用户跑。
 *
 * ⚠️ 红线：日志与错误文案不得含 token / cookie / 学号，只许教学班 ID 与课程名（R3）。
 */

import { scoped } from '../../common/core/log.ts';
import { read, write } from '../../common/core/storage.ts';
import { getValue, isEnabled } from '../../common/core/settings.ts';
import { PRIORITY } from '../../common/core/http.ts';
import { clampLimit } from '../../common/core/limits.ts';
import type { PanelApi } from '../types.ts';
import { bkxkContext, pageOrigin } from './context.ts';
import { BKXK_STORE_KEY } from './legacy.ts';
import { SITE_ID, TOGGLE, VALUE } from './settings.ts';
import {
  EP,
  RESP_KIND,
  buildCapacityBody,
  buildVolunteerBody,
  bkxkSend,
  capacityRemain,
  endpointUrl,
} from './api.ts';
import type { CategoryCode, RespKind } from './api.ts';
import { fetchCategory, remainOf } from './courses.ts';
import type { BkxkClass, CategoryResult } from './courses.ts';
import type { MonitorItem, MonitorStore } from './list-model.ts';
import {
  MAX_PAGES,
  PAGE_SIZE,
  addHitCount,
  applyCheck,
  byId,
  groupByCategory,
  hitSummaryText,
  hitsOf,
  normalizeMonitorMode,
  normalizeMonitorStore,
  patchMonitor,
  removeMonitorItem,
  slimMonitor,
} from './monitor-model.ts';
import type { HitRow, MonitorMode } from './monitor-model.ts';

const log = scoped('bkxk/monitor');

// -------------------------------------------------------------- 外部绑定

let panel: PanelApi | null = null;

/** 绑定面板，用于 toast。由 `index.ts` 在 `init` 时调用 */
export function bindMonitorPanel(p: PanelApi): void {
  panel = p;
}

const listeners = new Set<() => void>();

/** 订阅「监控列表或轮询状态变了」。返回退订函数 */
export function subscribeMonitor(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (err) {
      log.warn('监控订阅回调抛错（已忽略）', err);
    }
  }
}

// -------------------------------------------------------------- 存储

export function loadMonitorStore(): MonitorStore {
  return normalizeMonitorStore(read<unknown>(BKXK_STORE_KEY.MONITOR, null));
}

export function saveMonitorStore(store: MonitorStore): void {
  write(BKXK_STORE_KEY.MONITOR, slimMonitor(store));
  notify();
}

/** 唯一的变更入口：读 → 变换 → 写 */
export function updateMonitor(fn: (store: MonitorStore) => MonitorStore): MonitorStore {
  const next = fn(loadMonitorStore());
  saveMonitorStore(next);
  return next;
}

// -------------------------------------------------------------- 设置

export function currentMode(): MonitorMode {
  return normalizeMonitorMode(getValue<unknown>(SITE_ID, VALUE.MONITOR_MODE));
}

function pollIntervalMs(): number {
  return clampLimit('pollIntervalMs', getValue<unknown>(SITE_ID, VALUE.POLL_INTERVAL_MS));
}

// -------------------------------------------------------------- 轮询状态

let polling = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let wake: (() => void) | null = null;
let lastPollAt: number | null = null;
let pollCount = 0;

export interface PollStats {
  readonly polling: boolean;
  readonly lastPollAt: number | null;
  readonly pollCount: number;
}

export function pollStats(): PollStats {
  return { polling, lastPollAt, pollCount };
}

export interface PollResult {
  /** 本轮实际比对过的监控项条数 */
  readonly checked: number;
  readonly hits: readonly HitRow[];
}

/**
 * 可被打断的等待。
 *
 * 为什么不用裸 `setTimeout`：`stopPolling()` 发生在等待期间时，裸定时器要么被
 * `clearTimeout` 掉导致 promise **永不 resolve**（异步循环泄漏在内存里），
 * 要么不被清导致停机要等满一个间隔。这里两头都收：清定时器并主动 resolve。
 */
function sleepInterruptible(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    wake = resolve;
    timer = setTimeout(() => {
      timer = null;
      wake = null;
      resolve();
    }, ms);
  });
}

function interruptSleep(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const w = wake;
  wake = null;
  if (w !== null) w();
}

/**
 * 开始轮询。
 * @returns 是否真的开始了（已在跑 / 监控列表为空都返回 false）
 */
export function startPolling(): boolean {
  if (polling) return false;
  const store = loadMonitorStore();
  if (store.items.length === 0) {
    panel?.toast('监控列表为空，先到选课列表里点「监控该教学班」', 'warn');
    return false;
  }
  polling = true;
  log.info(`开始监控轮询（${currentMode()}），监控项 ${String(store.items.length)} 条`);
  panel?.toast(`开始监控（${String(store.items.length)} 条）`, 'success');
  notify();
  void loop();
  return true;
}

/**
 * 停止轮询。
 *
 * ⚠️ 已发出、还没回来的那条请求不会被取消，它的结果仍会写回监控列表。
 * @returns 之前是否在跑
 */
export function stopPolling(): boolean {
  if (!polling) return false;
  polling = false;
  interruptSleep();
  log.info('已停止监控轮询');
  panel?.toast('已停止监控轮询', 'info');
  notify();
  return true;
}

export function isPolling(): boolean {
  return polling;
}

async function loop(): Promise<void> {
  try {
    while (polling) {
      await pollOnce();
      if (!polling) return;
      await sleepInterruptible(pollIntervalMs());
    }
  } catch (err) {
    polling = false;
    log.error('监控轮询异常结束', err);
    panel?.toast('监控轮询异常，已停止（详见日志）', 'error');
  } finally {
    notify();
  }
}

// -------------------------------------------------------------- 一轮

/** 跑一轮。导出是为了「立即检查一次」按钮 —— 它不走定时器 */
export async function pollOnce(): Promise<PollResult> {
  lastPollAt = Date.now();
  pollCount += 1;

  const store = loadMonitorStore();
  if (store.items.length === 0) {
    notify();
    return { checked: 0, hits: [] };
  }

  // ⚠️ 一轮内**不检查** `polling`：旧仓库 `_pollSingle` / `_pollCategory` 也没有。
  // 中途停机只保证不发下一轮，不保证中断当前这一轮（已经在飞的请求也停不下来）。
  const res =
    currentMode() === 'single' ? await pollSingle(store) : await pollCategory(store);

  await afterCheck(res);
  notify();
  return res;
}

async function pollSingle(start: MonitorStore): Promise<PollResult> {
  let store = start;
  const rows: HitRow[] = [];
  for (const item of start.items) {
    const r = await checkOne(store, item.teachingClassID);
    store = r.store;
    rows.push(r.row);
  }
  return { checked: rows.length, hits: hitsOf(rows) };
}

async function checkOne(
  store: MonitorStore,
  tcId: string,
): Promise<{ store: MonitorStore; row: HitRow }> {
  const ctx = bkxkContext();
  if (ctx.batchCode === '') {
    log.warn(`查容量跳过 ${tcId}：批次码为空（请刷新选课页）`);
    return {
      store,
      row: { teachingClassID: tcId, remain: null, kind: 'nobatch', msg: '批次码为空（请刷新选课页）' },
    };
  }

  let kind: RespKind;
  let msg: string;
  let remain: number | null = null;

  try {
    const r = await bkxkSend({
      url: endpointUrl(EP.CAPACITY, pageOrigin()),
      action: `查容量 ${tcId}`,
      method: 'POST',
      body: buildCapacityBody(tcId, ctx.batchCode),
      token: ctx.token,
      priority: PRIORITY.NORMAL,
    });
    kind = r.cls.kind;
    msg = r.cls.msg;
    if (kind === RESP_KIND.OK) remain = capacityRemain(r.cls.data);
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    log.warn(`查容量请求异常：${tcId}`, err);
    const applied = applyCheck(store, tcId, null, Date.now(), `请求异常：${text}`);
    saveMonitorStore(applied.store);
    return { store: applied.store, row: { teachingClassID: tcId, remain: null, kind: 'exception', msg: text } };
  }

  if (kind !== RESP_KIND.OK) {
    noteAuthLost(kind);
    log.warn(`查容量失败（${kind}）：${tcId} ${msg}`);
    const applied = applyCheck(store, tcId, null, Date.now(), msg);
    saveMonitorStore(applied.store);
    return { store: applied.store, row: { teachingClassID: tcId, remain: null, kind, msg } };
  }

  // 成功路径**不写 lastMsg**（与旧仓库 `_apply` 一致）：上一次的失败文案留在那儿，
  // 反而能让用户看出「这条刚才是查不到，现在好了」
  const applied = applyCheck(store, tcId, remain, Date.now());
  saveMonitorStore(applied.store);
  return { store: applied.store, row: { teachingClassID: tcId, remain, kind: 'ok' } };
}

/**
 * 类别模式：**按类别拉整页列表**再在本地比对，而不是逐个教学班查容量。
 * 逐个查会把请求数放大到「监控条数 × 轮询次数」。
 * @returns 成功时是整类教学班；一次都没拉到时返回 `null`（调用方据此区分
 *          「查不到该教学班」与「压根没查到」—— 前者是事实，后者是失败）
 */
async function fetchCategoryAll(category: string): Promise<readonly BkxkClass[] | null> {
  const ctx = bkxkContext();
  const out: BkxkClass[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let r: CategoryResult;
    try {
      r = await fetchCategory({
        category: category as CategoryCode,
        studentCode: ctx.studentCode,
        batchCode: ctx.batchCode === '' ? null : ctx.batchCode,
        token: ctx.token,
        pageNumber: page,
        pageSize: PAGE_SIZE,
        origin: pageOrigin(),
      });
    } catch (err) {
      log.warn(`类别 ${category} 第 ${page} 页请求异常`, err);
      return out.length > 0 ? out : null;
    }
    if (r.kind !== RESP_KIND.OK) {
      noteAuthLost(r.kind);
      log.warn(`类别 ${category} 第 ${page} 页拉取失败（${r.kind}）：${r.msg}`);
      return out.length > 0 ? out : null;
    }
    for (const c of r.classes) out.push(c);
    if (r.classes.length < PAGE_SIZE) return out;
  }
  log.warn(`类别 ${category} 超过 ${String(MAX_PAGES)} 页上限，只用前 ${String(out.length)} 条比对`);
  return out;
}

async function pollCategory(start: MonitorStore): Promise<PollResult> {
  const { groups, skipped } = groupByCategory(start.items);
  if (skipped > 0) {
    log.warn(`类别监控：跳过 ${String(skipped)} 条缺类别代码的监控项（无法按类别查询）`);
  }
  if (groups.length === 0) {
    log.warn('类别监控：监控项都缺类别代码，无法按类别查询');
    return { checked: 0, hits: [] };
  }

  let store = start;
  const rows: HitRow[] = [];

  for (const group of groups) {
    const classes = await fetchCategoryAll(group.category);
    if (classes === null) {
      // 这一类压根没查成：如实标 fail，**不要**标 notfound —— 那会让用户以为课没了
      for (const it of group.items) {
        rows.push({ teachingClassID: it.teachingClassID, remain: null, kind: 'fail' });
        const applied = applyCheck(store, it.teachingClassID, null, Date.now(), '按类别查询失败');
        store = applied.store;
        saveMonitorStore(store);
      }
      continue;
    }

    const index = new Map<string, BkxkClass>();
    for (const c of classes) index.set(c.teachingClassID, c);

    for (const it of group.items) {
      const cls = index.get(it.teachingClassID);
      const remain = cls === undefined ? null : remainOf(cls);
      const applied =
        cls === undefined
          ? applyCheck(store, it.teachingClassID, null, Date.now(), '按类别查询未找到该教学班')
          : applyCheck(store, it.teachingClassID, remain, Date.now());
      store = applied.store;
      saveMonitorStore(store);
      rows.push({
        teachingClassID: it.teachingClassID,
        remain,
        kind: cls === undefined ? 'notfound' : 'ok',
      });
    }
  }

  return { checked: rows.length, hits: hitsOf(rows) };
}

/** 登录态失效：停轮询 + 报出来。返回是否确实是登录态问题 */
function noteAuthLost(kind: RespKind): boolean {
  if (kind !== RESP_KIND.UNAUTHENTICATED) return false;
  stopPolling();
  log.error('登录态失效，已停止监控轮询');
  panel?.toast('登录态失效，已停止监控，请刷新页面重新登录', 'error');
  return true;
}

function nameOf(store: MonitorStore, tcId: string): string {
  const m = byId(store, tcId);
  if (m === null || m.courseName === '') return tcId;
  return m.courseName;
}

async function afterCheck(res: PollResult): Promise<void> {
  if (res.hits.length === 0) return;

  const withCount = addHitCount(loadMonitorStore(), res.hits.length);
  saveMonitorStore(withCount);

  const summary = hitSummaryText(res.hits, (tcId) => nameOf(withCount, tcId));
  log.info(`监控命中余量：${summary}`);
  panel?.toast(`发现余量：${summary}`, 'success');

  if (!isEnabled(SITE_ID, TOGGLE.WRITE_API)) {
    log.warn('监控命中余量，但写接口总开关未开启，只提醒不自动抢');
    return;
  }

  for (const row of res.hits) {
    // 逐条重读：用户可能在提醒弹出后、抢之前手动把这条移除了
    const item = byId(loadMonitorStore(), row.teachingClassID);
    if (item === null) continue;
    await grabNow(item);
  }
}

export interface GrabResult {
  readonly ok: boolean;
  /** `''` 成功；否则是 `write-disabled` / `no-session` / `no-category` / 响应 kind / `exception` */
  readonly reason: string;
  readonly msg?: string;
}

/**
 * 立刻抢一条（监控命中时自动调用，也可由标签页手动触发）。
 *
 * 失败**不在本地重试**：交给下一轮轮询重新判断余量，避免对同一门课死循环猛打。
 */
export async function grabNow(item: MonitorItem): Promise<GrabResult> {
  if (!isEnabled(SITE_ID, TOGGLE.WRITE_API)) return { ok: false, reason: 'write-disabled' };

  const ctx = bkxkContext();
  if (ctx.batchCode === '' || ctx.studentCode === '') return { ok: false, reason: 'no-session' };
  if (item.category === '') return { ok: false, reason: 'no-category' };

  const body = buildVolunteerBody({
    studentCode: ctx.studentCode,
    electiveBatchCode: ctx.batchCode,
    teachingClassId: item.teachingClassID,
    campus: ctx.campus,
    teachingClassType: item.category,
  });

  try {
    const r = await bkxkSend({
      url: endpointUrl(EP.VOLUNTEER, pageOrigin()),
      action: `监控自动抢 ${item.teachingClassID}`,
      method: 'POST',
      body,
      token: ctx.token,
      priority: PRIORITY.MONITOR_HIT,
    });

    if (r.cls.kind === RESP_KIND.OK) {
      const name = item.courseName === '' ? item.teachingClassID : item.courseName;
      log.info(`监控自动抢成功 ${name}`);
      panel?.toast(`监控抢到：${name}`, 'success');
      const removed = removeMonitorItem(loadMonitorStore(), item.teachingClassID);
      if (removed.removed) saveMonitorStore(removed.store);
      return { ok: true, reason: '' };
    }

    const msg = r.cls.msg === '' ? r.cls.kind : r.cls.msg;
    updateMonitor((s) => patchMonitor(s, item.teachingClassID, { lastMsg: msg }));
    log.warn(`监控自动抢未成功（${r.cls.kind}）：${msg}`);
    noteAuthLost(r.cls.kind);
    return { ok: false, reason: r.cls.kind, msg };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    log.warn(`监控自动抢请求异常：${item.teachingClassID}`, err);
    return { ok: false, reason: 'exception', msg: text };
  }
}

// -------------------------------------------------------------- 测试钩子

/** 仅供档 1 冒烟：把运行时状态置回初值。生产代码不要调用 */
export function __resetMonitorRuntime(): void {
  polling = false;
  timer = null;
  wake = null;
  lastPollAt = null;
  pollCount = 0;
  panel = null;
  listeners.clear();
}

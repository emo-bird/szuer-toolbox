/**
 * 余量监控的**纯函数层**：模式归一、命中判定、落盘形状、展示文案。
 *
 * 与 `tasks-model.ts` 同一套分层理由：命中判定（`remain > 0` 才算命中）和
 * 「缺类别的项在类别模式下必须跳过」这两条一旦写错，表现是**静默的**——
 * 要么永远不提醒，要么按固定间隔一直打服务器。所以抽出来跑档 1。
 *
 * ⚠️ 逐字对齐旧仓库 `monitor.js` 的地方：
 *   · `remain` 为 `null`（查不到 / 缺字段 / 非法）**绝不能当 0**，也不能当命中
 *     （`monitor.js:287-294`：只有 `remain !== null && remain > 0` 才 `hits += 1`）。
 *   · 类别模式下一次拉**该类全部分页**再比对，而不是逐个教学班单独查容量
 *     —— 逐个查会把请求数放大到「监控条数 × 轮询次数」。
 *   · 抢到之后**立刻移出监控**（`monitor.js:337-371`），否则下一轮还会命中同一条。
 *
 * ⚠️ 红线：本模块只处理课程与教学班信息，不碰 token / cookie / 学号（R3）。
 */

import type { MonitorItem, MonitorStore } from './list-model.ts';
import { readMonitorStore } from './list-model.ts';

// ---------------------------------------------------------------- 模式

/** 监控模式。字面值与旧仓库 `monitor.js:20` 一致，也与设置项 `monitorMode` 的取值一致 */
export const MONITOR_MODE = {
  /** 逐个教学班查 `capacity.do` */
  SINGLE: 'single',
  /** 按类别的列表接口整页拉，再在本地比对 */
  CATEGORY: 'category',
} as const;

export type MonitorMode = (typeof MONITOR_MODE)[keyof typeof MONITOR_MODE];

export const MONITOR_MODE_NAME: Readonly<Record<string, string>> = {
  category: '按类别（列表接口整页拉，请求少）',
  single: '逐个教学班（capacity 接口，直观但请求多）',
};

/** 不认识的值一律回落 `category`（与设置项 `default: 'category'` 一致） */
export function normalizeMonitorMode(v: unknown): MonitorMode {
  return v === MONITOR_MODE.SINGLE ? MONITOR_MODE.SINGLE : MONITOR_MODE.CATEGORY;
}

export function monitorModeLabel(v: string): string {
  return MONITOR_MODE_NAME[v] ?? v;
}

// ---------------------------------------------------------------- 分页预算

/** 类别模式一次最多拉几页（旧仓库 `monitor.js:214-215` 的 `MAX_PAGES`） */
export const MAX_PAGES = 4;
/** 单页条数（旧仓库同处的 `PAGE_SIZE`） */
export const PAGE_SIZE = 50;

// ---------------------------------------------------------------- 纯判定

/**
 * 监控项到「查什么」的分组。
 *
 * ⚠️ **缺类别的项会被丢掉**（旧仓库 `monitor.js:246-252` 的 `if (!cat) continue`）。
 * 这是有意的：类别模式下没有类别码就无从查起，硬塞一个默认类别会查到**别的**课的余量，
 * 比不查更糟。返回的 `skipped` 让调用方能如实告诉用户「跳过了几条」。
 */
export interface CategoryGroup {
  readonly category: string;
  readonly items: readonly MonitorItem[];
}

export function groupByCategory(items: readonly MonitorItem[]): {
  groups: readonly CategoryGroup[];
  skipped: number;
} {
  const map = new Map<string, MonitorItem[]>();
  let skipped = 0;
  for (const it of items) {
    if (it.category === '') {
      skipped += 1;
      continue;
    }
    const bucket = map.get(it.category);
    if (bucket === undefined) map.set(it.category, [it]);
    else bucket.push(it);
  }
  const groups: CategoryGroup[] = [];
  for (const [category, group] of map) groups.push({ category, items: group });
  return { groups, skipped };
}

export interface HitRow {
  readonly teachingClassID: string;
  readonly remain: number | null;
  /** 这一条的来源状态：`ok` 查到了、`notfound` 该类列表里没这个教学班、`nobatch`/`unauthenticated` 等是失败 */
  readonly kind: string;
  readonly msg?: string;
}

/**
 * 命中筛选：**只有查到了、且余量 > 0** 才算命中。
 * `null`（未查到）不是命中，`0` 也不是命中。
 */
export function hitsOf(rows: readonly HitRow[]): readonly HitRow[] {
  return rows.filter((r) => r.remain !== null && r.remain > 0);
}

/** 余量的展示文案。`null` 一律显示「未知」，**不要显示 0** —— 「未知」和「没余量」是两件事 */
export function remainText(remain: number | null): string {
  if (remain === null) return '未知';
  if (remain <= 0) return '无余量';
  return `余 ${String(remain)}`;
}

/** 余量对应的样式类后缀（`monitor-style.ts` 按 `sztb-bkxk-rm-<key>` 上色） */
export function remainKey(remain: number | null): string {
  if (remain === null) return 'unknown';
  if (remain > 0) return 'has';
  return 'none';
}

// ---------------------------------------------------------------- 存储形状

/**
 * 规范化从 storage 读到的任意值。
 * `readMonitorStore` 已经做了字段级兜底（非法 `remain` → `null`），这里只补
 * 「`hits` / `hitCount` 必须是非负整数」这一层，避免坏数据把界面显示成 `-3 次`。
 */
export function normalizeMonitorStore(raw: unknown): MonitorStore {
  const base = readMonitorStore(raw);
  return {
    items: base.items.map((m) => ({ ...m, hits: nonNegativeInt(m.hits) })),
    hitCount: nonNegativeInt(base.hitCount),
  };
}

function nonNegativeInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

/** 落盘形状（旧仓库 `monitor.js:41-47`）：字段逐个对齐，`{ items, hitCount }` */
export function slimMonitor(store: MonitorStore): MonitorStore {
  return {
    items: store.items.map((m) => ({
      teachingClassID: m.teachingClassID,
      courseName: m.courseName,
      teacherName: m.teacherName,
      teachingPlace: m.teachingPlace,
      category: m.category,
      remain: m.remain,
      checkedAt: m.checkedAt,
      hits: m.hits,
      lastMsg: m.lastMsg,
    })),
    hitCount: nonNegativeInt(store.hitCount),
  };
}

// ---------------------------------------------------------------- 变更（纯变换）

/**
 * 把一次检查结果写回某条监控项（旧仓库 `monitor.js:287-294` 的 `_apply`）。
 *
 * 命中才 `hits += 1`；`checkedAt` 每次都更新（**包括查不到的情况**，
 * 否则界面上会分不清「刚查过没余量」和「很久没查」）。
 */
export function applyCheck(
  store: MonitorStore,
  tcId: string,
  remain: number | null,
  nowMs: number,
  lastMsg?: string,
): { store: MonitorStore; hit: boolean } {
  let hit = false;
  let changed = false;
  const items = store.items.map((m) => {
    if (m.teachingClassID !== tcId) return m;
    changed = true;
    const isHit = remain !== null && remain > 0;
    if (isHit) hit = true;
    return {
      ...m,
      remain,
      checkedAt: nowMs,
      hits: isHit ? m.hits + 1 : m.hits,
      ...(lastMsg === undefined ? {} : { lastMsg }),
    };
  });
  return changed ? { store: { ...store, items }, hit } : { store, hit: false };
}

/** 记一次命中总数（旧仓库 `monitor.js:305-331`：命中时 `hitCount += hits.length`） */
export function addHitCount(store: MonitorStore, n: number): MonitorStore {
  if (n <= 0) return store;
  return { ...store, hitCount: nonNegativeInt(store.hitCount) + n };
}

/** 移出一条（抢到之后立刻调，旧仓库 `monitor.js:360` 的 `M.remove`） */
export function removeMonitorItem(
  store: MonitorStore,
  tcId: string,
): { store: MonitorStore; removed: boolean } {
  const items = store.items.filter((m) => m.teachingClassID !== tcId);
  if (items.length === store.items.length) return { store, removed: false };
  return { store: { ...store, items }, removed: true };
}

export function clearMonitor(): MonitorStore {
  return { items: [], hitCount: 0 };
}

/** 改一条的若干字段；tcId 不存在时**原样返回同一个 store 引用**（便于判等） */
export function patchMonitor(
  store: MonitorStore,
  tcId: string,
  patch: Partial<MonitorItem>,
): MonitorStore {
  let hit = false;
  const items = store.items.map((m) => {
    if (m.teachingClassID !== tcId) return m;
    hit = true;
    return { ...m, ...patch };
  });
  return hit ? { ...store, items } : store;
}

/** 重置命中计数与上次检查时间，**不动监控列表本身** */
export function resetMonitorStats(store: MonitorStore): MonitorStore {
  return {
    items: store.items.map((m) => ({ ...m, hits: 0, remain: null, checkedAt: null, lastMsg: '' })),
    hitCount: 0,
  };
}

// ---------------------------------------------------------------- 展示文案

export function byId(store: MonitorStore, tcId: string): MonitorItem | null {
  return store.items.find((m) => m.teachingClassID === tcId) ?? null;
}

/** 上次检查时间 → `刚刚` / `12 秒前` / `3 分钟前` / `从未` */
export function checkedAgoText(checkedAt: number | null, nowMs: number): string {
  if (checkedAt === null || checkedAt <= 0) return '从未';
  const delta = nowMs - checkedAt;
  if (delta < 0) return '刚刚';
  if (delta < 3000) return '刚刚';
  if (delta < 60000) return `${String(Math.floor(delta / 1000))} 秒前`;
  if (delta < 3600000) return `${String(Math.floor(delta / 60000))} 分钟前`;
  return `${String(Math.floor(delta / 3600000))} 小时前`;
}

/** 顶栏一句话摘要，例如 `3 条监控（命中 2 次，最近 12 秒前）` */
export function summaryText(store: MonitorStore, nowMs: number): string {
  const n = store.items.length;
  if (n === 0) return '监控列表为空';
  const last = store.items.reduce<number | null>((acc, m) => {
    if (m.checkedAt === null) return acc;
    return acc === null || m.checkedAt > acc ? m.checkedAt : acc;
  }, null);
  return `${String(n)} 条监控（累计命中 ${String(store.hitCount)} 次，最近检查 ${checkedAgoText(last, nowMs)}）`;
}

/** 命中弹窗/日志用的一句话，例如 `高等数学 余 3；大学物理 余 1` */
export function hitSummaryText(rows: readonly HitRow[], nameOf: (tcId: string) => string): string {
  return rows
    .map((r) => `${nameOf(r.teachingClassID)} ${remainText(r.remain)}`)
    .join('；');
}

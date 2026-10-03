/**
 * bkxk 容量监控（旧仓库 `C:\Project\szu_bkxk\src\monitor.js` 的移植）。
 *
 * 【两种模式（用户指定，默认类别）】
 *   单独监控 single   —— 逐个教学班查 `teachingclass/capacity.do`，精确、报文极小
 *   类别监控 category —— 拉该类别列表（programCourse.do 等），一次拿到一类里所有教学班的余量
 *
 * 【命中后】写接口开启则自动抢（`PRIORITY.MONITOR_HIT` 最高优先级插队）；关闭则只提醒。
 *
 * 【安全】所有请求过公共串行限流队列；轮询只在用户显式点「开始监控」后启动（红线 R5）。
 * 轮询运行状态**刻意不落盘** —— 刷新页面后不自动续跑。
 *
 * 【与旧版的差异】余量算法不再自带一份，直接用 `courses.ts` 的 `remainOfRow()`
 * （旧 `monitor.js:202` 的 `remainOfClass` 是同一口径的第二份实现，属重复代码）。
 */

import { scoped } from '../../common/core/log.ts';
import { PRIORITY } from '../../common/core/http.ts';
import { clampLimit } from '../../common/core/limits.ts';
import { getValue, isEnabled } from '../../common/core/settings.ts';
import { read, write } from '../../common/core/storage.ts';
import { pageOrigin } from '../../common/utils/page.ts';
import { BKXK_STORE_KEY } from './legacy.ts';
import { bkxkBus, notifyChanged } from './bus.ts';
import { EP, RESP_KIND, bkxkSend, buildCapacityBody, buildVolunteerBody, capacityRemain, endpointUrl } from './api.ts';
import type { CategoryCode, RespKind } from './api.ts';
import { fetchCategory, remainOfRow } from './courses.ts';
import type { TeachingClass } from './courses.ts';
import { sessionContext } from './session.ts';
import { SITE_ID, TOGGLE, VALUE } from './settings.ts';

const log = scoped('bkxk/monitor');

export const MODE = { SINGLE: 'single', CATEGORY: 'category' } as const;
export type MonitorMode = (typeof MODE)[keyof typeof MODE];

export interface MonitorItem {
  teachingClassID: string;
  courseName: string;
  teacherName: string;
  teachingPlace: string;
  category: string;
  /** 上次查到的余量；null = 还没查到或字段缺失 */
  remain: number | null;
  checkedAt: number | null;
  hits: number;
  lastMsg: string;
}

export interface MonitorInput {
  teachingClassID: string;
  courseName?: string;
  teacherName?: string;
  teachingPlace?: string;
  category?: string;
}

export function mode(): string {
  return getValue<string>(SITE_ID, VALUE.MONITOR_MODE);
}

export function intervalMs(): number {
  return clampLimit('pollIntervalMs', getValue<string>(SITE_ID, VALUE.POLL_INTERVAL_MS));
}

let items: MonitorItem[] = [];
let polling = false;
let lastPollAt: number | null = null;
let pollCount = 0;
let hitCount = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

export function list(): readonly MonitorItem[] {
  ensureLoaded();
  return items;
}

export function isPolling(): boolean {
  return polling;
}

export function stats(): { lastPollAt: number | null; pollCount: number; hitCount: number } {
  return { lastPollAt, pollCount, hitCount };
}

/**
 * 落盘。
 * 【刻意不存】轮询运行状态（刷新后不自动续跑，红线 R5）与任何凭证（红线 R3）。
 * 余量数据一并存下，刷新后界面仍能看到上次结果。
 */
export function save(): void {
  const slim = items.map((m) => ({
    teachingClassID: m.teachingClassID,
    courseName: m.courseName,
    teacherName: m.teacherName,
    teachingPlace: m.teachingPlace,
    category: m.category,
    remain: m.remain,
    checkedAt: m.checkedAt,
    hits: m.hits,
    lastMsg: m.lastMsg,
  }));
  write(BKXK_STORE_KEY.MONITOR, { items: slim, hitCount });
  notifyChanged('monitor');
}

interface StoredMonitorShape {
  items?: ReadonlyArray<Partial<MonitorItem>>;
  hitCount?: number;
}

/** 加载。幂等。刷新后一律不处于轮询态。 */
export function load(): number {
  if (loaded) return items.length;
  loaded = true;
  const data = read<StoredMonitorShape | null>(BKXK_STORE_KEY.MONITOR, null);
  if (data === null || !Array.isArray(data.items)) return 0;

  items = data.items
    .map(
      (m): MonitorItem => ({
        teachingClassID: String(m.teachingClassID ?? ''),
        courseName: m.courseName ?? '',
        teacherName: m.teacherName ?? '',
        teachingPlace: m.teachingPlace ?? '',
        category: m.category ?? '',
        remain: typeof m.remain === 'number' ? m.remain : null,
        checkedAt: typeof m.checkedAt === 'number' ? m.checkedAt : null,
        hits: typeof m.hits === 'number' ? m.hits : 0,
        lastMsg: m.lastMsg ?? '',
      }),
    )
    .filter((m) => m.teachingClassID !== '');

  hitCount = typeof data.hitCount === 'number' ? data.hitCount : 0;
  polling = false;
  if (items.length > 0) log.info(`已恢复 ${items.length} 个监控项`);
  return items.length;
}

function ensureLoaded(): void {
  if (!loaded) load();
}

export function has(tcId: string): boolean {
  ensureLoaded();
  return items.some((m) => m.teachingClassID === tcId);
}

export function byId(tcId: string): MonitorItem | null {
  ensureLoaded();
  return items.find((m) => m.teachingClassID === tcId) ?? null;
}

/** 加入监控。已在列表里返回 null（调用方据此提示「已存在」） */
export function add(info: MonitorInput): MonitorItem | null {
  ensureLoaded();
  if (info.teachingClassID === '' || has(info.teachingClassID)) return null;
  const rec: MonitorItem = {
    teachingClassID: info.teachingClassID,
    courseName: info.courseName ?? '',
    teacherName: info.teacherName ?? '',
    teachingPlace: info.teachingPlace ?? '',
    category: info.category ?? '',
    remain: null,
    checkedAt: null,
    hits: 0,
    lastMsg: '',
  };
  items.push(rec);
  save();
  log.info(`加入监控 ${rec.teachingClassID}`, rec.courseName);
  return rec;
}

export function remove(tcId: string): boolean {
  ensureLoaded();
  const i = items.findIndex((m) => m.teachingClassID === tcId);
  if (i < 0) return false;
  items.splice(i, 1);
  save();
  return true;
}

export function clear(): void {
  ensureLoaded();
  items = [];
  hitCount = 0;
  save();
}

// -------------------------------------------------------------- 检查

export interface PollRow {
  teachingClassID: string;
  remain: number | null;
  kind: string;
}

export interface PollResult {
  checked: number;
  hits: PollRow[];
}

/**
 * 轮询期间发现登录态失效：立刻停掉轮询并上报。
 * 不停的话会按 `pollIntervalMs` 一直空转打服务器、刷日志，而用户完全不知道需要去重新登录。
 */
function noteAuthLost(kind: RespKind): boolean {
  if (kind !== RESP_KIND.UNAUTHENTICATED) return false;
  stopPolling();
  bkxkBus.emit('authExpired', { source: 'monitor' });
  return true;
}

/** 一次「检查」：依模式选择端点 */
export async function pollOnce(): Promise<PollResult> {
  ensureLoaded();
  lastPollAt = Date.now();
  pollCount += 1;
  if (items.length === 0) return { checked: 0, hits: [] };
  const res = mode() === MODE.CATEGORY ? await pollCategory() : await pollSingle();
  return afterCheck(res);
}

/** 单独监控：查一个教学班的容量。**只读，不需要写接口开关** */
export async function checkOne(tcId: string): Promise<PollRow> {
  const ctx = sessionContext();
  if (ctx.batchCode === '') {
    return { teachingClassID: tcId, remain: null, kind: 'nobatch' };
  }
  const r = await bkxkSend({
    action: `查容量 ${tcId}`,
    url: endpointUrl(EP.CAPACITY, pageOrigin()),
    method: 'POST',
    body: buildCapacityBody(tcId, ctx.batchCode),
  });
  if (r.cls.kind !== RESP_KIND.OK) {
    log.warn(`查容量失败 [${r.cls.kind}] ${r.cls.msg} | ${tcId}`);
    noteAuthLost(r.cls.kind);
    return { teachingClassID: tcId, remain: null, kind: r.cls.kind };
  }
  // 单独监控的余量口径：`mainClassCapacity - mainElectiveNumber`（`api.ts` 的 `capacityRemain`）。
  // 与列表行的 `remainOfRow()`（`classCapacity - numberOfFirstVolunteer`）**不是同一对字段**，
  // 两个端点返回的结构不同，别互相套用（用户已确认两套都保留）。
  const remain = capacityRemain(r.cls.data);
  apply(tcId, remain);
  return { teachingClassID: tcId, remain, kind: 'ok' };
}

/** 逐个检查（串行，队列本身已限流） */
async function pollSingle(): Promise<PollResult> {
  const out: PollRow[] = [];
  for (const m of items) out.push(await checkOne(m.teachingClassID));
  return { checked: out.length, hits: hitsOf(out) };
}

/** 类别监控：按类别分组拉列表，再把余量回填到对应的监控项 */
async function pollCategory(): Promise<PollResult> {
  const byCat = new Map<string, MonitorItem[]>();
  for (const m of items) {
    if (m.category === '') continue;
    const bucket = byCat.get(m.category);
    if (bucket === undefined) byCat.set(m.category, [m]);
    else bucket.push(m);
  }
  if (byCat.size === 0) {
    log.warn('类别监控：监控项都缺类别代码，无法按类别查询');
    return { checked: 0, hits: [] };
  }

  const out: PollRow[] = [];
  for (const [cat, bucket] of byCat) {
    const classes = await fetchClasses(cat);
    const index = new Map<string, TeachingClass>();
    for (const c of classes) index.set(String(c.teachingClassID ?? ''), c);
    for (const item of bucket) {
      const cls = index.get(item.teachingClassID) ?? null;
      const remain = remainOfRow(cls);
      apply(item.teachingClassID, remain);
      out.push({
        teachingClassID: item.teachingClassID,
        remain,
        kind: cls === null ? 'notfound' : 'ok',
      });
    }
  }
  return { checked: out.length, hits: hitsOf(out) };
}

/**
 * 拉一个类别的全部页（最多 `MAX_PAGES` 页，防止无限翻页）。
 *
 * 类别码来自监控项自身（当初从选课列表那一栏带过来的），所以这里只做一次窄化转换 ——
 * 监控项是用户可编辑的存储数据，理论上可能是任意字符串，站点会自己拒绝不认识的类别码。
 */
async function fetchClasses(category: string): Promise<TeachingClass[]> {
  const MAX_PAGES = 4;
  const PAGE_SIZE = 50;
  const ctx = sessionContext();
  const all: TeachingClass[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const r = await fetchCategory({
      category: category as CategoryCode,
      studentCode: ctx.studentCode,
      batchCode: ctx.batchCode,
      pageNumber: page,
      pageSize: PAGE_SIZE,
    });
    if (r.kind !== RESP_KIND.OK) {
      log.warn(`类别监控拉取失败 [${r.kind}] ${r.msg} | ${category}`);
      noteAuthLost(r.kind);
      return all;
    }
    all.push(...r.classes);
    if (r.classes.length < PAGE_SIZE) return all;
  }
  return all;
}

function apply(tcId: string, remain: number | null): void {
  const item = byId(tcId);
  if (item === null) return;
  item.remain = remain;
  item.checkedAt = Date.now();
  if (remain !== null && remain > 0) item.hits += 1;
  save();
}

function hitsOf(rows: readonly PollRow[]): PollRow[] {
  return rows.filter((r) => r.remain !== null && r.remain > 0);
}

/**
 * 检查完的收尾：有命中则提醒，写接口开启时自动抢。
 *
 * 【两套余量口径别混】单独监控用 `capacityRemain()`（`mainClassCapacity - mainElectiveNumber`），
 * 类别监控用 `remainOfRow()`（`classCapacity - numberOfFirstVolunteer`）。两个端点返回的结构不同，
 * 互相套用只会得到 null（用户已确认两套都保留，见 D4）。
 */
async function afterCheck(res: PollResult): Promise<PollResult> {
  const hits = res.hits;
  if (hits.length > 0) {
    hitCount += hits.length;
    save();
    const summary = hits
      .map((h) => {
        const it = byId(h.teachingClassID);
        return `${it !== null && it.courseName !== '' ? it.courseName : h.teachingClassID} 余量${String(h.remain)}`;
      })
      .join('；');
    log.info(`监控命中余量：${summary}`);
    bkxkBus.emit('toast', { msg: `发现余量：${summary}`, kind: 'success' });

    if (!isEnabled(SITE_ID, TOGGLE.WRITE_API)) {
      log.warn('监控命中余量，但写接口未开启，只提醒不自动抢');
    } else {
      // 依次自动抢（队列会串行化，不会同时打服务器）
      for (const h of hits) {
        const item = byId(h.teachingClassID);
        if (item !== null) await grabNow(item);
      }
    }
  }
  return res;
}

/**
 * 监控命中后立即抢一次（走 `MONITOR_HIT` 最高优先级插队）。
 * 失败不在这里重试 —— 交给下一轮轮询再判断，避免死循环。
 */
export async function grabNow(item: MonitorItem): Promise<{ ok: boolean; reason: string }> {
  if (!isEnabled(SITE_ID, TOGGLE.WRITE_API)) return { ok: false, reason: 'write-disabled' };
  const ctx = sessionContext();
  if (ctx.batchCode === '' || ctx.studentCode === '') return { ok: false, reason: 'no-session' };
  if (item.category === '') return { ok: false, reason: 'no-category' };

  const body = buildVolunteerBody({
    studentCode: ctx.studentCode,
    electiveBatchCode: ctx.batchCode,
    teachingClassId: item.teachingClassID,
    campus: ctx.campus,
    teachingClassType: item.category,
  });
  const r = await bkxkSend({
    action: `监控自动抢 ${item.teachingClassID}`,
    url: endpointUrl(EP.VOLUNTEER, pageOrigin()),
    method: 'POST',
    body,
    priority: PRIORITY.MONITOR_HIT,
  });
  if (r.cls.kind === RESP_KIND.OK) {
    const name = item.courseName !== '' ? item.courseName : item.teachingClassID;
    log.info(`监控自动抢成功：${name}`);
    bkxkBus.emit('toast', { msg: `监控抢到：${name}`, kind: 'success' });
    remove(item.teachingClassID);
    return { ok: true, reason: '' };
  }
  item.lastMsg = r.cls.msg !== '' ? r.cls.msg : r.cls.kind;
  log.warn(`监控自动抢未成功 [${r.cls.kind}] ${item.lastMsg}`);
  noteAuthLost(r.cls.kind);
  return { ok: false, reason: r.cls.kind };
}

// -------------------------------------------------------------- 轮询

export function startPolling(): boolean {
  ensureLoaded();
  if (polling || items.length === 0) return false;
  polling = true;
  log.info(`开始监控轮询（${mode() === MODE.CATEGORY ? '类别' : '单独'}模式）`);
  bkxkBus.emit('toast', { msg: '已开始监控轮询' });
  void loop();
  return true;
}

async function loop(): Promise<void> {
  if (!polling) return;
  await pollOnce();
  if (!polling) return;
  timer = setTimeout(() => {
    void loop();
  }, intervalMs());
}

export function stopPolling(): boolean {
  const was = polling;
  polling = false;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (was) log.info('已停止监控轮询');
  return was;
}

/** 仅供测试：清空内存态（不碰存储） */
export function resetForTest(): void {
  items = [];
  polling = false;
  lastPollAt = null;
  pollCount = 0;
  hitCount = 0;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  loaded = false;
}

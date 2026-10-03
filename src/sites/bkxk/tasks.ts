/**
 * bkxk 抢课任务模型 + 执行引擎（旧仓库 `C:\Project\szu_bkxk\src\tasks.js` 的移植）。
 *
 * 【重试策略三选一（用户指定，默认 smart）】
 *   smart  —— 可重试的继续（满员 / 容量类），终结性的停并提示原因
 *   never  —— 任何失败都停
 *   always —— 任何失败都持续重试
 *
 * 【执行方式：轮转】每轮每个活跃任务各尝试一次，然后等 `retryIntervalMs` 再开下一轮。
 * 这样某门课满员狂重试时不会把其它任务饿死。所有请求都过 `common/core/http.ts` 的
 * 串行限流队列（任务用 `PRIORITY.HIGH`）。
 *
 * 【与旧版的差异（都是有意的）】
 *   1. 不再调 `NS.ui.render()` 重绘面板，改为 `bus.emit('changed')`（见 `bus.ts` 的说明）。
 *   2. 落盘从 `localStorage['szubkxk.v2.tasks']` 换成公共 GM 存储的 `bkxk:tasks`
 *      （键在 `legacy.ts` 的 `BKXK_STORE_KEY`），旧数据由批 1 的迁移原样搬过来 ——
 *      **payload 形状必须和旧版一致**（`{ seq, items }`），否则迁移过去的任务读不回来。
 *   3. `load()` 改成惰性且幂等（`ensureLoaded()`）：旧版靠 `main.js` 在固定时机调用，
 *      本框架里标签页可能在适配器 `init` 之前就挂载，谁先来都不会漏读。
 */

import { scoped } from '../../common/core/log.ts';
import { PRIORITY } from '../../common/core/http.ts';
import { clampLimit } from '../../common/core/limits.ts';
import { getValue, isEnabled } from '../../common/core/settings.ts';
import { read, write } from '../../common/core/storage.ts';
import { clamp } from '../../common/utils/misc.ts';
import { pageOrigin } from '../../common/utils/page.ts';
import { BKXK_STORE_KEY } from './legacy.ts';
import { bkxkBus, notifyChanged } from './bus.ts';
import { EP, RESP_KIND, bkxkSend, buildVolunteerBody, endpointUrl } from './api.ts';
import { sessionContext } from './session.ts';
import { SITE_ID, TOGGLE, VALUE } from './settings.ts';

const log = scoped('bkxk/tasks');

// -------------------------------------------------------------- 常量

export const MODE = { SMART: 'smart', NEVER: 'never', ALWAYS: 'always' } as const;
export type RetryMode = (typeof MODE)[keyof typeof MODE];

export const MODE_NAME: Record<RetryMode, string> = {
  smart: '智能',
  never: '失败即停',
  always: '持续重试',
};

export const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
} as const;
export type TaskStatus = (typeof STATUS)[keyof typeof STATUS];

/** 登录态失效的展示文案；同时也是「这条残留不可信」的标记来源（见 `load`） */
export const AUTH_MSG = '登录态失效，请刷新页面重新登录';
export const KIND_AUTH = 'auth';

/**
 * 业务返回文案分类。
 *
 * 【顺序重要，共三级】
 * 1. `TERMINAL_QUOTA_RE`（配额类终结）——
 *    `学分已满` / `选课门数已满` 同时含「已满」（可重试词），但它们是**配额上限**，
 *    再重试毫无意义：只会按红线 R2 的节奏反复打站点，甚至把会话打没。
 * 2. `RETRYABLE_RE` —— `已选人数超过课容量` 同时含「已选」（终结词）与「容量」，
 *    但它表达的是「满员」，必须算可重试，故可重试优先于终结性。
 * 3. `TERMINAL_RE` —— 其余终结性文案。
 */
const TERMINAL_QUOTA_RE = /学分|门数|门课/;
const RETRYABLE_RE = /已满|满员|容量|人数/;
const TERMINAL_RE =
  /已选|已添加|选中|重复|冲突|学分|门数|门课|限选|性别|年级|不允许|未开放|无权限|不在|已经存在|存在选课结果/;

export type MsgKind = 'retryable' | 'terminal' | 'unknown';

export function classifyMsg(msg: unknown): MsgKind {
  const m = msg === undefined || msg === null ? '' : String(msg);
  if (TERMINAL_QUOTA_RE.test(m)) return 'terminal';
  if (RETRYABLE_RE.test(m)) return 'retryable';
  if (TERMINAL_RE.test(m)) return 'terminal';
  return 'unknown';
}

/** 依策略判断是否应继续重试 */
export function shouldRetry(mode: RetryMode, kind: string): boolean {
  if (mode === MODE.ALWAYS) return true;
  if (mode === MODE.NEVER) return false;
  // smart：只对可重试 / 未识别继续（未识别宁可继续，便于事后补分支）
  return kind === 'retryable' || kind === 'unknown';
}

// -------------------------------------------------------------- 状态

export interface Task {
  id: string;
  seq: number;
  teachingClassID: string;
  courseName: string;
  teacherName: string;
  category: string;
  priority: number;
  enabled: boolean;
  status: TaskStatus;
  retryMode: RetryMode;
  attempts: number;
  lastMsg: string;
  lastKind: string;
  addedAt: number;
}

/** 新建任务需要的字段（`category` 必须是该教学班**所属列表**的类别，不能拿全局设置顶替） */
export interface TaskInput {
  teachingClassID: string;
  courseName?: string;
  teacherName?: string;
  category?: string;
}

export interface AttemptResult {
  /** true 表示该任务已终结（成功或按策略停止） */
  done: boolean;
}

export type StartReason = '' | 'write-disabled' | 'already-running' | 'no-task';
export interface StartResult {
  ok: boolean;
  reason: StartReason;
}

let items: Task[] = [];
let seq = 0;
let running = false;
let stopped = false;
let loaded = false;

/** 只读视图；要改字段请用下面那些函数，以便统一落盘与广播 */
export function list(): readonly Task[] {
  ensureLoaded();
  return items;
}

export function isRunning(): boolean {
  ensureLoaded();
  return running;
}

export function isStopped(): boolean {
  return stopped;
}

/**
 * 状态一有变化就落盘 + 广播。
 *
 * 旧版把面板重绘挂在这里，注释记录了原因：面板原先只靠 `if (NS.tasks.running) U.render()`
 * 的 1s 轮询刷新，于是**停止那一刻的最终状态永远显示不出来**（登录态失效会把 running
 * 置为 false，轮询随即不再渲染，用户看到的是停止前那一帧）。所以所有变更路径都必须走这里。
 */
export function save(): void {
  const slim = items.map((t) => ({
    id: t.id,
    seq: t.seq,
    teachingClassID: t.teachingClassID,
    courseName: t.courseName,
    teacherName: t.teacherName,
    category: t.category,
    priority: t.priority,
    enabled: t.enabled,
    status: t.status === STATUS.RUNNING ? STATUS.PENDING : t.status,
    retryMode: t.retryMode,
    attempts: t.attempts,
    lastMsg: t.lastMsg,
    lastKind: t.lastKind,
    addedAt: t.addedAt,
  }));
  write(BKXK_STORE_KEY.TASKS, { seq, items: slim });
  notifyChanged('tasks');
}

interface StoredTaskShape {
  seq?: number;
  items?: ReadonlyArray<Partial<Task>>;
}

/**
 * 加载。幂等：第二次调用直接返回当前条数。
 *
 * 只存配置与进度，**不存任何凭证**（红线 R3）。
 * 页面刷新时正在跑的请求会丢，故把 running 态复位为 pending。
 */
export function load(): number {
  if (loaded) return items.length;
  loaded = true;
  const data = read<StoredTaskShape | null>(BKXK_STORE_KEY.TASKS, null);
  if (data === null || !Array.isArray(data.items)) return 0;

  items = data.items
    .map((t) => {
      const id = typeof t.id === 'string' && t.id !== '' ? t.id : `t${++seq}`;
      const mode = typeof t.retryMode === 'string' ? t.retryMode : MODE.SMART;
      return {
        id,
        seq: typeof t.seq === 'number' ? t.seq : 0,
        teachingClassID: String(t.teachingClassID ?? ''),
        courseName: t.courseName ?? '',
        teacherName: t.teacherName ?? '',
        category: t.category ?? '',
        priority: typeof t.priority === 'number' ? t.priority : 0,
        enabled: t.enabled !== false,
        // 刷新前正在请求的，复位为等待
        status:
          t.status === STATUS.RUNNING ? STATUS.PENDING : (t.status ?? STATUS.PENDING),
        retryMode: Object.prototype.hasOwnProperty.call(MODE_NAME, mode)
          ? (mode as RetryMode)
          : MODE.SMART,
        attempts: typeof t.attempts === 'number' ? t.attempts : 0,
        lastMsg: t.lastMsg ?? '',
        lastKind: t.lastKind ?? '',
        addedAt: typeof t.addedAt === 'number' ? t.addedAt : Date.now(),
      } satisfies Task;
    })
    .filter((t) => t.teachingClassID !== '');

  // 上一会话残留的「登录态失效」不是任务本身的问题，刷新后可能已经重新登录。
  // 原样恢复的话，用户重新登录后的第一眼就是一条早已不成立的红色错误。
  for (const it of items) {
    if (it.lastKind !== KIND_AUTH && it.lastMsg !== AUTH_MSG) continue;
    it.lastKind = '';
    it.lastMsg = '';
    if (it.status === STATUS.FAILED) it.status = STATUS.PENDING;
  }

  seq = Math.max(typeof data.seq === 'number' ? data.seq : 0, items.length);
  if (items.length > 0) log.info(`已恢复 ${items.length} 个抢课任务`);
  return items.length;
}

function ensureLoaded(): void {
  if (!loaded) load();
}

/** 重试间隔（每轮现读设置，所以改设置立刻生效，不需要 apply 钩子） */
export function retryIntervalMs(): number {
  return clampLimit('retryIntervalMs', getValue<string>(SITE_ID, VALUE.RETRY_INTERVAL_MS));
}

/** 当前该跑的任务：勾选着且还没终结，优先级小的先试、同级按加入顺序 */
export function active(): Task[] {
  ensureLoaded();
  return items
    .filter((t) => t.enabled && (t.status === STATUS.PENDING || t.status === STATUS.RUNNING))
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.seq - b.seq));
}

export function findByTc(tcId: string): Task | null {
  ensureLoaded();
  return items.find((t) => t.teachingClassID === tcId) ?? null;
}

export function byId(id: string): Task | null {
  ensureLoaded();
  return items.find((t) => t.id === id) ?? null;
}

/**
 * 加入任务。**只入队不执行**（红线 R5：不自动启动任务）。
 * 该教学班已在列表里时返回既有任务，调用方据此提示「已存在」。
 */
export function add(info: TaskInput): Task | null {
  ensureLoaded();
  if (info.teachingClassID === '') return null;
  const exist = findByTc(info.teachingClassID);
  if (exist !== null) return exist;
  const mode = getValue<string>(SITE_ID, VALUE.RETRY_MODE);
  const task: Task = {
    id: `t${++seq}`,
    seq,
    teachingClassID: info.teachingClassID,
    courseName: info.courseName ?? '',
    teacherName: info.teacherName ?? '',
    category: info.category ?? '',
    priority: 0,
    enabled: true,
    status: STATUS.PENDING,
    retryMode: Object.prototype.hasOwnProperty.call(MODE_NAME, mode)
      ? (mode as RetryMode)
      : MODE.SMART,
    attempts: 0,
    lastMsg: '',
    lastKind: '',
    addedAt: Date.now(),
  };
  items.push(task);
  save();
  log.info(`加入抢课任务 ${task.teachingClassID}`, task.courseName);
  return task;
}

export function remove(id: string): boolean {
  ensureLoaded();
  const i = items.findIndex((t) => t.id === id);
  if (i < 0) return false;
  items.splice(i, 1);
  save();
  return true;
}

/** 勾选 / 取消勾选；重新勾选时把上次的失败态翻回待抢 */
export function toggle(id: string): boolean {
  const t = byId(id);
  if (t === null) return false;
  t.enabled = !t.enabled;
  if (t.enabled && t.status === STATUS.FAILED) t.status = STATUS.PENDING;
  save();
  return t.enabled;
}

/** 优先级：-1 最优先，1 最后；越界或非数字回落 0（旧版就是 `NS.util.clamp(p,-1,1,0)`） */
export function setPriority(id: string, p: unknown): boolean {
  const t = byId(id);
  if (t === null) return false;
  t.priority = clamp(p, -1, 1, 0);
  save();
  return true;
}

export function setRetryMode(id: string, mode: string): boolean {
  const t = byId(id);
  if (t === null) return false;
  if (!Object.prototype.hasOwnProperty.call(MODE_NAME, mode)) return false;
  t.retryMode = mode as RetryMode;
  save();
  return true;
}

export function clear(): void {
  ensureLoaded();
  items = [];
  save();
}

/** 全部复位为待抢（成功的保持不动，避免对已抢上的课重复提交） */
export function reset(): void {
  ensureLoaded();
  for (const t of items) {
    if (t.status !== STATUS.SUCCESS) t.status = STATUS.PENDING;
    t.attempts = 0;
    t.lastMsg = '';
  }
  save();
}

/**
 * 清洗**已勾选**任务的上次异常残留，让它们回到待抢。
 *
 * 为什么必须做：`active()` 只挑 pending/running。任务在「已勾选」状态下跑失败时状态被置为
 * failed（前置校验失败 / 终结性业务拒绝 / 网络异常不重试），再点「开始抢课」这些任务会被
 * `active()` 直接过滤掉，永远不再尝试。`toggle()` 只在重新勾选那一刻翻回 pending，救不了这种情况。
 *
 * 只重置 failed；success 保持不动，避免对已抢上的课重复提交。
 * @returns 被清洗的任务数
 */
export function clearStale(): number {
  ensureLoaded();
  let n = 0;
  for (const t of items) {
    if (!t.enabled || t.status !== STATUS.FAILED) continue;
    t.status = STATUS.PENDING;
    t.attempts = 0;
    t.lastMsg = '';
    t.lastKind = '';
    n += 1;
  }
  if (n > 0) save();
  return n;
}

/** 构造该任务的抢课请求体 */
export function buildBody(task: Task): string {
  const ctx = sessionContext();
  return buildVolunteerBody({
    studentCode: ctx.studentCode,
    electiveBatchCode: ctx.batchCode,
    teachingClassId: task.teachingClassID,
    campus: ctx.campus,
    teachingClassType: task.category,
  });
}

// -------------------------------------------------------------- 执行

/** 对单个任务尝试一次。`done=true` 表示该任务已终结 */
export async function attempt(task: Task): Promise<AttemptResult> {
  // 前置校验：缺关键字段就不要发请求了
  const ctx = sessionContext();
  if (ctx.batchCode === '' || ctx.studentCode === '') {
    task.status = STATUS.FAILED;
    task.lastMsg = '缺少学号或选课批次码，请在设置中补全';
    log.error('任务中止：缺少学号或 batchCode', task.teachingClassID);
    save();
    return { done: true };
  }
  if (task.category === '') {
    task.status = STATUS.FAILED;
    task.lastMsg = '未能识别该教学班的类别代码，请重新在列表中点击「添加抢课」';
    log.error('任务中止：类别未知', task.teachingClassID);
    save();
    return { done: true };
  }

  task.attempts += 1;
  task.status = STATUS.RUNNING;

  try {
    const r = await bkxkSend({
      action: `抢课 ${task.teachingClassID}`,
      url: endpointUrl(EP.VOLUNTEER, pageOrigin()),
      method: 'POST',
      body: buildBody(task),
      priority: PRIORITY.HIGH,
    });

    const kind = r.cls.kind;
    task.lastMsg = r.cls.msg;

    if (kind === RESP_KIND.OK) {
      task.status = STATUS.SUCCESS;
      save();
      log.info(`抢课成功 ${task.teachingClassID}`, task.courseName);
      return { done: true };
    }

    if (kind === RESP_KIND.UNAUTHENTICATED) {
      task.status = STATUS.FAILED;
      task.lastMsg = AUTH_MSG;
      task.lastKind = KIND_AUTH;
      stopped = true;
      save();
      log.error('登录态失效，已停止全部任务');
      bkxkBus.emit('authExpired', { source: 'tasks' });
      return { done: true };
    }

    // 只有业务响应才按文案分类；网络 / 结构异常一律 unknown（宁可继续，便于事后补分支）
    const cls: MsgKind = kind === RESP_KIND.BUSINESS ? classifyMsg(task.lastMsg) : 'unknown';
    task.lastKind = cls;
    if (shouldRetry(task.retryMode, cls)) {
      task.status = STATUS.PENDING;
      save();
      log.warn(`抢课未成功，将继续重试 [${cls}] ${task.lastMsg}`);
      return { done: false };
    }
    task.status = STATUS.FAILED;
    save();
    log.warn(`任务停止：${task.lastMsg}`);
    return { done: true };
  } catch (e) {
    // 网络 / 队列异常：按策略处理
    task.lastMsg = `请求异常：${e instanceof Error ? e.message : String(e)}`;
    task.lastKind = 'unknown';
    task.status = shouldRetry(task.retryMode, 'unknown') ? STATUS.PENDING : STATUS.FAILED;
    save();
    return { done: task.status === STATUS.FAILED };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

/** 一轮：每个活跃任务各尝试一次（串行，避免同时打服务器） */
export async function round(): Promise<void> {
  const batch = active();
  for (const task of batch) {
    if (stopped) return;
    if (!task.enabled) continue;
    await attempt(task);
  }
}

async function loop(): Promise<void> {
  if (stopped || !running) {
    running = false;
    return;
  }
  if (active().length === 0) {
    running = false;
    log.info('全部任务已结束');
    return;
  }
  await round();
  if (stopped || !running) {
    running = false;
    return;
  }
  if (active().length === 0) {
    running = false;
    log.info('全部任务已结束');
    return;
  }
  await sleep(retryIntervalMs());
  return loop();
}

/**
 * 开始执行。写接口未开启时直接拒绝（红线 R1）。
 * 只返回结果码，提示交给视图层（旧版是 ui.js 弹的）。
 */
export function start(): StartResult {
  ensureLoaded();
  if (!isEnabled(SITE_ID, TOGGLE.WRITE_API)) return { ok: false, reason: 'write-disabled' };
  if (running) return { ok: false, reason: 'already-running' };
  const cleared = clearStale();
  if (active().length === 0) return { ok: false, reason: 'no-task' };
  running = true;
  stopped = false;
  if (cleared > 0) log.info(`已重置 ${cleared} 个上次异常的任务`);
  log.info(`开始抢课，任务数 ${active().length}`);
  void loop();
  return { ok: true, reason: '' };
}

export function stop(): boolean {
  if (!running && !stopped) return false;
  stopped = true;
  running = false;
  for (const t of items) {
    if (t.status === STATUS.RUNNING) t.status = STATUS.PENDING;
  }
  save();
  log.info('已停止抢课');
  return true;
}

/** 仅供测试：清空内存态（不碰存储） */
export function resetForTest(): void {
  items = [];
  seq = 0;
  running = false;
  stopped = false;
  loaded = false;
}

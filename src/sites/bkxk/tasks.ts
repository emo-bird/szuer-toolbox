/**
 * 抢课**执行引擎**：定时轮询队列、逐条发抢课请求、按策略决定重试或停手。
 *
 * 分层：判定与落盘形状在 `tasks-model.ts`（纯函数、档 1 可测）；
 * 本文件只管三件在 node 下测不了的事 —— storage、定时器、网络。
 *
 * ⚠️ 三条红线与既有约束：
 *   1. **写接口总开关未开时拒绝开始**（`TOGGLE.WRITE_API`，risk `irreversible`）。
 *      引擎是唯一真正会改用户选课结果的地方，所以这道门禁放在**发第一次请求之前**，
 *      而不是「先跑起来，抢的时候再判断」。旧仓库 `tasks.js:395-397` 同此。
 *   2. **不能假设「点一次退选 = 一条请求」** —— 那是站点自身的缺陷
 *      （见 `docs/开发文档.md` §2.1.4）。本引擎只发抢课，不发退选。
 *   3. 日志与错误文案**不得含 token / cookie / 学号**，只许教学班 ID 与课程名（红线 R3）。
 *
 * ⚠️ 与旧仓库的**一处有意偏离**（两处前置检查会写 `lastKind`）：旧仓库不写，
 * 于是在「上一次失败留下的 lastKind 是 auth」时，`normalizeStore` 会把新写入的
 * 报错文案当成登录态残留一并抹掉，用户重启后看到一条无文案的失败任务。
 * 补上 `lastKind` 让这条文案存得住。见 `tasks-model.ts` 的 `normalizeItem`。
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
import { EP, RESP_KIND, bkxkSend, buildVolunteerBody, endpointUrl } from './api.ts';
import type { RespKind } from './api.ts';
import type { TaskItem, TaskStore } from './list-model.ts';
import {
  AUTH_MSG,
  RETRY_MODE_NAME,
  TASK_KIND,
  TASK_STATUS,
  activeTasks,
  byId,
  classifyMsg,
  clearStaleTasks,
  kindLabel,
  normalizeStore,
  patchTask,
  shouldRetry,
  slimTasks,
} from './tasks-model.ts';

const log = scoped('bkxk/tasks');

// -------------------------------------------------------------- 外部绑定

let panel: PanelApi | null = null;

/**
 * 绑定面板，用于 toast。由 `index.ts` 在 `init` 时调用。
 *
 * 为什么不让每个调用点自己 toast：`startTasks()` 会在**几轮之后**才失败
 * （登录态失效时），那时已经没有调用点的栈了，必须由引擎自己报出来。
 */
export function bindTaskPanel(p: PanelApi): void {
  panel = p;
}

const listeners = new Set<() => void>();

/**
 * 订阅「队列或状态变了」。返回退订函数。
 *
 * 为什么不用 `bus.ts`：本次只需要「引擎 → 标签页」单向刷新，加一条全局总线
 * 会让别的站点模块也能无意间触发刷新。用模块内订阅，谁订阅谁负责退订。
 */
export function subscribeTasks(fn: () => void): () => void {
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
      // 一个订阅者抛错不能让其它订阅者（另一个标签页）漏掉刷新
      log.warn('任务订阅回调抛错（已忽略）', err);
    }
  }
}

// -------------------------------------------------------------- 存储

/** 读队列：一律走 `normalizeStore`，把 `running` / 垃圾策略 / 登录态残留都收敛掉 */
export function loadTaskStore(): TaskStore {
  return normalizeStore(read<unknown>(BKXK_STORE_KEY.TASKS, null));
}

/** 写队列：落盘前必须过 `slimTasks`（`running` 不落盘） */
export function saveTaskStore(store: TaskStore): void {
  write(BKXK_STORE_KEY.TASKS, slimTasks(store));
  notify();
}

/**
 * 唯一的变更入口：读 → 变换 → 写。
 * 标签页的勾选 / 删除 / 改优先级 / 改策略都从这里走，保证落盘与广播只有一条路。
 */
export function updateTasks(fn: (store: TaskStore) => TaskStore): TaskStore {
  const next = fn(loadTaskStore());
  saveTaskStore(next);
  return next;
}

// -------------------------------------------------------------- 运行状态

let running = false;

export function isTaskRunning(): boolean {
  return running;
}

export type StartReason = 'write-disabled' | 'already-running' | 'no-task' | '';

export interface StartResult {
  readonly ok: boolean;
  readonly reason: StartReason;
  /** 本次开始后参与轮询的任务数 */
  readonly count: number;
}

/**
 * 开始抢课。
 *
 * 三道前置（顺序照旧仓库 `tasks.js:394-407`）：
 *   ① 写接口总开关 → ② 已在跑 → ③ 清洗陈旧态后队列为空
 * 然后才置 `running` 并起循环。**同步返回**，循环在后台跑。
 */
export function startTasks(): StartResult {
  if (!isEnabled(SITE_ID, TOGGLE.WRITE_API)) {
    log.warn('写接口总开关未开启，拒绝开始抢课');
    panel?.toast('写接口总开关未开启，请先到【设置】里打开', 'warn');
    return { ok: false, reason: 'write-disabled', count: 0 };
  }
  if (running) {
    return { ok: false, reason: 'already-running', count: 0 };
  }

  const stale = clearStaleTasks(loadTaskStore());
  if (stale.cleared > 0) {
    saveTaskStore(stale.store);
    log.info(`开始前清洗了 ${String(stale.cleared)} 条「已勾选但上次跑失败」的任务，它们会重新参与`);
  }

  const list = activeTasks(loadTaskStore().items);
  if (list.length === 0) {
    panel?.toast('没有可抢的任务（都没勾选，或都已抢到）', 'warn');
    return { ok: false, reason: 'no-task', count: 0 };
  }

  running = true;
  log.info(`开始抢课，任务数 ${String(list.length)}`);
  panel?.toast(`开始抢课（${String(list.length)} 条）`, 'success');
  void loop();
  return { ok: true, reason: '', count: list.length };
}

/**
 * 停止抢课。
 *
 * ⚠️ 已发出、还没回来的那条请求**不会**被取消（fetch 没有可靠的中断路径），
 * 它的结果仍会照常写回队列。这里只保证「不再开始下一轮、不再发新请求」。
 * @returns 之前是否在跑
 */
export function stopTasks(): boolean {
  if (!running) return false;
  running = false;

  const before = loadTaskStore();
  const after = slimTasks(before);
  const changed = after.items.some((t, i) => t !== before.items[i]);
  if (changed) saveTaskStore(after);
  else notify();

  log.info('已停止抢课');
  panel?.toast('已停止抢课', 'info');
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

// -------------------------------------------------------------- 循环

async function loop(): Promise<void> {
  try {
    while (running) {
      if (activeTasks(loadTaskStore().items).length === 0) {
        running = false;
        log.info('全部任务已结束');
        panel?.toast('全部任务已结束', 'info');
        return;
      }

      await round();

      if (!running) return;

      // 间隔只在**轮与轮之间**；一轮内的多条任务无额外等待（旧仓库 `tasks.js:349-363`）
      const iv = clampLimit('retryIntervalMs', getValue<unknown>(SITE_ID, VALUE.RETRY_INTERVAL_MS));
      await sleep(iv);
    }
  } catch (err) {
    // 循环里的意外异常必须让 running 落回 false，否则界面永远显示「抢课中」
    running = false;
    log.error('抢课循环异常结束', err);
    panel?.toast('抢课循环异常，已停止（详见日志）', 'error');
  } finally {
    notify();
  }
}

/** 跑一轮：快照 → 串行逐条 attempt，每条之前重查 enabled（用户可能中途取消勾选） */
async function round(): Promise<void> {
  const list = activeTasks(loadTaskStore().items);
  for (const snapshot of list) {
    if (!running) return;
    const cur = byId(loadTaskStore(), snapshot.id);
    if (cur === null || !cur.enabled) continue;
    await attempt(cur);
  }
}

// -------------------------------------------------------------- 单条尝试

function finish(id: string, patch: Partial<TaskItem>): void {
  saveTaskStore(patchTask(loadTaskStore(), id, patch));
}

async function attempt(task: TaskItem): Promise<void> {
  const ctx = bkxkContext();

  if (ctx.batchCode === '' || ctx.studentCode === '') {
    finish(task.id, {
      status: TASK_STATUS.FAILED,
      lastMsg: '缺少学号或选课批次码，请在设置中补全',
      lastKind: TASK_KIND.TERMINAL,
    });
    log.error(`抢课中止：缺少学号或批次码 ${task.teachingClassID}`);
    return;
  }

  if (task.category === '') {
    finish(task.id, {
      status: TASK_STATUS.FAILED,
      lastMsg: '未能识别该教学班的类别代码，请重新在列表中点击「添加抢课」',
      lastKind: TASK_KIND.TERMINAL,
    });
    log.error(`抢课中止：类别代码未知 ${task.teachingClassID}`);
    return;
  }

  finish(task.id, { status: TASK_STATUS.RUNNING, attempts: task.attempts + 1 });

  const body = buildVolunteerBody({
    studentCode: ctx.studentCode,
    electiveBatchCode: ctx.batchCode,
    teachingClassId: task.teachingClassID,
    campus: ctx.campus,
    teachingClassType: task.category,
  });

  let kind: RespKind;
  let msg: string;

  try {
    const r = await bkxkSend({
      url: endpointUrl(EP.VOLUNTEER, pageOrigin()),
      action: `抢课 ${task.teachingClassID}`,
      method: 'POST',
      body,
      token: ctx.token,
      priority: PRIORITY.HIGH,
    });
    kind = r.cls.kind;
    msg = r.cls.msg;
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    const retry = shouldRetry(task.retryMode, TASK_KIND.UNKNOWN);
    finish(task.id, {
      status: retry ? TASK_STATUS.PENDING : TASK_STATUS.FAILED,
      lastMsg: `请求异常：${text}`,
      lastKind: TASK_KIND.UNKNOWN,
    });
    log.warn(`抢课请求异常（${retry ? '稍后重试' : '已停手'}）：${task.teachingClassID}`, err);
    return;
  }

  if (kind === RESP_KIND.OK) {
    finish(task.id, { status: TASK_STATUS.SUCCESS, lastMsg: msg, lastKind: TASK_KIND.OK });
    const name = task.courseName === '' ? task.teachingClassID : task.courseName;
    log.info(`抢课成功 ${name}`);
    panel?.toast(`抢课成功：${name}`, 'success');
    return;
  }

  if (kind === RESP_KIND.UNAUTHENTICATED) {
    // 不停的话下一轮还会拿同一个失效 token 打服务器：空转 + 刷日志，
    // 而用户完全不知道要去重新登录（旧仓库 `tasks.js:294-303` / `monitor.js:149-154`）
    running = false;
    finish(task.id, { status: TASK_STATUS.FAILED, lastMsg: AUTH_MSG, lastKind: TASK_KIND.AUTH });
    log.error('登录态失效，已停止全部任务');
    panel?.toast('登录态失效，已停止全部任务，请刷新页面重新登录', 'error');
    // 全屏提示（用户 m00846 新需求 2）：toast 只在面板里一闪而过，
    // 用户多半正盯着选课页面本身，会以为还在这儿抢着
    panel?.alertAuthExpired();
    return;
  }

  // 只有业务性拒绝（code=2）才有可读文案可归类；其余一律 unknown（继续重试）
  const cls = kind === RESP_KIND.BUSINESS ? classifyMsg(msg) : TASK_KIND.UNKNOWN;

  if (shouldRetry(task.retryMode, cls)) {
    finish(task.id, { status: TASK_STATUS.PENDING, lastMsg: msg, lastKind: cls });
    log.warn(`抢课未成功，稍后重试（${kindLabel(cls)}）：${msg}`);
  } else {
    finish(task.id, { status: TASK_STATUS.FAILED, lastMsg: msg, lastKind: cls });
    const mode = RETRY_MODE_NAME[task.retryMode] ?? task.retryMode;
    log.warn(`抢课失败，已按「${mode}」停手（${kindLabel(cls)}）：${msg}`);
  }
}

// -------------------------------------------------------------- 测试钩子

/**
 * 仅供档 1 冒烟：把 `running` 置回初值。
 * 生产代码**不要**调用 —— 运行时状态只有 `startTasks` / `stopTasks` 能改。
 */
export function __resetTaskRuntime(): void {
  running = false;
  panel = null;
  listeners.clear();
}

/**
 * 抢课任务队列的**纯函数层**：状态机、重试判定、落盘形状、状态文案。
 *
 * 为什么单独一层：`tasks.ts` 要开定时器、发请求、碰 storage，在 node 下测不了；
 * 而这里的规则（尤其 `classifyMsg` 的**先后顺序**与 `shouldRetry` 的三分支）
 * 最容易被「顺手改一下」静默搞坏 —— 坏了的表现是「该重试的不重试」或
 * 「不该重试的一直打服务器」，两者都不会报错。所以抽出来跑档 1 冒烟。
 *
 * ⚠️ 本模块的每一条判定都**逐字对齐旧仓库 `tasks.js`**，包括看似别扭的地方：
 *   · `RETRYABLE_RE` 必须**先于** `TERMINAL_RE` 判 —— 「已选人数超过课容量」
 *     同时含「已选」与「容量」，但它表达的是「满员」，必须算可重试（`tasks.js:28-32`）。
 *   · `smart` 对 `unknown` **继续重试** —— 未识别的失败文案宁可多打几轮，
 *     也不要让用户的任务无声停掉（`tasks.js:48-49`）。
 *   · `RUNNING` **不进存储**，落盘时写回 `pending`（`tasks.js:88`）。
 *     刷新页面时正在飞的请求必丢，留着 `running` 会让任务看起来永远在跑。
 *
 * ⚠️ 红线：本模块只处理课程与教学班信息，不碰 token / cookie / 学号（R3）。
 */

import type { TaskItem, TaskStore } from './list-model.ts';
import { readTaskStore } from './list-model.ts';

// ---------------------------------------------------------------- 状态与文案

/** 任务状态。字面值与旧仓库 `tasks.js:22` 一致 */
export const TASK_STATUS = {
  /** 等待尝试（也是每轮跑完/刷新后的落点） */
  PENDING: 'pending',
  /** 正在请求。**不落盘** */
  RUNNING: 'running',
  /** 抢到了。留在队列里不删（旧仓库如此），只是不再参与轮询 */
  SUCCESS: 'success',
  /** 已按策略停手 */
  FAILED: 'failed',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/** 单条任务的重试策略。字面值与旧仓库 `tasks.js:19` 一致 */
export const RETRY_MODE = {
  SMART: 'smart',
  NEVER: 'never',
  ALWAYS: 'always',
} as const;

export type RetryMode = (typeof RETRY_MODE)[keyof typeof RETRY_MODE];

/** 策略的界面文案（旧仓库 `tasks.js:20` 的 `MODE_NAME`） */
export const RETRY_MODE_NAME: Readonly<Record<string, string>> = {
  smart: '智能',
  never: '失败即停',
  always: '持续重试',
};

/** 失败归类。`auth` 与 `ok` 不是 `classifyMsg` 的产物，是响应分类直接给的 */
export const TASK_KIND = {
  OK: 'ok',
  RETRYABLE: 'retryable',
  TERMINAL: 'terminal',
  AUTH: 'auth',
  UNKNOWN: 'unknown',
} as const;

export type TaskKind = (typeof TASK_KIND)[keyof typeof TASK_KIND];

/** 登录态失效的展示文案；同时也是落盘里「这条残留不可信」的标记来源 */
export const AUTH_MSG = '登录态失效，请刷新页面重新登录';

/**
 * 【顺序重要】可重试优先于终结性。
 * `已选人数超过课容量` 同时命中两个正则，但它表达的是「满员」⇒ 必须算可重试。
 */
const RETRYABLE_RE = /已满|满员|容量|人数/;
const TERMINAL_RE =
  /已选|已添加|选中|重复|冲突|学分|门数|门课|限选|性别|年级|不允许|未开放|无权限|不在|已经存在|存在选课结果/;

// ---------------------------------------------------------------- 纯判定

/** 把业务返回文案归成三类（旧仓库 `tasks.js:37-42`） */
export function classifyMsg(msg: string | null | undefined): TaskKind {
  const m = msg === null || msg === undefined ? '' : String(msg);
  if (RETRYABLE_RE.test(m)) return TASK_KIND.RETRYABLE;
  if (TERMINAL_RE.test(m)) return TASK_KIND.TERMINAL;
  return TASK_KIND.UNKNOWN;
}

/** 依策略判断是否继续重试（旧仓库 `tasks.js:45-50`） */
export function shouldRetry(mode: string, kind: TaskKind): boolean {
  if (mode === RETRY_MODE.ALWAYS) return true;
  if (mode === RETRY_MODE.NEVER) return false;
  // smart：只对可重试 / 未识别继续
  return kind === TASK_KIND.RETRYABLE || kind === TASK_KIND.UNKNOWN;
}

/** 认不认这个重试策略字面值（不认的一律回落到 `smart`，与旧仓库一致） */
export function isRetryMode(v: string): v is RetryMode {
  return v === RETRY_MODE.SMART || v === RETRY_MODE.NEVER || v === RETRY_MODE.ALWAYS;
}

export function normalizeRetryMode(v: string): RetryMode {
  return isRetryMode(v) ? v : RETRY_MODE.SMART;
}

/**
 * 状态收敛：`running` 与任何不认识的垃圾值都归 `pending`。
 * 与旧仓库 `tasks.js:112` 的 `status === RUNNING ? PENDING : (status || PENDING)` 等价。
 */
export function normalizeStatus(v: string): TaskStatus {
  if (v === TASK_STATUS.SUCCESS) return TASK_STATUS.SUCCESS;
  if (v === TASK_STATUS.FAILED) return TASK_STATUS.FAILED;
  return TASK_STATUS.PENDING;
}

/** 这一条现在还该不该被轮询到（旧仓库 `tasks.js:143`） */
export function isActiveTask(t: TaskItem): boolean {
  return t.enabled && (t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING);
}

/**
 * 本轮要尝试的任务，**已排好序**。
 *
 * `priority` **小的先抢**（旧仓库 `tasks.js:146-149` 是升序），同级按加入顺序 `seq`。
 * 注释写清楚是因为这里极易反转 —— 界面上的「↑ 提前」对应 priority **减 1**。
 */
export function activeTasks(items: readonly TaskItem[]): readonly TaskItem[] {
  return [...items]
    .filter((t) => isActiveTask(t))
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.seq - b.seq));
}

// ---------------------------------------------------------------- 存储形状

/** 落盘形状（旧仓库 `tasks.js:78-96`）：`RUNNING` 写回 `pending`，字段逐个对齐 */
export function slimTasks(store: TaskStore): TaskStore {
  return {
    seq: store.seq,
    items: store.items.map((t) => (t.status === TASK_STATUS.RUNNING ? { ...t, status: TASK_STATUS.PENDING } : t)),
  };
}

/**
 * 规范化从 storage 读到的任意值。
 *
 * 比 `list-model.readTaskStore` 多做三件事，都来自旧仓库 `load()`：
 *   1. `running` → `pending`（刷新时飞在半路的请求回不来）
 *   2. 不认识的重试策略 → `smart`
 *   3. **清掉「登录态失效」残留**（`tasks.js:120-128`）：上一次会话留下的
 *      「请重新登录」在用户重新登录后早已不成立，原样恢复的话第一眼就是一条假错误。
 */
export function normalizeStore(raw: unknown): TaskStore {
  const base = readTaskStore(raw);
  return { seq: base.seq, items: base.items.map((t) => normalizeItem(t)) };
}

function normalizeItem(t: TaskItem): TaskItem {
  const authResidue = t.lastKind === TASK_KIND.AUTH || t.lastMsg === AUTH_MSG;
  const status = normalizeStatus(t.status);
  return {
    ...t,
    status: authResidue && status === TASK_STATUS.FAILED ? TASK_STATUS.PENDING : status,
    retryMode: normalizeRetryMode(t.retryMode),
    ...(authResidue ? { lastMsg: '', lastKind: '' } : {}),
  };
}

// ---------------------------------------------------------------- 变更（纯变换）

export function byId(store: TaskStore, id: string): TaskItem | null {
  return store.items.find((t) => t.id === id) ?? null;
}

/** 改一条的若干字段；id 不存在时**原样返回同一个 store 引用**（便于判等） */
export function patchTask(store: TaskStore, id: string, patch: Partial<TaskItem>): TaskStore {
  let hit = false;
  const items = store.items.map((t) => {
    if (t.id !== id) return t;
    hit = true;
    return { ...t, ...patch };
  });
  return hit ? { ...store, items } : store;
}

export function setRetryMode(store: TaskStore, id: string, mode: string): TaskStore {
  if (!isRetryMode(mode)) return store;
  return patchTask(store, id, { retryMode: mode });
}

/**
 * 启停一条。**重新启用且停在 `failed` 时翻回 `pending`**（旧仓库 `tasks.js:196-203`）。
 *
 * ⚠️ 这一步救不了「已勾选状态下跑失败」的任务 —— 那些要靠 `clearStaleTasks`
 * （在【开始】时自动跑）。这里只覆盖「用户手动重新勾上」那一刻。
 * @returns 变更后的 store 与「现在是不是启用着」
 */
export function toggleTask(store: TaskStore, id: string): { store: TaskStore; enabled: boolean } {
  const t = byId(store, id);
  if (t === null) return { store, enabled: false };
  const enabled = !t.enabled;
  const next =
    enabled && t.status === TASK_STATUS.FAILED
      ? patchTask(store, id, { enabled, status: TASK_STATUS.PENDING })
      : patchTask(store, id, { enabled });
  return { store: next, enabled };
}

export function removeTask(store: TaskStore, id: string): { store: TaskStore; removed: boolean } {
  const items = store.items.filter((t) => t.id !== id);
  if (items.length === store.items.length) return { store, removed: false };
  return { store: { ...store, items }, removed: true };
}

export function clearTasks(): TaskStore {
  return { seq: 0, items: [] };
}

/**
 * 清洗「已勾选但上次跑失败了」的残留，让它们回到待抢（旧仓库 `tasks.js:380-392`）。
 *
 * 为什么必须做：`activeTasks` 只挑 pending / running。任务在勾选状态下失败时
 * 状态被置为 `failed`，再点【开始】会被直接过滤掉，**永远不再尝试** ——
 * 而 `toggleTask` 只在「重新勾选那一刻」翻回 pending，救不了这种情况。
 *
 * 只重置 `failed`；`success` 保持不动，避免对已经抢上的课重复提交。
 * @returns 新 store 与被清洗的条数
 */
export function clearStaleTasks(store: TaskStore): { store: TaskStore; cleared: number } {
  let cleared = 0;
  const items = store.items.map((t) => {
    if (!t.enabled || t.status !== TASK_STATUS.FAILED) return t;
    cleared += 1;
    return { ...t, status: TASK_STATUS.PENDING, attempts: 0, lastMsg: '', lastKind: '' };
  });
  return cleared === 0 ? { store, cleared } : { store: { ...store, items }, cleared };
}

/**
 * 全部重来：非 success 的置回 pending、`attempts` 清零、清空 `lastMsg`
 * （旧仓库 `tasks.js:232-239`。它**不清 `lastKind`**，这里也照旧）。
 */
export function resetTasks(store: TaskStore): TaskStore {
  return {
    seq: store.seq,
    items: store.items.map((t) =>
      t.status === TASK_STATUS.SUCCESS ? { ...t, attempts: 0, lastMsg: '' } : { ...t, status: TASK_STATUS.PENDING, attempts: 0, lastMsg: '' },
    ),
  };
}

// ---------------------------------------------------------------- 展示文案

const STATUS_LABEL: Readonly<Record<string, string>> = {
  pending: '待抢',
  running: '抢课中',
  success: '已抢到',
  failed: '已停止',
};

export function statusLabel(v: string): string {
  return STATUS_LABEL[v] ?? v;
}

/** 状态对应的样式类后缀（`tasks-style.ts` 里按 `sztb-bkxk-st-<key>` 上色） */
export function statusKey(v: string): string {
  if (v === TASK_STATUS.SUCCESS) return 'ok';
  if (v === TASK_STATUS.FAILED) return 'bad';
  if (v === TASK_STATUS.RUNNING) return 'run';
  return 'wait';
}

const KIND_LABEL: Readonly<Record<string, string>> = {
  ok: '正常',
  retryable: '可重试',
  terminal: '终结性',
  auth: '登录态',
  unknown: '未识别',
};

export function kindLabel(v: string): string {
  return KIND_LABEL[v] ?? v;
}

/** 顶栏一句话摘要，例如 `4 条（待抢 2 · 已抢到 1 · 已停止 1）` */
export function summaryText(items: readonly TaskItem[]): string {
  if (items.length === 0) return '队列为空';
  const count = (s: string): number => items.filter((t) => t.status === s).length;
  const parts: string[] = [];
  const pending = count(TASK_STATUS.PENDING);
  const running = count(TASK_STATUS.RUNNING);
  const success = count(TASK_STATUS.SUCCESS);
  const failed = count(TASK_STATUS.FAILED);
  if (pending > 0) parts.push(`待抢 ${String(pending)}`);
  if (running > 0) parts.push(`抢课中 ${String(running)}`);
  if (success > 0) parts.push(`已抢到 ${String(success)}`);
  if (failed > 0) parts.push(`已停止 ${String(failed)}`);
  const disabled = items.filter((t) => !t.enabled).length;
  if (disabled > 0) parts.push(`未勾选 ${String(disabled)}`);
  return `${String(items.length)} 条（${parts.join(' · ')}）`;
}

// ------------------------------------------------------------------ 优先级

/**
 * 优先级取值范围的**下界**。
 *
 * `priority` 小 = 先抢，而抢课顺序是「按优先级升序」排的（同一优先级按加入队列的先后），
 * 所以把下界从旧仓库的 0 放宽到 -9 是有意的：想插队只能靠比默认更小，
 * 若下界是 0，默认那批全是 0 的任务就**谁也没法插到谁前面**（怎么点【−】都不动）。
 *
 * 上界沿旧仓库取 9：往后排本来就可以靠「别这么早加进来」达到，
 * 不需要无限放大 —— 无限大还会让界面上的数字失去意义。
 *
 * 两侧都保住「默认 = 0」这个锚点，界面才能把数字正负翻译成「更先抢 / 更后抢」。
 */
export const PRIORITY_MIN = -9;
export const PRIORITY_MAX = 9;

/**
 * 把任意输入钳进合法区间；非数字 / `NaN` 一律当 0（默认值）。
 *
 * ⚠️ 旧仓库 `tasks.js` 用的是 `NS.util.clamp(p, -1, 1, 0)`，下界 0 会让默认队列
 * （每条都是 0）的【−】按钮彻底按不动 —— 那是真 bug，不是设计。这里改成 -9。
 */
export function clampPriority(p: unknown): number {
  const n = typeof p === 'number' ? p : Number(p);
  if (!Number.isFinite(n)) return 0;
  const i = Math.trunc(n);
  if (i < PRIORITY_MIN) return PRIORITY_MIN;
  if (i > PRIORITY_MAX) return PRIORITY_MAX;
  return i;
}

/** 改某条任务的优先级（自动钳位） */
export function setPriority(store: TaskStore, id: string, p: unknown): TaskStore {
  return patchTask(store, id, { priority: clampPriority(p) });
}

/** 优先级按钮的提示文案（`priority` 小 = 先抢，别把方向说反） */
export function priorityHint(p: number): string {
  if (p < 0) return `优先级 ${String(p)}（比默认更先抢）`;
  if (p > 0) return `优先级 ${String(p)}（比默认更后抢）`;
  return '优先级 0（默认）';
}

/** 优先级栏里那个短标签（放在【− N ＋】左侧，省地方但能一眼看懂是什么） */
export function priorityLabel(p: number): string {
  if (p < 0) return '更先抢';
  if (p > 0) return '更后抢';
  return '默认';
}

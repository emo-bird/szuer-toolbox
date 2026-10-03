/**
 * 选课列表注入的**纯函数层**：教学班 id 解析、类别推导、入队结构、按钮文案。
 *
 * 为什么单独一层：`list.ts` 要碰 `document`，在 node 下测不了；而这里的规则
 * （尤其 tcId 的四个来源、以及「未知容器不给类别」）最容易被站点的结构/样式改动
 * 静默搞坏，所以抽出来跑档 1 冒烟（`tests/suites/bkxk-list.test.ts`）。
 *
 * ⚠️ 存储结构**刻意与旧仓库一致**（`tasks` = `{seq, items}`、`monitor` = `{items, hitCount}`）。
 * 原因：批 1 的迁移把旧数据**原样**写进了这两个键（见 `legacy.ts:203-216`），
 * 换形状会让用户已经排队的任务读不出来。字段名逐条对齐旧仓库：
 *   - `tasks.js:82-92` 的落盘 slim 形状
 *   - `monitor.js:41-47` 的落盘 slim 形状
 *
 * ⚠️ 红线：本模块**只存课程与教学班信息**，不存 token / cookie / 学号（R3）。
 */

import type { CategoryCode } from './api.ts';

// ------------------------------------------------------------ 教学班 id

/**
 * 教学班 id 的形态：纯数字长整数。
 * 实测 `202620271520189001039`（21 位）；给到 15~24 位是留出年份/校区变化的余量，
 * 同时能挡掉把课程号（`5201890010`，10 位）误当教学班 id 的错。
 */
const TC_ID_RE = /^\d{15,24}$/;

/** 是不是一个合法形态的教学班 id */
export function isTcId(value: unknown): value is string {
  return typeof value === 'string' && TC_ID_RE.test(value);
}

/** 折叠空白（含换行/制表）并去掉首尾装饰（站点文案常带前导「· 」） */
export function cleanText(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  return raw.replace(/\s+/g, ' ').replace(/^[·\s]+/, '').trim();
}

/**
 * 卡片 id → 教学班 id。
 * 站点给卡片的 id 形如 `202620271520189001039_courseDiv`，这是**最稳的**
 * tcId 来源（id 一定存在，且就在卡片自己身上）。
 */
export function tcIdFromCardId(cardId: string | null | undefined): string | null {
  if (cardId === null || cardId === undefined) return null;
  const m = /^(\d+)_courseDiv$/.exec(cardId.trim());
  if (m === null) return null;
  const id = m[1];
  return isTcId(id) ? id : null;
}

/**
 * 依次尝试若干候选来源，返回第一个合法教学班 id。
 *
 * 传入顺序即优先级。`list.ts` 给的顺序是：
 *   卡片 id → 卡内 `[tcId]` 属性（退选按钮 / 选择按钮 / collection-img）
 *   → 列表行的 `a.cv-choice[tcId]`。
 * 站点这些属性大小写不统一（`tcId` vs `tcid`），取属性时一律用 `getAttribute`
 * 的两种拼写各试一次，这里只负责校验。
 */
export function pickTcId(candidates: readonly (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (isTcId(c)) return c;
  }
  return null;
}

// ------------------------------------------------------------ 列表类别

/**
 * 列表容器 id → 教学班类别代码。
 *
 * 【来源】旧仓库 `list.js:32-42`（它自己注明来源是站点 `grablessons.js` 的
 * `reloadCourseList()` 映射）。抢课报文的 `teachingClassType` 必须用**该教学班
 * 所属列表**的类别，不能用当前激活页签 —— 采样已证实多个页签的列表会同时留在
 * DOM 里（方案内页的采样里同时躺着 7 行本班课程 + 10 行方案内课程）。
 */
export const BODY_CATEGORY: Readonly<Partial<Record<string, CategoryCode>>> = {
  programBody: 'FANKC',
  unProgramBody: 'FAWKC',
  recommendBody: 'TJKC',
  publicBody: 'XGXK',
  retakeBody: 'CXKC',
  sportBody: 'TYKC',
  minorBody: 'FXKC',
  moocBody: 'MOOC',
  // 全校课程没有独立类别码，旧仓库按校公选处理（旧仓库自己标了「未实测」）
  schoolBody: 'XGXK',
};

/**
 * 未知容器返回**空串**而不是猜一个类别码。
 * 让批 4 执行时看到「类别未知」的警告，也远好过用错 `teachingClassType` 去下错单。
 */
export function categoryOfBodyId(id: string | null | undefined): CategoryCode | '' {
  if (id === null || id === undefined) return '';
  const hit = BODY_CATEGORY[id];
  return hit === undefined ? '' : hit;
}

// ------------------------------------------------------------ 入队结构

/** `tasks` 里的一条（字段与旧仓库 `tasks.js:82-92` 落盘形状一致） */
export interface TaskItem {
  readonly id: string;
  readonly seq: number;
  readonly teachingClassID: string;
  readonly courseName: string;
  readonly teacherName: string;
  readonly category: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly status: string;
  readonly retryMode: string;
  readonly attempts: number;
  readonly lastMsg: string;
  readonly lastKind: string;
  readonly addedAt: number;
}

/** `monitor` 里的一条（字段与旧仓库 `monitor.js:41-47` 落盘形状一致） */
export interface MonitorItem {
  readonly teachingClassID: string;
  readonly courseName: string;
  readonly teacherName: string;
  readonly teachingPlace: string;
  readonly category: string;
  readonly remain: number | null;
  readonly checkedAt: number | null;
  readonly hits: number;
  readonly lastMsg: string;
}

export interface TaskStore {
  readonly seq: number;
  readonly items: readonly TaskItem[];
}

export interface MonitorStore {
  readonly items: readonly MonitorItem[];
  readonly hitCount: number;
}

/** 新任务初始状态（旧仓库 `tasks.js:22` 的 `STATUS.PENDING`） */
export const TASK_STATUS_PENDING = 'pending';

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function str(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * 把存储里读到的任意值规范成 `TaskStore`。
 *
 * 容忍三种输入：旧仓库迁移来的形状、我们写的形状、以及垃圾值（返回空 store）。
 * **不认识的字段会被丢掉** —— 与旧仓库 `load()` 的行为一致。
 */
export function readTaskStore(raw: unknown): TaskStore {
  const rec = asRecord(raw);
  const rawItems = rec === null ? null : rec['items'];
  if (!Array.isArray(rawItems)) return { seq: 0, items: [] };
  const items: TaskItem[] = [];
  for (const it of rawItems) {
    const o = asRecord(it);
    if (o === null) continue;
    const teachingClassID = str(o['teachingClassID']);
    if (teachingClassID === '') continue;
    items.push({
      id: str(o['id']),
      seq: num(o['seq'], 0),
      teachingClassID,
      courseName: str(o['courseName']),
      teacherName: str(o['teacherName']),
      category: str(o['category']),
      priority: num(o['priority'], 0),
      enabled: bool(o['enabled'], true),
      status: str(o['status']) === '' ? TASK_STATUS_PENDING : str(o['status']),
      retryMode: str(o['retryMode']),
      attempts: num(o['attempts'], 0),
      lastMsg: str(o['lastMsg']),
      lastKind: str(o['lastKind']),
      addedAt: num(o['addedAt'], 0),
    });
  }
  return { seq: num(rec?.['seq'], items.length), items };
}

/** 同 `readTaskStore`，对应 `monitor` */
export function readMonitorStore(raw: unknown): MonitorStore {
  const rec = asRecord(raw);
  const rawItems = rec === null ? null : rec['items'];
  if (!Array.isArray(rawItems)) return { items: [], hitCount: 0 };
  const items: MonitorItem[] = [];
  for (const it of rawItems) {
    const o = asRecord(it);
    if (o === null) continue;
    const teachingClassID = str(o['teachingClassID']);
    if (teachingClassID === '') continue;
    items.push({
      teachingClassID,
      courseName: str(o['courseName']),
      teacherName: str(o['teacherName']),
      teachingPlace: str(o['teachingPlace']),
      category: str(o['category']),
      remain: typeof o['remain'] === 'number' && Number.isFinite(o['remain']) ? o['remain'] : null,
      checkedAt:
        typeof o['checkedAt'] === 'number' && Number.isFinite(o['checkedAt']) ? o['checkedAt'] : null,
      hits: num(o['hits'], 0),
      lastMsg: str(o['lastMsg']),
    });
  }
  return { items, hitCount: num(rec?.['hitCount'], 0) };
}

/** 一条入队输入：从 DOM 采到的、与「哪个教学班」有关的最小信息 */
export interface TargetInfo {
  readonly tcId: string;
  readonly courseName: string;
  readonly teacherName: string;
  /** 该教学班所属列表的类别码；未知时为空串 */
  readonly category: string;
  /** 上课时间地点原文（卡片上是 `title` 属性，列表行上是「上课时间地点」列） */
  readonly teachingPlace: string;
}

export interface TaskAddInput extends TargetInfo {
  readonly now: number;
  /** 取自站点配置项 `retryMode`（smart / never / always） */
  readonly retryMode: string;
}

export function hasTask(store: TaskStore, tcId: string): boolean {
  return store.items.some((t) => t.teachingClassID === tcId);
}

export function hasMonitor(store: MonitorStore, tcId: string): boolean {
  return store.items.some((m) => m.teachingClassID === tcId);
}

/**
 * 加一条抢课任务。**已在队列里则原样返回**（`added: false`），
 * 与旧仓库 `tasks.add` 的「重复加入返回空」行为一致 —— 不做去重覆盖，
 * 免得把用户调过的 retryMode / enabled 冲掉。
 */
export function addTask(store: TaskStore, input: TaskAddInput): { store: TaskStore; added: boolean } {
  if (hasTask(store, input.tcId)) return { store, added: false };
  const seq = store.seq + 1;
  const item: TaskItem = {
    id: `t${seq}`,
    seq,
    teachingClassID: input.tcId,
    courseName: cleanText(input.courseName),
    teacherName: cleanText(input.teacherName),
    category: input.category,
    priority: 0,
    enabled: true,
    status: TASK_STATUS_PENDING,
    retryMode: input.retryMode,
    attempts: 0,
    lastMsg: '',
    lastKind: '',
    addedAt: input.now,
  };
  return { store: { seq, items: [...store.items, item] }, added: true };
}

export interface MonitorAddInput extends TargetInfo {
  readonly now: number;
}

export function addMonitor(
  store: MonitorStore,
  input: MonitorAddInput,
): { store: MonitorStore; added: boolean } {
  if (hasMonitor(store, input.tcId)) return { store, added: false };
  const item: MonitorItem = {
    teachingClassID: input.tcId,
    courseName: cleanText(input.courseName),
    teacherName: cleanText(input.teacherName),
    teachingPlace: cleanText(input.teachingPlace),
    category: input.category,
    remain: null,
    checkedAt: null,
    hits: 0,
    lastMsg: '',
  };
  return { store: { ...store, items: [...store.items, item] }, added: true };
}

export function removeMonitor(
  store: MonitorStore,
  tcId: string,
): { store: MonitorStore; removed: boolean } {
  const items = store.items.filter((m) => m.teachingClassID !== tcId);
  if (items.length === store.items.length) return { store, removed: false };
  return { store: { ...store, items }, removed: true };
}

/**
 * 「添加监控」是个开关：已在列表里就移除（与旧仓库 `list.js:217-236` 一致）。
 * 抢课**不是**开关 —— 任务带重试与进度，误点一下不该把它删掉。
 */
export function toggleMonitor(
  store: MonitorStore,
  input: MonitorAddInput,
): { store: MonitorStore; on: boolean } {
  if (hasMonitor(store, input.tcId)) {
    const { store: next } = removeMonitor(store, input.tcId);
    return { store: next, on: false };
  }
  const { store: next } = addMonitor(store, input);
  return { store: next, on: true };
}

/** 按钮文案：直接反映状态，免得「蓝了不知道再点会取消」 */
export function grabButtonLabel(on: boolean): string {
  return on ? '已加抢课' : '添加抢课';
}

export function monitorButtonLabel(on: boolean): string {
  return on ? '移除监控' : '添加监控';
}

/**
 * 教师名。
 *
 * 卡片上 `.cv-info-title` 的 `title` 形如 `[39]教师N` —— 中括号里是站点自己的
 * 教师编号，只留姓名（列表页的 `.cv-teacher-col` 本来就是纯姓名，走同一个函数没坏处）。
 */
export function teacherFromTitle(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  return cleanText(raw.replace(/^\s*\[\d+\]\s*/, ''));
}

/** 教学班 id 行：站点文案习惯「教学班ID 2026…」）
 *
 * 注意刻意**不格式化**数字（旧仓库同样原样显示）——
 * 教学班 id 是要拿去核对 / 上报的，任何分隔符都会让人复制错。
 */
export function idLineText(tcId: string): string {
  return `教学班ID ${tcId}`;
}

/**
 * 从「上课时间地点」原文里取教学地点。
 *
 * 卡片上原文形如 `5-18周 星期二 1-2节 汇文楼H3-104,5-18周 星期四 3-4节 …`：
 * 取第一段（逗号前）的最后一个空白分隔词；若它看起来还是节次/周次（以「节」「周」结尾）
 * 就认为这段没写地点，返回空串 —— 宁可空着，也不要往监控记录里写「1-2节」这种假地点。
 */
export function placeFromTimeText(raw: string | null | undefined): string {
  const first = cleanText(raw).split(',')[0] ?? '';
  const tokens = first.split(' ').filter((t) => t !== '');
  const last = tokens[tokens.length - 1];
  if (last === undefined) return '';
  if (last.endsWith('节') || last.endsWith('周')) return '';
  return last;
}

/**
 * bkxk 旧数据一次性迁移。
 *
 * 旧仓库 `C:\Project\szu_bkxk` 把状态存在页面 `localStorage` 里：
 *   - `szubkxk.settings.v2`        → 设置对象
 *   - `szubkxk.v2.customCourses`   → 自定义课程数组
 *   - `szubkxk.v2.monitor`         → 监控进度
 *   - `szubkxk.v2.tasks`           → 任务队列进度
 *
 * 本模块把它们搬进公共存储（`sztb:` 命名空间）。三条原则：
 *
 *   1. **不删旧数据**。迁完只写一个标记（`migrate:bkxk:v2`），旧键原样留着当退路。
 *   2. **不替用户开危险开关**。🟠 / 🔴 开关一律保持「未设置」，让 N1 门禁生效；
 *      旧版曾开启的，只在报告里提一句（用户已拍板方案 A）。
 *   3. **不是照搬，是清洗**。只接受能识别的形状，其余丢弃并列进 skipped，
 *      避免把旧版的派生字段 / 脏数据带进新结构。
 *   4. **自定义课程写通用键**（`custom:courses`）。批 1 曾写进站点键 `bkxk:customCourses`，
 *      那是错误落点（自定义课程是跨站点数据）；已装过批 1 的机器由 `runCustomCarry()` 补搬。
 *
 * 本文件是纯函数集合，可在 Node 下直接测试；真正的 IO 在 `runMigration()` / `runCustomCarry()`。
 */

import { read, write } from '../../common/core/storage.ts';
import { scoped } from '../../common/core/log.ts';
import { CUSTOM_COURSES_KEY, LEGACY_SITE_CUSTOM_KEY, parseCustomCourses } from '../../common/custom/courses.ts';
import { TOGGLE } from './settings.ts';

const log = scoped('bkxk/legacy');

/** 旧仓库的设置键（注意：**不带** `szubkxk.v2.` 前缀） */
export const LEGACY_SETTINGS_KEY = 'szubkxk.settings.v2';
/** 旧仓库 store 的键前缀 */
export const LEGACY_STORE_PREFIX = 'szubkxk.v2.';

/** 旧 store 里实际用到的三个键（已核 `custom.js:15` / `monitor.js:30` / `tasks.js:57`） */
export const LEGACY_DATA_KEY = {
  CUSTOM_COURSES: 'customCourses',
  MONITOR: 'monitor',
  TASKS: 'tasks',
} as const;

/**
 * 新存储里对应的键。批 3 / 批 4 的监控、任务模块**都从这里 import**，
 * 不要在别处另起炉灶 —— 否则迁移写进去的东西没人读得到。
 *
 * ⚠️ **自定义课程不在这里**：它是**跨站点通用**数据（办事大厅的「我的课程表」也要读），
 * 键在 `common/custom/courses.ts` 的 `CUSTOM_COURSES_KEY`（`custom:courses`，
 * 不带站点前缀）。批 1 曾把它写进站点命名空间，那是个错误落点，见下面的搬运逻辑。
 */
export const BKXK_STORE_KEY = {
  MONITOR: 'bkxk:monitor',
  TASKS: 'bkxk:tasks',
} as const;

/**
 * 批 1 的错误落点（`bkxk:customCourses`）。
 * 只给 `runCustomCarry()` 读，**任何模块都不许往这里写**。
 */
export const BKXK_SITE_CUSTOM_KEY = LEGACY_SITE_CUSTOM_KEY;

/** 迁移完成标记 */
export const MIGRATION_FLAG_KEY = 'migrate:bkxk:v2';

/** 自定义课程搬运完成标记（与上面那个是两件事：迁移可能早就跑过了，搬运才需要补） */
export const CARRY_FLAG_KEY = 'migrate:bkxk:custom-to-common';

/**
 * 旧设置项 → 新配置项 id 的映射。
 * **只含安全项**；危险开关（写接口 / 两个 hijack）刻意不进这张表，见 `planMigration`。
 */
const SETTING_VALUE_MAP: ReadonlyArray<{ from: string; to: string; kind: 'number' | 'text'; max?: number }> = [
  { from: 'intervalMs', to: 'intervalMs', kind: 'number' },
  { from: 'retryIntervalMs', to: 'retryIntervalMs', kind: 'number' },
  { from: 'pollIntervalMs', to: 'pollIntervalMs', kind: 'number' },
  { from: 'batchCode', to: 'batchCode', kind: 'text' },
  { from: 'monitorMode', to: 'monitorMode', kind: 'text' },
  // `monitorCategory` 不在表里：这个配置项在 v0.31 被删掉（引擎自己找出要查哪些类别），
  // 迁过来只会留下一个没人读的键。老用户机上的历史键由 `registerBkxkSettings()` 清掉。
  { from: 'retryMode', to: 'retryMode', kind: 'text' },
];

/** 旧设置项 → 新开关 id。**这些只用来出提示，不写值。** */
const DANGER_TOGGLE_MAP: ReadonlyArray<{ from: string; to: string; label: string }> = [
  { from: 'writeApiEnabled', to: TOGGLE.WRITE_API, label: '写接口总开关（🔴）' },
  { from: 'hijackTimetable', to: TOGGLE.HIJACK_TIMETABLE, label: '课表注入（🟠）' },
  { from: 'hijackListConflict', to: TOGGLE.HIJACK_LIST_CONFLICT, label: '列表冲突追加（🟠）' },
];

export interface LegacySnapshot {
  /** `szubkxk.settings.v2` 的原始字符串 */
  settings: string | null;
  /** `szubkxk.v2.customCourses` 的原始字符串 */
  customCourses: string | null;
  /** `szubkxk.v2.monitor` 的原始字符串 */
  monitor: string | null;
  /** `szubkxk.v2.tasks` 的原始字符串 */
  tasks: string | null;
}

export interface PlannedEntry {
  readonly key: string;
  readonly value: unknown;
}

export interface MigrationPlan {
  /** 要写进公共存储的条目（key 为 storage 层键，不含 `sztb:` 前缀） */
  readonly entries: PlannedEntry[];
  /** 给用户看的正常流水 */
  readonly report: string[];
  /** 需要用户手动处理的提醒（危险开关、丢弃的数据） */
  readonly notices: string[];
  /** 旧数据里一无所获 */
  readonly empty: boolean;
}

/** 解析一段 JSON；失败返回 null 而不是抛错 */
function parseJson(raw: string | null): unknown {
  if (raw === null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/**
 * 生成迁移计划（纯函数）。
 *
 * @param snapshot 旧数据原文
 * @param alreadyMigrated 是否已迁移过
 */
export function planMigration(snapshot: LegacySnapshot, alreadyMigrated: boolean): MigrationPlan {
  const report: string[] = [];
  const notices: string[] = [];

  if (alreadyMigrated) {
    return { entries: [], report: ['旧数据已迁移过，本次跳过。'], notices: [], empty: true };
  }

  const entries: PlannedEntry[] = [];

  // ---- 设置项 ----
  const settings = asRecord(parseJson(snapshot.settings));
  if (settings === null && snapshot.settings !== null) {
    notices.push('旧设置 `szubkxk.settings.v2` 无法解析，已跳过。');
  }
  if (settings !== null) {
    for (const m of SETTING_VALUE_MAP) {
      const raw = settings[m.from];
      if (raw === undefined || raw === null) continue;
      if (m.kind === 'number') {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          notices.push(`旧设置 ${m.from} 的值 ${String(raw)} 不是有效正数，未迁移。`);
          continue;
        }
        entries.push({ key: `value:bkxk:${m.to}`, value: String(Math.floor(n)) });
      } else {
        const s = String(raw);
        if (s === '') continue; // 空串等于没设置，不必写进去覆盖默认
        entries.push({ key: `value:bkxk:${m.to}`, value: s });
      }
      report.push(`设置 ${m.from} → ${m.to}`);
    }

    // 危险开关：只报告，不写值（用户已拍板方案 A）
    for (const d of DANGER_TOGGLE_MAP) {
      if (settings[d.from] === true) {
        notices.push(
          `旧版曾开启「${d.label}」。按风险门禁约定**不会**自动为你打开，` +
            `如需继续使用请在设置页手动勾选一次。`,
        );
      }
    }
  }

  // ---- 数据块 ----
  const ccRaw = parseJson(snapshot.customCourses);
  if (ccRaw !== null) {
    if (Array.isArray(ccRaw)) {
      const slim = parseCustomCourses(ccRaw);
      const dropped = ccRaw.length - slim.length;
      // 写**通用键**（不带站点前缀）：自定义课程是跨站点数据
      entries.push({ key: CUSTOM_COURSES_KEY, value: slim });
      report.push(`自定义课程 ${slim.length} 门 → ${CUSTOM_COURSES_KEY}`);
      if (dropped > 0) notices.push(`有 ${dropped} 条自定义课程缺少 name / id，已丢弃。`);
    } else {
      notices.push('旧自定义课程不是数组，已跳过。');
    }
  }

  const blobs: ReadonlyArray<{ raw: string | null; newKey: string; label: string }> = [
    { raw: snapshot.monitor, newKey: BKXK_STORE_KEY.MONITOR, label: '监控进度' },
    { raw: snapshot.tasks, newKey: BKXK_STORE_KEY.TASKS, label: '任务进度' },
  ];
  for (const blob of blobs) {
    const parsed = parseJson(blob.raw);
    if (parsed === null) continue;
    if (asRecord(parsed) === null) {
      notices.push(`旧${blob.label}不是对象，已跳过。`);
      continue;
    }
    entries.push({ key: blob.newKey, value: parsed });
    report.push(blob.label);
  }

  if (entries.length === 0) {
    report.push('旧数据里没有可迁移的内容。');
  }

  return { entries, report, notices, empty: entries.length === 0 };
}

// -------------------------------------------- 自定义课程：站点键 → 通用键搬运

/**
 * 「把批 1 误写进站点键的自定义课程搬到通用键」的计划（纯函数）。
 *
 * 【为什么需要它】`migrate:bkxk:v2` 是**一次性**标记。已经装过批 1 的机器上，
 * 迁移早就跑完并把课程写进了 `bkxk:customCourses`；现在通用键 `custom:courses`
 * 才是正式落点 ⇒ 不做搬运的话，那些用户的课程会静默消失。
 *
 * 【为什么不覆盖】通用键里已经有内容就**放弃搬运**（只出一条提醒）：
 * 覆盖等于拿旧数据盖掉用户后来新建的课程，丢数据比重复更不可接受。
 *
 * 【旧键不删】与迁移同一原则：`bkxk:customCourses` 原样留着当退路。
 */
export interface CarryPlan {
  readonly entries: PlannedEntry[];
  readonly report: string[];
  readonly notices: string[];
  /** 没有东西可搬（含「通用键已有内容，刻意不搬」） */
  readonly empty: boolean;
}

export function planCustomCarry(siteValue: unknown, commonValue: unknown): CarryPlan {
  const rawCount = Array.isArray(siteValue) ? siteValue.length : 0;
  const site = parseCustomCourses(siteValue);
  if (site.length === 0) {
    return { entries: [], report: [], notices: [], empty: true };
  }

  const notices: string[] = [];
  if (rawCount > site.length) {
    notices.push(`站点键里有 ${rawCount - site.length} 条自定义课程缺少 name / id，搬运时丢弃。`);
  }

  const common = parseCustomCourses(commonValue);
  if (common.length > 0) {
    notices.push(
      `通用键 ${CUSTOM_COURSES_KEY} 里已有 ${common.length} 门自定义课程，` +
        `站点键里的 ${site.length} 门**未搬运**（避免覆盖）。如需保留，请自行导出后合并。`,
    );
    return { entries: [], report: [], notices, empty: true };
  }

  return {
    entries: [{ key: CUSTOM_COURSES_KEY, value: site }],
    report: [`自定义课程 ${site.length} 门：${BKXK_SITE_CUSTOM_KEY} → ${CUSTOM_COURSES_KEY}`],
    notices,
    empty: false,
  };
}

/**
 * 执行搬运（IO 入口）。**只应在 bkxk 页面上调用**（键是本工具箱自己的，与 origin 无关，
 * 但与其他早期初始化放在一起，读一次 storage 而已）。
 *
 * @returns 报告行数（0 表示无事可做）
 */
export function runCustomCarry(): string[] {
  if (read<boolean>(CARRY_FLAG_KEY, false)) return [];

  const site = read<unknown>(BKXK_SITE_CUSTOM_KEY, null);
  const common = read<unknown>(CUSTOM_COURSES_KEY, []);
  const plan = planCustomCarry(site, common);

  write(CARRY_FLAG_KEY, true);

  if (plan.empty) {
    // 没有东西可搬（或刻意不搬）：也打标记，免得每次进页面都读一遍旧键
    for (const line of plan.notices) log.warn(`搬运 · ${line}`);
    return [];
  }

  for (const e of plan.entries) write(e.key, e.value);
  log.info(`自定义课程搬运完成：${plan.report.join('；')}`);
  for (const line of plan.notices) log.warn(`搬运 · ${line}`);
  return [...plan.report, ...plan.notices];
}

/** 从页面 localStorage 读旧数据原文 */
function readLegacySnapshot(): LegacySnapshot {
  const ls = (() => {
    try {
      const w = globalThis as unknown as { unsafeWindow?: { localStorage?: Storage } };
      const pageLs = w.unsafeWindow?.localStorage;
      if (pageLs !== undefined) return pageLs;
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  })();

  if (ls === null) {
    return { settings: null, customCourses: null, monitor: null, tasks: null };
  }

  const get = (k: string): string | null => {
    try {
      return ls.getItem(k);
    } catch {
      return null;
    }
  };

  return {
    settings: get(LEGACY_SETTINGS_KEY),
    customCourses: get(LEGACY_STORE_PREFIX + LEGACY_DATA_KEY.CUSTOM_COURSES),
    monitor: get(LEGACY_STORE_PREFIX + LEGACY_DATA_KEY.MONITOR),
    tasks: get(LEGACY_STORE_PREFIX + LEGACY_DATA_KEY.TASKS),
  };
}

/**
 * 执行迁移。**只应在 bkxk 页面上调用** —— `localStorage` 按 origin 隔离，
 * 在别的站点跑读到的永远是空。
 *
 * @returns 报告行数（0 表示无事可做）
 */
export function runMigration(): string[] {
  if (read<boolean>(MIGRATION_FLAG_KEY, false)) {
    return [];
  }

  const snapshot = readLegacySnapshot();
  const plan = planMigration(snapshot, false);
  const lines: string[] = [];

  if (plan.empty && plan.notices.length === 0) {
    // 没有旧数据：也打标记，免得每次进页面都去翻一遍 localStorage
    write(MIGRATION_FLAG_KEY, true);
    log.info('未发现旧版数据，跳过迁移');
    return [];
  }

  for (const e of plan.entries) {
    write(e.key, e.value);
  }
  write(MIGRATION_FLAG_KEY, true);

  lines.push(...plan.report, ...plan.notices);
  log.info(`旧数据迁移完成：写入 ${plan.entries.length} 项`);
  for (const line of plan.report) log.info(`迁移 · ${line}`);
  for (const line of plan.notices) log.warn(`迁移 · ${line}`);

  return lines;
}

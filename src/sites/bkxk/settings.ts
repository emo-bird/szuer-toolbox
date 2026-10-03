/**
 * bkxk 的功能开关与配置项声明。
 *
 * 本文件**只声明**，不实现行为 —— 行为在后续各批的模块里（courses / list /
 * hijack / timetable / tasks / monitor）。这样设置面板可以一次做完，
 * 而后续每批只负责「读 `isEnabled` 然后干活」。
 *
 * 风险门禁（需求文档 §8.1 N1）由 `common/core/settings.ts` 的 `isEnabled` 统一兜底：
 * 🟠 / 🔴 一律强制 false，必须用户显式勾选后才生效。
 * **所以这些开关的 `default` 也一律写 false** —— 写 true 也不生效，只会让后来人
 * 误以为「这个功能默认是开着的」，是纯粹的陷阱。
 */

import { registerValue, getValue as getStoredValue } from '../../common/core/settings.ts';
import type { SiteToggleDef } from '../types.ts';
import { scoped } from '../../common/core/log.ts';
import { setIntervalMs } from '../../common/core/http.ts';
import { LIMITS, clampLimit, isBelowRecommended } from '../../common/core/limits.ts';

const log = scoped('bkxk/settings');

/** 站点 id（同时是 storage 命名空间前缀） */
export const SITE_ID = 'bkxk';

/** 开关 id 常量：调用方一律引用这里，禁止在别处写裸字符串 */
export const TOGGLE = {
  /** 🔴 写接口总开关（抢课 / 退课）。旧仓库红线 R1：默认 false，不得改 */
  WRITE_API: 'write-api',
  /** 🟠 课表注入：把自定义课程写进 teachingTime.do 的返回，交给站点原生渲染 */
  HIJACK_TIMETABLE: 'hijack-timetable',
  /** 🟠 列表冲突追加：在站点算好的 isConflict 上追加我们算出的冲突 */
  HIJACK_LIST_CONFLICT: 'hijack-list-conflict',
  /** 🟢 自绘课表 */
  TIMETABLE_SELF_DRAW: 'timetable-self-draw',
  /** 🟢 列表加列 */
  LIST_EXTRA_COLUMNS: 'list-extra-columns',
  /** 🟢 自定义课程 */
  CUSTOM_COURSES: 'custom-courses',
} as const;

export const VALUE = {
  INTERVAL_MS: 'intervalMs',
  RETRY_INTERVAL_MS: 'retryIntervalMs',
  POLL_INTERVAL_MS: 'pollIntervalMs',
  BATCH_CODE: 'batchCode',
  MONITOR_MODE: 'monitorMode',
  MONITOR_CATEGORY: 'monitorCategory',
  RETRY_MODE: 'retryMode',
} as const;

/**
 * 开关清单。
 *
 * ⚠️ 关于「课表注入」与「列表冲突追加」两项：旧脚本里它们是**默认开启**的，
 * 但在本框架里属于 🟠（会改变站点返回内容），按 N1 必须由用户显式勾选。
 * 所以 `default` 写 false，**这是有意的行为差异** —— 不要为了「贴合旧版」改回 true，
 * 也不要把它们降成 🟢 来绕过门禁。旧版用户由 `legacy.ts` 的迁移报告提示「需你手动再勾一次」。
 */
export const BKXK_TOGGLES: readonly SiteToggleDef[] = [
  {
    id: TOGGLE.WRITE_API,
    label: '写接口总开关（抢课 / 退课）',
    desc:
      '开启后才会真正提交选课与退课请求。这类操作不可撤销，且会在学校系统留痕。' +
      '默认关闭；打开时需要二次确认。',
    risk: 'irreversible',
    default: false,
    group: '选课',
  },
  {
    id: TOGGLE.HIJACK_TIMETABLE,
    label: '课表注入',
    desc:
      '把自定义课程合并进 teachingTime.do 的响应，让站点自己把它画进课表。' +
      '需要拦截页面请求，会改变站点看到的返回内容。',
    risk: 'trace',
    default: false,
    group: '课表',
  },
  {
    id: TOGGLE.HIJACK_LIST_CONFLICT,
    label: '列表冲突追加',
    desc:
      '在站点自己算好的 isConflict 之上，追加上自定义课程造成的冲突。' +
      '只追加、不清除站点原值。需要拦截页面请求。',
    risk: 'trace',
    default: false,
    group: '选课列表',
  },
  {
    id: TOGGLE.TIMETABLE_SELF_DRAW,
    label: '自绘课表',
    desc: '用工具箱自己画一份课表（含自定义课程）。关掉「课表注入」后就只剩这一份。',
    risk: 'safe',
    default: true,
    group: '课表',
  },
  {
    id: TOGGLE.LIST_EXTRA_COLUMNS,
    label: '列表加列（冲突 / 余量）',
    desc: '在选课列表里补上冲突提示与实时余量。用 flex 布局，不写死列宽。',
    risk: 'safe',
    default: true,
    group: '选课列表',
  },
  {
    id: TOGGLE.CUSTOM_COURSES,
    label: '自定义课程',
    desc: '本地维护一份不属于培养方案、但你想让它出现在课表上的课程。',
    risk: 'safe',
    default: true,
    group: '课表',
  },
];

/**
 * 注册本站的**配置项**。
 *
 * 注意：`BKXK_TOGGLES` 里的开关**不在这里注册** —— 它们随适配器的 `toggles` 字段
 * 由 `src/sites/index.ts` 的 `registerSites()` 统一灌进设置注册表（单一来源）。
 * 本函数只补适配器表达不了的东西：输入框型配置项。
 */
export function registerBkxkSettings(): void {
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.INTERVAL_MS,
    label: '请求间隔（毫秒）',
    desc: `全局串行队列里相邻两条请求的最小间隔。建议不低于 ${LIMITS.intervalMs.recommended}ms。`,
    default: String(LIMITS.intervalMs.def),
    kind: 'number',
  });
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.RETRY_INTERVAL_MS,
    label: '抢课重试间隔（毫秒）',
    desc: '一轮抢课跑完等多久再开下一轮。',
    default: String(LIMITS.retryIntervalMs.def),
    kind: 'number',
  });
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.POLL_INTERVAL_MS,
    label: '监控轮询间隔（毫秒）',
    desc: '监控模式下一轮查容量到下一轮的间隔。',
    default: String(LIMITS.pollIntervalMs.def),
    kind: 'number',
  });
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.BATCH_CODE,
    label: '选课批次码',
    desc: '留空则自动从页面会话里读取。手动填用于会话里读不到的场景。',
    default: '',
    kind: 'text',
  });
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.MONITOR_MODE,
    label: '监控模式',
    desc: 'category = 按类别盯一整类课；class = 只盯指定教学班。',
    default: 'category',
    kind: 'text',
  });
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.MONITOR_CATEGORY,
    label: '监控类别',
    desc: '类别代码之一：FANKC / FAWKC / TJKC / XGXK / CXKC / TYKC / FXKC / MOOC。',
    default: 'FANKC',
    kind: 'text',
  });
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.RETRY_MODE,
    label: '重试策略',
    desc: 'smart = 只对可能成功的失败重试；always = 一律重试；never = 不重试。',
    default: 'smart',
    kind: 'text',
  });
}

/**
 * 把配置项推进运行时（目前只有请求间隔需要）。
 *
 * 只在启动时与设置页保存后调用 —— 不调也安全，因为 `http.ts` 的默认值
 * 就取自 `LIMITS.intervalMs.def`，两者是同一个来源。
 */
export function applyBkxkSettings(): void {
  const raw = getStoredValue<string>(SITE_ID, VALUE.INTERVAL_MS);
  const ms = clampLimit('intervalMs', raw);
  if (isBelowRecommended('intervalMs', ms)) {
    log.warn(`请求间隔被设为 ${ms}ms，低于建议下限 ${LIMITS.intervalMs.recommended}ms`);
  }
  setIntervalMs(ms);
}

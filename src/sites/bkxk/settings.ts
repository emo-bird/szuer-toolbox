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
import { CATEGORIES, CATEGORY_NAME } from './api.ts';

const log = scoped('bkxk/settings');

/** 站点 id（同时是 storage 命名空间前缀） */
export const SITE_ID = 'bkxk';

/** 开关 id 常量：调用方一律引用这里，禁止在别处写裸字符串 */
export const TOGGLE = {
  /** 🔴 写接口总开关（抢课 / 退课）。旧仓库红线 R1：默认 false，不得改 */
  WRITE_API: 'write-api',
  /** 🟠 课表注入：把自定义课程写进 teachingTime.do 的返回，交给站点原生渲染（默认开） */
  HIJACK_TIMETABLE: 'hijack-timetable',
  /** 🟠 列表冲突追加：在站点算好的 isConflict 上追加我们算出的冲突（默认开） */
  HIJACK_LIST_CONFLICT: 'hijack-list-conflict',
  /** 🟢 自绘课表 */
  TIMETABLE_SELF_DRAW: 'timetable-self-draw',
  /** 🟢 列表加列 */
  LIST_EXTRA_COLUMNS: 'list-extra-columns',
  /** 🟢 列表注入（教学班ID / 抢课按钮） */
  LIST_INJECT: 'list-inject',
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
 * ⚠️ 「课表注入」与「列表冲突追加」都是 🟠（会改变站点返回内容），**v0.24 起都默认开**：
 *   - **课表注入**：只是把自定义课程并进站点课表响应，最坏情况是课表上多几门你自己的课，
 *     看得见、改得回来。用户实测后要求默认开（与旧脚本一致）。
 *   - **列表冲突追加**：旧仓库自己写过放弃接管的顾虑 —— 自定义课程一旦把大半个列表
 *     标成冲突，用户会不敢选课。用户知情后仍要求**一并默认开**（原话：「也改成默认开」），
 *     所以这里跟随课表注入。**后果是可撤销的**：关掉开关立即恢复原样，不需要刷新。
 *
 * 🟠 这一档的门禁语义已于 v0.24 放宽（见 `common/core/settings.ts`）：用户没动过时
 * 按 `default` 走，显式关过一次之后 true 不会再顶回来。只有 🔴 仍是一律强制 false。
 * 旧版用户由 `legacy.ts` 的迁移报告提示「需你手动再勾一次」。
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
      '需要拦截页面请求，会改变站点看到的返回内容。默认开启。',
    risk: 'trace',
    default: true,
    group: '课表',
  },
  {
    id: TOGGLE.HIJACK_LIST_CONFLICT,
    label: '列表冲突追加',
    desc:
      '在站点自己算好的 isConflict 之上，追加上自定义课程造成的冲突。' +
      '只追加、不清除站点原值。需要拦截页面请求，会改变站点看到的返回内容。默认开启。',
    risk: 'trace',
    default: true,
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
    id: TOGGLE.LIST_INJECT,
    label: '列表注入（教学班ID / 抢课按钮）',
    desc:
      '在选课列表的每个教学班旁补上教学班ID 与「添加抢课 / 添加监控」两个按钮。' +
      '点击只写本地队列，不发送任何请求。关掉后已注入的块会立即移除。',
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
 * 本函数只补适配器表达不了的东西：输入框 / 下拉型配置项。
 *
 * ⚠️ 凡是取值来自**有限枚举**的配置项（监控模式 / 监控类别 / 重试策略）一律用
 * `kind: 'select'` —— 旧脚本本来就是下拉（`C:\Project\szu_bkxk\src\ui.js:377,620`），
 * 换成自由文本框只会让用户打错一个字母就静默不生效。
 */
export function registerBkxkSettings(): void {
  registerInterval(VALUE.INTERVAL_MS, 'intervalMs', '请求间隔（毫秒）',
    '全局串行队列里相邻两条请求的最小间隔。');
  registerInterval(VALUE.RETRY_INTERVAL_MS, 'retryIntervalMs', '抢课重试间隔（毫秒）',
    '一轮抢课跑完等多久再开下一轮。');
  registerInterval(VALUE.POLL_INTERVAL_MS, 'pollIntervalMs', '监控轮询间隔（毫秒）',
    '监控模式下一轮查容量到下一轮的间隔。');

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.BATCH_CODE,
    label: '选课批次码',
    desc: '留空则自动从页面会话里读取（studentInfo.electiveBatch.code）。手动填用于会话里读不到的场景。',
    default: '',
    kind: 'text',
  });
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.MONITOR_MODE,
    label: '监控模式',
    desc: '决定监控怎么拿数据。类别监控请求少、粒度粗；单独监控逐课查容量、更精确但请求多。',
    default: 'category',
    kind: 'select',
    options: [
      { value: 'category', label: '类别监控（拉类别列表，一次拿一类）' },
      { value: 'single', label: '单独监控（逐课查容量，精确）' },
    ],
  });
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.MONITOR_CATEGORY,
    label: '监控类别',
    desc: '类别监控模式下盯哪一类课。方案外 / 重修 / 体育 / 辅修的端点映射尚未实测。',
    default: 'FANKC',
    kind: 'select',
    options: CATEGORIES.map((code) => ({
      value: code,
      label: `${CATEGORY_NAME[code]}（${code}）`,
    })),
  });
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.RETRY_MODE,
    label: '重试策略',
    desc: '抢课任务失败之后怎么处理。',
    default: 'smart',
    kind: 'select',
    options: [
      { value: 'smart', label: '智能 —— 只对可能成功的失败重试' },
      { value: 'never', label: '失败即停 —— 不重试' },
      { value: 'always', label: '持续重试 —— 失败一律重试' },
    ],
  });
}

/**
 * 注册一个时间参数型配置项。
 *
 * 三个时间参数共用同一套口径：同一个下限来源（`LIMITS`）、同一种「低于建议值就提示」的说法。
 * 各写一遍必然漂移，所以抽成一个函数。
 *
 * 两个钩子的分工（用户已确认的交互）：
 *   - `validate` → **失焦/回车时**在输入框下方显示一行黄字，不必等到刷新页面；
 *   - `apply`    → 立刻写进运行时，用户不用刷新就能生效。
 */
function registerInterval(
  id: string,
  key: 'intervalMs' | 'retryIntervalMs' | 'pollIntervalMs',
  label: string,
  desc: string,
): void {
  const spec = LIMITS[key];
  registerValue<string>({
    siteId: SITE_ID,
    id,
    label,
    desc: `${desc}建议不低于 ${spec.recommended}ms。`,
    default: String(spec.def),
    kind: 'number',
    validate: (raw) => {
      const ms = clampLimit(key, raw);
      if (!isBelowRecommended(key, ms)) return null;
      return (
        `低于建议下限 ${spec.recommended}ms。` +
        '校园站对高频请求零容忍，实测会被直接终止会话 —— 请自行确认风险。'
      );
    },
    // 只有请求间隔现在就有消费方（http.ts 的串行队列）；
    // 重试/轮询间隔要等批 4 的任务与监控模块，到那时再补 apply。
    ...(key === 'intervalMs' ? { apply: applyIntervalMs } : {}),
  });
}

/** 把「请求间隔」推进运行时（设置页改完立刻生效，不用刷新） */
function applyIntervalMs(raw: string): void {
  setIntervalMs(clampLimit('intervalMs', raw));
}

/**
 * 把配置项推进运行时。
 *
 * 启动时跑一次（把上次存的设置装回运行时）。设置页改动走 `ValueDef.apply` 钩子，
 * 不再依赖这个函数。
 */
export function applyBkxkSettings(): void {
  const raw = getStoredValue<string>(SITE_ID, VALUE.INTERVAL_MS);
  const ms = clampLimit('intervalMs', raw);
  if (isBelowRecommended('intervalMs', ms)) {
    log.warn(`请求间隔被设为 ${ms}ms，低于建议下限 ${LIMITS.intervalMs.recommended}ms`);
  }
  setIntervalMs(ms);
}

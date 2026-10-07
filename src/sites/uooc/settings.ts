/**
 * UOOC（优课联盟）的功能开关与配置项声明。
 *
 * 本文件**只声明**，不实现行为 —— 行为在 `video.ts` / `autoplay.ts` 等模块里。
 * 与 bkxk 的 `settings.ts` 同一套路：设置面板一次做完，后续每批只负责
 * 「读 `isEnabled` 然后干活」。
 *
 * ## 分区（用户 m01877 拍板）
 *
 * 设置项按 `group` 分成三页，分别由 `tabs/video.ts`、`tabs/autoplay.ts`、
 * `tabs/ai.ts` 渲染（`renderSiteSettings(..., { onlyGroups: [...] })`）：
 *
 *   - `视频`   —— 播放器行为（倍速 / 静音 / 防暂停）
 *   - `连播`   —— 连播行为（等待时间、跳过什么）
 *   - `AI 作答` —— 答题开关与接口配置
 *
 * ⚠️ `group` 与标签页是**一体的**：加一个分组就要在同一提交里加对应标签页，
 * 否则那一组设置会在公共【设置】页里也看不到（UOOC 已声明 `settingsInOwnTabs`，
 * 公共页整个跳过它）—— 也就是**任何入口都改不到它**。
 *
 * ## 风险门禁
 *
 * 由 `common/core/settings.ts` 的 `isEnabled` 统一兜底（需求文档 §8.1 N1）：
 *   - 🟢 safe        按声明的 `default` 走；
 *   - 🟠 trace       也按 `default` 走（v0.24 起放宽），只是「会改变站点看到的返回内容」；
 *   - 🔴 irreversible **一律强制 false**，与 `default` 写什么无关。
 * 所以 🔴 的 `default` 也一律写 false —— 写 true 不生效，只会误导后来人。
 */

import { registerValue, getValue as getStoredValue } from '../../common/core/settings.ts';
import type { SiteToggleDef } from '../types.ts';
import { scoped } from '../../common/core/log.ts';

const log = scoped('uooc/settings');

/** 站点 id（同时是 storage 命名空间前缀） */
export const SITE_ID = 'uooc';

/**
 * 分组名常量。
 *
 * 一律引用这里，禁止在别处写裸字符串 —— 分组名是**字符串等值**匹配
 * （`renderSiteSettings` 的 `onlyGroups` 用 `includes` 比），
 * 写错一个字的后果不是报错，是那一组设置静默从所有入口消失。
 */
export const GROUP = {
  /** 播放器行为（U1/U2/U4） */
  VIDEO: '视频',
  /** 连播行为（U3） */
  AUTOPLAY: '连播',
  /** AI 作答（U6–U9） */
  AI: 'AI 作答',
} as const;

/** 开关 id 常量：调用方一律引用这里，禁止在别处写裸字符串 */
export const TOGGLE = {
  /** 🟢 二倍速播放（U1） */
  RATE_2X: 'rate-2x',
  /** 🟢 静音播放（U2） */
  MUTE: 'mute',
  /** 🟢 防失焦暂停（U4） */
  KEEP_PLAYING: 'keep-playing',
  /** 🟠 自动连播（U3） */
  AUTO_NEXT: 'auto-next',
  /** 🟢 附件只路过，不打开文件（仍导航到该小节）—— 用户 m01816 需求 2 */
  SKIP_ATTACHMENT: 'skip-attachment',
  /** 🟢 文本不停留：导航过去后不等待，直接下一项 */
  SKIP_TEXT: 'skip-text',
  /** 🟢 讨论不停留、不暂停（需求细则 A.3「跳过讨论」，默认开） */
  SKIP_DISCUSSION: 'skip-discussion',
  /** 🟠 测验不自动进入：连播走到测验就停下等用户 */
  SKIP_QUIZ: 'skip-quiz',
  /** 🟠 AI 答题（U6–U9）—— 未实现，先占位 */
  AI_ANSWER: 'ai-answer',
} as const;

/** 配置项 id 常量 */
export const VALUE = {
  /** 跳到下一项**之后**等多久再处理它（ms） */
  WAIT_BEFORE_MS: 'wait-before-ms',
  /** 一项处理完、跳下一项**之前**停留多久（ms） */
  HOLD_AFTER_MS: 'hold-after-ms',
} as const;

export const UOOC_TOGGLES: readonly SiteToggleDef[] = [
  {
    id: TOGGLE.RATE_2X,
    label: '二倍速',
    desc: '锁在 2 倍速，在播放器里改回去会被扳回',
    risk: 'safe',
    default: true,
    group: GROUP.VIDEO,
  },
  {
    id: TOGGLE.MUTE,
    label: '静音',
    desc: '锁在静音，取消会被扳回',
    risk: 'safe',
    default: true,
    group: GROUP.VIDEO,
  },
  {
    id: TOGGLE.KEEP_PLAYING,
    label: '防暂停',
    desc: '暂停会被立刻恢复（含你自己按的暂停）',
    risk: 'safe',
    default: true,
    group: GROUP.VIDEO,
  },
  {
    id: TOGGLE.AUTO_NEXT,
    label: '自动连播',
    desc: '播完自动打开目录里的下一个视频',
    risk: 'trace',
    default: false,
    group: GROUP.AUTOPLAY,
  },
  {
    id: TOGGLE.SKIP_ATTACHMENT,
    label: '跳过附件',
    desc: '不打开附件文件（仍导航到该小节）。打开时会尝试在后台标签页里打开',
    risk: 'safe',
    default: true,
    group: GROUP.AUTOPLAY,
  },
  {
    id: TOGGLE.SKIP_TEXT,
    label: '跳过文本',
    desc: '文本不停留：导航过去后不等待，直接下一项',
    risk: 'safe',
    default: false,
    group: GROUP.AUTOPLAY,
  },
  {
    id: TOGGLE.SKIP_DISCUSSION,
    label: '跳过讨论',
    desc: '连播遇到讨论不提醒、不暂停，等一会儿直接继续',
    risk: 'safe',
    default: true,
    group: GROUP.AUTOPLAY,
  },
  {
    id: TOGGLE.SKIP_QUIZ,
    label: '跳过测验',
    desc: '不自动进入测验：连播走到测验就停下等你（AI 作答是另一个开关）',
    risk: 'trace',
    default: false,
    group: GROUP.AUTOPLAY,
  },
  {
    id: TOGGLE.AI_ANSWER,
    label: 'AI 答题',
    desc: '测验未完成时由脚本作答（尚未实现，开了也没用）',
    risk: 'trace',
    default: false,
    group: GROUP.AI,
  },
];

/**
 * 注册本站的**配置项**（开关不在这里 —— 它们随适配器的 `toggles` 字段
 * 由 `src/sites/index.ts` 的 `registerSites()` 统一灌进设置注册表，单一来源）。
 */
export function registerUoocSettings(): void {
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.WAIT_BEFORE_MS,
    label: '跳转后等待(ms)',
    desc: '导航到某一项之后先等这么久，再开始处理它（给页面加载与视频缓冲留时间）',
    default: '5000',
    kind: 'number',
    group: GROUP.AUTOPLAY,
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.HOLD_AFTER_MS,
    label: '播完后停留(ms)',
    desc: '一项处理完、跳下一项之前停留的时间（0 = 立刻跳）',
    default: '3000',
    kind: 'number',
    group: GROUP.AUTOPLAY,
  });
}

/** 读一个毫秒配置项；非法值回退到 `fallbackMs` 并留一条 warn */
function readMs(id: string, fallbackMs: number): number {
  const raw = getStoredValue<string>(SITE_ID, id);
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) {
    log.warn(`${id} 取值异常（${String(raw)}），按 ${fallbackMs}ms 处理`);
    return fallbackMs;
  }
  return num;
}

/** 跳到下一项**之后**等多久再处理它（ms） */
export function waitBeforeMs(): number {
  return readMs(VALUE.WAIT_BEFORE_MS, 5000);
}

/** 一项处理完、跳下一项**之前**停留多久（ms） */
export function holdAfterMs(): number {
  return readMs(VALUE.HOLD_AFTER_MS, 3000);
}

/**
 * 把配置项推进运行时（启动时跑一次）。
 *
 * 取值本身是**每次用时现读**（`waitBeforeMs` / `holdAfterMs`），所以这里只做一次
 * 存在性检查，保证拼错 id 时能在日志里立刻看见，而不是静默用默认值。
 */
export function applyUoocSettings(): void {
  waitBeforeMs();
  holdAfterMs();
}

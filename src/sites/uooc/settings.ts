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
import type { LlmConfig } from './ai/llm.ts';

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
  /** 🟢 空白片源（U10）：把原片换成等长黑画面，只省流量不省时间 */
  BLANK_VIDEO: 'blank-video',
  /** 🟠 AI 答题（U6–U9）：连播走到测验就交给它；关掉则停下等用户手动处理 */
  AI_ANSWER: 'ai-answer',
} as const;

/** 配置项 id 常量 */
export const VALUE = {
  /** 改完 `location.hash` 之后、开始等元素出现之前的固定 sleep（ms） */
  WAIT_BEFORE_MS: 'wait-before-ms',
  /** 一项处理完（`ended` 之后）停留多久再重拉课程树（ms） */
  HOLD_AFTER_MS: 'hold-after-ms',
  /** 除 API 请求本身之外，所有「等某个条件出现」的超时（ms） */
  WAIT_TIMEOUT_MS: 'wait-timeout-ms',
  /** 大模型接口根地址（OpenAI Chat Completions 兼容），如 `https://api.openai.com/v1` */
  AI_BASE_URL: 'ai-base-url',
  /** 大模型 API Key */
  AI_API_KEY: 'ai-api-key',
  /** 模型名，如 `gpt-4o-mini` */
  AI_MODEL: 'ai-model',
  /** 单次请求超时（ms） */
  AI_TIMEOUT_MS: 'ai-timeout-ms',
  /** 同时答几道题（1~8） */
  AI_CONCURRENCY: 'ai-concurrency',
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
    id: TOGGLE.BLANK_VIDEO,
    label: '空白片源',
    desc:
      '读到原片时长后立刻把片源换成等长的纯黑片段（自制的 1KB MP4），' +
      '播放进度与上报的时长/进度照旧，但不再下载原片；' +
      '只省流量不省时间（2 倍速下依然要播满一半时长），且只对本页之后加载的视频生效',
    risk: 'safe',
    default: true,
    group: GROUP.VIDEO,
  },
  {
    id: TOGGLE.AI_ANSWER,
    label: 'AI 答题',
    desc:
      '连播遇到测验脚本就在页内答题 iframe 里拉题问模型、逐题回填；' +
      '提交前会弹确认框，人机验证码要你手动点一下',
    risk: 'irreversible',
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
    desc: '改完地址栏 hash 后先等这么久，再开始等页面元素出现（给页面加载与视频缓冲留时间）',
    default: '5000',
    kind: 'number',
    group: GROUP.AUTOPLAY,
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.HOLD_AFTER_MS,
    label: '播完后停留(ms)',
    desc: '视频播放结束（ended）后停留这么久，再去重拉课程树确认完成状态',
    default: '5000',
    kind: 'number',
    group: GROUP.AUTOPLAY,
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.WAIT_TIMEOUT_MS,
    label: '全局等待超时(ms)',
    desc: '除取数请求外，所有「等某个东西出现」的超时上限（等元素、等待测验交卷……）',
    default: '30000',
    kind: 'number',
    group: GROUP.AUTOPLAY,
  });

  // ------------------------------------------------------------ AI 作答（U6–U9）

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.AI_BASE_URL,
    label: '接口地址',
    desc: 'OpenAI Chat Completions 兼容的根地址，会自动补 /chat/completions。例：https://api.openai.com/v1',
    default: '',
    kind: 'url',
    group: GROUP.AI,
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.AI_API_KEY,
    label: 'API Key',
    desc: '只存在你本机的油猴存储里。本地部署（ollama 等）不需要填',
    default: '',
    kind: 'password',
    group: GROUP.AI,
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.AI_MODEL,
    label: '模型名',
    desc: '填服务商文档里那个精确的模型 id，例：gpt-4o-mini',
    default: '',
    kind: 'text',
    group: GROUP.AI,
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.AI_TIMEOUT_MS,
    label: '超时(ms)',
    desc: '单次请求的最长等待时间；推理型模型要调大',
    default: '60000',
    kind: 'number',
    group: GROUP.AI,
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.AI_CONCURRENCY,
    label: '并发数',
    desc: '同时答几道题（1~8）。默认 1 最稳；调高容易撞到服务商的速率限制（表现为「这道题没答出来」）',
    default: '1',
    kind: 'number',
    group: GROUP.AI,
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

/** 改完 `location.hash` 之后、开始等元素出现之前的固定 sleep（ms） */
export function waitBeforeMs(): number {
  return readMs(VALUE.WAIT_BEFORE_MS, 5000);
}

/** 视频 `ended` 之后、重拉课程树之前的停留（ms） */
export function holdAfterMs(): number {
  return readMs(VALUE.HOLD_AFTER_MS, 5000);
}

/**
 * 除 API 请求本身之外，所有「等某个条件出现」的超时（ms）。
 *
 * 承载的场景：等任务点元素出现、等待视频 `ended`、等测验交卷后 `finished` 翻 1。
 * **不要**把这个值用在 `request()` 上 —— 取数请求的超时是另一套（§E.6，单次 30 秒）。
 */
export function waitTimeoutMs(): number {
  return readMs(VALUE.WAIT_TIMEOUT_MS, 30000);
}

/** 读一个字符串配置项并去掉首尾空白 */
function readText(id: string): string {
  return getStoredValue<string>(SITE_ID, id).trim();
}

/**
 * 大模型的完整配置；**配置不全时返回 null**（调用方据此给出人话提示，而不是发一个注定 404 的请求）。
 *
 * 判据只要求「地址 + 模型名」：API Key 允许为空 —— 本地 ollama / vllm 不需要，
 * 而 OpenAI 那类会直接返回 401，报错信息已经足够清楚。
 */
export function aiConfig(): LlmConfig | null {
  const baseUrl = readText(VALUE.AI_BASE_URL);
  const model = readText(VALUE.AI_MODEL);
  if (baseUrl === '' || model === '') return null;
  return {
    baseUrl,
    model,
    apiKey: readText(VALUE.AI_API_KEY),
    timeoutMs: readMs(VALUE.AI_TIMEOUT_MS, 60000),
  };
}

/** AI 作答的并发数，夹在 1~8（上限是防呆，不是性能调优） */
export function aiConcurrency(): number {
  const n = Math.floor(readMs(VALUE.AI_CONCURRENCY, 1));
  return Math.min(8, Math.max(1, n));
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
  aiConcurrency();
  // aiConfig() 允许返回 null（还没配），所以这里只报一次「配没配」，不当异常
  log.info(`AI 作答配置：${aiConfig() === null ? '未配置（AI 答题用不了）' : '已配置'}`);
}

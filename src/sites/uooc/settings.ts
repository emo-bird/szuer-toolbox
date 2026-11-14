/**
 * UOOC（优课联盟）的功能开关与配置项声明。
 *
 * 本文件**只声明**，不实现行为 —— 行为在 `video.ts` / `takeover.ts` 等模块里。
 * 与 bkxk 的 `settings.ts` 同一套路：设置面板一次做完，后续每批只负责
 * 「读 `isEnabled` 然后干活」。
 *
 * ## 分区（用户 m01877 拍板 + 后续调整）
 *
 * 设置项按 `group` 分组，由对应的站点标签页渲染
 * （`renderSiteSettings(..., { onlyGroups: [...] })`）：
 *
 *   - `视频`（`tabs/video.ts`）   —— `GROUP.VIDEO`：播放器行为（倍速 / 静音 / 防暂停）
 *   - `等待`（`tabs/wait.ts`）    —— `GROUP.WAIT`：接管的三个等待参数
 *     （wait-before / hold-after / wait-timeout，§E.5 从【连播】页整组搬过来）
 *   - `AI 作答`（`tabs/ai.ts`）   —— `GROUP.AI`：答题开关与接口配置
 *   - 【接管】页（`tabs/autoplay.ts`）只放「开始/停止接管」两个按钮，**不渲染设置**
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
import { backendName, listKeys, read, remove, write } from '../../common/core/storage.ts';
import { validateLlmEndpoint } from './ai/llm.ts';
import type { LlmConfig, LlmResponseFormat } from './ai/llm.ts';
import { DEEPSEEK_FLASH, deepSeekModel, deepSeekOptions, deepSeekReferenceFile, isDeepSeekEndpoint,
  type DeepSeekOptions, type DeepSeekReferenceFile } from './ai/deepseek.ts';
import { courseIdFromLocation } from './catalog-model.ts';

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
  /** 接管的等待参数（wait-before / hold-after / wait-timeout），渲染在【等待】页 */
  WAIT: '等待参数',
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
  VIDEO_QUIZ_AUTO_SUBMIT: 'video-quiz-auto-submit',
  CAPTCHA_SOUND: 'captcha-sound',
  /** 🟠 AI 答题（U6–U9）：连播走到测验就交给它；关掉则停下等用户手动处理 */
  AI_ANSWER: 'ai-answer',
} as const;

/** 配置项 id 常量 */
const VALUE = {
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
    id: TOGGLE.VIDEO_QUIZ_AUTO_SUBMIT,
    label: '自动提交视频小题',
    desc: '视频弹题时自动选答案并点击确定。关闭后由你作答。',
    risk: 'irreversible',
    default: false,
    group: GROUP.AI,
  },
  {
    id: TOGGLE.CAPTCHA_SOUND,
    label: '测验交卷提示音',
    desc: '确认提交弹窗和验证码弹窗出现时，分别播放提示音。',
    risk: 'safe',
    default: true,
    group: GROUP.AI,
  },
  {
    id: TOGGLE.AI_ANSWER,
    label: '接管遇到测验时自动启动 AI',
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
    group: GROUP.WAIT,
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.HOLD_AFTER_MS,
    label: '播完后停留(ms)',
    desc: '视频播放结束（ended）后停留这么久，再去重拉课程树确认完成状态',
    default: '5000',
    kind: 'number',
    group: GROUP.WAIT,
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.WAIT_TIMEOUT_MS,
    label: '全局等待超时(ms)',
    desc: '除取数请求外，所有「等某个东西出现」的超时上限（等元素、等待测验交卷……）',
    default: '30000',
    kind: 'number',
    group: GROUP.WAIT,
  });

}

/** 读一个毫秒配置项；非法值回退到 `fallbackMs` 并留一条 warn */
function readMs(id: string, fallbackMs: number): number {
  const raw = getStoredValue<string>(SITE_ID, id);
  // 与 core/limits.ts 的 clampLimit 同一判空口径：空串/纯空白按「没填」处理，
  // 不能走 Number('')===0——否则程序化写入空串时，等待/超时会被静默当成 0。
  // 但数字形态的存量值要照旧接受（早期版本可能写成 number），别一刀切成 NaN 回默认。
  let n: number;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && raw.trim() !== '') n = Number(raw.trim());
  else n = Number.NaN;
  if (!Number.isFinite(n) || n < 0) {
    log.warn(`${id} 取值异常（${String(raw)}），按 ${fallbackMs}ms 处理`);
    return fallbackMs;
  }
  return n;
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

const AI_PROFILES_KEY = 'uooc:ai-profiles';
const AI_ACTIVE_KEY = 'uooc:ai-active-profile';
const DEFAULT_PROFILE_ID = 'default';
interface AiSecret {
  readonly origin: string;
  readonly value: string;
}
const memoryKeys = new Map<string, AiSecret>();

export interface AiProfile {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly responseFormat: LlmResponseFormat;
  readonly vision: boolean;
  readonly deepSeek?: DeepSeekOptions;
}

function profileDeepSeek(baseUrl: string, value: unknown): { deepSeek?: DeepSeekOptions } {
  const options = isDeepSeekEndpoint(baseUrl) ? deepSeekOptions(value) : undefined;
  return options === undefined ? {} : { deepSeek: options };
}

export function referenceCourseId(page: Pick<Location, 'pathname' | 'hash'> | undefined =
  typeof location === 'undefined' ? undefined : location): string | null {
  if (!page || !/^\/home\/learn\/(?:index\/?$|new\/\d+(?:\/|$))/.test(page.pathname)) return null;
  return courseIdFromLocation(page.pathname, page.hash);
}

export function courseReferenceFile(courseId: string | null): DeepSeekReferenceFile | undefined {
  return courseId === null ? undefined : deepSeekReferenceFile(read<unknown>(`uooc:reference-file:${courseId}`, null));
}

export function setCourseReferenceFile(courseId: string, file?: DeepSeekReferenceFile): void {
  if (file === undefined) remove(`uooc:reference-file:${courseId}`);
  else write(`uooc:reference-file:${courseId}`, file);
}

export function removeReferenceFileBindings(fileId: string): void {
  for (const key of listKeys()) {
    if (key.startsWith('uooc:reference-file:') &&
      deepSeekReferenceFile(read<unknown>(key, null))?.id === fileId) remove(key);
  }
}

function legacyKey(id: string): string {
  return `value:${SITE_ID}:${id}`;
}

function legacyProfile(): AiProfile {
  const timeout = Number(read<unknown>(legacyKey(VALUE.AI_TIMEOUT_MS), null) ?? 60000);
  const concurrency = Number(read<unknown>(legacyKey(VALUE.AI_CONCURRENCY), null) ?? 1);
  return {
    id: DEFAULT_PROFILE_ID,
    name: '默认方案',
    baseUrl: read(legacyKey(VALUE.AI_BASE_URL), ''),
    model: read(legacyKey(VALUE.AI_MODEL), ''),
    timeoutMs: Number.isFinite(timeout) && timeout >= 1000 ? timeout : 60000,
    concurrency: Number.isFinite(concurrency) ? Math.min(8, Math.max(1, Math.floor(concurrency))) : 1,
    responseFormat: 'text',
    vision: false,
  };
}

export function aiProfiles(): AiProfile[] {
  const saved = read<unknown>(AI_PROFILES_KEY, null);
  if (!Array.isArray(saved)) return [legacyProfile()];
  const profiles: AiProfile[] = [];
  for (const candidate of saved) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const { id, name, baseUrl, model, timeoutMs, concurrency, responseFormat, vision, deepSeek } = candidate as Partial<AiProfile>;
    if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)
      || typeof name !== 'string' || typeof baseUrl !== 'string' || typeof model !== 'string'
      || typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 1000
      || typeof concurrency !== 'number' || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) continue;
    profiles.push({
      id, name, baseUrl, model, timeoutMs, concurrency,
      responseFormat: responseFormat === 'json' ? 'json' : 'text',
      vision: vision === true,
      ...profileDeepSeek(baseUrl, deepSeek),
    });
  }
  return profiles.length > 0 ? profiles : [{ ...legacyProfile(), baseUrl: '', model: '' }];
}

/** 仅导出已保存方案的公开字段，接口地址中的认证与临时参数一并移除。 */
export function exportAiProfiles(): string {
  const profiles = aiProfiles().map(({ id, name, baseUrl, model, timeoutMs, concurrency, responseFormat, vision, deepSeek }) => {
    let endpoint = '';
    try {
      const url = new URL(baseUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        endpoint = `${url.origin}${url.pathname}`;
      }
    } catch { /* 无法解析的旧地址不写入导出文件 */ }
    const shareable = deepSeek === undefined ? undefined : { ...deepSeek, context: undefined, referenceFile: undefined };
    return { id, name, baseUrl: endpoint, model, timeoutMs, concurrency, responseFormat, vision, ...profileDeepSeek(baseUrl, shareable) };
  });
  const activeId = read(AI_ACTIVE_KEY, DEFAULT_PROFILE_ID);
  const activeProfileId = profiles.some((profile) => profile.id === activeId) ? activeId : profiles[0]?.id;
  return JSON.stringify({ version: 1, activeProfileId, profiles }, null, 2);
}

export function activeAiProfile(): AiProfile {
  const profiles = aiProfiles();
  const activeId = read(AI_ACTIVE_KEY, DEFAULT_PROFILE_ID);
  return profiles.find((profile) => profile.id === activeId) ?? profiles[0]!;
}

export function selectAiProfile(id: string): void {
  if (aiProfiles().some((profile) => profile.id === id)) write(AI_ACTIVE_KEY, id);
}

function secretKey(id: string): string {
  return `uooc:ai-secret:${id}`;
}

export function aiProfileSecret(id: string, baseUrl: string): string {
  const endpoint = validateLlmEndpoint(baseUrl).url;
  if (endpoint === undefined) return '';
  const origin = new URL(endpoint).origin;
  const secret = backendName() === 'GM'
    ? read<AiSecret | null>(secretKey(id), null)
    : memoryKeys.get(id);
  if (secret?.origin === origin && typeof secret.value === 'string') return secret.value.trim();
  if (secret || backendName() !== 'GM' || id !== DEFAULT_PROFILE_ID) return '';
  const legacy = validateLlmEndpoint(legacyProfile().baseUrl).url;
  return legacy !== undefined && new URL(legacy).origin === origin
    ? read(legacyKey(VALUE.AI_API_KEY), '').trim()
    : '';
}

function setAiProfileSecret(id: string, apiKey: string, origin?: string): void {
  const key = apiKey.trim();
  const secret = key !== '' && origin !== undefined ? { origin, value: key } : null;
  if (backendName() !== 'GM') {
    if (secret === null) memoryKeys.delete(id);
    else memoryKeys.set(id, secret);
    return;
  }
  if (secret === null) remove(secretKey(id));
  else write(secretKey(id), secret);
  if (id === DEFAULT_PROFILE_ID) remove(legacyKey(VALUE.AI_API_KEY));
}

/** 只保存公开字段。不同来源的接口不会沿用旧接口的认证信息。 */
export function saveAiProfile(profile: AiProfile, replacementKey?: string): void {
  const profiles = aiProfiles();
  const old = profiles.find((item) => item.id === profile.id);
  const endpoint = validateLlmEndpoint(profile.baseUrl);
  const previous = old ? validateLlmEndpoint(old.baseUrl).url : undefined;
  const sameOrigin = endpoint.url !== undefined && previous !== undefined
    && new URL(endpoint.url).origin === new URL(previous).origin;
  if (old !== undefined && !sameOrigin) setAiProfileSecret(profile.id, '');
  const { id, name, baseUrl, model, timeoutMs, concurrency, responseFormat, vision, deepSeek } = profile;
  const stored = { id, name, baseUrl, model, timeoutMs, concurrency, responseFormat, vision, ...profileDeepSeek(baseUrl, deepSeek) };
  write(AI_PROFILES_KEY, old === undefined ? [...profiles, stored] : profiles.map((item) => item.id === id ? stored : item));
  if (replacementKey !== undefined) {
    setAiProfileSecret(id, replacementKey, endpoint.url === undefined ? undefined : new URL(endpoint.url).origin);
  }
  write(AI_ACTIVE_KEY, id);
}

export function removeAiProfile(id: string): void {
  const remaining = aiProfiles().filter((profile) => profile.id !== id);
  if (remaining.length === 0) return;
  setAiProfileSecret(id, '');
  write(AI_PROFILES_KEY, remaining);
  if (read(AI_ACTIVE_KEY, DEFAULT_PROFILE_ID) === id) write(AI_ACTIVE_KEY, remaining[0]!.id);
}

/**
 * 大模型的完整配置；**配置不全时返回 null**（调用方据此给出人话提示，而不是发一个注定 404 的请求）。
 *
 * 判据只要求「地址 + 模型名」：API Key 允许为空 —— 本地 ollama / vllm 不需要，
 * 而 OpenAI 那类会直接返回 401，报错信息已经足够清楚。
 */
export function aiConfig(courseId = referenceCourseId()): LlmConfig | null {
  const profile = activeAiProfile();
  const endpoint = validateLlmEndpoint(profile.baseUrl);
  if (endpoint.url === undefined || profile.model.trim() === '') return null;
  const { deepSeek } = profileDeepSeek(profile.baseUrl, profile.deepSeek);
  const file = isDeepSeekEndpoint(profile.baseUrl) && deepSeekModel(profile.model.trim()) === DEEPSEEK_FLASH
    ? courseReferenceFile(courseId) : undefined;
  return {
    baseUrl: profile.baseUrl,
    model: profile.model.trim(),
    apiKey: aiProfileSecret(profile.id, profile.baseUrl),
    timeoutMs: profile.timeoutMs,
    responseFormat: profile.responseFormat,
    profileId: profile.id,
    vision: profile.vision,
    ...(file ? { deepSeek: { ...deepSeekOptions(deepSeek ?? {})!, referenceFile: file } } : deepSeek ? { deepSeek } : {}),
  };
}

/** AI 作答的并发数，夹在 1~8（上限是防呆，不是性能调优） */
export function aiConcurrency(): number {
  return activeAiProfile().concurrency;
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

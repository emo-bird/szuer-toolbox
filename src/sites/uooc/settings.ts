/**
 * UOOC（优课联盟）的功能开关与配置项声明。
 *
 * 本文件**只声明**，不实现行为 —— 行为在 `video.ts` 等模块里。
 * 与 bkxk 的 `settings.ts` 同一套路：设置面板一次做完，后续每批只负责
 * 「读 `isEnabled` 然后干活」。
 *
 * 风险门禁（需求文档 §8.1 N1）由 `common/core/settings.ts` 的 `isEnabled` 统一兜底：
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
} as const;

/** 配置项 id 常量 */
export const VALUE = {
  /** 连播范围：章内 / 跨章 */
  NEXT_SCOPE: 'nextScope',
} as const;

export const UOOC_TOGGLES: readonly SiteToggleDef[] = [
  {
    id: TOGGLE.RATE_2X,
    label: '二倍速播放',
    desc:
      '把播放器速率锁在 2 倍：视频换集、播放器重建、以及你在站点播放器菜单里改成别的速度，' +
      '都会被立刻扳回 2 倍（即站点自己的倍速菜单在开启期间失效）。' +
      '倍速只改变本地播放速度，**不改变站点上报的观看进度**（进度仍按真实播放位置上报）。',
    risk: 'safe',
    default: true,
    group: '视频',
  },
  {
    id: TOGGLE.MUTE,
    label: '静音播放',
    desc:
      '把播放器锁在静音：视频换集、播放器重建、以及你在站点播放器上取消静音，' +
      '都会被立刻扳回静音（即站点自己的音量控制在开启期间失效）。',
    risk: 'safe',
    default: true,
    group: '视频',
  },
  {
    id: TOGGLE.KEEP_PLAYING,
    label: '防止失焦暂停',
    desc:
      '**本开关开启期间你无法手动暂停视频** —— 一旦暂停就会被立刻恢复播放（含切到别的窗口、' +
      '切标签页导致的暂停）。这是刻意的：想暂停请先关掉这个开关。' +
      '只在本站点，不会影响其它站点。',
    risk: 'safe',
    default: true,
    group: '视频',
  },
  {
    id: TOGGLE.AUTO_NEXT,
    label: '自动连播',
    desc:
      '一个视频播完后，自动点开目录里的下一个视频。' +
      '这会代替你触发站点的换集请求（含观看进度上报），属于会留痕的操作。默认关闭。',
    risk: 'trace',
    default: false,
    group: '视频',
  },
];

/**
 * 注册本站的**配置项**（开关不在这里 —— 它们随适配器的 `toggles` 字段
 * 由 `src/sites/index.ts` 的 `registerSites()` 统一灌进设置注册表，单一来源）。
 */
export function registerUoocSettings(): void {
  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.NEXT_SCOPE,
    label: '连播范围',
    desc: '自动连播到本小节最后一个视频之后怎么办。',
    default: 'chapter',
    kind: 'select',
    options: [
      { value: 'chapter', label: '止于本章 —— 本章看完就停' },
      { value: 'all', label: '跨章继续 —— 直到整门课看完' },
    ],
  });
}

/**
 * 把配置项推进运行时（启动时跑一次）。
 *
 * 目前只有连播范围，`video.ts` 每次触发时自己读，所以这里只做一次存在性检查，
 * 保证拼错 id 时能在日志里立刻看见，而不是静默用默认值。
 */
export function applyUoocSettings(): void {
  const scope = getStoredValue<string>(SITE_ID, VALUE.NEXT_SCOPE);
  if (scope !== 'chapter' && scope !== 'all') {
    log.warn(`连播范围取值异常（${scope}），按「止于本章」处理`);
  }
}

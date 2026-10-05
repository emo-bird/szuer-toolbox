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
 *   - 🔴 irreversible 在**用户没动过**时按 false 处理（`default` 写什么都不算数），
 *     但用户显式勾选过之后是真的会生效的 —— 见 `settings.ts:79-82`。
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
  /** 🔴 随机进度上报（心跳）—— 会往站点写进度 */
  AUTO_PROGRESS: 'auto-progress',
  /** 🔴 自动作答（U8）—— 目前只是占位，还没有实现 */
  AUTO_SOLVE: 'auto-solve',
} as const;

/** 配置项 id 常量 */
export const VALUE = {
  /** 连播范围：章内 / 跨章 */
  NEXT_SCOPE: 'nextScope',
  /** 进度上报间隔下限（秒） */
  PROGRESS_MIN: 'progressMin',
  /** 进度上报间隔上限（秒） */
  PROGRESS_MAX: 'progressMax',
} as const;

/**
 * 进度上报区间的默认值（秒）。`progress.ts` 拿它当兜底，避免两处写两遍。
 *
 * 区间宽是刻意的：站点自己的心跳也是「一段时间一次」，固定间隔反而更像机器。
 * ⚠️ 改这里**对已经存过值的用户无效** —— `getValue()` 只在没存过时才回退默认值。
 */
export const PROGRESS_DEFAULT = { min: '300', max: '600' } as const;

export const UOOC_TOGGLES: readonly SiteToggleDef[] = [
  {
    id: TOGGLE.RATE_2X,
    label: '二倍速',
    desc: '锁在 2 倍速，在播放器里改回去会被扳回',
    risk: 'safe',
    default: true,
    group: '视频',
  },
  {
    id: TOGGLE.MUTE,
    label: '静音',
    desc: '锁在静音，取消会被扳回',
    risk: 'safe',
    default: true,
    group: '视频',
  },
  {
    id: TOGGLE.KEEP_PLAYING,
    label: '防暂停',
    desc: '暂停会被立刻恢复（含你自己按的暂停）',
    risk: 'safe',
    default: true,
    group: '视频',
  },
  {
    id: TOGGLE.AUTO_NEXT,
    label: '自动连播',
    desc: '播完自动打开目录里的下一个视频',
    risk: 'trace',
    default: false,
    group: '视频',
  },
  {
    id: TOGGLE.AUTO_PROGRESS,
    label: '进度上报',
    desc: '按下面的随机间隔，替你把视频进度报给站点',
    risk: 'irreversible',
    default: false,
    group: '视频',
  },
  {
    id: TOGGLE.AUTO_SOLVE,
    label: '自动作答',
    desc: '连播遇到没做过的测验时自动作答（还没实现，先占位）',
    risk: 'irreversible',
    default: false,
    group: '测验',
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
    desc: '连播到本章结束后',
    default: 'chapter',
    kind: 'select',
    options: [
      { value: 'chapter', label: '止于本章' },
      { value: 'all', label: '跨章继续' },
    ],
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.PROGRESS_MIN,
    label: '上报间隔下限',
    desc: '秒。和下面的上限一起决定随机区间',
    default: PROGRESS_DEFAULT.min,
    kind: 'number',
    validate: (value) => positiveIntHint(value, 5, 3600),
  });

  registerValue<string>({
    siteId: SITE_ID,
    id: VALUE.PROGRESS_MAX,
    label: '上报间隔上限',
    desc: '秒。改完立刻按新区间重新计时',
    default: PROGRESS_DEFAULT.max,
    kind: 'number',
    validate: (value) => positiveIntHint(value, 5, 3600),
  });
}

/** 数字配置项的通用校验：不合法就提示，**不**偷偷改值（`ValueDef.validate` 的约定） */
function positiveIntHint(value: unknown, lo: number, hi: number): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return `要填整数秒（${lo} ~ ${hi}）`;
  if (n < lo || n > hi) return `要填 ${lo} ~ ${hi} 之间的秒数`;
  return null;
}

/**
 * 把配置项推进运行时（启动时跑一次）。
 *
 * 连播范围、上报区间都是「用的时候现读」，所以这里只做一次存在性检查，
 * 保证拼错 id / 存了脏值时能在日志里立刻看见，而不是静默用默认值。
 */
export function applyUoocSettings(): void {
  const scope = getStoredValue<string>(SITE_ID, VALUE.NEXT_SCOPE);
  if (scope !== 'chapter' && scope !== 'all') {
    log.warn(`连播范围取值异常（${scope}），按「止于本章」处理`);
  }

  const min = getStoredValue<string>(SITE_ID, VALUE.PROGRESS_MIN);
  const max = getStoredValue<string>(SITE_ID, VALUE.PROGRESS_MAX);
  if (positiveIntHint(min, 5, 3600) !== null) {
    log.warn(`上报间隔下限取值异常（${min}），按 ${PROGRESS_DEFAULT.min} 秒处理`);
  }
  if (positiveIntHint(max, 5, 3600) !== null) {
    log.warn(`上报间隔上限取值异常（${max}），按 ${PROGRESS_DEFAULT.max} 秒处理`);
  }
}

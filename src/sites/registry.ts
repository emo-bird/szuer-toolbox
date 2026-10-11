/**
 * 站点注册表与分派。
 *
 * 分派规则（对应「悬浮球常在，功能页才自动展开」）：
 *
 *   1. 命中某个适配器的 `hosts`            → 注入 + 悬浮球；若再命中 `pages` 则自动展开
 *   2. 未命中适配器，但在 `SUPPORTED_ROOT_DOMAINS` 下 → 注入 + 悬浮球（只有公共标签页）
 *   3. 其它情况                            → **不注入**
 */

import type { SiteAdapter } from './types.ts';
import { matchAnyHost, matchAnyPage, isUnderDomain, parseUrl } from '../common/utils/url.ts';

/** 即使没有任何适配器命中，也依然注入悬浮球的根域（深大校园域） */
export const SUPPORTED_ROOT_DOMAINS: readonly string[] = ['szu.edu.cn'];

const adapters: SiteAdapter[] = [];

/** 注册一个站点适配器。后注册的同 id 适配器会覆盖先前的。 */
export function registerAdapter(adapter: SiteAdapter): void {
  const existing = adapters.findIndex((a) => a.id === adapter.id);
  if (existing >= 0) {
    adapters[existing] = adapter;
    return;
  }
  adapters.push(adapter);
}

/** 当前已注册的全部适配器（注册顺序） */
export function allAdapters(): readonly SiteAdapter[] {
  return adapters;
}

function getAdapter(id: string): SiteAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

/**
 * 约定：站点若要把自己的设置渲染进**自己的标签页**，标签 id 必须是 `<siteId>:settings`。
 *
 * 有这个约定的原因：公共【设置】标签页需要知道「这个站点自己管设置了」，
 * 才能跳过它、只留一行指引 —— 否则同一个开关会在面板里出现两遍。
 */
export function settingsTabId(siteId: string): string {
  return `${siteId}:settings`;
}

/**
 * 该站点是否自己注册了设置标签页。
 *
 * 两条都算「自己管设置」：
 *   1. 有一个 id 等于 `<siteId>:settings` 的标签页（约定见上，bkxk 走这条）；
 *   2. 适配器显式声明了 `settingsInOwnTabs: true` —— 站点把设置**拆成多个**标签页，
 *      没有任何一个 id 能代表全部（UOOC = 视频 / 接管+等待 / AI 作答，走这条）。
 *
 * 判定错了的代价不是「少显示一项」，而是同一个开关在面板里出现两遍、还能从两处改。
 */
export function hasOwnSettingsTab(siteId: string): boolean {
  const adapter = getAdapter(siteId);
  if (adapter === undefined) return false;
  if (adapter.settingsInOwnTabs === true) return true;
  return adapter.tabs.some((t) => t.id === settingsTabId(siteId));
}

export interface Resolution {
  /** 是否应该在本页注入悬浮窗 */
  readonly inject: boolean;
  /** 命中的站点适配器；未命中为 null */
  readonly adapter: SiteAdapter | null;
  /** 是否应当自动展开面板（命中功能页） */
  readonly autoExpand: boolean;
  /** 命中的原因，仅用于日志 */
  readonly reason: 'adapter' | 'root-domain' | 'none';
}

const NOT_INJECT: Resolution = { inject: false, adapter: null, autoExpand: false, reason: 'none' };

/**
 * 判定当前页面该怎么处理。
 * 纯函数（不读 DOM、不读 storage），可以直接被测试覆盖。
 */
export function resolve(url: URL, registry: readonly SiteAdapter[] = adapters): Resolution {
  for (const adapter of registry) {
    if (matchAnyHost(url.hostname, adapter.hosts)) {
      return {
        inject: true,
        adapter,
        autoExpand: isFeaturePage(url, adapter),
        reason: 'adapter',
      };
    }
  }

  if (SUPPORTED_ROOT_DOMAINS.some((root) => isUnderDomain(url.hostname, root))) {
    return { inject: true, adapter: null, autoExpand: false, reason: 'root-domain' };
  }

  return NOT_INJECT;
}

/** `pages` 为空表示该站点任意页面都算功能页 */
export function isFeaturePage(url: URL, adapter: SiteAdapter): boolean {
  if (adapter.pages.length === 0) return true;
  return matchAnyPage(url, adapter.pages);
}

/** 便捷入口：直接吃一个 URL 字符串 */
export function resolveString(href: string, registry: readonly SiteAdapter[] = adapters): Resolution {
  const url = parseUrl(href);
  return url === null ? NOT_INJECT : resolve(url, registry);
}

/** 测试用：清空注册表 */
export function resetRegistry(): void {
  adapters.length = 0;
}

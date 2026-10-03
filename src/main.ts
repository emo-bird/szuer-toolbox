/**
 * 入口装配。
 *
 * 职责边界（刻意保持很窄）：
 *   1. 注册所有站点适配器
 *   2. 把站点声明的开关灌进设置注册表
 *   3. 依据 sites/registry 的分派结果决定「注不注入 / 折没折叠」
 *   4. 组装悬浮窗（公共标签页 + 命中站点的专属标签页）
 *   5. 处理 SPA 站内跳转（hash 路由）导致的重新分派
 *
 * 这里**不做任何业务逻辑** —— 业务一律在 sites/<id>/ 里。
 */

import baseCss from './common/ui/style.css';

import { scoped } from './common/core/log.ts';
import { registerToggles } from './common/core/settings.ts';
import { createPanel } from './common/ui/panel.ts';
import type { PanelHandle, TabEntry } from './common/ui/panel.ts';
import { settingsTab, setSiteNameResolver } from './common/ui/tabs/settings.ts';
import { logTab } from './common/ui/tabs/log.ts';
import { statusTab, setStatusProvider } from './common/ui/tabs/status.ts';

import { registerAdapter, allAdapters, resolve, SUPPORTED_ROOT_DOMAINS } from './sites/registry.ts';
import { demoAdapter } from './sites/demo/index.ts';

const log = scoped('main');

const VERSION = typeof __SZB_VERSION__ === 'string' ? __SZB_VERSION__ : '0.0.0-dev';
const BUILD_TIME = typeof __SZB_BUILD_TIME__ === 'string' ? __SZB_BUILD_TIME__ : null;

// ------------------------------------------------------------------ 注册

function registerSites(): void {
  registerAdapter(demoAdapter);

  setSiteNameResolver((siteId) => allAdapters().find((a) => a.id === siteId)?.name ?? siteId);

  for (const adapter of allAdapters()) {
    if (adapter.toggles !== undefined && adapter.toggles.length > 0) {
      registerToggles(adapter.id, adapter.name, adapter.toggles);
    }
  }
}

// ------------------------------------------------------------------ 分派

interface Booted {
  panel: PanelHandle;
  adapterId: string | null;
}

let booted: Booted | null = null;

/** 公共标签页在前，站点专属标签页在后（顺序最终由 TabRegistration.order 决定） */
function buildEntries(siteTabs: readonly TabEntry[]): TabEntry[] {
  const common: TabEntry[] = [
    { siteId: 'common', tab: settingsTab },
    { siteId: 'common', tab: logTab },
    { siteId: 'common', tab: statusTab },
  ];
  return [...common, ...siteTabs];
}

/** 依据当前 URL 装配（或重装）悬浮窗；不应注入时返回 false */
function boot(): boolean {
  const url = new URL(location.href);
  const res = resolve(url);

  if (!res.inject) {
    log.debug(`不注入：${url.host} 既不属于任何适配器，也不在 ${SUPPORTED_ROOT_DOMAINS.join('/')} 下`);
    return false;
  }

  if (booted !== null) {
    booted.panel.destroy();
    booted = null;
  }

  const siteTabs: TabEntry[] =
    res.adapter !== null ? res.adapter.tabs.map((tab) => ({ siteId: res.adapter!.id, tab })) : [];

  const panel = createPanel(baseCss, buildEntries(siteTabs), {
    siteName: res.adapter?.name ?? null,
    startCollapsed: !res.autoExpand,
  });

  setStatusProvider(() => ({
    href: location.href,
    host: location.host,
    resolution: res.reason,
    adapterId: res.adapter?.id ?? null,
    inject: res.inject,
    autoExpand: res.autoExpand,
    tabCount: siteTabs.length + 3,
    registeredAdapters: allAdapters().map((a) => a.id),
    buildTime: BUILD_TIME,
    version: VERSION,
  }));

  booted = { panel, adapterId: res.adapter?.id ?? null };
  log.info(`深大人工具箱 v${VERSION} 已装载（分派=${res.reason}，站点=${res.adapter?.id ?? '无'}）`);

  res.adapter?.init?.({
    adapter: res.adapter,
    isFeaturePage: res.autoExpand,
    panel,
  });

  return true;
}

// ---------------------------------------------------------- SPA 站内跳转

/**
 * 站内 hash 路由（UOOC 新旧版页面都是 hash 路由）不会触发页面重载，
 * 所以这里监听 hashchange / popstate，必要时重新分派。
 */
function watchNavigation(): void {
  let bootedFor = location.href;

  const onNavigate = (): void => {
    const url = new URL(location.href);
    const res = resolve(url);
    const nextAdapter = res.adapter?.id ?? null;

    // 站点没变、只是页内参数变了：不动悬浮窗，避免打断用户操作
    if (nextAdapter === (booted?.adapterId ?? null) && res.inject) {
      bootedFor = location.href;
      return;
    }

    if (!res.inject) {
      log.debug(`站内跳转后不再属于支持范围，保持现有悬浮窗`);
      return;
    }

    log.info(`站内跳转导致重新分派：${bootedFor} → ${location.href}`);
    bootedFor = location.href;
    boot();
  };

  window.addEventListener('hashchange', onNavigate);
  window.addEventListener('popstate', onNavigate);
}

// ------------------------------------------------------------------ 启动

function main(): void {
  // 只在顶层文档运行（userscript header 里另有 @noframes 兜底）
  if (window.top !== window.self) return;

  registerSites();
  if (!boot()) return;
  watchNavigation();
}

try {
  main();
} catch (err) {
  // 启动期崩溃至少要在 console 里留痕（此时悬浮窗可能还没建起来）
  console.error('[深大人工具箱] 启动失败', err);
}

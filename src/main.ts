/**
 * 入口装配。
 *
 * 职责边界（刻意保持很窄）：
 *   1. 调用 sites/index 注册全部站点适配器
 *   2. 把「站点名 / 当前站点」两个 resolver 接到入口的运行时状态
 *   3. 依据 sites/registry 的分派结果决定「注不注入 / 折没折叠」
 *   4. 组装悬浮窗（公共标签页 + 命中站点的专属标签页）
 *   5. 处理 SPA 站内跳转（hash 路由）导致的重新分派
 *
 * 这里**不做任何业务逻辑** —— 业务一律在 sites/<id>/ 里。
 *
 * ## 两个执行阶段（`@run-at document-start`）
 *
 * | 阶段 | 时机 | 能做什么 |
 * |---|---|---|
 * | 启动期 | 脚本注入瞬间，早于页面任何脚本 | 挂钩子（`adapter.earlyInit`）、读 storage、分派 |
 * | 挂载期 | `DOMContentLoaded` | 建悬浮窗、`adapter.init`、操作页面 DOM |
 *
 * 拆开的唯一理由：响应接管必须抢在站点脚本之前（见 sites/types.ts 的 `earlyInit`），
 * 而悬浮窗必须等 body 存在。**不要把两件事塞进同一个时机。**
 */

import baseCss from './common/ui/style.css';

import { scoped } from './common/core/log.ts';
import { whenDomReady } from './common/utils/dom.ts';
import { createPanel } from './common/ui/panel.ts';
import type { PanelHandle, TabEntry } from './common/ui/panel.ts';
import { settingsTab, setSiteNameResolver } from './common/ui/tabs/settings.ts';
import { logTab } from './common/ui/tabs/log.ts';
import { statusTab, setStatusProvider } from './common/ui/tabs/status.ts';
import { loginTab, setCurrentSiteResolver } from './common/ui/tabs/login.ts';

import { allAdapters, resolve, SUPPORTED_ROOT_DOMAINS } from './sites/registry.ts';
import type { Resolution } from './sites/registry.ts';
import { registerSites } from './sites/index.ts';

const log = scoped('main');

const VERSION = typeof __SZB_VERSION__ === 'string' ? __SZB_VERSION__ : '0.0.0-dev';
const BUILD_TIME = typeof __SZB_BUILD_TIME__ === 'string' ? __SZB_BUILD_TIME__ : null;
const BUILD_NO = typeof __SZB_BUILD_NO__ === 'number' ? __SZB_BUILD_NO__ : null;

/** 形如 `v0.1.0#7`；构建号缺失时只显示版本 */
const VERSION_LABEL = BUILD_NO === null ? `v${VERSION}` : `v${VERSION}#${BUILD_NO}`;

// ------------------------------------------------------------------ 注册

/**
 * 把站点适配器注册进 registry，并接上两个依赖注入的 resolver。
 *
 * ⚠️ 真正的适配器清单在 `sites/index.ts` 的 `registerSites()` 里 ——
 * 它必须与 userscript header 的 `@match` 一一对应，且被
 * `tests/suites/sites-registered.test.ts` 直接钉住。**不要**把适配器
 * 直接 import 到这里注册：那样测试就抓不到「header 承诺了但没注册」
 * 这类漏配，而它的表现是完全静默的（UOOC 曾因此毫无反应且不报错）。
 */
function wireSites(): void {
  registerSites();

  setSiteNameResolver((siteId) => allAdapters().find((a) => a.id === siteId)?.name ?? siteId);
  setCurrentSiteResolver(() => booted?.adapterId ?? null);
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
    { siteId: 'common', tab: loginTab },
    { siteId: 'common', tab: statusTab },
  ];
  return [...common, ...siteTabs];
}

/** 依据分派结果装配（或重装）悬浮窗 */
function boot(url: URL, res: Resolution): void {
  if (booted !== null) {
    booted.panel.destroy();
    booted = null;
  }

  const siteTabs: TabEntry[] =
    res.adapter !== null ? res.adapter.tabs.map((tab) => ({ siteId: res.adapter!.id, tab })) : [];

  const panel = createPanel(baseCss, buildEntries(siteTabs), {
    siteName: res.adapter?.name ?? null,
  });

  setStatusProvider(() => ({
    href: location.href,
    host: location.host,
    resolution: res.reason,
    adapterId: res.adapter?.id ?? null,
    inject: res.inject,
    autoExpand: res.autoExpand,
    tabCount: siteTabs.length + 4,
    registeredAdapters: allAdapters().map((a) => a.id),
    buildTime: BUILD_TIME,
    version: VERSION,
  }));

  booted = { panel, adapterId: res.adapter?.id ?? null };
  log.info(
    `深大人工具箱 ${VERSION_LABEL} 已装载（host=${url.hostname}，分派=${res.reason}，` +
      `站点=${res.adapter?.id ?? '无'}，功能页=${res.autoExpand ? '是' : '否'}）`,
  );

  res.adapter?.init?.({
    adapter: res.adapter,
    isFeaturePage: res.autoExpand,
    panel,
  });
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
    boot(url, res);
  };

  window.addEventListener('hashchange', onNavigate);
  window.addEventListener('popstate', onNavigate);
}

// ------------------------------------------------------------------ 启动

function main(): void {
  // 只在顶层文档运行（userscript header 里另有 @noframes 兜底）
  if (window.top !== window.self) {
    console.info('[深大人工具箱] 当前是子框架，跳过（@noframes 兜底）');
    return;
  }

  // 启动期无条件打一条：用于区分「脚本没注入」和「注入了但没渲染」。
  // ⚠️ 必须用 console.info 而非 console.debug —— Edge DevTools 默认把 Verbose
  //    级别过滤掉，debug 日志用户根本看不见（UOOC 排查因此绕了远路）。
  console.info(
    `[深大人工具箱] ${VERSION_LABEL} 启动，href=${location.href}，构建于 ${BUILD_TIME ?? '未知'}`,
  );

  wireSites();

  const url = new URL(location.href);
  const res = resolve(url);

  if (!res.inject) {
    console.info(
      `[深大人工具箱] 不注入：host=${url.hostname} 既不属于任何适配器` +
        `（${allAdapters().map((a) => a.hosts.join('|')).join(' , ')}），` +
        `也不在根域 ${SUPPORTED_ROOT_DOMAINS.join('/')} 下`,
    );
    return;
  }

  // ---- 启动期（document-start）：只允许挂钩子，不许碰 DOM ----
  // 站点脚本可能马上就开始发请求，接管必须抢在这一刻。
  if (res.adapter?.earlyInit !== undefined) {
    try {
      res.adapter.earlyInit({ adapter: res.adapter, url });
      log.debug(`已执行启动期钩子：${res.adapter.id}`);
    } catch (err) {
      // 站点钩子挂不上不应该连累悬浮窗：接管的失败要能在日志里看见，
      // 但不能让整个脚本死掉（否则用户连日志面板都打不开）。
      log.error(`启动期钩子执行失败：${res.adapter.id}`, err);
    }
  }

  // ---- 挂载期（DOMContentLoaded）：建悬浮窗、初始化站点 UI ----
  whenDomReady(() => {
    boot(url, res);
    watchNavigation();
  });
}

try {
  main();
} catch (err) {
  // 启动期崩溃至少要在 console 里留痕（此时悬浮窗可能还没建起来）
  console.error('[深大人工具箱] 启动失败', err);
}

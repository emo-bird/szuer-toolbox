/**
 * 本科选课（`bkxk.szu.edu.cn`）适配器。
 *
 * 来源：旧仓库 `C:\Project\szu_bkxk`（分支 `master-tampermonkey-v2` @ `51e5cb6`，v2.3.2，
 * 13 个 JS 模块约 3100 行、产物 127 KB）。本项目是**重写移植**，不是打包：
 * 旧代码零依赖 + 字符串拼接构建，本项目 TS + esbuild，且要接入公共悬浮窗与设置层。
 *
 * 与旧版的关键差异（都是有意的，别改回去）：
 *   1. `@run-at document-start` —— 响应接管必须抢在站点脚本之前。
 *   2. `unsafeWindow` —— 旧版 `@grant none` 天然在页面上下文；现在要显式拿。
 *   3. 存储从 `localStorage` (`szubkxk.v2.*`) 换成公共 GM 存储（一次性迁移，见 legacy.ts）。
 *   4. 危险开关不再自动打开 —— 旧版 `hijackTimetable: true` 这类默认值在本框架里
 *      被风险门禁强制成关闭，用户需手动勾一次。
 *
 * 交付节奏（用户已拍板分 4 批，每批一个可验证 commit；原「批 3」已取消并入批 2）：
 *   批 1 请求层 + 设置 + 风险门禁 + 旧数据迁移
 *   批 2 课程取数 + 抢课任务 + 容量监控 + 选课列表增强 + 三个站点标签页
 *   批 3 课表（hijack / 自绘）+ 自定义课程 UI —— 待办
 *   批 4 收尾
 */

import { scoped } from '../../common/core/log.ts';
import { loginTab } from '../../common/ui/tabs/login.ts';
import type { SiteAdapter } from '../types.ts';
import { setTokenProvider } from './api.ts';
import { bkxkBus } from './bus.ts';
import { BKXK_TOGGLES, applyBkxkSettings, registerBkxkSettings, SITE_ID } from './settings.ts';
import { readSession, sessionSummary } from './session.ts';
import { runMigration } from './legacy.ts';
import { BKXK_SETTINGS_TAB } from './tabs/settings.ts';

const log = scoped('site/bkxk');

/** 站点域（单一主机，无子域） */
const HOSTS: readonly string[] = ['bkxk.szu.edu.cn'];

/**
 * 功能页。
 *
 * 旧仓库 `main.js:18,32,45` 用 `location.pathname` 判页：
 *   - 选课页 `/xsxkapp/sys/xsxkapp/*default/grablessons.do`
 *   - 课表页 `/xsxkapp/sys/xsxkapp/*default/curriculum.do`
 * 这里沿用同一判据（`*` 前缀吃掉中间那段路径）。
 *
 * 其余页面（如登录页、首页）只显示悬浮球，不自动展开 —— 它们没有可用功能。
 */
const PAGES: readonly string[] = ['*default/grablessons.do*', '*default/curriculum.do*'];

export const bkxkAdapter: SiteAdapter = {
  id: SITE_ID,
  name: '本科选课',
  hosts: HOSTS,
  pages: PAGES,
  // 标签页分批补齐（用户拍板的五个：任务 / 监控 / 自定义 / 设置 / 日志）：
  //   本批只有【设置】—— 用户反馈「本科选课的设置都放在单独标签页更好」，
  //   【任务】【监控】在 2d 接入，【自定义】随批 3 的自定义课程模块接入，
  //   【日志】是公共标签页、不用站点注册。
  tabs: [BKXK_SETTINGS_TAB],
  toggles: BKXK_TOGGLES,

  /**
   * 启动期：只做「读 storage / 写 storage」，不碰 DOM。
   * 迁移必须在这里跑完 —— 后面的 courses / list 模块初始化时就要读迁移结果。
   */
  earlyInit(ctx) {
    const lines = runMigration();
    registerBkxkSettings();
    // 请求层的 token 来源（见 `api.ts` 的 `setTokenProvider`）。必须在任何请求之前注册：
    // 页面刷新后模块会重新求值，所以每次 earlyInit 都要重挂一遍。
    setTokenProvider(() => readSession().token);
    if (lines.length > 0) {
      log.info(`已从旧版迁移 ${lines.length} 条内容，详情见日志页`);
    } else {
      log.debug(`无旧数据需要迁移（earlyInit @ ${ctx.url.pathname}）`);
    }
  },

  /** 挂载期：DOM 已就绪，可以安全地把配置推给运行时并报登录态。 */
  init(ctx) {
    applyBkxkSettings();

    // 模型层（tasks / monitor / custom）只广播事实，展示方式在这里统一决定。
    bkxkBus.on('toast', ({ msg, kind }) => {
      ctx.panel.toast(msg, kind);
    });
    // D3：登录态失效 = Toast + 日志 + 自动切到「登录态」标签页。
    // 不停轮询在这里也是错的 —— 停轮询是发起方（tasks / monitor）自己的事，它更清楚该停什么。
    bkxkBus.on('authExpired', ({ source }) => {
      log.error(`登录态失效（来源：${source}），相关任务已停止`);
      ctx.panel.toast('登录态失效，请刷新页面重新登录', 'error');
      ctx.panel.activateTab(loginTab.id);
    });

    const session = readSession();
    if (!session.loggedIn) {
      log.warn('未读到有效登录态：学号或 token 缺失，功能接口会失败。请先在站内完成登录。');
    } else {
      log.info(`站点已就绪：${sessionSummary(session)}`);
    }
    log.info(`功能页=${String(ctx.isFeaturePage)}（设置 / 任务 / 监控 标签页已就绪）`);
  },
};

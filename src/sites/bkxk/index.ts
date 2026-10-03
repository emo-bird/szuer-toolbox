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
 * 交付节奏（用户已拍板分 4 批，每批一个可验证 commit）：
 *   批 1（本批）请求层 + 设置 + 风险门禁 + 旧数据迁移
 *   批 2 courses / time
 *   批 3 list / hijack / timetable
 *   批 4 tasks / monitor + 5 个标签页并入公共悬浮窗
 */

import { scoped } from '../../common/core/log.ts';
import type { SiteAdapter } from '../types.ts';
import { BKXK_TOGGLES, applyBkxkSettings, registerBkxkSettings, SITE_ID } from './settings.ts';
import { readSession, sessionSummary } from './session.ts';
import { runMigration } from './legacy.ts';

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
  // 标签页在批 4 补齐（任务 / 监控 / 自定义 / 设置 / 日志），本批先不加。
  tabs: [],
  toggles: BKXK_TOGGLES,

  /**
   * 启动期：只做「读 storage / 写 storage」，不碰 DOM。
   * 迁移必须在这里跑完 —— 后面的 courses / list 模块初始化时就要读迁移结果。
   */
  earlyInit(ctx) {
    const lines = runMigration();
    registerBkxkSettings();
    if (lines.length > 0) {
      log.info(`已从旧版迁移 ${lines.length} 条内容，详情见日志页`);
    } else {
      log.debug(`无旧数据需要迁移（earlyInit @ ${ctx.url.pathname}）`);
    }
  },

  /** 挂载期：DOM 已就绪，可以安全地把配置推给运行时并报登录态。 */
  init(ctx) {
    applyBkxkSettings();

    const session = readSession();
    if (!session.loggedIn) {
      log.warn('未读到有效登录态：学号或 token 缺失，功能接口会失败。请先在站内完成登录。');
    } else {
      log.info(`站点已就绪：${sessionSummary(session)}`);
    }
    log.info(`功能页=${String(ctx.isFeaturePage)}（标签页待批 4 接入）`);
  },
};

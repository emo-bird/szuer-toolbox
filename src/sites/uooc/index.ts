/**
 * UOOC 优课联盟适配器。
 *
 * 阶段 3 进行中。**当前批次只做视频助手（U1 二倍速 / U2 静音）**；
 * 测验答案与 LLM 答题那几项见 docs/需求文档.md §2.1 的 U6–U9 与
 * docs/UOOC-AI方案-逆向笔记.md。
 *
 * 历史：本目录在阶段 2 曾长期是空壳，只声明站点域以便日志/状态页能显示「站点=uooc」。
 *
 * 分支说明：AI 答题方案在 `feat/uooc-ai`；旧方案（测验答案采集与回填）在
 * `feat/uooc-phase3`，其逆向结论留在那边的 `docs/UOOC-制作方案.md`，不在本分支。
 */

import { scoped } from '../../common/core/log.ts';
import type { SiteAdapter } from '../types.ts';
import { SITE_ID, UOOC_TOGGLES, applyUoocSettings, registerUoocSettings } from './settings.ts';
import { startVideoAssist } from './video.ts';

const log = scoped('site/uooc');

/**
 * 站点域。
 *
 * `uooc.net.cn` 与 `*.uooc.net.cn` 都要写：前者覆盖裸域，后者覆盖 `www.` 等子域
 * （`matchAnyHost` 的通配语义与 `@match` 一致，`*.uooc.net.cn` **不含**裸域本身）。
 */
const HOSTS: readonly string[] = ['uooc.net.cn', '*.uooc.net.cn'];

/**
 * 功能页。
 *
 * 语义：命中 → 悬浮窗自动展开。这里是**精确路径**，不要图省事留空
 * （留空 = 任意页面都自动展开，连门户首页都会弹面板）。
 *
 * 三处对应实测到的真实 URL：
 *   - `/home/learn/index#/2042342697/57920722/...` —— 旧版学习页（hash 路由）
 *   - `/home/learn/new/2042342697#/...`           —— 新版学习页
 *   - `/exam/983779533`                           —— 新版答题页（tid 直接写在路径里）
 * 旧版的答题界面是**嵌在旧版学习页里的 iframe**（`/exam/paper?cid=&tid=`），
 * 所以它由第一条规则覆盖，不需要单独列。
 */
const PAGES: readonly string[] = ['/home/learn/index*', '/home/learn/new/*', '/exam/*'];

/** 视频助手只在学习页有意义（测验页没有播放器，挂着只是白跑观察器） */
const LEARN_PATH_PREFIX = '/home/learn/';

export const uoocAdapter: SiteAdapter = {
  id: SITE_ID,
  name: 'UOOC 优课联盟',
  hosts: HOSTS,
  pages: PAGES,
  tabs: [],
  toggles: UOOC_TOGGLES,

  /**
   * 启动期：此刻 `document.body` 还不存在，**只注册设置、不碰 DOM**。
   *
   * 必须在设置面板渲染之前注册完，否则用户打开设置页会看不到本站的开关。
   */
  earlyInit() {
    registerUoocSettings();
  },

  /** 挂载期：DOM 已就绪，可以开始接管播放器。 */
  init(ctx) {
    applyUoocSettings();

    const onLearnPage = location.pathname.startsWith(LEARN_PATH_PREFIX);
    if (onLearnPage) {
      startVideoAssist();
    } else {
      log.debug(`非学习页（${location.pathname}），本次不启动视频助手`);
    }

    log.info(
      `UOOC 适配器已启用：isFeaturePage=${String(ctx.isFeaturePage)}，` +
        `路径=${location.pathname}，视频助手=${onLearnPage ? '已挂载' : '未挂载'}`,
    );
  },
};

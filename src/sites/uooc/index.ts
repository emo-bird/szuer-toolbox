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
import { isEnabled } from '../../common/core/settings.ts';
import type { SiteAdapter } from '../types.ts';
import { autoAnswerExamPage } from './ai/index.ts';
import { startAutoplay } from './autoplay.ts';
import { installUoocIntercept } from './intercept.ts';
import { SITE_ID, TOGGLE, UOOC_TOGGLES, applyUoocSettings, registerUoocSettings } from './settings.ts';
import { UOOC_AI_TAB } from './tabs/ai.ts';
import { UOOC_AUTOPLAY_TAB } from './tabs/autoplay.ts';
import { UOOC_VIDEO_TAB } from './tabs/video.ts';
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
 *   - `/exam/paper?cid=2005836044&tid=153728628`  —— 答题页
 *
 * ⚠️ 更正：旧注释写「新版答题页 `/exam/983779533`，tid 直接写在路径里」，
 * **2025-xx 实测是 `/exam/paper?cid=&tid=`**（`tid` 取自目录资源的 `task_id`，
 * 见 `catalog.ts` 的 `examUrl()`）。这里两条 `/exam/*` 都能覆盖，不影响功能。
 */
const PAGES: readonly string[] = ['/home/learn/index*', '/home/learn/new/*', '/exam/*'];

/** 视频助手只在学习页有意义（测验页没有播放器，挂着只是白跑观察器） */
const LEARN_PATH_PREFIX = '/home/learn/';

/**
 * 答题页前缀。
 *
 * 答题页上**没有 SPA**（`/exam/paper?cid=&tid=` 是整页跳转过来的），所以这里
 * 既不起连播也不起视频助手，只把「自动作答」这一步接上 —— 连播那边整页跳过来
 * 就断了，接力全靠 `ai/handoff.ts` 那条交接条。
 */
const EXAM_PATH_PREFIX = '/exam/';

export const uoocAdapter: SiteAdapter = {
  id: SITE_ID,
  name: 'UOOC 优课联盟',
  hosts: HOSTS,
  pages: PAGES,
  tabs: [UOOC_VIDEO_TAB, UOOC_AUTOPLAY_TAB, UOOC_AI_TAB],
  /**
   * 本站的设置**拆成了三个标签页**（视频 / 连播 / AI 作答），没有任何一个 id
   * 能代表全部 ⇒ 必须显式声明，否则公共【设置】页会把同一批开关再渲染一遍。
   * 详见 `src/sites/types.ts` 的 `settingsInOwnTabs`。
   */
  settingsInOwnTabs: true,
  toggles: UOOC_TOGGLES,

  /**
   * 启动期：此刻 `document.body` 还不存在，**只注册设置、不碰 DOM**。
   *
   * 必须在设置面板渲染之前注册完，否则用户打开设置页会看不到本站的开关。
   */
  earlyInit() {
    registerUoocSettings();

    // ⚠️ 必须在这里装嗅探，不能挪到 init：
    // `earlyInit` 是 document-start，早于站点 Angular 启动；挪到 init 就会漏掉
    // 首屏那波 `getCatalogList`（`src/sites/types.ts:116-124` 有明文约束）。
    // 嗅探只读、不改写响应，所以不需要开关就能装（与 bkxk 的 hijack 同一口径）。
    installUoocIntercept();
  },

  /** 挂载期：DOM 已就绪，可以开始接管播放器。 */
  init(ctx) {
    applyUoocSettings();

    const onLearnPage = location.pathname.startsWith(LEARN_PATH_PREFIX);
    const onExamPage = location.pathname.startsWith(EXAM_PATH_PREFIX);
    let autoplayMounted = false;
    if (onLearnPage) {
      startVideoAssist();
      startAutoplay({ toast: (message, kind) => ctx.panel.toast(message, kind) });
      autoplayMounted = true;
    } else if (onExamPage) {
      // 用户 m04227 选的是「只要 URL 带 tid 且 AI 开着就自动」⇒ 这里不做任何
      // 「是不是从连播跳过来的」判断，触发条件就是这一个开关。
      // 安全阀在 autoAnswerExamPage 里：没有【提交】按钮的卷子（已交过的复习页）
      // 一律不填不动。
      if (isEnabled(SITE_ID, TOGGLE.AI_ANSWER)) {
        log.info('答题页：AI 作答开着，交给 ai/index.ts 自动接管');
        void autoAnswerExamPage(ctx.panel);
      } else {
        log.debug('答题页，但「AI 作答」开关没开，不自动作答');
      }
    } else {
      log.debug(`非学习页（${location.pathname}），本次不启动视频助手与连播`);
    }

    log.info(
      `UOOC 适配器已启用：isFeaturePage=${String(ctx.isFeaturePage)}，` +
        `路径=${location.pathname}，视频助手=${onLearnPage ? '已挂载' : '未挂载'}，` +
        `连播=${autoplayMounted ? '已挂载' : '未挂载'}`,
    );
  },
};

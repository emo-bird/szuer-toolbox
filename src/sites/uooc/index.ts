/**
 * UOOC 优课联盟适配器 —— **只做旧版课程页**（用户 m04485 的转向要求）。
 *
 * ## 两版 URL 与本站的分工（需求细则 §A）
 *
 * | | pathname | 本站做什么 |
 * |---|---|---|
 * | 旧版学习页 | `/home/learn/index` | **全部功能**：二倍速/静音/防失焦 + 连播 + AI 答题 |
 * | 新版学习页 | `/home/learn/new/{cid}` | **只弹一次全屏提示**问要不要切旧版；点「否」后是个**空面板** |
 * | 答题页 | `/exam/paper` | **不涉及** —— 旧版测验是**页内同源 iframe**（§A.4），本站不在顶级 `/exam/*` 上做任何事 |
 *
 * 判定**只看 `location.pathname` 前缀**，hash 不参与。
 *
 * ## 为什么删掉了「答题页」分支
 *
 * 旧实现的旧版流程是「连播整页跳到 `/exam/paper?tid=`，再靠 `ai/handoff.ts` 跨页面接力」。
 * 实测与用户确认（§A.4）旧版点测验**不跳转** —— 主区域直接换成答题 iframe。
 * 于是 `/exam/*` 作为**顶级页面**只属于新版流程，本站（只做旧版）不涉及；
 * `handoff.ts` 与 `autoAnswerExamPage()` 整条链路一并删除。
 *
 * ## 新版页为什么「什么都不留」
 *
 * 用户 m04485 第二轮拍板：新版页点「否」之后**挂面板但完全不启动任何 UOOC 功能**
 * （不起连播、不起视频助手、**不装接口嗅探**），面板里也不给任何「切到旧版」的入口
 * —— 就是个空面板。提示每次打开都弹，不记忆。
 */

import { scoped } from '../../common/core/log.ts';
import type { PanelApi, SiteAdapter } from '../types.ts';
import { startAutoplay } from './autoplay.ts';
import { installUoocIntercept } from './intercept.ts';
import { noticeBind } from './notice.ts';
import { SITE_ID, UOOC_TOGGLES, applyUoocSettings, registerUoocSettings } from './settings.ts';
import { UOOC_AI_TAB } from './tabs/ai.ts';
import { UOOC_AUTOPLAY_TAB } from './tabs/autoplay.ts';
import { UOOC_MONITOR_TAB } from './tabs/monitor.ts';
import { UOOC_VIDEO_TAB } from './tabs/video.ts';
import { UOOC_WAIT_TAB } from './tabs/wait.ts';
import { startVideoAssist } from './video.ts';
import { startVideoQuiz } from './video-quiz.ts';

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
 * 只有两版**课程页**：旧版要能用全部功能，新版要弹「切旧版」的提示。
 * `/exam/*` 不再列 —— 见文件头「为什么删掉了答题页分支」。
 */
const PAGES: readonly string[] = ['/home/learn/index*', '/home/learn/new/*'];

/** 旧版学习页前缀（实测 `/home/learn/index#/...`，hash 路由） */
const OLD_LEARN_PATH = '/home/learn/index';
/** 新版学习页前缀（实测 `/home/learn/new/2042342697#/...`） */
const NEW_LEARN_PREFIX = '/home/learn/new/';

/** 当前是不是新版课程页 */
function isNewVersionPage(): boolean {
  return location.pathname.startsWith(NEW_LEARN_PREFIX);
}

/** 当前是不是旧版课程页 */
function isOldVersionPage(): boolean {
  return location.pathname.startsWith(OLD_LEARN_PATH);
}

/**
 * 新版 URL → 旧版 URL：**只换 pathname 前缀，丢掉 `{cid}`，hash 与 search 一个字符都不动**。
 *
 * ```
 * /home/learn/new/2042342697#/1/2/3   →   /home/learn/index#/1/2/3
 * ```
 *
 * ⚠️ **不依赖站点自己的那个「旧版」入口**（用户第二轮拍板：自己拼 URL，更有把握）。
 * ⚠️ hash 为空（`/home/learn/new/2042342697` 后面什么都没有）→ 跳 `/home/learn/index`，
 *    旧版首页会自己选课。
 */
export function oldVersionUrl(href: string = location.href): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (!u.pathname.startsWith(NEW_LEARN_PREFIX)) return null;
  u.pathname = OLD_LEARN_PATH;
  return u.toString();
}

export const uoocAdapter: SiteAdapter = {
  id: SITE_ID,
  name: 'UOOC 优课联盟',
  hosts: HOSTS,
  pages: PAGES,
  tabs: [UOOC_VIDEO_TAB, UOOC_AUTOPLAY_TAB, UOOC_AI_TAB, UOOC_MONITOR_TAB, UOOC_WAIT_TAB],
  /**
   * 本站的设置**拆成了多个标签页**（视频 / 连播 / AI 作答 / 监视），没有任何一个 id
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

    // 新版页「什么都不留」（§A.2）⇒ 连嗅探都不装。
    if (isNewVersionPage()) {
      log.debug('新版课程页：不装接口嗅探（本次不启动任何 UOOC 功能）');
      return;
    }

    // ⚠️ 必须在这里装嗅探，不能挪到 init：
    // `earlyInit` 是 document-start，早于站点 Angular 启动；挪到 init 就会漏掉
    // 首屏那波 `getCatalogList`（`src/sites/types.ts:116-124` 有明文约束）。
    // 嗅探只读、不改写响应，所以不需要开关就能装（与 bkxk 的 hijack 同一口径）。
    installUoocIntercept();
  },

  /** 挂载期：DOM 已就绪，可以开始接管播放器。 */
  init(ctx) {
    applyUoocSettings();
    // 提示流（notice.ts）要一个 Toast 出口；站点模块拿不到 shadow root，只能在这里绑
    noticeBind(ctx.panel);

    if (isNewVersionPage()) {
      log.info('新版课程页：只弹「要不要切旧版」的提示，本次不启动任何 UOOC 功能');
      void promptSwitchToOld(ctx.panel);
      return;
    }

    if (!isOldVersionPage()) {
      log.debug(`非旧版课程页（${location.pathname}），本次不启动任何 UOOC 功能`);
      return;
    }

    startVideoAssist();
    // 视频随机小测：无条件自动作答（读 DOM 里的答案，用户 m06055 拍板不留开关）
    startVideoQuiz();
    // 只装载、不启动：由用户在【接管】页点【开始接管】（用户 m04485 第二轮拍板）
    // ⚠️ 这是**旧的 DOM 点击连播**（`./autoplay.ts`），新版接管在 `./takeover.ts`，
    //    入口在 `tabs/autoplay.ts`。旧的这行等 §G 清理时一起删。
    startAutoplay(ctx.panel);
    log.info(
      `UOOC 旧版课程页已启用：isFeaturePage=${String(ctx.isFeaturePage)}，` +
        `路径=${location.pathname}，视频助手=已挂载，小测助手=已挂载，接管=等用户点开始`,
    );
  },
};

/**
 * 新版课程页的全屏提示（§A.2）。
 *
 * 形态复用面板的确认框（`src/common/ui/widgets/confirm.ts` 的 `showConfirm`，
 * 已是全屏遮罩 + 居中框，支持 Esc / 点遮罩取消）。
 *
 * **每次打开都弹，不记忆** —— 点「不用，我自己看」只对本次生效。
 */
async function promptSwitchToOld(host: PanelApi): Promise<void> {
  const yes = await host.confirm({
    title: '检测到新版课程页',
    body: '本插件只适配旧版课程页，是否切换到旧版？',
    confirmText: '切换到旧版',
    cancelText: '不用，我自己看',
  });

  if (!yes) {
    log.info('用户选择留在新版页 —— 面板挂空，不启动任何 UOOC 功能');
    return;
  }

  const target = oldVersionUrl();
  if (target === null) {
    const msg = '拼不出旧版地址，请手动把地址栏的 /home/learn/new/<cid> 改成 /home/learn/index';
    log.error(msg);
    host.toast(msg, 'error');
    return;
  }
  log.info(`切换到旧版：${target}`);
  location.href = target;
}

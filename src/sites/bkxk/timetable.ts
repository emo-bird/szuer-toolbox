/**
 * 课表页（`*default/curriculum.do`）：**我们不再自己画课表**（v0.29 用户拍板）。
 *
 * 【这是什么形态】
 * 站点自己的渲染管线负责把课表画出来，我们只做两件事：
 *   1. 在**响应接管**里给自定义课程那一行塞一个「自定义」标签（`hijack.ts` + `tt-mark.ts`）；
 *   2. 站点若在我们赶到之前就把课表画完了（拿的是没改写的响应），**请它再画一次**
 *      —— 重画会重新请求 `teachingTime.do`，这次能经过我们的包装（晚到补偿，v0.27 起）。
 * 为什么不再自绘：v0.22–v0.28 是「自己算 `top`/`height` 往列里写 `.cv-lesson`」，
 * 手测第十轮暴露出「同一门课出现两份 / 位置错乱」一类问题，用户判定自绘这条路不划算。
 *
 * ⚠️ 选择器照旧仓库的 DOM 契约写（站点 `docs/curriculum.do.html`），真机验证靠手测。
 * 纯逻辑（要不要补请）在 `timetable-model.ts`，本文件只做 DOM 与调度。
 */

import { scoped } from '../../common/core/log.ts';
import { el, whenDomReady } from '../../common/utils/dom.ts';
import { readEnabledCustomCourses } from './custom.ts';
import { didRewriteTimetable, kindEnabled } from './hijack.ts';
import { pageRecord } from './page-realm.ts';
import { TT_CSS, TT_STYLE_ID } from './timetable-style.ts';
import {
  MAX_REFETCH_TRIES,
  SITE_CARD_CLASS,
  SITE_TABLE_ID,
  SITE_TABLE_SELECTOR,
  shouldRefetchSite,
} from './timetable-model.ts';
import { TT_TAG_SELECTOR } from './tt-mark.ts';

const log = scoped('site/bkxk/timetable');

/** 课表页路径片段（与适配器 `pages` 的判据同源） */
const TT_PAGE_MARK = 'curriculum.do';
/** 站点是异步渲染课表，等容器的次数与间隔（旧仓库 20 × 500ms） */
const MAX_TRIES = 20;
const RETRY_MS = 500;
/** 站点重绘的去抖（旧仓库 300ms） */
const RESCAN_DELAY_MS = 300;

/**
 * 站点自己那个「请求 `teachingTime.do` 并画课表」的全局模块名。
 *
 * 来源是**实测**而不是猜的：课表页加载的 `…/js/curriculum/curriculum.min.js`（6635 字符）
 * 里，这个 IIFE 的参数就是它，且它的 `init()` 无参、内部自己从 `sessionStorage`
 * 读 `studentInfo` / `sysParam` 再发请求：
 *
 * ```js
 * var t = e.dataList, i = JSON.parse(sessionStorage.getItem("sysParam")),
 *     r = { sectionList: {…}, teachingTime: t };
 * CVMyCourseTable.init($("#myCourseTable"), r);
 * ```
 *
 * （同一份文件里还有 `CVNoArranged` / `CVMyCourseTable` / `CVPublicCourse` 等，
 * 名字都用 `window.X = window.X || {}` 挂出来。改版就失效 —— 失效时只落一条 warn，
 * 后果是自定义课程这一轮不出现，用户刷新页面即可重来。）
 */
const SITE_TIMETABLE_MODULE = 'CVQueryCurriculum';

/** 自动补请已经用过几次（用户自己改课程触发的不计入 —— 那是他点的，见 `refreshTimetable`） */
const autoRefetch = { tried: 0 };
/** 「站点画出的课表里带上我们的标记」这条 info 只落一次 */
let loggedDrawn = false;

// ------------------------------------------------------------ 页面事实

/** 找课表容器；找不到返回 null（非课表页、或还没渲染出来、或站点结构变了） */
export function findTable(doc: Document = document): HTMLElement | null {
  return doc.getElementById(SITE_TABLE_ID) ?? doc.querySelector<HTMLElement>(SITE_TABLE_SELECTOR);
}

/** 表里站点已经画出来的卡片数 */
function countSiteCards(table: HTMLElement): number {
  return table.querySelectorAll(`.${SITE_CARD_CLASS}`).length;
}

/** 表里我们的标记有几个 —— 有就说明站点画的这一版里已经带着自定义课程 */
function countTags(table: HTMLElement): number {
  return table.querySelectorAll(TT_TAG_SELECTOR).length;
}

/** 把「自定义」标签的样式塞进页面（标签待在站点卡片里，必须与站点样式同作用域） */
function injectTagStyle(): void {
  if (document.getElementById(TT_STYLE_ID) !== null) return;
  const style = el('style', { attrs: { id: TT_STYLE_ID } });
  style.textContent = TT_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

// ------------------------------------------------------------ 晚到补偿

/**
 * 请站点**重新请求一次**课表并重画。
 *
 * 为什么会有这种需要（真机实测）：用户脚本由 Tampermonkey 异步投进页面，暖缓存下普通刷新
 * 时 `teachingTime.do` 在页面加载后第 **75ms** 就发出去了，我们的 XHR 包装那时还没装上
 * ⇒ 站点拿到的还是原样响应，画出来的课表里没有自定义课程，且**界面上完全看不出异常**。
 * 硬刷新 / 限速 3G 都因为页面变慢而恰好让我们先到，所以只有普通刷新会中招。
 *
 * 返回是否真的触发了。
 */
function askSiteToRefetch(reason: string): boolean {
  const mod = pageRecord()[SITE_TIMETABLE_MODULE] as { init?: unknown } | undefined;
  if (mod === undefined || typeof mod.init !== 'function') {
    log.warn(
      `站点没有 ${SITE_TIMETABLE_MODULE}.init（改版了？）—— 这一轮的自定义课程不会出现，刷新页面可重来`,
    );
    return false;
  }
  log.info(
    `请站点重新请求一次课表（${reason}；上一发响应${
      didRewriteTimetable() ? '已被我们改写' : '我们没赶上'
    }）⇒ ${SITE_TIMETABLE_MODULE}.init()`,
  );
  (mod.init as () => void).call(mod);
  return true;
}

/**
 * 自动补请：判据是纯函数 `shouldRefetchSite`（有站点卡片、但我们一个标记都没有），
 * 次数上限 `MAX_REFETCH_TRIES`，避免与站点互相触发。
 */
function autoRefetchIfNeeded(table: HTMLElement): boolean {
  const enabled = readEnabledCustomCourses().length;
  const cards = countSiteCards(table);
  const tags = countTags(table);
  const ok = shouldRefetchSite({
    hijackOn: kindEnabled('timetable'),
    tried: autoRefetch.tried,
    maxTries: MAX_REFETCH_TRIES,
    enabledCourses: enabled,
    siteCards: cards,
    tags,
  });
  if (!ok) {
    // 已经接住了：落一条 info（只落一次），手测时用来确认走的是哪条路
    if (!loggedDrawn && tags > 0) {
      loggedDrawn = true;
      log.info(
        `站点画出的课表里已经带上我们的标记 ${String(tags)} 个（自定义课程 ${String(enabled)} 门）`,
      );
    }
    return false;
  }
  autoRefetch.tried += 1;
  return askSiteToRefetch(
    `站点已经画完 ${String(cards)} 张卡片、里面没有我们的标记（第 ${String(autoRefetch.tried)} 次）`,
  );
}

/**
 * 让外部（【自定义课程】标签页）在改完课程后**请站点重画一次**。
 *
 * 为什么必须主动做：增删课程只改 storage，站点 DOM 一个字节都没动 ⇒ MutationObserver
 * 不会触发，用户在课表页会以为「加了课却没出现」。旧仓库 `ui.js:485,508,523,534`
 * 每处改完都调一次重画，同一原因。
 *
 * 返回 1 表示已经请站点重画（调用方可据此提示），0 表示无事可做
 * （不在课表页 / 没有启用的自定义课程 / 接管开关关着 / 站点改版）。
 */
export function refreshTimetable(): number {
  const table = findTable();
  if (table === null) return 0;
  if (readEnabledCustomCourses().length === 0) return 0;
  if (!kindEnabled('timetable')) return 0;
  return askSiteToRefetch('你在【自定义】里改了课程') ? 1 : 0;
}

// ------------------------------------------------------------ 启动

/**
 * 启动课表页接管。返回停止函数。
 *
 * 只在课表页生效（适配器的 `pages` 里也有同源判据，这里再挡一次是为了让
 * 单元测试与「误注入」都无路可走）。
 */
export function startTimetableInjection(): () => void {
  if (!location.pathname.includes(TT_PAGE_MARK)) {
    log.debug(`当前不是课表页（${location.pathname}），跳过课表接管`);
    return () => undefined;
  }

  let observer: MutationObserver | null = null;
  let timer: number | null = null;
  let retry: number | null = null;
  let tries = 0;

  /**
   * 站点每次重绘都会走到这里。
   *
   * ⚠️ 这里**不再有** v0.26 那个「我注入的节点还在不在」的防自触发判据：我们一个字节都
   * 不往表里写了，写进去的只有 `<style>`（挂在 `document.head`，不在观察范围内），
   * 所以不存在「自己触发自己」的循环。循环风险改由 `MAX_REFETCH_TRIES` 兜住：
   * 补请最多 3 次，且要求「有站点卡片 + 没有我们的标记」同时成立。
   */
  const schedule = (): void => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      const table = findTable();
      if (table === null) return;
      injectTagStyle();
      autoRefetchIfNeeded(table);
    }, RESCAN_DELAY_MS);
  };

  const attempt = (): void => {
    const table = findTable();
    if (table === null) {
      tries += 1;
      if (tries < MAX_TRIES) {
        retry = window.setTimeout(attempt, RETRY_MS);
      } else {
        log.warn(`未找到课表容器 #${SITE_TABLE_ID}，放弃接管（站点的课表可能还没出数据）`);
      }
      return;
    }
    injectTagStyle();
    const courses = readEnabledCustomCourses();
    log.info(
      `课表页接管就绪：自定义课程 ${String(courses.length)} 门；课表由站点自己画，我们只加「自定义」标签`,
    );
    // 站点此刻可能已经画完了（我们到得晚）—— 先判一次，再挂观察器跟着后面的重绘
    autoRefetchIfNeeded(table);
    observer = new MutationObserver(schedule);
    observer.observe(table, { childList: true, subtree: true });
  };

  whenDomReady(attempt);

  return () => {
    observer?.disconnect();
    observer = null;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (retry !== null) {
      window.clearTimeout(retry);
      retry = null;
    }
  };
}

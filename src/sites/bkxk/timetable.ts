/**
 * 课表页（`*default/curriculum.do`）注入：把自定义课程画进**站点自己的课表列**。
 *
 * 形态照旧仓库 `src/timetable.js`（用户已拍板）：不自建容器、不重画整张表，
 * 而是在站点每一列里按「星期 + 起止节次」算出 `top`/`height`，追加一个 `.cv-lesson`，
 * 内部放与站点同构的 `.cv-course-card-single`（带我们的标记类以示区分）。
 *
 * ⚠️ 选择器全部照旧仓库的 DOM 契约写（站点 `docs/curriculum.do.html`），
 * **真机验证留给手测** —— 本项目惯例是「先真机只读采样再写选择器」，
 * 但课表页只在**真有已选课程**时结构才完整，所以这一块先按契约落地、由手测确认。
 *
 * 纯逻辑（几何 / 派单 / 读已选课程）在 `timetable-model.ts`，本文件只做 DOM。
 */

import { scoped } from '../../common/core/log.ts';
import { isEnabled } from '../../common/core/settings.ts';
import { el, whenDomReady } from '../../common/utils/dom.ts';
import { readEnabledCustomCourses } from './custom.ts';
import { didRewriteTimetable, kindEnabled } from './hijack.ts';
import { pageRecord } from './page-realm.ts';
import { SITE_ID, TOGGLE } from './settings.ts';
import { TT_CSS, TT_STYLE_ID } from './timetable-style.ts';
import {
  DEFAULT_SLOT_H,
  DEFAULT_TOP0,
  SITE_CARD_CLASS,
  SITE_CARD_LINE_SELECTOR,
  SITE_CARD_SELECTOR,
  SITE_DAY_COLUMN_SELECTOR,
  SITE_HEAD_SELECTOR,
  SITE_LESSON_SELECTOR,
  SITE_LEFT_SELECTOR,
  SITE_TABLE_ID,
  SITE_TABLE_SELECTOR,
  SITE_TOP_LINE_CLASS,
  TT_CARD_CLASS,
  TT_CONFLICT_CLASS,
  TT_CONFLICT_TIP,
  TT_DONE_ATTR,
  TT_HOLDER_CLASS,
  TT_LESSON_CLASS,
  TT_LINES_CLASS,
  TT_TAG_CLASS,
  TT_TAG_TEXT,
  TT_TIP_CLASS,
  findDayColumnIndex,
  needsRescan,
  pickSlotH,
  planInjection,
  readExistingCards,
  renderedCourseNames,
  segLabel,
  shouldRefetchSite,
} from './timetable-model.ts';
import type { InjectionPlan, RawCard } from './timetable-model.ts';
import type { BkxkCustomCourse } from './custom.ts';
import type { TimeSegment } from './time.ts';

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
 * 功能退回自绘，不会打扰用户。）
 */
const SITE_TIMETABLE_MODULE = 'CVQueryCurriculum';

/** 晚到补偿是否已经试过（只试一次，见 `shouldRefetchSite`） */
const refetch = { tried: false };

// ------------------------------------------------------------ 找容器 / 量尺寸

/** 找课表容器；找不到返回 null（非课表页、或还没渲染出来、或站点结构变了） */
export function findTable(doc: Document = document): HTMLElement | null {
  return doc.getElementById(SITE_TABLE_ID) ?? doc.querySelector<HTMLElement>(SITE_TABLE_SELECTOR);
}

/** 单节高度：从左侧真实刻度量，量不到退回 54 */
function measure(table: HTMLElement): number {
  const lesson = table.querySelector(`${SITE_LEFT_SELECTOR} ${SITE_LESSON_SELECTOR}`);
  if (lesson === null) return DEFAULT_SLOT_H;
  const first = lesson.firstElementChild;
  const raw = first instanceof HTMLElement ? first.style.height : '';
  return pickSlotH([raw]);
}

/** 各列的列头文本（`周一`…`周七`），按 DOM 顺序 */
function columnHeads(table: HTMLElement): string[] {
  const out: string[] = [];
  for (const col of table.querySelectorAll<HTMLElement>(SITE_DAY_COLUMN_SELECTOR)) {
    out.push(col.querySelector<HTMLElement>(SITE_HEAD_SELECTOR)?.textContent?.trim() ?? '');
  }
  return out;
}

// ------------------------------------------------------------ 读站点已选课程

/** 把站点卡片抠成纯数据（`timetable-model.readExistingCards` 吃这个） */
function readRawCards(table: HTMLElement): RawCard[] {
  const out: RawCard[] = [];
  for (const card of table.querySelectorAll<HTMLElement>(`.${TT_CARD_CLASS}, ${SITE_CARD_SELECTOR}`)) {
    if (!(card instanceof HTMLElement)) continue;
    const parts: string[] = [];
    for (const line of card.querySelectorAll<HTMLElement>(SITE_CARD_LINE_SELECTOR)) {
      parts.push(line.textContent ?? '');
    }
    out.push({ className: card.getAttribute('class'), parts });
  }
  return out;
}

// ------------------------------------------------------------ 建节点 / 注入

function injectStyle(): void {
  if (document.getElementById(TT_STYLE_ID) !== null) return;
  const style = el('style', { attrs: { id: TT_STYLE_ID } });
  style.textContent = TT_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

/** 造一张自定义课程卡片：结构对齐站点（`div > div{课名+标签, 时间, 地点, 教师, 冲突提示}`） */
function buildCard(seg: TimeSegment, course: BkxkCustomCourse, conflict: boolean): HTMLElement {
  // 课名是**纯文本节点** + 一个「自定义」标签 span（与站点卡片同构）
  const head = el('div', {}, course.name);
  head.appendChild(el('span', { class: TT_TAG_CLASS, text: TT_TAG_TEXT }));

  const lines: HTMLElement[] = [head, el('div', { text: segLabel(seg) })];
  if (seg.place !== '') lines.push(el('div', { text: seg.place }));
  if (course.teacher !== '') lines.push(el('div', { text: course.teacher }));
  if (conflict) lines.push(el('div', { class: TT_TIP_CLASS, text: TT_CONFLICT_TIP }));

  // ⚠️ 这几行必须包在中间那层 div 里（站点同构：`.cv-course-card-single > div > div`）——
  // 站点给卡片本身的 CSS 会把**直接子元素**排成一行，漏了这层就变成「左中右」。
  const box = el('div', { class: TT_LINES_CLASS }, ...lines);

  const card = el(
    'div',
    {
      class: `${SITE_CARD_CLASS} ${TT_CARD_CLASS}${conflict ? ` ${TT_CONFLICT_CLASS}` : ''}`,
      attrs: { [TT_DONE_ATTR]: '1' },
    },
    box,
  );
  // 自定义课程的颜色由用户选（`CUSTOM_COLORS` / `colorAt`），站点自己的卡片不吃这个字段
  if (course.color !== '') card.style.background = course.color;
  return card;
}

/**
 * 把一条派单注进去。
 * 结构照站点：`.cv-lesson[start][end][style=top/height] > div > .cv-course-card-single`
 */
function injectPlan(table: HTMLElement, plan: InjectionPlan): boolean {
  const heads = columnHeads(table);
  const index = findDayColumnIndex(heads, plan.seg.day);
  if (index < 0) {
    log.debug(`第 ${String(plan.seg.day)} 天没有对应列，跳过（列头=${heads.join(',')}）`);
    return false;
  }
  const cols = table.querySelectorAll<HTMLElement>(SITE_DAY_COLUMN_SELECTOR);
  const col = cols[index];
  if (col === undefined) return false;

  const wrap = el('div', {
    class: `${SITE_LESSON_SELECTOR.slice(1)} ${SITE_TOP_LINE_CLASS} ${TT_LESSON_CLASS}`,
    attrs: {
      start: String(plan.seg.sectionFrom),
      end: String(plan.seg.sectionTo),
      [TT_DONE_ATTR]: '1',
    },
    style: { height: `${String(plan.height)}px`, top: `${String(plan.top)}px` },
  });
  wrap.appendChild(el('div', { class: TT_HOLDER_CLASS }, buildCard(plan.seg, plan.course, plan.conflict)));
  col.appendChild(wrap);
  return true;
}

/** 清掉上一轮注入的块（站点重绘、或用户关掉开关时用） */
export function clearInjected(table: HTMLElement | null): number {
  const scope: ParentNode = table ?? document;
  const olds = scope.querySelectorAll<HTMLElement>(`.${TT_LESSON_CLASS}`);
  for (const node of olds) node.remove();
  return olds.length;
}

/** 当前页面上还留着几个我们注入的「一节课」（判断站点有没有把我们抹掉） */
export function countInjected(table: HTMLElement | null): number {
  const scope: ParentNode = table ?? document;
  return scope.querySelectorAll(`.${TT_LESSON_CLASS}`).length;
}

// ------------------------------------------------------------ 渲染与扫描

/**
 * `writing` 闸门：我们自己的 appendChild 也会触发 MutationObserver，若不设防就会
 * 「注入 → 触发回调 → 清掉再注入」无限循环。写 DOM 期间置位，回调看到它就跳过。
 *
 * 放在模块级（而不是 `startTimetableInjection` 的局部）是因为【自定义课程】标签页
 * 增删改之后要立刻重画一次 —— 那时站点 DOM 没有任何变化，观察器不会触发，
 * 只能由 `refreshTimetable()` 主动调，两边必须共用同一个闸门对象。
 */
const writing = { busy: false };

export function render(table: HTMLElement, gate: { busy: boolean }): number {
  gate.busy = true;
  try {
    clearInjected(table);
    const courses = readEnabledCustomCourses();
    const cards = readExistingCards(readRawCards(table));
    const plans = planInjection(courses, cards, {
      slotH: measure(table),
      top0: DEFAULT_TOP0,
    });
    let count = 0;
    for (const plan of plans) {
      if (injectPlan(table, plan)) count += 1;
    }
    // 站点自己画过的那几门，自绘会跳过（否则同一门课出现两份卡片）
    const rendered = renderedCourseNames(cards);
    const skipped = courses.filter((c) => c.enabled && rendered.has(c.name.trim())).length;
    log.info(
      `课表注入自定义课程段 ${String(count)} 个（已选课程 ${String(cards.length)} 门${
        skipped > 0 ? `；站点已自己画出 ${String(skipped)} 门，自绘跳过` : ''
      }）`,
    );
    return count;
  } finally {
    gate.busy = false;
  }
}

/**
 * 晚到补偿：发现「站点把课表画完了、而我们没赶上那条响应」时，请站点**重新请求一次**。
 *
 * 为什么会有这种情况（真机实测）：用户脚本由 Tampermonkey 异步投进页面，暖缓存下普通刷新
 * 时 `teachingTime.do` 在页面加载后第 **75ms** 就发出去了，我们的 XHR 包装那时还没装上
 * ⇒ 站点拿到的还是原样响应，画出来的课表里没有自定义课程，且**界面上完全看不出异常**。
 * 硬刷新 / 限速 3G 都因为页面变慢而恰好让我们先到，所以只有普通刷新会中招。
 *
 * 这里只做「让它再请求一次」这件小事 —— 请求会再次经过我们的包装（v0.24 已确认包装装在
 * 页面 realm），这次就能改写成功。补偿只试一次，避免与站点互相重绘。
 *
 * 返回是否真的触发了（触发时调用方这一轮就别画了，表马上会被站点重画）。
 */
function refetchSiteTable(table: HTMLElement): boolean {
  const ok = shouldRefetchSite({
    hijackOn: kindEnabled('timetable'),
    didRewrite: didRewriteTimetable(),
    alreadyTried: refetch.tried,
    enabledCourses: readEnabledCustomCourses().length,
    siteCards: table.querySelectorAll(`.${SITE_CARD_CLASS}`).length,
  });
  if (!ok) return false;

  // 先记上「试过了」：站点模块名若对不上，也不该每次 DOM 变动都再试一遍
  refetch.tried = true;
  const mod = pageRecord()[SITE_TIMETABLE_MODULE] as { init?: unknown } | undefined;
  if (mod === undefined || typeof mod.init !== 'function') {
    log.warn(
      `站点没有 ${SITE_TIMETABLE_MODULE}.init（改版了？）—— 放弃晚到补偿，继续用自绘兜底`,
    );
    return false;
  }
  log.info(
    `站点已自行画完课表、而我们没赶上那条响应 ⇒ 请站点重新请求一次 ${SITE_TIMETABLE_MODULE}.init()（这次会经过我们的包装）`,
  );
  (mod.init as () => void).call(mod);
  return true;
}

/**
 * 扫一遍并按需重画；返回注入的节次数。
 *
 * 开关关着时**顺手清掉**已注入的节点（用户拨开关不用刷新页面）。
 */
function scan(gate: { busy: boolean }): number {
  const table = findTable();
  if (table === null) return 0;
  // 晚到补偿要在自绘开关判断**之前**做：用户要的正是「关掉自绘、让站点自己画」那条路
  if (refetchSiteTable(table)) return 0;
  if (!isEnabled(SITE_ID, TOGGLE.TIMETABLE_SELF_DRAW)) {
    const n = clearInjected(table);
    if (n > 0) log.info(`自绘课表开关已关闭：移除 ${String(n)} 个注入节点`);
    return 0;
  }
  injectStyle();
  return render(table, gate);
}

/**
 * 让外部（【自定义课程】标签页）在改完课程后**立即**重画一次。
 *
 * 为什么必须主动调：增删课程只改 storage，站点 DOM 一个字节都没动 ⇒
 * MutationObserver 不会触发，用户在课表页会以为「加了课却没出现」。
 * 旧仓库 `ui.js:485,508,523,534` 每处改完都调一次 `NS.timetable.render()`，同一原因。
 *
 * 不在课表页（找不到表）时返回 0，静默无事 —— 调用方不必自己判页面。
 */
export function refreshTimetable(): number {
  return scan(writing);
}

/**
 * 启动课表注入。返回停止函数。
 *
 * 只在课表页生效（适配器的 `pages` 里也有同源判据，这里再挡一次是为了让
 * 单元测试与「误注入」都无路可走）。
 */
export function startTimetableInjection(): () => void {
  if (!location.pathname.includes(TT_PAGE_MARK)) {
    log.debug(`当前不是课表页（${location.pathname}），跳过自绘课表`);
    return () => undefined;
  }

  let observer: MutationObserver | null = null;
  let timer: number | null = null;
  let retry: number | null = null;
  let tries = 0;

  const schedule = (): void => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      // 我们自己的写入期间不重画（同任务内的自触发）。
      if (writing.busy) return;
      const table = findTable();
      if (table === null) return;
      if (!isEnabled(SITE_ID, TOGGLE.TIMETABLE_SELF_DRAW)) {
        scan(writing);
        return;
      }
      // ⚠️ 关键判据：**只有我们注入的节点被抹掉了才重画**（站点翻页 / 切学期会整段重绘）。
      // 若节点还在，说明这次 DOM 变动就是我们自己上一次注入造成的 —— 而 MutationObserver
      // 的回调是**异步**投递的，`writing` 闸门那时早已复位，拦不住它 ⇒ 会变成
      // 「清掉 → 重注入 → 又触发 → 每 300ms 一次」的死循环（v0.26 修的真 bug）。
      if (!needsRescan(countInjected(table), readEnabledCustomCourses().length)) return;
      scan(writing);
    }, RESCAN_DELAY_MS);
  };

  const attempt = (): void => {
    const table = findTable();
    if (table === null) {
      tries += 1;
      if (tries < MAX_TRIES) {
        retry = window.setTimeout(attempt, RETRY_MS);
      } else {
        log.warn(`未找到课表容器 #${SITE_TABLE_ID}，放弃注入（站点的课表可能还没出数据）`);
      }
      return;
    }
    scan(writing);
    // 站点的翻页 / 切换学期全是 XHR + 重绘，跟着补注入
    observer = new MutationObserver(schedule);
    observer.observe(table, { childList: true, subtree: true });
    const courses = readEnabledCustomCourses();
    log.info(`自绘课表已就绪：自定义课程 ${String(courses.length)} 门（单节 ${String(measure(table))}px）`);
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
    clearInjected(findTable());
  };
}

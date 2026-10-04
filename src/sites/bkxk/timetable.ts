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
import { pageSessionStorage } from '../../common/utils/page.ts';
import { readEnabledCustomCourses } from './custom.ts';
import { installedAt, kindEnabled } from './hijack.ts';
import { pageRecord } from './page-realm.ts';
import { readSession } from './session.ts';
import { SITE_ID, TOGGLE } from './settings.ts';
import { fetchMergedTimetable, judgeLate, readTeachingTimeStarts } from './timetable-late.ts';
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
  shouldOwnRender,
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
 * 站点自己那个课表渲染器挂在哪。
 *
 * 实测来源：HAR 里那份 `curriculum.min.js`（6635 字符）—— 站点取完
 * `teachingTime.do` 后调的正是 `CVMyCourseTable.init($("#myCourseTable"), {sectionList, teachingTime})`。
 * 晚到补偿复用它，才能画出与站点**一模一样的**课表（含左侧节次栏与课程块样式）。
 */
const SITE_RENDERER_MODULE = 'CVMyCourseTable';

/** 晚到补偿只做一次（本次页面加载内） */
const ownRender = { tried: false };

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
    const cards = readExistingCards(readRawCards(table));
    const plans = planInjection(readEnabledCustomCourses(), cards, {
      slotH: measure(table),
      top0: DEFAULT_TOP0,
    });
    let count = 0;
    for (const plan of plans) {
      if (injectPlan(table, plan)) count += 1;
    }
    log.info(`课表注入自定义课程段 ${String(count)} 个（已选课程 ${String(cards.length)} 门）`);
    return count;
  } finally {
    gate.busy = false;
  }
}

// ------------------------------------------------- 晚到补偿（自己取一次，交给站点画）

/** 读页面 `sessionStorage.sysParam`（站点渲染器要的 `sectionList` 从这里来） */
function readSysParam(): Record<string, unknown> {
  const ss = pageSessionStorage();
  if (ss === null) return {};
  try {
    const raw = ss.getItem('sysParam');
    if (raw === null || raw === '') return {};
    const json: unknown = JSON.parse(raw);
    if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
    return json as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * 调站点自己的渲染器重画整张课表（行里已经含我们合并进去的自定义课程）。
 *
 * 三个前提缺一不可：页面世界的 `jQuery`（渲染器要一个 jQuery 对象，**不是 DOM 元素**：
 * 它内部会 `.html()` / `.outerHeight()` / `.attr()`）、`CVMyCourseTable.init`、
 * 以及 `sessionStorage.sysParam` 里的三段节次表。缺任何一个就返回 false，由自绘兜底。
 */
export function callSiteRenderer(table: HTMLElement, rows: readonly unknown[]): boolean {
  const realm = pageRecord();
  const jq = realm['jQuery'];
  if (typeof jq !== 'function') return false;

  const mod = realm[SITE_RENDERER_MODULE];
  if (mod === null || typeof mod !== 'object') return false;
  const init = (mod as Record<string, unknown>)['init'];
  if (typeof init !== 'function') return false;

  const sys = readSysParam();
  // ⚠️ 站点自己把 `morningSectionList` 拼成了 `morringSectionList`（实测原文如此），
  // 必须跟着拼错，否则左侧节次栏是空的。三个都没有就说明 sysParam 形状变了，别硬来。
  const sectionList = {
    morringSectionList: sys['morningSectionList'],
    afternoonSectionList: sys['afternoonSectionList'],
    nightSectionList: sys['nightSectionList'],
  };
  if (
    sectionList.morringSectionList === undefined &&
    sectionList.afternoonSectionList === undefined &&
    sectionList.nightSectionList === undefined
  ) {
    log.warn('晚到补偿：读不到 sessionStorage.sysParam 的节次表，跳过（继续用自绘兜底）');
    return false;
  }

  try {
    // 传元素即可（jQuery 两种都吃）；用我们手上这个节点，省得它再查一次 DOM
    const $ = jq as (target: unknown) => unknown;
    (init as (this: unknown, el: unknown, data: unknown) => void).call(mod, $(table), {
      sectionList,
      teachingTime: rows,
    });
    return true;
  } catch (err) {
    log.warn('晚到补偿：站点渲染器抛错', err);
    return false;
  }
}

/** 自己取一次课表、合并自定义课程、交给站点渲染器画（异步，失败只记日志） */
async function ownRenderAsync(table: HTMLElement, courses: readonly BkxkCustomCourse[]): Promise<void> {
  const session = readSession();
  const res = await fetchMergedTimetable({
    items: courses,
    studentCode: session.studentCode,
    token: session.token,
  });
  if (!res.ok) {
    log.warn(`晚到补偿失败：${res.reason}（继续用自绘兜底）`);
    return;
  }
  // 请求期间站点可能已经把表重画过一遍（容器换了），重新找一次
  const now = findTable() ?? table;
  if (!callSiteRenderer(now, res.dataList)) {
    log.warn('晚到补偿：站点渲染器用不了（jQuery / CVMyCourseTable 找不到）—— 继续用自绘兜底');
    return;
  }
  log.info(`晚到补偿完成：请站点渲染器重画了整张课表，其中含我们的 ${String(res.added)} 段`);
}

/**
 * 判断这一轮要不要走晚到补偿；要就发起来（异步）并返回 true。
 *
 * `timing-late.ts` 的 `judgeLate` 只把「谁快谁慢」写进日志，**不参与这个判断** ——
 * 判断只看页面事实：我们手上还有课，而站点画完的表里一门都没有。
 */
function tryOwnRender(table: HTMLElement): boolean {
  const courses = readEnabledCustomCourses();
  const enabled = courses.filter((c) => c.enabled);
  const rendered = renderedCourseNames(readExistingCards(readRawCards(table)));
  const missing = enabled.filter((c) => !rendered.has(c.name.trim())).length;

  const ok = shouldOwnRender({
    hijackOn: kindEnabled('timetable'),
    selfDrawOff: !isEnabled(SITE_ID, TOGGLE.TIMETABLE_SELF_DRAW),
    alreadyTried: ownRender.tried,
    enabledCourses: enabled.length,
    missingCourses: missing,
    siteCards: readExistingCards(readRawCards(table)).length,
  });
  if (!ok) return false;

  ownRender.tried = true;
  log.info(
    `站点已经画完课表，但里面一门自定义课程都没有（${String(missing)} 门缺）⇒ 自己补一次 teachingTime.do，交给站点渲染器重画`,
  );
  void ownRenderAsync(table, courses);
  return true;
}

/** 把「谁快谁慢」写进日志（每次到课表页写一次；补偿触发时它就是证据） */
function logTiming(): void {
  const at = installedAt();
  if (at === null) {
    log.info('响应接管没装上（环境里没有 XHR 也没有 fetch）⇒ 本站的响应改不到');
    return;
  }
  log.info(judgeLate(at, readTeachingTimeStarts()).text);
}

/**
 * 扫一遍并按需重画；返回注入的节次数。
 *
 * 开关关着时**顺手清掉**已注入的节点（用户拨开关不用刷新页面）。
 */
function scan(gate: { busy: boolean }): number {
  const table = findTable();
  if (table === null) return 0;
  // ⚠️ 晚到补偿必须排在自绘开关判断**之前**：用户要的正是「关掉自绘也让站点自己画」。
  if (tryOwnRender(table)) return 0;
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

  // 「谁快谁慢」先记一笔：站点那条 teachingTime.do 要是比我们装接管还早，日志里就能看出来
  logTiming();

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

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
  TT_TAG_CLASS,
  TT_TAG_TEXT,
  TT_TIP_CLASS,
  findDayColumnIndex,
  pickSlotH,
  planInjection,
  readExistingCards,
  segLabel,
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

  const card = el(
    'div',
    {
      class: `${SITE_CARD_CLASS} ${TT_CARD_CLASS}${conflict ? ` ${TT_CONFLICT_CLASS}` : ''}`,
      attrs: { [TT_DONE_ATTR]: '1' },
    },
    ...lines,
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

// ------------------------------------------------------------ 渲染与扫描

/**
 * 渲染一轮。返回注入的节次数。
 *
 * `writing` 闸门：我们自己的 appendChild 也会触发 MutationObserver，若不设防就会
 * 「注入 → 触发回调 → 清掉再注入」无限循环。写 DOM 期间置位，回调看到它就跳过。
 */
export function render(table: HTMLElement, writing: { busy: boolean }): number {
  writing.busy = true;
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
    writing.busy = false;
  }
}

function scan(writing: { busy: boolean }): void {
  const table = findTable();
  if (table === null) return;
  if (!isEnabled(SITE_ID, TOGGLE.TIMETABLE_SELF_DRAW)) {
    const n = clearInjected(table);
    if (n > 0) log.info(`自绘课表开关已关闭：移除 ${String(n)} 个注入节点`);
    return;
  }
  injectStyle();
  render(table, writing);
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

  const writing = { busy: false };
  let observer: MutationObserver | null = null;
  let timer: number | null = null;
  let retry: number | null = null;
  let tries = 0;

  const schedule = (): void => {
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      // 站点重绘会连带把我们注入的块一起抹掉，这时才需要重画；
      // 我们自己的写入（writing.busy）直接忽略。
      if (writing.busy) return;
      if (!isEnabled(SITE_ID, TOGGLE.TIMETABLE_SELF_DRAW)) {
        scan(writing);
        return;
      }
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

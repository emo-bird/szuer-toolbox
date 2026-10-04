/**
 * 自绘课表（课表页 `curriculum.do` 注入）的**纯逻辑** —— 不碰 DOM，档 1 全覆盖。
 *
 * 为什么把逻辑抽出来：本项目的档 1 冒烟是「Node 里跑 `.ts` 源码」，而 `document` 不存在。
 * 派单表、几何算术、从站点卡片里读已选课程的口径都在这儿，`timetable.ts` 只做「按派单表
 * 建节点、按抓手指认容器」。
 *
 * 【形态】照旧仓库 `src/timetable.js`：**往站点自己的课表列里追加** `.cv-lesson`
 * （不自建容器、不重画、不放进悬浮窗）。站点课表页的 DOM 契约（来自旧仓库
 * `docs/curriculum.do.html`，真机验证留给手测）：
 *
 *   #myCourseTable
 *     .cv-my-course
 *       .cv-col.cv-left                      ← 左侧「节次」列
 *         .cv-lesson > div[style=height]     ← 14 个节次刻度（单节 54px）
 *       .cv-col.cv-right                     ← 每天一列（周一…周七）
 *         .cv-head                           ← 「周一」
 *         .cv-lesson[start][end][style=top]  ← 一节课的容器
 *           .cv-course-card-single > div > div{课程名, 时间, 地点, 教师}
 *
 * 【几何】一节课的位置完全由行内 style 决定：
 *   top    = 表头高度 + (起始节次 - 1) × 单节高度
 *   height = 节次数 × 单节高度 + 1（+1 是旧仓库的实测值：贴边线用的）
 * 单节高度**运行时从左侧真实刻度量**（量不到才退回 54）；表头高度固定用 28（实测）。
 */

import type { BkxkCustomCourse } from './custom.ts';
import type { TimeSegment } from './time.ts';
import { placesConflict } from './time.ts';

// ---------------------------------------------------------------- 常量

/** 我们注入的「一节课」容器（站点同款 `.cv-lesson` 之外再加一个标记类，便于清理与自检） */
export const TT_LESSON_CLASS = 'sztb-bkxk-tt-lesson';
/** 我们注入的卡片（与站点 `.cv-course-card-single` 同元素，额外加这个类以示区分） */
export const TT_CARD_CLASS = 'sztb-bkxk-tt-card';
export const TT_CONFLICT_CLASS = 'sztb-bkxk-tt-conflict';
export const TT_TAG_CLASS = 'sztb-bkxk-tt-tag';
export const TT_TIP_CLASS = 'sztb-bkxk-tt-conflict-tip';
/** 卡片外面那层 div（站点结构如此：`.cv-lesson > div > .cv-course-card-single`） */
export const TT_HOLDER_CLASS = 'sztb-bkxk-tt-holder';
/** 标记属性：注入过的节点都带，方便自检与清理（值是 `'1'`） */
export const TT_DONE_ATTR = 'data-sztb-tt';
/**
 * 卡片内那层「装三行文字」的 div。
 *
 * ⚠️ 站点结构是 `.cv-course-card-single > div > div{课程名,时间,地点,教师}` ——
 * **中间那层 div 不是装饰**：站点给卡片本身（`.cv-course-card-single`）的 CSS
 * 会把它的**直接子元素**排成一行。v0.26 前我们漏了这层，于是课名/时间/地点
 * 被排成了「左中右」，用户手测原话：「预期应该是上中下的排列」。
 */
export const TT_LINES_CLASS = 'sztb-bkxk-tt-lines';

/** 站点选择器（单一来源，改结构只改这里） */
export const SITE_TABLE_ID = 'myCourseTable';
export const SITE_TABLE_SELECTOR = '.cv-my-course';
export const SITE_LEFT_SELECTOR = '.cv-left';
/** 站点「一节课」的类名（我们注入的节点也要带它，站点样式才会生效） */
export const SITE_LESSON_CLASS = 'cv-lesson';
export const SITE_LESSON_SELECTOR = `.${SITE_LESSON_CLASS}`;
/** 站点「一张课程卡片」的类名（同上下） */
export const SITE_CARD_CLASS = 'cv-course-card-single';
export const SITE_CARD_SELECTOR = `.${SITE_CARD_CLASS}`;
export const SITE_DAY_COLUMN_SELECTOR = '.cv-col.cv-right';
export const SITE_HEAD_SELECTOR = '.cv-head';
export const SITE_CARD_LINE_SELECTOR = 'div div';
export const SITE_TOP_LINE_CLASS = 'cv-top-line';

export const TT_TAG_TEXT = '自定义';
export const TT_CONFLICT_TIP = '与已选课程冲突';

/** 单节高度默认值（实测 14 节 × 54 = 756） */
export const DEFAULT_SLOT_H = 54;
/** 第 1 节的 top（= `.cv-head` 高度，实测 28） */
export const DEFAULT_TOP0 = 28;

/** 站点列头文本；**下标 0 就是周一**（注意与 `time.ts` 的 `CN_WEEKDAY` 不同：那个是「星期一」且下标从 1 起） */
export const DAY_COLUMN_NAMES: readonly string[] = ['周一', '周二', '周三', '周四', '周五', '周六', '周七'];

/** 站点卡片里「时间」那一行的形状（`5-18周 星期二 3-4节` 之类） */
const WEEK_TEXT_RE = /\d+-\d+周/;

// ---------------------------------------------------------------- 类名

/** 把 `className` 按空白切开；空串 / null 得空数组 */
export function classTokens(className: string | null | undefined): readonly string[] {
  if (typeof className !== 'string' || className === '') return [];
  return className.split(/\s+/).filter((t) => t !== '');
}

/**
 * 类名里是否**按整词**含某个 token。
 *
 * ⚠️ 不能用 `indexOf`：站点与我们都有 `.cv-lesson` 这种前缀类，子串匹配会误判
 * （旧仓库 `timetable.js:164` 用的就是 `indexOf('szu-tt-card')`，本项目不沿用这个做法）。
 */
export function hasClassToken(className: string | null | undefined, token: string): boolean {
  return classTokens(className).includes(token);
}

// ---------------------------------------------------------------- 几何

/** 从量到的刻度高度里挑一个能用的；挑不出（空 / 非数字 / 非正值 / 非有限）一律用 54 */
export function pickSlotH(heights: readonly unknown[]): number {
  for (const raw of heights) {
    const h = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
    if (Number.isFinite(h) && h > 0) return h;
  }
  return DEFAULT_SLOT_H;
}

/** 起始节次的 top（第 1 节 = `top0`） */
export function slotTop(sectionFrom: number, slotH: number = DEFAULT_SLOT_H, top0: number = DEFAULT_TOP0): number {
  return top0 + (sectionFrom - 1) * slotH;
}

/** 一节或连堂的高度；`+1` 与旧仓库一致（站点用行内 style 贴边） */
export function slotHeight(
  sectionFrom: number,
  sectionTo: number,
  slotH: number = DEFAULT_SLOT_H,
): number {
  return (sectionTo - sectionFrom + 1) * slotH + 1;
}

/** 星期几 → 站点列头文本；超出 1..7 给空串（调用方据此放弃这一节） */
export function dayColumnName(day: number | null): string {
  if (day === null || !Number.isInteger(day)) return '';
  return DAY_COLUMN_NAMES[day - 1] ?? '';
}

/**
 * 在站点各列的列头文本里找第 `day` 天那一列。
 *
 * 先用列头文本认（站点顺序就是周一到周七，但列头对得上才可靠）；对不上再按
 * 「第 day 列」兜底；都不行返回 `-1`（调用方跳过这一节，不猜）。
 */
export function findDayColumnIndex(heads: readonly string[], day: number | null): number {
  const want = dayColumnName(day);
  if (want === '') return -1;
  for (let i = 0; i < heads.length; i += 1) {
    if ((heads[i] ?? '').includes(want)) return i;
  }
  if (day !== null && day >= 1 && day <= heads.length) return day - 1;
  return -1;
}

// ---------------------------------------------------------------- 读站点已选课程

/** 从站点卡片里读出来的「已选课程」——只够用来判断冲突，不是完整课程对象 */
export interface ExistingCard {
  readonly courseName: string;
  /** 站点卡片里的时间整串（`5-18周 星期二 3-4节 汇德楼A508`），旧仓库把它塞进 `teachingPlace` 字段 */
  readonly timeText: string;
}

/** `timetable.ts` 从 DOM 里抠出来的原始素材（纯逻辑只吃这个，不吃 Element） */
export interface RawCard {
  readonly className: string | null;
  /** 卡片里的各段文本（`div div` 的 textContent） */
  readonly parts: readonly string[];
}

/**
 * 把站点卡片的文本整理成已选课程清单。
 *
 * 两条口径（沿用旧仓库）：① 跳过我们自己注入的卡片（按标记类**整词**判）；
 * ② 「课程名 = 第一个非空文本」「时间 = 第一个长得像 `5-18周` 的文本」，
 * 读不到时间的卡片直接丢（判冲突必须有时间）。
 */
export function readExistingCards(cards: readonly RawCard[]): readonly ExistingCard[] {
  const out: ExistingCard[] = [];
  for (const card of cards) {
    if (hasClassToken(card.className, TT_CARD_CLASS)) continue;
    let name = '';
    let time = '';
    for (const part of card.parts) {
      const text = part.trim();
      if (name === '' && text !== '') name = text;
      if (time === '' && WEEK_TEXT_RE.test(text)) time = text;
    }
    if (time !== '') out.push({ courseName: name, timeText: time });
  }
  return out;
}

/** 这门课的地点串是否与任一已选课程冲突 */
export function conflictsWithCards(place: string, cards: readonly ExistingCard[]): boolean {
  for (const card of cards) {
    if (placesConflict(place, card.timeText)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- 派单

/** 卡片第二行的时间文本（旧仓库是 `5-18周3-5节`，没写星期 —— 因为有列位置了） */
export function segLabel(seg: TimeSegment): string {
  return `${String(seg.weekFrom)}-${String(seg.weekTo)}周${String(seg.sectionFrom)}-${String(seg.sectionTo)}节`;
}

/** 一条注入指令：往「第 day 天那一列」的 `top` 处放一张 `height` 高的卡片 */
export interface InjectionPlan {
  readonly courseId: string;
  readonly course: BkxkCustomCourse;
  readonly seg: TimeSegment;
  /** 这门课在 `segs` 里的下标（用于生成稳定的元素 id / 调试） */
  readonly segIndex: number;
  /** 整门课一个布尔：地点与任一已选课程冲突（沿用旧仓库口径） */
  readonly conflict: boolean;
  readonly top: number;
  readonly height: number;
}

/**
 * 算出这一轮要注入哪些节次。
 *
 * 口径：
 *   - 只处理**启用**的课程（调用方通常已滤过，这里再挡一次）；
 *   - `day === null` 的节次跳过（不知道星期几，无处可放）——**不猜**；
 *   - 冲突是**整门课**一个布尔（一处冲突则该课所有节次都高亮，旧仓库口径）；
 *   - 几何在纯逻辑里算完，DOM 层只管照着放。
 */
export function planInjection(
  courses: readonly BkxkCustomCourse[],
  cards: readonly ExistingCard[],
  geo: { readonly slotH: number; readonly top0: number } = { slotH: DEFAULT_SLOT_H, top0: DEFAULT_TOP0 },
): readonly InjectionPlan[] {
  const out: InjectionPlan[] = [];
  // 站点自己已经画过这门课就不再自绘（v0.28 去重）：晚到补偿会让站点的渲染器
  // 拿着合并后的 dataList 重画一遍，那一份里已经有我们的课 —— 再自绘就是两张卡片。
  const rendered = renderedCourseNames(cards);
  for (const course of courses) {
    if (!course.enabled) continue;
    if (rendered.has(course.name.trim())) continue;
    const conflict = conflictsWithCards(course.place, cards);
    course.segs.forEach((seg, segIndex) => {
      if (seg.day === null) return;
      out.push({
        courseId: course.id,
        course,
        seg,
        segIndex,
        conflict,
        top: slotTop(seg.sectionFrom, geo.slotH, geo.top0),
        height: slotHeight(seg.sectionFrom, seg.sectionTo, geo.slotH),
      });
    });
  }
  return out;
}

/**
 * 站点重绘后**要不要重画**我们注入的那些块。
 *
 * 语义是「我们的节点被抹掉了才重画」：站点翻页 / 切学期会整段重绘课表，
 * 连带把我们注入的节点一起删掉 —— 这时才需要补。若我们的节点还在，说明
 * 这次 DOM 变动**就是我们自己上一次注入造成的**，再扫一次就等于自杀式循环。
 *
 * ⚠️ 为什么不能只靠 `writing` 闸门（v0.26 修的 bug）：闸门是**同步**置位/复位的，
 * 而 MutationObserver 的回调是**异步**投递的（当前任务结束后的微任务里才跑），
 * 回调执行时闸门早就复位了 ⇒ 拦不住自触发。旧仓库 `timetable.js` 用的正是
 * 「我们的节点还在吗」这条判据（`if (!document.querySelector('.szu-tt-lesson') ...) render()`）。
 * 现象是日志每 300ms 刷一条「课表注入…」，同时白白清掉再重建一遍 DOM。
 */
export function needsRescan(injected: number, enabledCourses: number): boolean {
  return enabledCourses > 0 && injected === 0;
}

/**
 * 表上已经出现的课名（去掉前后空白、丢掉空名）。
 *
 * 用于「这门课是不是已经画过了」的去重 —— 自绘与站点渲染器画出来的卡片课名是同一个
 * （都来自同一条自定义课程记录），所以拿名字当键够了。
 */
export function renderedCourseNames(cards: readonly ExistingCard[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const card of cards) {
    const name = card.courseName.trim();
    if (name !== '') out.add(name);
  }
  return out;
}

/** 「让站点自己画一次」的判据输入（全部来自页面事实，不看时钟） */
export interface OwnRenderInput {
  /** 🟠 响应接管开关开着 —— 否则我们根本不该碰站点的课表 */
  readonly hijackOn: boolean;
  /**
   * 🟢 自绘课表**关着**。
   *
   * 这是用户要这个功能的原始场景：「关闭课表自绘不应该有网页自己的绘制逻辑来绘制
   * 自定义课程吗」。自绘开着时我们本来就会立刻把课画上去，不缺这一条路 ——
   * 若那时也补一次，等于每次刷新都白跑一个请求 + 白重画一遍整张表。
   */
  readonly selfDrawOff: boolean;
  /** 本次页面加载还没试过（只补一次，绝不循环） */
  readonly alreadyTried: boolean;
  /** 还有启用中的自定义课程 */
  readonly enabledCourses: number;
  /** 站点画出来的卡片里，**一门**我们的课都没有（有就说明已经画上了，不用补） */
  readonly missingCourses: number;
  /** 站点确实画过表；连表都没有时该走自绘兜底，没什么可补的 */
  readonly siteCards: number;
}

/**
 * 要不要「自己取一次课表、交给站点渲染器画」。
 *
 * 判据全部是**页面上的既成事实**（不是猜时钟）：我们手上还有课，而站点已经画完的
 * 表里一门都没有 ⇒ 我们没赶上站点那条 `teachingTime.do`（`timing-late` 那边的
 * `judgeLate` 只负责把「谁快谁慢」写进日志，不参与决策）。
 */
export function shouldOwnRender(input: OwnRenderInput): boolean {
  return (
    input.hijackOn &&
    input.selfDrawOff &&
    !input.alreadyTried &&
    input.enabledCourses > 0 &&
    input.missingCourses > 0 &&
    input.siteCards > 0
  );
}

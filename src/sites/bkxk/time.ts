/**
 * 教学时间解析 + 周次位图 + 冲突判定（批 2）。
 *
 * 数据来源有两处，形态不同，都要能吃：
 *
 * 1. **列表里的 `teachingPlace` 字符串**（课程列表接口）：
 *    `5-18周星期二3-5节汇文楼H1-201,5-18周星期四7-8节汇文楼H1-201`
 *    真实样本（`tests/fixtures/bkxk-teaching-place.json`，49 条去重）**全部无空格**；
 *    但旧 HAR 里还有带空格的写法（`5-18周 星期二 1-2节 汇文楼H3-104`）⇒ 两种都要兼容，
 *    所以每条正则都用 `\s*` 而不是写死空格。
 *
 * 2. **规则课表的周次位图**（`teachingTime.do` 的 `week` 字段）：
 *    `000011111111111111` —— **下标 0 = 第 1 周**，长度不固定（实测 11 / 18 / 20），
 *    多出来的尾巴是 0。默认长度 18（跟随站点），长度可传，冲突判定不依赖长度。
 *
 * ⚠️ **冲突判定的红线（只加不减）**：站点自己已经在列表里算好了
 * `isConflict` / `conflictDesc`，本模块只用来判定「自定义课程带来的新冲突」，
 * **绝不用我们的结论去覆盖站点原值**（见 `docs/需求文档.md` 红线 R1–R5 与开发文档 §4.1）。
 *
 * 本模块是**纯函数、零 DOM、零网络**（档 1 可直接测）。
 */

/** 中文星期 → 数字（1 = 周一）。`天` 与 `日` 都算 7（站点两种都出现过）。 */
export const WEEKDAY: Readonly<Record<string, number>> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

/** 下标即星期几（`CN_WEEKDAY[1] === '星期一'`），0 位留空以便直接按下标取。 */
export const CN_WEEKDAY: readonly string[] = [
  '',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
  '星期日',
];

/**
 * 位图默认长度。站点实测有 11 / 18 / 20 三种，18 是多数；
 * 这里只作**缺省**，凡是能拿到站点实际长度的场合都该把长度传进来
 * （`augmentTimetable` 那类场景要跟站点已有条目对齐）。
 */
export const DEFAULT_WEEK_BITMAP_LEN = 18;

/** 单双周。`null` = 每周都上。 */
export type Parity = '单' | '双' | null;

/** 一段教学时间。解析不出来时本模块一律返回 `null`，**不抛异常、不猜**。 */
export interface TimeSegment {
  /** 起始周（含）。 */
  readonly weekFrom: number;
  /** 结束周（含）。 */
  readonly weekTo: number;
  /** 单双周；`null` = 每周。 */
  readonly parity: Parity;
  /** 星期几（1~7）；文本里没写就是 `null`。 */
  readonly day: number | null;
  /** 起始节（含）。 */
  readonly sectionFrom: number;
  /** 结束节（含）。 */
  readonly sectionTo: number;
  /** 节次之后的剩余文本，一般是地点；可能为空串。 */
  readonly place: string;
  /** 原始文本，便于日志与调试。 */
  readonly raw: string;
}

/** 只有周次的那部分（`weekName` 字段就是这个形态）。 */
export interface WeekRange {
  readonly weekFrom: number;
  readonly weekTo: number;
  readonly parity: Parity;
}

const WEEK_RE = /(\d+)(?:\s*-\s*(\d+))?\s*周\s*(?:[（(]\s*(单|双)\s*[)）])?/;
const DAY_RE = /星期\s*([一二三四五六日天])/;
const SECTION_RE = /(\d+)(?:\s*-\s*(\d+))?\s*节/;

/** 中文数字 → 阿拉伯数字（用于「十二」这类写法，节次文本里少见但要吃）。 */
export function cn2num(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  const map: Readonly<Record<string, number>> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (s === '十') return 10;
  if (s.startsWith('十')) return 10 + (map[s.charAt(1)] ?? 0);
  if (s.includes('十')) {
    const [head, tail] = s.split('十');
    return (map[head ?? ''] ?? 0) * 10 + (tail === undefined || tail === '' ? 0 : (map[tail] ?? 0));
  }
  return map[s] ?? Number.NaN;
}

/** 单双周是否命中某一周。`null` 恒真。 */
export function parityMatches(week: number, parity: Parity): boolean {
  if (parity === null) return true;
  return parity === '单' ? week % 2 === 1 : week % 2 === 0;
}

/**
 * 只解析「周次」部分，例如 `7-11周(单)` → `{weekFrom:7, weekTo:11, parity:'单'}`。
 * 解析不出、或**起止颠倒**（`9-3周` 这种无意义数据）都返回 `null`。
 */
export function parseWeekRange(text: string | null | undefined): WeekRange | null {
  if (typeof text !== 'string' || text === '') return null;
  const m = WEEK_RE.exec(text);
  if (m === null) return null;
  const from = Number(m[1]);
  const to = m[2] === undefined ? from : Number(m[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || from > to) return null;
  const p = m[3];
  return { weekFrom: from, weekTo: to, parity: p === '单' || p === '双' ? p : null };
}

/**
 * 解析**一段**教学时间，例如
 * `5-18周星期二3-5节汇文楼H1-201` 或 `5-18周 星期二 1-2节 汇文楼H3-104`。
 *
 * 解析不出**节次**就返回 `null`（只有周次的信息请用 `parseWeekRange`）。
 * 没有「星期」不算失败——`day` 给 `null`，冲突判定时一律判不冲突，宁可漏报不误报。
 */
export function parseSegment(seg: string | null | undefined): TimeSegment | null {
  if (typeof seg !== 'string') return null;
  const s = seg.trim();
  if (s === '') return null;
  const week = parseWeekRange(s);
  if (week === null) return null;
  const section = SECTION_RE.exec(s);
  if (section === null) return null;

  const sectionFrom = Number(section[1]);
  const sectionTo = section[2] === undefined ? sectionFrom : Number(section[2]);
  if (!Number.isFinite(sectionFrom) || !Number.isFinite(sectionTo)) return null;

  const dayText = DAY_RE.exec(s);
  const day = dayText === null ? null : (WEEKDAY[dayText[1] ?? ''] ?? null);

  return {
    weekFrom: week.weekFrom,
    weekTo: week.weekTo,
    parity: week.parity,
    day,
    sectionFrom,
    sectionTo: Math.max(sectionFrom, sectionTo),
    // 地点 = 节次匹配之后的剩余文本。用匹配下标而不是 indexOf，
    // 免得「节次文本恰好也在前面出现过」时截错位置。
    place: s.slice(section.index + section[0].length).trim(),
    raw: seg,
  };
}

/** 解析整串 `teachingPlace`（段之间用中文或英文逗号分隔）。空/异常一律给空数组。 */
export function parsePlace(text: string | null | undefined): readonly TimeSegment[] {
  if (typeof text !== 'string' || text.trim() === '') return [];
  const out: TimeSegment[] = [];
  for (const piece of text.split(/[,，]/)) {
    const seg = parseSegment(piece);
    if (seg !== null) out.push(seg);
  }
  return out;
}

/** 这一段是否落在第 `week` 周（含单双周过滤）。 */
export function weekMatches(seg: TimeSegment, week: number): boolean {
  if (!Number.isFinite(week) || week < seg.weekFrom || week > seg.weekTo) return false;
  return parityMatches(week, seg.parity);
}

/** 两段节次是否重叠（闭区间）。 */
export function sectionsOverlap(a: TimeSegment, b: TimeSegment): boolean {
  return a.sectionFrom <= b.sectionTo && b.sectionFrom <= a.sectionTo;
}

/**
 * 两段是否冲突：同一天 + 节次重叠 + 存在共同的周。
 * 「存在共同周」用逐周扫描实现，这样单双周、位图长度不一都不影响。
 */
export function segmentsConflict(a: TimeSegment, b: TimeSegment): boolean {
  if (a.day === null || b.day === null) return false;
  if (a.day !== b.day) return false;
  if (!sectionsOverlap(a, b)) return false;
  const from = Math.max(a.weekFrom, b.weekFrom);
  const to = Math.min(a.weekTo, b.weekTo);
  for (let w = from; w <= to; w += 1) {
    if (weekMatches(a, w) && weekMatches(b, w)) return true;
  }
  return false;
}

/** 两串 `teachingPlace` 是否冲突。任一侧解析为空一律判**不冲突**（宁可漏报不误报）。 */
export function placesConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = parsePlace(a);
  const right = parsePlace(b);
  if (left.length === 0 || right.length === 0) return false;
  for (const x of left) {
    for (const y of right) {
      if (segmentsConflict(x, y)) return true;
    }
  }
  return false;
}

/** 从一组课程里挑出与 `targetPlace` 冲突的那些（原样返回元素，不改动）。 */
export function findConflicts<T extends { readonly teachingPlace?: string | null }>(
  targetPlace: string | null | undefined,
  courses: readonly T[],
): readonly T[] {
  return courses.filter((c) => placesConflict(targetPlace, c.teachingPlace));
}

/**
 * 按周次区间 + 单双周造位图。`len` 默认 `DEFAULT_WEEK_BITMAP_LEN`。
 * 下标 0 = 第 1 周，位 = `'1'` 表示有课；区间之外的周恒为 `'0'`。
 */
export function buildWeekBitmap(
  from: number,
  to: number,
  parity: Parity,
  len: number = DEFAULT_WEEK_BITMAP_LEN,
): string {
  const n = Number.isFinite(len) && len > 0 ? Math.floor(len) : DEFAULT_WEEK_BITMAP_LEN;
  let out = '';
  for (let i = 1; i <= n; i += 1) {
    out += i >= from && i <= to && parityMatches(i, parity) ? '1' : '0';
  }
  return out;
}

/** 周次的短文本，例如 `5-18周` / `7-11周(单)` / `3周`。 */
export function weekText(seg: Pick<TimeSegment, 'weekFrom' | 'weekTo' | 'parity'>): string {
  const body = seg.weekFrom === seg.weekTo ? `${seg.weekFrom}周` : `${seg.weekFrom}-${seg.weekTo}周`;
  return seg.parity === null ? body : `${body}(${seg.parity})`;
}

/** 位图 → 有课的周次数组（下标 0 视为第 1 周）。非 `'1'` 字符一律当 0。 */
export function bitmapWeeks(bitmap: string): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < bitmap.length; i += 1) {
    if (bitmap.charAt(i) === '1') out.push(i + 1);
  }
  return out;
}

/** 位图里 `'1'` 的个数（= 总周数）。 */
export function bitmapWeekCount(bitmap: string): number {
  let n = 0;
  for (let i = 0; i < bitmap.length; i += 1) if (bitmap.charAt(i) === '1') n += 1;
  return n;
}

/** 站点实际用的位图长度：取一组位图里最长的那个（`augmentTimetable` 需要）。 */
export function maxBitmapLength(bitmaps: readonly string[]): number {
  let n = 0;
  for (const b of bitmaps) if (b.length > n) n = b.length;
  return n;
}

/**
 * 两张位图是否有共同的有课周。长度不等时按**短的那张**比较
 * （长的那张多出来的尾部在站点里恒为 0，不影响结论）。
 */
export function bitmapsOverlap(a: string, b: string): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a.charAt(i) === '1' && b.charAt(i) === '1') return true;
  }
  return false;
}

/**
 * 站点位图与周次文本是否一致（一致性校验用）。
 * `bitmap` 的长度就是比较长度；文本解析不出周次时返回 `false`。
 */
export function bitmapMatchesWeekRange(bitmap: string, weekName: string | null | undefined): boolean {
  const range = parseWeekRange(weekName);
  if (range === null) return false;
  return buildWeekBitmap(range.weekFrom, range.weekTo, range.parity, bitmap.length) === bitmap;
}

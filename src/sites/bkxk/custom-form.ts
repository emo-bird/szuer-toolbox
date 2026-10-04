/**
 * 【自定义课程】结构化表单的**纯逻辑**（零 DOM）。
 *
 * 【为什么要这个文件】需求文档 Q-F 明写「自定义课程 UI 版 = 纯表单」，
 * 而旧仓库 `ui.js:441-540` 只有一个「时间地点」文本框 + 文本解析
 * —— 那**正是**「纯靠文本识别」，用户写错一个空格就被拒。
 * 本项目改成结构化录入：周次起止 / 单双周 / 星期 / 节次起止 / 地点分开填，
 * 由 `time.ts` 的 `placeTextFor` **生成**站点格式的 `place` 串。
 *
 * 于是这里承担两件事，都能被档 1 直测：
 *   1. **表单状态 → `place` 文本**（提交路径）与 **`place` 文本 → 表单状态**（编辑回填路径）；
 *   2. **校验**：所有用户可见的报错文案都在这里，界面只负责把它显示出来。
 *
 * 【表单状态里的数字一律是字符串】因为 `<input>` 给的就是字符串，
 * 在这里一次性转成数字，比让每个取值点各自 `Number()` 再各自处理 NaN 要稳。
 */

import { parsePlace, segToPlaceText } from './time.ts';
import type { Parity, TimeSegment } from './time.ts';

/** 单双周下拉的取值：空串 = 每周都上（对应 `Parity` 的 `null`） */
export type ParityChoice = '' | '单' | '双';

/** 一段上课时间的表单状态（全是字符串，与输入控件一一对应） */
export interface SegmentDraft {
  readonly weekFrom: string;
  readonly weekTo: string;
  readonly parity: ParityChoice;
  /** 星期几，`'1'`~`'7'`（与 `time.ts` 的数字一致，`星期一` = 1） */
  readonly day: string;
  readonly sectionFrom: string;
  readonly sectionTo: string;
  readonly place: string;
}

/** 各项的取值范围（校验与提示文案共用一处，免得文案与代码漂移） */
export const DRAFT_LIMITS = {
  WEEK_MIN: 1,
  WEEK_MAX: 52,
  SECTION_MIN: 1,
  SECTION_MAX: 20,
  /** 最多几段：只是想拦住误触「再加一段」，正常课程 1~3 段 */
  MAX_SEGMENTS: 8,
} as const;

/** 新开一段时的默认值：第 1-18 周、每周、星期一、1-2 节、地点空着等用户填 */
export const DEFAULT_SEGMENT: SegmentDraft = {
  weekFrom: '1',
  weekTo: '18',
  parity: '',
  day: '1',
  sectionFrom: '1',
  sectionTo: '2',
  place: '',
};

/** 新开一段（返回默认值的**副本**，免得多个输入框共享同一个对象） */
export function emptySegment(): SegmentDraft {
  return { ...DEFAULT_SEGMENT };
}

/** 严格整数：`''` / `'3.5'` / `'abc'` / `' '` 一律 `null`（不 Number() 猜） */
export function intOf(text: string): number | null {
  const s = text.trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** 解析好的时段 → 表单状态（编辑回填用） */
export function draftFromSegment(seg: TimeSegment): SegmentDraft {
  return {
    weekFrom: String(seg.weekFrom),
    weekTo: String(seg.weekTo),
    parity: seg.parity === null ? '' : seg.parity,
    day: seg.day === null ? '' : String(seg.day),
    sectionFrom: String(seg.sectionFrom),
    sectionTo: String(seg.sectionTo),
    place: seg.place,
  };
}

/**
 * `place` 原文 → 表单状态数组（编辑回填用）。
 *
 * 解析不出的整段会被丢掉（`parsePlace` 的语义）。**调用方必须处理返回空数组的情况** ——
 * 说明原数据是手改过的或旧版本写的，这时只能给一段默认值并提示用户重填，
 * 不能装作读出来了。
 */
export function draftsFromText(text: string | null | undefined): readonly SegmentDraft[] {
  return parsePlace(text).map((seg) => draftFromSegment(seg));
}

/** 校验一段；通过返回 `null`，否则返回给用户看的文案 */
export function validateSegment(d: SegmentDraft): string | null {
  const { WEEK_MIN, WEEK_MAX, SECTION_MIN, SECTION_MAX } = DRAFT_LIMITS;

  const wf = intOf(d.weekFrom);
  const wt = intOf(d.weekTo);
  if (
    wf === null ||
    wt === null ||
    wf < WEEK_MIN ||
    wt > WEEK_MAX ||
    wf > WEEK_MAX ||
    wt < WEEK_MIN
  ) {
    return `周次要填 ${String(WEEK_MIN)}-${String(WEEK_MAX)} 之间的整数`;
  }
  if (wf > wt) return '周次起止颠倒：起始周不能大于结束周';

  const sf = intOf(d.sectionFrom);
  const st = intOf(d.sectionTo);
  if (
    sf === null ||
    st === null ||
    sf < SECTION_MIN ||
    st > SECTION_MAX ||
    sf > SECTION_MAX ||
    st < SECTION_MIN
  ) {
    return `节次要填 ${String(SECTION_MIN)}-${String(SECTION_MAX)} 之间的整数`;
  }
  if (sf > st) return '节次起止颠倒：起始节不能大于结束节';

  if (intOf(d.day) === null || (intOf(d.day) ?? 0) < 1 || (intOf(d.day) ?? 0) > 7) {
    return '请选择星期几';
  }
  if (d.place.trim() === '') return '请填地点（例如 致理楼L1-707）';
  return null;
}

/** 校验整张表单；通过返回 `null`，否则返回第一条错误 */
export function validateDraft(name: string, segs: readonly SegmentDraft[]): string | null {
  if (name.trim() === '') return '请填课程名';
  if (segs.length === 0) return '至少填一段上课时间';
  if (segs.length > DRAFT_LIMITS.MAX_SEGMENTS) {
    return `最多 ${String(DRAFT_LIMITS.MAX_SEGMENTS)} 段`;
  }
  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i];
    if (seg === undefined) continue;
    const err = validateSegment(seg);
    if (err !== null) {
      const nth = segs.length > 1 ? `第 ${String(i + 1)} 段：` : '';
      return nth + err;
    }
  }
  return null;
}

/**
 * 表单状态 → `TimeSegment`（**假定已通过 `validateSegment`**）。
 * 校验失败时返回 `null`，不硬凑一个看起来合法的段。
 */
export function segmentFromDraft(d: SegmentDraft): TimeSegment | null {
  if (validateSegment(d) !== null) return null;
  const wf = intOf(d.weekFrom);
  const wt = intOf(d.weekTo);
  const sf = intOf(d.sectionFrom);
  const st = intOf(d.sectionTo);
  const day = intOf(d.day);
  if (wf === null || wt === null || sf === null || st === null || day === null) return null;
  const parity: Parity = d.parity === '' ? null : d.parity;
  const place = d.place.trim();
  return {
    weekFrom: wf,
    weekTo: wt,
    parity,
    day,
    sectionFrom: sf,
    sectionTo: st,
    place,
    // 与手写文本走同一条生成路径，`raw` 就是生成出来的那一串
    raw: segToPlaceText({
      weekFrom: wf,
      weekTo: wt,
      parity,
      day,
      sectionFrom: sf,
      sectionTo: st,
      place,
    }),
  };
}

/**
 * 表单状态 → 存储用的 `place` 文本（多段用 `,` 连）。
 * 有任一段不合法就返回 `null` —— 界面应先 `validateDraft` 再调它。
 */
export function placeFromDraft(segs: readonly SegmentDraft[]): string | null {
  const parsed: TimeSegment[] = [];
  for (const d of segs) {
    const seg = segmentFromDraft(d);
    if (seg === null) return null;
    parsed.push(seg);
  }
  return parsed.map((s) => s.raw).join(',');
}

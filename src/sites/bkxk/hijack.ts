/**
 * 响应接管（批 3 之一）。
 *
 * 【干什么】把**站点自己**发出的两类响应在到达站点 JS 之前改掉：
 * - `elective/teachingTime.do`（我的课表）⇒ 追加自定义课程的行；
 * - `elective/<各种课程列表>.do` ⇒ 给与自定义课程冲突的教学班补 `isConflict` / `conflictDesc`。
 *
 * 【为什么挂 XHR 而不是自己再发一次】站点所有请求走
 * `BH_UTILS.doAjax → jQuery.$.ajax → XMLHttpRequest`，而本站模块自己的请求走
 * `fetch`（`common/core/http.ts`，带 `init.__szuSkip = true`）⇒ 挂 XHR 天然只命中站点请求。
 * fetch 也挂一层纯属防御（站点将来改用 fetch 时不用改这里）。
 *
 * 【为什么 readystatechange 一定是「先于站点」】监听器在 XHR **构造时**注册，
 * 站点（jQuery）的监听是之后才 `addEventListener` 的 ⇒ 取值顺序在前。
 *
 * 【红线（`docs/开发文档.md` §4.2）】
 * - **只增加，绝不清除**站点自己算好的 `isConflict` / `conflictDesc`；
 * - 不改写请求、不加请求头、不重放请求，凭证不落任何地方；
 * - 两个开关关掉后**完全不接管**（理由：自定义课程把课全标成冲突会导致选不了课，
 *   用户必须有办法立刻退回站点原始响应）。
 */

import { scoped } from '../../common/core/log.ts';
import { isEnabled } from '../../common/core/settings.ts';
import { SITE_ID, TOGGLE } from './settings.ts';
import {
  CN_WEEKDAY,
  DEFAULT_WEEK_BITMAP_LEN,
  buildWeekBitmap,
  maxBitmapLength,
  placesConflict,
  weekText,
} from './time.ts';
import type { TimeSegment } from './time.ts';
import { readEnabledCustomCourses } from './custom.ts';
import type { BkxkCustomCourse } from './custom.ts';
import { pageRealm } from './page-realm.ts';

const log = scoped('bkxk/hijack');

/** 接管的两个方向 */
export type HijackKind = 'timetable' | 'list';

/** 注入课表行的 `teachingClassID` 前缀（站点不会用这个前缀，便于自己和用户辨认） */
export const CUSTOM_ID_PREFIX = 'szu-custom-';

/**
 * 列表类端点。与 `api.ts` 的 `EP` 一一对应，这里用正则是因为要匹配**站点**发出的
 * URL（可能带查询串、可能是绝对地址）。`tests/suites/bkxk-hijack.test.ts` 有一条
 * 用例断言 `CATEGORY_EP` 的每个端点都被这条正则命中，防止将来加类别忘了改这里。
 */
const LIST_RE =
  /elective\/(?:programCourse|unProgramCourse|publicCourse|recommendedCourse|queryCourse|course|minorCourse|retakeCourse|sportCourse)\.do/i;

const TIMETABLE_RE = /elective\/teachingTime\.do/i;

/** 只用于判断「这条 URL 要不要接管」；返回 `null` = 与我们无关 */
export function kindOf(url: string | null | undefined): HijackKind | null {
  if (typeof url !== 'string' || url === '') return null;
  if (TIMETABLE_RE.test(url)) return 'timetable';
  if (LIST_RE.test(url)) return 'list';
  return null;
}

/** 该方向是否开着（🟠 开关，默认关） */
export function kindEnabled(kind: HijackKind): boolean {
  return isEnabled(SITE_ID, kind === 'timetable' ? TOGGLE.HIJACK_TIMETABLE : TOGGLE.HIJACK_LIST_CONFLICT);
}

// ----------------------------------------------------- 纯函数：改写响应内容

type Rec = Record<string, unknown>;

function asRecord(v: unknown): Rec | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Rec;
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 某个时间地点文本与「启用中的自定义课程」里哪些冲突。
 * 空文本返回 `[]`（站点没写地点时无从判定 —— 宁可漏报不误报）。
 */
export function customConflicts(
  place: string | null | undefined,
  items: readonly BkxkCustomCourse[],
): readonly BkxkCustomCourse[] {
  if (typeof place !== 'string' || place === '') return [];
  const out: BkxkCustomCourse[] = [];
  for (const c of items) {
    if (!c.enabled) continue;
    if (placesConflict(place, c.place)) out.push(c);
  }
  return out;
}

/** 冲突描述文案，拼到站点原有的 `conflictDesc` 后面 */
export function conflictDescFor(items: readonly BkxkCustomCourse[]): string {
  return items.map((c) => `自定义课程：${c.name}(${c.place})`).join('；');
}

/** 改写结果：`json` 是**同一个对象**（刚 parse 出来的私有副本，原地改省一次深拷贝），`changed` = 改动处数 */
export interface AugmentResult {
  readonly json: unknown;
  readonly changed: number;
}

/**
 * 课表响应 ⇒ 追加自定义课程的行。
 *
 * 行的字段形状照抄站点（旧仓库 `hijack.js` 实测口径），其中
 * `week` 是**位图串**、`weekName` 是人读的 `5-18周`、`teachingClassID` 带我们的前缀。
 * 位图长度跟随站点已有数据（`max(18, 站点最长位图)`），避免比站点多出尾部 0。
 */
export function augmentTimetable(json: unknown, items: readonly BkxkCustomCourse[]): AugmentResult {
  const root = asRecord(json);
  if (root === null) return { json, changed: 0 };
  const list = asArray(root['dataList']);
  if (list === null) return { json, changed: 0 };

  const len = Math.max(DEFAULT_WEEK_BITMAP_LEN, maxBitmapLength(weekStringsOf(list)));

  let changed = 0;
  for (const c of items) {
    if (!c.enabled) continue;
    for (let k = 0; k < c.segs.length; k++) {
      const seg = c.segs[k];
      if (seg === undefined || seg.day === null) continue;
      list.push(timetableRow(c, seg, k, len));
      changed++;
    }
  }
  if (changed > 0) root['totalCount'] = num(root['totalCount']) + changed;
  return { json, changed };
}

function weekStringsOf(list: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const row of list) {
    const rec = asRecord(row);
    if (rec === null) continue;
    const w = rec['week'];
    if (typeof w === 'string' && w !== '') out.push(w);
  }
  return out;
}

function timetableRow(c: BkxkCustomCourse, seg: TimeSegment, index: number, len: number): Rec {
  return {
    dayOfWeekName: seg.day === null ? '' : (CN_WEEKDAY[seg.day] ?? ''),
    teachingClassID: `${CUSTOM_ID_PREFIX}${c.id}-${index}`,
    courseNumber: '',
    studentCode: '',
    courseName: c.name,
    courseIndex: '',
    teacherName: c.teacher,
    teachingPlace: seg.place,
    sportCode: null,
    timeType: '1',
    sportName: null,
    studyMode: '01',
    weekName: weekText(seg),
    beginSection: String(seg.sectionFrom),
    endSection: String(seg.sectionTo),
    week: buildWeekBitmap(seg.weekFrom, seg.weekTo, seg.parity, len),
    dayOfWeek: seg.day === null ? '' : String(seg.day),
    wid: null,
    /** 我们自己打的标记：站点不会返回这个键，用于辨认与将来的排查 */
    szuCustom: true,
  };
}

/**
 * 课程列表响应 ⇒ 给与自定义课程冲突的教学班补 `isConflict` / `conflictDesc`。
 *
 * 兼容两种结构：`tcList` 数组（嵌套，`programCourse`）与「整行即教学班」（扁平，`noArranged`）。
 */
export function augmentList(json: unknown, items: readonly BkxkCustomCourse[]): AugmentResult {
  const root = asRecord(json);
  if (root === null) return { json, changed: 0 };
  const list = asArray(root['dataList']);
  if (list === null) return { json, changed: 0 };

  let changed = 0;
  for (const row of list) {
    const item = asRecord(row);
    if (item === null) continue;
    const tcList = asArray(item['tcList']);
    const targets: readonly Rec[] = tcList === null ? [item] : tcList.map(asRecord).filter(isRec);
    for (const tc of targets) {
      const place = tc['teachingPlace'];
      if (typeof place !== 'string' || place === '') continue;
      const mine = customConflicts(place, items);
      if (mine.length === 0) continue;
      const desc = conflictDescFor(mine);
      const before = tc['conflictDesc'];
      tc['isConflict'] = '1';
      tc['conflictDesc'] = typeof before === 'string' && before !== '' ? `${before}；${desc}` : desc;
      tc['szuCustomConflict'] = true;
      changed++;
    }
  }
  return { json, changed };
}

function isRec(v: Rec | null): v is Rec {
  return v !== null;
}

/**
 * 一段响应为什么没被改写（**诊断用**，v0.28 新增）。
 *
 * `rewritten` = 真的改了；其余都是早退路径。逐条记下来的原因：
 * 出了问题（「开关开了但什么都没发生」）时，日志里能直接看出卡在哪一步，
 * 而不是只能猜「是不是响应根本没经过我们」。
 */
export type SkipReason =
  | 'rewritten'
  | 'empty-text'
  | 'no-courses'
  | 'bad-json'
  | 'not-object'
  | 'bad-code'
  | 'nothing-changed';

/** 人能读的早退原因（进日志） */
export const SKIP_TEXT: Record<SkipReason, string> = {
  rewritten: '',
  'empty-text': '响应正文是空的',
  'no-courses': '当前没有启用中的自定义课程，没必要改',
  'bad-json': '正文不是 JSON',
  'not-object': '解析出来不是对象',
  'bad-code': '响应 code 不是 1（站点这次没成功）',
  'nothing-changed': '解析成功、但没有一处需要改（这门课不冲突 / 没有可注入的段）',
};

export interface TransformOutcome {
  readonly reason: SkipReason;
  /** `reason === 'rewritten'` 时是新正文，否则为 null */
  readonly text: string | null;
  readonly changed: number;
}

/**
 * 改写一段响应正文，并把**为什么**一并返回。
 *
 * 判据与旧版 `transformResponse` 完全一致（返回 `null` = **不要改变原响应**）：
 * 空正文 / 没有自定义课程 / 不是 JSON / 不是对象 / `code !== '1'` / 一处都没改。
 */
export function explainTransform(
  kind: HijackKind,
  text: string,
  items: readonly BkxkCustomCourse[],
): TransformOutcome {
  if (text === '') return { reason: 'empty-text', text: null, changed: 0 };
  if (items.length === 0) return { reason: 'no-courses', text: null, changed: 0 };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { reason: 'bad-json', text: null, changed: 0 };
  }
  const root = asRecord(json);
  if (root === null) return { reason: 'not-object', text: null, changed: 0 };
  if (String(root['code']) !== '1') return { reason: 'bad-code', text: null, changed: 0 };
  const res = kind === 'timetable' ? augmentTimetable(root, items) : augmentList(root, items);
  if (res.changed === 0) return { reason: 'nothing-changed', text: null, changed: 0 };
  return { reason: 'rewritten', text: JSON.stringify(res.json), changed: res.changed };
}

/**
 * 改写一段响应正文。返回 `null` = **不要改变原响应**。
 *
 * 没有自定义课程时直接返回 `null`：此时接管没有任何意义，早退也省一次 JSON 解析。
 */
export function transformResponse(
  kind: HijackKind,
  text: string,
  items: readonly BkxkCustomCourse[],
): string | null {
  const outcome = explainTransform(kind, text, items);
  if (outcome.reason === 'rewritten') log.info(`[接管] ${kind} 改写了 ${String(outcome.changed)} 处`);
  return outcome.text;
}

/** 改写过课表响应没有（晚到补偿用：只有「真改到了」才算接住） */
let rewroteTimetable = false;

/** 我们是不是真的把自定义课程写进过站点课表响应 */
export function didRewriteTimetable(): boolean {
  return rewroteTimetable;
}

/** 复位（档 1 测试用） */
export function resetRewriteFlags(): void {
  rewroteTimetable = false;
}

/**
 * 运行期入口：读开关 + 读自定义课程，再改写。
 *
 * ⚠️ 这里会为**每一条**响应留一行诊断（v0.28 起）：接管「开关打开了但什么都没发生」
 * 这类问题，光看成功日志是看不出来的 —— 必须知道它是没经过我们、还是经过了但早退了。
 * 刻意**不给两种情况记日志**：开关关着（那是用户的选择）、以及没有自定义课程
 * （那是常态，否则列表页每次请求都要刷一行）。
 */
export function transformCurrentResponse(kind: HijackKind, text: string): string | null {
  if (!kindEnabled(kind)) return null;
  const items = readEnabledCustomCourses();
  const outcome = explainTransform(kind, text, items);
  if (outcome.reason === 'rewritten') {
    log.info(`[接管] ${kind} 改写了 ${String(outcome.changed)} 处`);
    if (kind === 'timetable') rewroteTimetable = true;
    return outcome.text;
  }
  if (outcome.reason !== 'no-courses' && outcome.reason !== 'empty-text') {
    log.info(`[接管] ${kind} 响应没改：${SKIP_TEXT[outcome.reason]}`);
  }
  return null;
}

// ------------------------------------------------------------ 安装层（IO）

/** `XMLHttpRequest` 里我们碰得到的部分（测试里用假对象顶替） */
export interface XhrLike {
  readonly readyState: number;
  readonly responseURL?: string;
  readonly responseType?: string;
  readonly responseText?: string;
  readonly response?: unknown;
  addEventListener(type: string, listener: () => void): void;
}

type XhrCtor = new () => XhrLike;

/**
 * 改写一个已经完成的 XHR。返回是否真的改了。
 *
 * 站点用 jQuery，`responseType` 通常是空串（走 `responseText`）；
 * 若它要 `'json'`，则连 `response` getter 一起换掉，否则 jQuery 读到的还是旧值。
 */
export function rewriteXhr(xhr: XhrLike): boolean {
  const kind = kindOf(typeof xhr.responseURL === 'string' ? xhr.responseURL : null);
  if (kind === null) return false;

  const rt = typeof xhr.responseType === 'string' ? xhr.responseType : '';
  if (rt !== '' && rt !== 'text' && rt !== 'json') return false;

  let text: string;
  try {
    text = typeof xhr.responseText === 'string' ? xhr.responseText : '';
  } catch {
    return false;
  }
  if (text === '') return false;

  const next = transformCurrentResponse(kind, text);
  if (next === null) return false;

  try {
    Object.defineProperty(xhr, 'responseText', { configurable: true, get: () => next });
    if (rt === 'json') {
      Object.defineProperty(xhr, 'response', { configurable: true, get: () => JSON.parse(next) as unknown });
    }
  } catch {
    log.warn('接管响应失败（无法改写 responseText）');
    return false;
  }
  return true;
}

/** 包一层构造函数；`prototype` 必须指回原型的原型，否则站点的 `instanceof` 判断会挂 */
export function makeXhrCtor(Orig: XhrCtor): XhrCtor {
  function Wrapped(this: unknown): XhrLike {
    const xhr = new Orig();
    xhr.addEventListener('readystatechange', () => {
      if (xhr.readyState === 4) rewriteXhr(xhr);
    });
    return xhr;
  }
  (Wrapped as unknown as { prototype: unknown }).prototype = (Orig as unknown as { prototype: unknown }).prototype;
  return Wrapped as unknown as XhrCtor;
}

/**
 * 该往哪个全局对象上装接管 —— **必须是页面 realm，不是沙箱 realm**。
 *
 * v0.24 修掉的真 bug 的说明挪到了 `page-realm.ts`（那两个函数现在被本文件与
 * 晚到补偿共用）。这里只留一句：`installXhr()` 默认目标是 `pageRealm()`。
 */

/** 我们是在页面加载后的第几毫秒装上接管的（`performance.now()` 同一时钟） */
let installedAtMs: number | null = null;

/** 装上接管的时刻（毫秒）；没装过为 null。晚到补偿用它和站点请求时刻比大小 */
export function installedAt(): number | null {
  return installedAtMs;
}

/** 装 XHR 接管；已装或环境里没有 XHR 返回 `false` */
export function installXhr(target: unknown = pageRealm()): boolean {
  const t = target as Record<string, unknown>;
  if (t['__szuXhrInstalled'] === true) return false;
  const orig = t['XMLHttpRequest'];
  if (typeof orig !== 'function') return false;
  t['XMLHttpRequest'] = makeXhrCtor(orig as XhrCtor);
  t['__szuXhrInstalled'] = true;
  return true;
}

interface FetchResLike {
  readonly status: number;
  readonly statusText: string;
  readonly headers: unknown;
  text(): Promise<string>;
}

type FetchInit = { __szuSkip?: boolean } & Record<string, unknown>;
type FetchLike = (input: unknown, init?: FetchInit) => Promise<FetchResLike>;

/** 装 fetch 接管（防御性：站点改用 fetch 时不必再改这里） */
export function installFetch(target: unknown = pageRealm()): boolean {
  const t = target as Record<string, unknown>;
  if (t['__szuFetchInstalled'] === true) return false;
  const orig = t['fetch'];
  if (typeof orig !== 'function') return false;

  const ResponseCtor = t['Response'];
  const patched: FetchLike = (input, init) => {
    const p = (orig as FetchLike)(input, init);
    // 我们自己发的请求带 __szuSkip（core/http.ts），必须原样放行
    if (init !== undefined && init !== null && init['__szuSkip'] === true) return p;
    const url = typeof input === 'string' ? input : ((input as { url?: string } | null)?.url ?? '');
    const kind = kindOf(url);
    if (kind === null) return p;
    return p.then(async (res) => {
      const text = await res.text();
      const next = transformCurrentResponse(kind, text);
      if (next === null) return res;
      if (typeof ResponseCtor !== 'function') {
        log.warn('接管响应失败（环境里没有 Response 构造器）');
        return res;
      }
      const Ctor = ResponseCtor as new (body: string, init: unknown) => FetchResLike;
      return new Ctor(next, { status: res.status, statusText: res.statusText, headers: res.headers });
    });
  };

  t['fetch'] = patched;
  t['__szuFetchInstalled'] = true;
  return true;
}

/**
 * 装上两类接管。**无论开关是否打开都装** —— 开关在每次响应时单独判断，
 * 这样用户在面板里拨开关不需要刷新页面。
 *
 * 默认目标是**页面 realm**（`pageRealm()`，即 unsafeWindow），
 * 传 `target` 只给档 1 测试用（塞一个假的全局对象）。
 */
export function installHijack(target: unknown = pageRealm()): boolean {
  const xhr = installXhr(target);
  const fetch = installFetch(target);
  if (xhr || fetch) {
    installedAtMs = typeof performance !== 'undefined' ? performance.now() : 0;
    log.info(
      `响应接管已安装（XHR=${String(xhr)} fetch=${String(fetch)}，装上时刻 ${installedAtMs.toFixed(0)}ms）`,
    );
  }
  return xhr || fetch;
}

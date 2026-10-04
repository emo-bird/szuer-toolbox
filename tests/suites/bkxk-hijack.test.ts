/**
 * 纯函数冒烟（档1）：bkxk 响应接管（`hijack.ts`）。
 *
 * 这一套守的是四条**红线**，不是功能覆盖率：
 *   1. **只接管该接管的端点** —— 课程查询 / 课表两类，其它（登录、容量查询…）一律不碰；
 *   2. **只增加，绝不清除**站点算好的 `isConflict` / `conflictDesc`（原有描述必须被追加）；
 *   3. **开关关掉就完全不接管**（用户要有办法立刻退回站点原始响应）；
 *   4. **我们自己发的请求必须放行**（`__szuSkip`），否则脚本自己的请求会被自己改写。
 *
 * 主力用例吃 `tests/fixtures/` 里的真实响应样本（脱敏裁剪版，见 tests/fixtures/README.md）：
 * 课表用 `bkxk-teachingTime.json`、列表用 `bkxk-programCourse.json`（嵌套）与
 * `bkxk-noArranged.json`（扁平）。
 */

import { readFileSync } from 'node:fs';
import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import { clearAll, write } from '../../src/common/core/storage.ts';
import { resetRegistry as resetSettings, registerToggles, setEnabled } from '../../src/common/core/settings.ts';
import { CUSTOM_COURSES_KEY } from '../../src/common/custom/courses.ts';
import { CATEGORY_EP, EP } from '../../src/sites/bkxk/api.ts';
import { BKXK_TOGGLES, registerBkxkSettings, SITE_ID, TOGGLE } from '../../src/sites/bkxk/settings.ts';
import { withSegments, readEnabledCustomCourses } from '../../src/sites/bkxk/custom.ts';
import type { BkxkCustomCourse } from '../../src/sites/bkxk/custom.ts';
import {
  CUSTOM_ID_PREFIX,
  augmentList,
  augmentTimetable,
  conflictDescFor,
  customConflicts,
  installFetch,
  installHijack,
  installXhr,
  kindEnabled,
  kindOf,
  rewriteXhr,
  transformResponse,
} from '../../src/sites/bkxk/hijack.ts';
import type { XhrLike } from '../../src/sites/bkxk/hijack.ts';

// ------------------------------------------------------------- fixture

interface RawBody {
  readonly totalCount?: unknown;
  readonly dataList: readonly Record<string, unknown>[];
  readonly code?: unknown;
}

function load<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

const PROGRAM = load<RawBody>('bkxk-programCourse.json');
const NO_ARRANGED = load<RawBody>('bkxk-noArranged.json');
const TIMETABLE = load<RawBody>('bkxk-teachingTime.json');

/** 真实样本里的第一个教学班地点（`5-18周星期一3-5节汇德楼A508`） */
const REAL_PLACE = String(
  (PROGRAM.dataList[0]?.['tcList'] as Record<string, unknown>[] | undefined)?.[0]?.['teachingPlace'] ??
    '',
);

/**
 * 与 `REAL_PLACE` 同天同节次、只换地点的自定义课程地点。
 * 实测：真实样本 33 个教学班里**有 7 个**是「5-18 周 星期一 3-5 节」（7 间不同教室），
 * 所以这里的期望值是 7 而不是 1 —— 也正因为如此，用例同时用 `time.ts` 自己数一遍做交叉验证。
 */
const CONFLICTING_PLACE = '5-18周星期一3-5节自定义教室';
const CONFLICTING_TC_COUNT = 7;

const TIMETABLE_URL = 'https://bkxk.szu.edu.cn/xsxkapp/sys/xsxkapp/elective/teachingTime.do?x=1';

function boot(): void {
  clearAll();
  resetSettings();
  // ⚠️ 开关**不在** `registerBkxkSettings()` 里注册：`BKXK_TOGGLES` 随适配器的 `toggles`
  // 字段由 `src/sites/index.ts` 的 `registerSites()` 统一灌进注册表（单一来源）。
  // 测试里只灌 bkxk 那几条，免得把 demo / uooc 一起拖进来。
  registerToggles(SITE_ID, '本科选课', BKXK_TOGGLES);
  registerBkxkSettings();
}

function course(id: string, name: string, place: string, enabled = true) {
  return { id, name, teacher: '张老师', place, color: '#e8f2fd', enabled };
}

/** 造一条带 `segs` 的自定义课程（走真实解析路径，不用手写 segs） */
function item(id: string, name: string, place: string, enabled = true): BkxkCustomCourse {
  const built = withSegments([course(id, name, place, enabled)])[0];
  assert(built !== undefined, `withSegments 应当返回一条：${place}`);
  return built!;
}

function textOf(body: unknown): string {
  return JSON.stringify(body);
}

/** 用 `time.ts` 自己数一遍真实样本里有多少教学班与我们冲突（交叉验证用） */
function countConflictsInSample(place: string): number {
  let n = 0;
  for (const row of PROGRAM.dataList) {
    const tcs = (row['tcList'] as Record<string, unknown>[] | undefined) ?? [row];
    for (const tc of tcs) {
      if (customConflicts(String(tc['teachingPlace'] ?? ''), [item('cx', 'X', place)]).length > 0) n += 1;
    }
  }
  return n;
}

// ------------------------------------------------------------ 端点识别

describe('bkxk/hijack —— 端点识别', () => {
  it('课表端点 → timetable（带查询串、绝对地址、大小写都能认）', () => {
    assertEqual(kindOf('elective/teachingTime.do'), 'timetable');
    assertEqual(kindOf(TIMETABLE_URL), 'timetable');
    assertEqual(
      kindOf('https://bkxk.szu.edu.cn/xsxkapp/sys/xsxkapp/elective/TEACHINGTIME.do'),
      'timetable',
    );
  });

  it('课程列表端点 → list', () => {
    assertEqual(kindOf('elective/programCourse.do'), 'list');
    assertEqual(kindOf('https://bkxk.szu.edu.cn/x/xsxkapp/elective/publicCourse.do?p=1'), 'list');
    assertEqual(kindOf('elective/queryCourse.do'), 'list');
  });

  it('api.ts 里出现的每个「会被接管」的列表端点都被正则命中（加类别时别忘了改这里）', () => {
    // `noArranged.do` 是**故意排除**的：它返回的每一行 `teachingPlace` 都是 null（未安排课程
    // 本来就没有地点），永远算不出冲突，接它等于白跑一层 JSON.parse。见开发文档 §4.4 的决策记录。
    const used = new Set<string>(Object.values(CATEGORY_EP));
    assertEqual(kindOf(EP.NO_ARRANGED), null, 'noArranged 故意不接管');
    for (const ep of used) {
      assertEqual(kindOf(ep), 'list', `${ep} 应当被识别为 list`);
      assertEqual(kindOf(`${ep}?t=1`), 'list', `${ep} 带查询串也该命中`);
    }
  });

  it('无关端点一律不接管（含容量查询、结果查询、登录页、未安排课程）', () => {
    const others = [
      EP.CAPACITY,
      EP.COURSE_RESULT,
      EP.NO_ARRANGED,
      'login/login.do',
      'https://bkxk.szu.edu.cn/xsxkapp/sys/xsxkapp/*default/grablessons.do',
      '',
      null,
      undefined,
    ];
    for (const u of others) {
      assertEqual(kindOf(u), null, `${String(u)} 不该被接管`);
    }
  });

  it('已知宽松匹配：正则不锚尾（与旧仓库一致，故意保留）', () => {
    // 钉住这个行为，免得将来有人以为是手滑：`.do` 后面跟什么都不影响命中。
    assertEqual(kindOf('elective/teachingTime.do.bak'), 'timetable');
    assertEqual(kindOf('elective/programCourse.do.json'), 'list');
  });

  it('开关默认值：课表注入默认开、列表冲突追加默认关（🟠 自 v0.24 按 default 走）', () => {
    boot();
    assertEqual(kindEnabled('timetable'), true, '课表注入默认开（用户拍板，与旧版一致）');
    assertEqual(kindEnabled('list'), false, '列表冲突追加默认关（怕把课全标成冲突不敢选课）');
    setEnabled(SITE_ID, TOGGLE.HIJACK_TIMETABLE, false);
    assertEqual(kindEnabled('timetable'), false, '显式关掉之后不许被 default 顶回来');
    setEnabled(SITE_ID, TOGGLE.HIJACK_LIST_CONFLICT, true);
    assertEqual(kindEnabled('list'), true);
    assertEqual(kindEnabled('timetable'), false, '两个开关互不影响');
    assertEqual(readEnabledCustomCourses().length, 0, '空库里读不到自定义课程');
  });
});

// -------------------------------------------------------- 冲突判定与描述

describe('bkxk/hijack —— 冲突判定', () => {
  boot();
  const mine = item('c1', '我的课', '5-18周星期一3-5节 自己加的教室');

  it('同天同节次且有共同周 → 冲突', () => {
    const hit = customConflicts('5-18周星期一3-5节汇德楼A508', [mine]);
    assertEqual(hit.length, 1);
    assertEqual(hit[0]?.name, '我的课');
  });

  it('星期不同 / 节次不重叠 / 周次不重叠 → 不冲突', () => {
    assertEqual(customConflicts('5-18周星期二3-5节汇德楼A508', [mine]).length, 0);
    assertEqual(customConflicts('5-18周星期一1-2节汇德楼A508', [mine]).length, 0);
    assertEqual(customConflicts('1-4周星期一3-5节汇德楼A508', [mine]).length, 0);
  });

  it('单双周：单周课程与双周课程不算冲突', () => {
    const odd = item('c2', '单周课', '5-18周(单)星期一3-5节 教室');
    assertEqual(customConflicts('5-18周(双)星期一3-5节汇德楼A508', [odd]).length, 0);
    assertEqual(customConflicts('5-18周(单)星期一3-5节汇德楼A508', [odd]).length, 1);
  });

  it('空地点 / 解析不出的地点 → 判定为「不冲突」（宁可漏报不误报）', () => {
    for (const p of ['', null, undefined, '未安排', '待定']) {
      assertDeepEqual(customConflicts(p, [mine]), [], `输入 ${String(p)}`);
    }
  });

  it('关掉的自定义课程不参与判定', () => {
    const off = item('c3', '关掉的课', '5-18周星期一3-5节 教室', false);
    assertDeepEqual(customConflicts('5-18周星期一3-5节汇德楼A508', [off]), []);
  });

  it('描述文案：自定义课程：名字(地点)，多条用分号连', () => {
    const a = item('c1', 'A', '5-18周星期一3-5节 X');
    const b = item('c2', 'B', '5-18周星期一3-5节 Y');
    assertEqual(conflictDescFor([a, b]), '自定义课程：A(5-18周星期一3-5节 X)；自定义课程：B(5-18周星期一3-5节 Y)');
    assertEqual(conflictDescFor([]), '');
  });
});

// ---------------------------------------------------------- 列表响应改写

describe('bkxk/hijack —— 列表响应改写（真实样本）', () => {
  boot();
  const mine = item('c1', '我的课', CONFLICTING_PLACE);

  it('样本前提：第一个教学班有地点，且与我们的自定义课程同天同节次', () => {
    assert(REAL_PLACE !== '', '样本应有 teachingPlace');
    assertEqual(customConflicts(REAL_PLACE, [mine]).length, 1, `应当冲突：${REAL_PLACE}`);
    assertEqual(countConflictsInSample(CONFLICTING_PLACE), CONFLICTING_TC_COUNT, '样本里的冲突数变了？');
  });

  it('命中 7 个教学班（实测：样本 33 个里 7 个是周一 3-5 节）', () => {
    const res = augmentList(JSON.parse(textOf(PROGRAM)) as RawBody, [mine]);
    assertEqual(res.changed, CONFLICTING_TC_COUNT);
  });

  it('打标记：isConflict=1、szuCustomConflict=true、conflictDesc 带自定义字样', () => {
    const res = augmentList(JSON.parse(textOf(PROGRAM)) as RawBody, [mine]);
    const list = (res.json as RawBody).dataList;
    const marked: Record<string, unknown>[] = [];
    for (const row of list) {
      for (const tc of (row['tcList'] as Record<string, unknown>[] | undefined) ?? [row]) {
        if (tc['szuCustomConflict'] === true) marked.push(tc);
      }
    }
    assertEqual(marked.length, CONFLICTING_TC_COUNT);
    for (const tc of marked) {
      assertEqual(tc['isConflict'], '1');
      assert(String(tc['conflictDesc']).includes('自定义课程：我的课'), String(tc['conflictDesc']));
    }
  });

  it('未冲突的教学班一个字段都不动（只加不减）', () => {
    const res = augmentList(JSON.parse(textOf(PROGRAM)) as RawBody, [mine]);
    const list = (res.json as RawBody).dataList;
    let untouched = 0;
    let touched = 0;
    for (const row of list) {
      for (const tc of (row['tcList'] as Record<string, unknown>[] | undefined) ?? [row]) {
        if (tc['szuCustomConflict'] === true) touched += 1;
        else {
          untouched += 1;
          assertEqual(tc['szuCustomConflict'], undefined, '未冲突的行不该有我们的标记');
        }
      }
    }
    assertEqual(touched, CONFLICTING_TC_COUNT);
    assertEqual(untouched, 33 - CONFLICTING_TC_COUNT, '样本共 33 个教学班');
  });

  it('站点原有的 conflictDesc 被**追加**而不是替换（红线：只加不减）', () => {
    const body = {
      code: '1',
      dataList: [
        {
          code: 'x',
          tcList: [
            {
              teachingPlace: '5-18周星期一3-5节汇德楼A508',
              isConflict: '1',
              conflictDesc: '与「线性代数」冲突',
            },
          ],
        },
      ],
    };
    const res = augmentList(JSON.parse(textOf(body)) as RawBody, [mine]);
    assertEqual(res.changed, 1);
    const tc = ((res.json as RawBody).dataList[0]?.['tcList'] as Record<string, unknown>[])[0];
    assertEqual(tc?.['conflictDesc'], `与「线性代数」冲突；自定义课程：我的课(${CONFLICTING_PLACE})`);
  });

  it('扁平结构（没有 tcList）也覆盖', () => {
    const body = {
      code: '1',
      dataList: [
        { courseName: '高等数学', teachingPlace: '5-18周星期一3-5节汇德楼A508' },
        { courseName: '没地点', teachingPlace: null },
      ],
    };
    const res = augmentList(JSON.parse(textOf(body)) as RawBody, [mine]);
    assertEqual(res.changed, 1);
    const rows = (res.json as RawBody).dataList as Record<string, unknown>[];
    assertEqual(rows[0]?.['szuCustomConflict'], true);
    assertEqual(rows[1]?.['szuCustomConflict'], undefined, '没地点的行不该被标');
  });

  it('真实 noArranged 样本（地点全为 null）不该被改任何一处', () => {
    const res = augmentList(JSON.parse(textOf(NO_ARRANGED)) as RawBody, [mine]);
    assertEqual(res.changed, 0);
  });

  it('dataList 不是数组 / json 不是对象 → 原样返回、改动 0、不抛错', () => {
    for (const body of [{}, { dataList: {} }, null, 7, 'x', []]) {
      const res = augmentList(body, [mine]);
      assertEqual(res.changed, 0, `输入 ${JSON.stringify(body)}`);
      assertEqual(res.json, body, '应当原样返回同一个引用');
    }
  });

  it('没有自定义课程 / 全部关掉 → 一处都不改', () => {
    assertEqual(augmentList(JSON.parse(textOf(PROGRAM)) as RawBody, []).changed, 0);
    assertEqual(
      augmentList(JSON.parse(textOf(PROGRAM)) as RawBody, [item('c1', 'A', REAL_PLACE, false)]).changed,
      0,
    );
  });
});

// ---------------------------------------------------------- 课表响应改写

describe('bkxk/hijack —— 课表响应改写（真实样本）', () => {
  boot();
  const mine = item('c1', '我的课', '5-18周星期一9-10节 自定义教室');
  const before = TIMETABLE.dataList.length;

  it('样本前提：14 条、位图最长 20（比默认 18 长）', () => {
    assertEqual(before, 14);
    const longest = Math.max(...TIMETABLE.dataList.map((r) => String(r['week'] ?? '').length));
    assertEqual(longest, 20);
  });

  it('新增一行，字段形状与站点一致（前缀 / 星期名 / 节次 / 位图长度）', () => {
    const res = augmentTimetable(JSON.parse(textOf(TIMETABLE)) as RawBody, [mine]);
    assertEqual(res.changed, 1);
    const list = (res.json as RawBody).dataList as Record<string, unknown>[];
    assertEqual(list.length, before + 1);
    const row = list[before]!;
    assertEqual(row['teachingClassID'], `${CUSTOM_ID_PREFIX}c1-0`);
    assertEqual(row['courseName'], '我的课');
    assertEqual(row['teacherName'], '张老师');
    assertEqual(row['dayOfWeekName'], '星期一');
    assertEqual(row['dayOfWeek'], '1');
    assertEqual(row['beginSection'], '9');
    assertEqual(row['endSection'], '10');
    assertEqual(row['teachingPlace'], '自定义教室');
    assertEqual(row['weekName'], '5-18周');
    assertEqual(row['szuCustom'], true);
    assertEqual(String(row['timeType']), '1');
    // 位图长度跟随站点（20），不是默认 18
    assertEqual(String(row['week']).length, 20);
  });

  it('位图内容正确：第 5-18 周为 1，长度 20 时后两格为空', () => {
    const res = augmentTimetable(JSON.parse(textOf(TIMETABLE)) as RawBody, [mine]);
    const row = ((res.json as RawBody).dataList as Record<string, unknown>[])[before]!;
    assertEqual(row['week'], '00001111111111111100');
  });

  it('totalCount 累加新增条数', () => {
    const res = augmentTimetable(JSON.parse(textOf(TIMETABLE)) as RawBody, [mine]);
    assertEqual((res.json as RawBody).totalCount, (TIMETABLE.totalCount as number) + 1);
  });

  it('多段课程按段数新增，段序号进 teachingClassID', () => {
    const two = item('c9', '两段课', '1-8周星期一1-2节 A, 9-16周星期三3-4节 B');
    assertEqual(two.segs.length, 2, '应当解析出两段');
    const res = augmentTimetable(JSON.parse(textOf(TIMETABLE)) as RawBody, [two]);
    assertEqual(res.changed, 2);
    const list = (res.json as RawBody).dataList as Record<string, unknown>[];
    assertEqual(list[before]?.['teachingClassID'], `${CUSTOM_ID_PREFIX}c9-0`);
    assertEqual(list[before + 1]?.['teachingClassID'], `${CUSTOM_ID_PREFIX}c9-1`);
    assertEqual(list[before + 1]?.['dayOfWeekName'], '星期三');
  });

  it('解不出星期（day 为 null）的段跳过：没有星期就不知道该插到哪一列', () => {
    const noDay = item('c2', '没星期', '1-8周 3-4节 A');
    assertEqual(noDay.segs.length, 1);
    assertEqual(noDay.segs[0]?.day, null);
    assertEqual(augmentTimetable(JSON.parse(textOf(TIMETABLE)) as RawBody, [noDay]).changed, 0);
  });

  it('站点位图都很短时用默认 18 周', () => {
    const body = { code: '1', totalCount: 1, dataList: [{ week: '111', teachingClassID: 'x' }] };
    const res = augmentTimetable(JSON.parse(textOf(body)) as RawBody, [mine]);
    const list = (res.json as RawBody).dataList as Record<string, unknown>[];
    assertEqual(String(list[1]?.['week']).length, 18);
  });

  it('dataList 不是数组 → 原样返回、改动 0', () => {
    for (const body of [{}, { dataList: null }, null, 'x']) {
      const res = augmentTimetable(body, [mine]);
      assertEqual(res.changed, 0);
      assertEqual(res.json, body);
    }
  });

  it('关掉的自定义课程不进课表', () => {
    const off = item('c3', '关掉的', '1-8周星期一1-2节 A', false);
    assertEqual(augmentTimetable(JSON.parse(textOf(TIMETABLE)) as RawBody, [off]).changed, 0);
  });
});

// -------------------------------------------------------- transformResponse

describe('bkxk/hijack —— transformResponse 的早退条件', () => {
  boot();
  const mine = item('c1', '我的课', '5-18周星期一9-10节 自定义教室');
  const ok = textOf({ code: '1', totalCount: 14, dataList: TIMETABLE.dataList });

  it('没有自定义课程 / 正文为空 → null（不解析）', () => {
    assertEqual(transformResponse('timetable', ok, []), null);
    assertEqual(transformResponse('timetable', '', [mine]), null);
  });

  it('正文不是 JSON / 不是对象 / code != 1 → null', () => {
    assertEqual(transformResponse('timetable', '{坏', [mine]), null);
    assertEqual(transformResponse('timetable', '"字符串"', [mine]), null);
    assertEqual(transformResponse('timetable', '[1,2]', [mine]), null);
    assertEqual(transformResponse('timetable', textOf({ code: '0', dataList: [] }), [mine]), null);
  });

  it('一处都没改 → null（调用方据此保留原响应）', () => {
    assertEqual(transformResponse('list', textOf({ code: '1', dataList: [] }), [mine]), null);
    assertEqual(transformResponse('list', textOf(NO_ARRANGED), [mine]), null);
  });

  it('改了 → 返回可直接 parse 的 JSON 字符串', () => {
    const out = transformResponse('timetable', ok, [mine]);
    assert(out !== null, '应当返回改写后的正文');
    const parsed = JSON.parse(out!) as RawBody;
    assertEqual(parsed.dataList.length, TIMETABLE.dataList.length + 1);
    assertEqual((parsed.dataList.at(-1) as Record<string, unknown>)['szuCustom'], true);
  });
});

// ------------------------------------------------------------- XHR 层

class FakeXhr {
  readyState = 0;
  responseURL = '';
  responseType = '';
  responseText = '';
  response: unknown = null;
  fired = 0;
  listeners: Array<() => void> = [];

  addEventListener(type: string, listener: () => void): void {
    if (type === 'readystatechange') this.listeners.push(listener);
  }

  fire(url: string, body: string): void {
    this.readyState = 4;
    this.responseURL = url;
    this.responseText = body;
    this.fired += 1;
    for (const l of this.listeners) l();
  }
}

type Env = Record<string, unknown>;

function makeEnv(): { env: Env; built: FakeXhr[] } {
  const built: FakeXhr[] = [];
  function Ctor(this: unknown): FakeXhr {
    const x = new FakeXhr();
    built.push(x);
    return x;
  }
  (Ctor as unknown as { prototype: unknown }).prototype = FakeXhr.prototype;
  return { env: { XMLHttpRequest: Ctor as unknown }, built };
}

function bootOn(): void {
  boot();
  setEnabled(SITE_ID, TOGGLE.HIJACK_TIMETABLE, true);
  setEnabled(SITE_ID, TOGGLE.HIJACK_LIST_CONFLICT, true);
  write(CUSTOM_COURSES_KEY, [course('c1', '我的课', '5-18周星期一9-10节 自定义教室')]);
}

describe('bkxk/hijack —— rewriteXhr', () => {
  const body = () => textOf({ code: '1', totalCount: 14, dataList: TIMETABLE.dataList });

  it('开关关着时一个字都不改', () => {
    boot();
    // 课表注入自 v0.24 起默认开 ⇒ 这里要显式关掉，测的是闸门而不是默认值
    setEnabled(SITE_ID, TOGGLE.HIJACK_TIMETABLE, false);
    write(CUSTOM_COURSES_KEY, [course('c1', '我的课', '5-18周星期一9-10节 A')]);
    const x = new FakeXhr();
    x.fire(TIMETABLE_URL, body());
    assertEqual(rewriteXhr(x as unknown as XhrLike), false);
    assertEqual(x.responseText, body());
  });

  it('开关开着且命中 → responseText 变了，返回 true', () => {
    bootOn();
    const x = new FakeXhr();
    x.fire(TIMETABLE_URL, body());
    assertEqual(rewriteXhr(x as unknown as XhrLike), true);
    const parsed = JSON.parse(x.responseText) as RawBody;
    assertEqual(parsed.dataList.length, TIMETABLE.dataList.length + 1);
  });

  it('不相关的 URL / 没有正文 / 正文为空 → 不动', () => {
    bootOn();
    const a = new FakeXhr();
    a.fire('https://bkxk.szu.edu.cn/xsxkapp/sys/xsxkapp/elective/teachingclass/capacity.do', body());
    assertEqual(rewriteXhr(a as unknown as XhrLike), false);
    assertEqual(a.responseText, body());
    const b = new FakeXhr();
    b.fire(TIMETABLE_URL, '');
    assertEqual(rewriteXhr(b as unknown as XhrLike), false);
  });

  it('responseType 是 blob/arraybuffer 时不动（我们看不懂二进制）', () => {
    bootOn();
    for (const rt of ['blob', 'arraybuffer', 'document']) {
      const x = new FakeXhr();
      x.responseType = rt;
      x.fire(TIMETABLE_URL, body());
      assertEqual(rewriteXhr(x as unknown as XhrLike), false, `responseType=${rt}`);
    }
  });

  it('responseType=list 的 json 请求：连 response getter 一起换掉', () => {
    bootOn();
    const x = new FakeXhr();
    x.responseType = 'json';
    x.fire('https://bkxk.szu.edu.cn/xsxkapp/sys/xsxkapp/elective/programCourse.do', textOf({
      code: '1',
      dataList: [{ tcList: [{ teachingPlace: '5-18周星期一9-10节汇德楼A508' }] }],
    }));
    assertEqual(rewriteXhr(x as unknown as XhrLike), true);
    const parsed = x.response as RawBody;
    const tc = ((parsed.dataList[0] as Record<string, unknown>)['tcList'] as Record<string, unknown>[])[0];
    assertEqual(tc?.['isConflict'], '1');
  });
});

describe('bkxk/hijack —— installXhr / installFetch', () => {
  it('装 XHR：新构造的对象带我们的监听，且 instanceof 仍然成立', () => {
    bootOn();
    const { env } = makeEnv();
    assertEqual(installXhr(env), true);
    const Ctor = env['XMLHttpRequest'] as new () => FakeXhr;
    const x = new Ctor();
    assert(x instanceof FakeXhr, 'prototype 必须指回原原型，否则站点 instanceof 判断会挂');
    x.fire(TIMETABLE_URL, textOf({ code: '1', totalCount: 0, dataList: [] }));
    assertEqual(x.fired, 1);
  });

  it('构造时就注册监听 → 站点（后注册）读到的是改写后的正文', () => {
    bootOn();
    const { env } = makeEnv();
    installXhr(env);
    const x = new (env['XMLHttpRequest'] as new () => FakeXhr)();
    // 模拟站点/jQuery：拿到 xhr **之后**才注册自己的回调
    let seen = '';
    x.addEventListener('readystatechange', () => {
      if (x.readyState === 4) seen = x.responseText;
    });
    x.fire(TIMETABLE_URL, textOf({ code: '1', totalCount: 14, dataList: TIMETABLE.dataList }));
    const ours = JSON.parse(seen) as RawBody;
    assertEqual(ours.dataList.length, TIMETABLE.dataList.length + 1, '站点读到的应当是改写后的');
  });

  it('重复装返回 false；环境里没有 XHR 也返回 false', () => {
    bootOn();
    const { env } = makeEnv();
    assertEqual(installXhr(env), true);
    assertEqual(installXhr(env), false, '重复装应当被守卫挡住');
    assertEqual(installXhr({}), false);
  });

  it('装 fetch：改写正文，并用原状态码包回一个 Response', async () => {
    bootOn();
    class FakeResponse {
      body: string;
      init: unknown;
      constructor(body: string, init: unknown) {
        this.body = body;
        this.init = init;
      }
      text(): Promise<string> {
        return Promise.resolve(this.body);
      }
    }
    const res = {
      status: 200,
      statusText: 'OK',
      headers: {},
      text: () => Promise.resolve(textOf({ code: '1', totalCount: 14, dataList: TIMETABLE.dataList })),
    };
    const env: Env = { fetch: () => Promise.resolve(res), Response: FakeResponse };
    assertEqual(installFetch(env), true);
    const call = env['fetch'] as (u: string) => Promise<FakeResponse>;
    const out = await call(TIMETABLE_URL);
    const parsed = JSON.parse(out.body) as RawBody;
    assertEqual(parsed.dataList.length, TIMETABLE.dataList.length + 1);
    assertDeepEqual(out.init, { status: 200, statusText: 'OK', headers: {} });
    assertEqual(installFetch(env), false, '重复装应当被守卫挡住');
  });

  it('带 __szuSkip 的请求原样放行（脚本自己发的请求不能被自己改写）', async () => {
    bootOn();
    const res = {
      status: 200,
      statusText: 'OK',
      headers: {},
      text: () => Promise.resolve(textOf({ code: '1', totalCount: 14, dataList: TIMETABLE.dataList })),
    };
    const env: Env = { fetch: () => Promise.resolve(res), Response: class {} };
    installFetch(env);
    const call = env['fetch'] as (u: string, i: unknown) => Promise<unknown>;
    const out = await call(TIMETABLE_URL, { __szuSkip: true });
    assert(out === res, '必须返回同一个对象（一个字节都不碰）');
  });

  it('installHijack 一次装两个；装不上返回 false', () => {
    bootOn();
    const { env } = makeEnv();
    env['fetch'] = () => Promise.resolve({ status: 200, statusText: '', headers: {}, text: async () => '{}' });
    env['Response'] = class {};
    assertEqual(installHijack(env), true);
    assertEqual(installHijack({}), false, '空环境里没有 XHR/fetch');
  });

  it('不给 target 时装到页面 realm（unsafeWindow），不是沙箱的 globalThis', () => {
    // v0.24 的真事故：脚本带 @grant ⇒ 跑在沙箱里，把包装写在沙箱的 globalThis 上
    // 页面一个字节都没动，站点请求照走原生 XHR ⇒ 接管永不出网且完全静默。
    bootOn();
    const { env } = makeEnv();
    const g = globalThis as Record<string, unknown>;
    const had = Object.prototype.hasOwnProperty.call(g, 'unsafeWindow');
    const before = g['unsafeWindow'];
    g['unsafeWindow'] = env;
    try {
      assertEqual(installHijack(), true, '应当装到 unsafeWindow 上');
      assertEqual(env['__szuXhrInstalled'], true, '包装必须落在页面 realm 的对象上');
    } finally {
      if (had) g['unsafeWindow'] = before;
      else delete g['unsafeWindow'];
    }
  });
});

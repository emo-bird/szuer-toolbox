/**
 * 档 1：`src/sites/bkxk/courses.ts` 的纯函数冒烟（批 2）。
 *
 * 两组主力用例直接吃 `tests/fixtures/` 里的**真实响应样本**
 * （`node tools/make-bkxk-fixtures.mjs` 从旧仓库脱敏裁剪生成，见 `tests/fixtures/README.md`）：
 * 33 个真实教学班的字段口径、扁平/嵌套两种结构，全都在真数据上验。
 *
 * 取数（`fetchCategory`）走**假 send** —— 档 1 一个网络请求都不发：
 * 唯一出口被替换成「记录调用 + 返回我给的响应正文」，于是能把
 * 「缺学号」「缺批次码」「业务拒绝」「登录失效」「未识别」这些分支全跑一遍。
 *
 * 因为 tsconfig 没开 `resolveJsonModule`，fixture 用 `node:fs` 读。
 */

import { readFileSync } from 'node:fs';
import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  classesOf,
  fetchCategory,
  flatten,
  listFrom,
  normClass,
  pick,
  pickFlag,
  pickNumber,
  pickString,
  remainOf,
  toFlag,
  toNumber,
} from '../../src/sites/bkxk/courses.ts';
import type { BkxkClass, SendFn } from '../../src/sites/bkxk/courses.ts';
import { BASE_PATH, classify } from '../../src/sites/bkxk/api.ts';
import type { SendOptions } from '../../src/sites/bkxk/api.ts';
import { subscribe as logSubscribe } from '../../src/common/core/log.ts';
import { parseSegment } from '../../src/sites/bkxk/time.ts';

// ------------------------------------------------------------- fixture

interface RawList {
  readonly totalCount: unknown;
  readonly dataList: readonly unknown[];
  readonly code?: unknown;
  readonly msg?: unknown;
}

function load<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

const PROGRAM = load<RawList>('bkxk-programCourse.json');
const NO_ARRANGED = load<RawList>('bkxk-noArranged.json');
const PLACES = load<{ rawCount: number; distinctCount: number; places: readonly string[] }>(
  'bkxk-teaching-place.json',
);

/** fixture 里的批次码（**脱敏后的假值**，见 tools/make-bkxk-fixtures.mjs 的 SENSITIVE） */
const BATCH_FROM_SAMPLE = 'abcdef0123456789abcdef0123456789';

const ORIGIN = 'https://bkxk.szu.edu.cn';
const STUDENT = '2026000000';

function asClass(c: unknown): BkxkClass {
  return c as BkxkClass;
}

// ----------------------------------------------------------- 假 send 装置

interface FakeSend {
  readonly fn: SendFn;
  readonly calls: SendOptions[];
}

/**
 * 造一个假 send：把每次调用记进 `calls`，返回我给的**响应正文**。
 *
 * 响应分类走**真的** `classify()`（不是手搓 `cls`），这样「业务拒绝 / 登录失效 /
 * 未识别」这些判定顺序一旦被改坏，本套件也会跟着红 —— 否则等于自己给自己发合格证。
 */
function fakeSend(body: string, status = 200): FakeSend {
  const calls: SendOptions[] = [];
  const fn: SendFn = async (o) => {
    calls.push(o);
    return {
      status,
      text: body,
      cls: classify({ status, text: body }),
      raw: { status, statusText: '', text: body, json: null, finalUrl: o.url, elapsedMs: 0 },
    };
  };
  return { fn, calls };
}

/** 造一个 bkxk 风格的响应正文 */
function reply(code: string, extra: Record<string, unknown> = {}, msg = ''): string {
  return JSON.stringify({ totalCount: 0, dataList: [], msg, code, timestamp: 0, ...extra });
}

/** 解出 `querySetting=<urlencoded json>` 里的那个 JSON */
function querySetting(body: string): Record<string, unknown> {
  assert(body.startsWith('querySetting='), `请求体应以 querySetting= 开头，实际：${body.slice(0, 40)}`);
  const raw = decodeURIComponent(body.slice('querySetting='.length));
  return JSON.parse(raw) as Record<string, unknown>;
}

// ------------------------------------------------------------- 1 纯函数

describe('courses · 取值与转换', () => {
  it('pick 取第一个有值的候选', () => {
    assertEqual(pick(null, undefined, 'a', 'b'), 'a', '应跳过 null/undefined');
  });

  it('pick 把空串也算缺失（站点会在 tc 行上写 ""）', () => {
    assertEqual(pick('', ' 课程名 ', null), ' 课程名 ', '空串必须被跳过');
  });

  it('pick 全缺失给 null', () => {
    assertEqual(pick(null, undefined, ''), null, '没有有值候选时应给 null');
  });

  it('pick 保留 0 与 false（它们不是"缺失"）', () => {
    assertEqual(pick(0, 'x'), 0, '数字 0 应被保留');
    assertEqual(pick(false, 'x'), false, '布尔 false 应被保留');
  });

  it('pickString 把数字转成字符串，拿不到给空串', () => {
    assertEqual(pickString(5), '5', '数字应转字符串');
    assertEqual(pickString(null, ''), '', '拿不到应给空串（不是 null）');
  });

  it('toNumber 认 "0" 与数值，认不出给 null', () => {
    assertEqual(toNumber('0'), 0, '"0" 是合法的 0');
    assertEqual(toNumber(3.5), 3.5, '数值原样返回');
    assertEqual(toNumber('12'), 12, '数字串应转成数字');
  });

  it('toNumber 拒绝空串 / 非数字 / 布尔 / 非有限数', () => {
    assertEqual(toNumber(''), null, '空串给 null');
    assertEqual(toNumber('   '), null, '纯空白给 null');
    assertEqual(toNumber('abc'), null, '非数字串给 null');
    assertEqual(toNumber(true), null, '布尔给 null（不要当成 1）');
    assertEqual(toNumber(Number.POSITIVE_INFINITY), null, '非有限数给 null');
    assertEqual(toNumber(null), null, 'null 给 null');
  });

  it('toFlag 吃站点的 "0" / "1" 与真布尔', () => {
    assertEqual(toFlag('1'), true, '"1" → true');
    assertEqual(toFlag('0'), false, '"0" → false');
    assertEqual(toFlag('true'), true, '"true" → true');
    assertEqual(toFlag('false'), false, '"false" → false');
    assertEqual(toFlag(true), true, 'true → true');
    assertEqual(toFlag(1), true, '1 → true');
    assertEqual(toFlag(0), false, '0 → false');
  });

  it('toFlag 给不出结论时给 null，而不是 false', () => {
    assertEqual(toFlag(null), null, 'null → null（站点没给值）');
    assertEqual(toFlag(''), null, '空串 → null');
    assertEqual(toFlag('2'), null, '没见过的取值 → null');
    assertEqual(toFlag('yes'), null, '非约定取值 → null');
  });

  it('pickNumber 跳过不可解析的候选', () => {
    assertEqual(pickNumber(null, '', 'abc', '7'), 7, '应取第一个能转成数字的');
    assertEqual(pickNumber(null, 'abc'), null, '都不可解析时给 null');
  });

  it('pickFlag 跳过给不出结论的候选（tc 是 null，课程级有值）', () => {
    assertEqual(pickFlag(null, '1'), true, '应取第一个能给出结论的');
    assertEqual(pickFlag(null, undefined, ''), null, '都无结论时给 null');
  });
});

// ------------------------------------------------- 2 嵌套结构（programCourse）

describe('courses · 嵌套结构：programCourse 真实样本', () => {
  it('样本顶部没有 data 外壳（这正是旧写法取不到数的原因）', () => {
    assert(!('data' in PROGRAM), '列表类端点的响应不该有顶层 data');
    assert(Array.isArray(PROGRAM.dataList), '应有顶层 dataList');
  });

  it('flatten 把 3 门课铺成 33 个教学班', () => {
    assertEqual(PROGRAM.dataList.length, 3, '裁剪后应剩 3 门课');
    assertEqual(flatten(PROGRAM).length, 33, '3 门课的 tcList 合计 33 个教学班');
  });

  it('教学班 ID 全部非空且互不重复', () => {
    const ids = flatten(PROGRAM).map((c) => c.teachingClassID);
    assert(ids.every((id) => id !== ''), '不应有空 ID');
    assertEqual(new Set(ids).size, ids.length, 'ID 不应重复');
  });

  it('课程名 / 学分 / 类型从课程级回填（tc 行上根本没有这些键）', () => {
    const first = flatten(PROGRAM).filter((c) => c.courseNumber === '5201890015');
    assert(first.length > 0, '样本里应有 5201890015 这门课的教学班');
    assert(
      first.every((c) => c.courseName === '大学英语（艺体类）（1）'),
      '每个教学班都该拿到课程级课程名',
    );
    assert(
      first.every((c) => c.credit === 4),
      '学分应来自课程级（credit="4" → 数字 4）',
    );
    assert(
      first.every((c) => c.typeName === '综合选修课'),
      '类型应来自课程级',
    );
  });

  it('开课单位 / 课程性质也从课程级回填（tc 上是 null）', () => {
    const all = flatten(PROGRAM);
    assert(
      all.every((c) => c.departmentName !== ''),
      '开课单位不该是空串（tc 上恒为 null，必须回退到课程级）',
    );
    assert(
      all.every((c) => c.courseNatureName !== ''),
      '课程性质不该是空串（同上）',
    );
  });

  it('学分 / 容量 / 志愿数归一化成数字（站点给的是字符串）', () => {
    const all = flatten(PROGRAM);
    assert(
      all.every((c) => typeof c.classCapacity === 'number'),
      'classCapacity 应是数字',
    );
    assert(
      all.every((c) => typeof c.numberOfFirstVolunteer === 'number'),
      'numberOfFirstVolunteer 应是数字',
    );
    assert(
      all.every((c) => typeof c.credit === 'number'),
      'credit 应是数字',
    );
  });

  it('三个开关归一化成布尔（站点给的是 "0" / "1"）', () => {
    const all = flatten(PROGRAM);
    assert(
      all.every((c) => typeof c.isMooc === 'boolean'),
      'isMooc 应是布尔',
    );
    assert(
      all.every((c) => typeof c.isFull === 'boolean'),
      'isFull 应是布尔',
    );
    assert(
      all.every((c) => typeof c.isConflict === 'boolean'),
      'isConflict 应是布尔',
    );
  });

  it('isFavorite 在这批样本里全是 null —— 不能拿它当收藏判据', () => {
    const all = flatten(PROGRAM);
    assert(
      all.every((c) => c.isFavorite === null),
      '站点这一栏不给值，归一化后必须是 null（不是 false）',
    );
  });

  it('campus 在 programCourse 两侧都没有 ⇒ 归一化成空串', () => {
    const all = flatten(PROGRAM);
    assert(
      all.every((c) => c.campus === ''),
      '没有校区字段时应给空串，由会话的 DEFAULT_CAMPUS 兜底',
    );
  });

  it('courseTotalNumber 只在部分 tc 上有值，取到的是数字', () => {
    const all = flatten(PROGRAM);
    const withValue = all.filter((c) => c.courseTotalNumber !== null);
    assert(withValue.length > 0, '样本里应有带 courseTotalNumber 的教学班');
    assert(
      withValue.every((c) => c.courseTotalNumber === 19022100),
      `tc 上的 "19022100" 应转成数字，实际：${withValue.map((c) => c.courseTotalNumber).join(',')}`,
    );
  });

  it('交叉验证：isFull 与 classCapacity-numberOfFirstVolunteer<=0 在 33/33 行一致', () => {
    const all = flatten(PROGRAM);
    let mismatch = 0;
    for (const c of all) {
      const remain = remainOf(c);
      if (remain === null) {
        mismatch += 1;
        continue;
      }
      if ((remain <= 0) !== (c.isFull === true)) mismatch += 1;
    }
    assertEqual(mismatch, 0, '站点自己算的 isFull 应与剩余名额的算法一致（不一致说明字段口径理解错了）');
  });

  it('每个教学班的地点串都能被 time.ts 解析出星期与节次', () => {
    const all = flatten(PROGRAM);
    assert(all.every((c) => c.teachingPlace !== ''), '嵌套结构里 teachingPlace 不该为空');
    const bad = all.filter((c) => parseSegment(c.teachingPlace) === null);
    assertEqual(bad.length, 0, `无法解析的地点串：${bad.map((c) => c.teachingPlace).join(' | ')}`);
  });

  it('地点语料 fixture 与课程样本自洽（49 条去重）', () => {
    assertEqual(PLACES.distinctCount, PLACES.places.length, 'distinctCount 应等于 places 条数');
    assertEqual(new Set(PLACES.places).size, PLACES.places.length, 'places 不该有重复');
    assert(PLACES.places.every((p) => parseSegment(p) !== null), '语料里每条都该能解析');
  });
});

// --------------------------------------------------- 3 扁平结构（noArranged）

describe('courses · 扁平结构：noArranged 真实样本', () => {
  it('没有 tcList 时，一行自己就是一个教学班', () => {
    const rows = NO_ARRANGED.dataList;
    assertEqual(rows.length, 2, '裁剪后应剩 2 行');
    assert(
      rows.every((r) => !Array.isArray((r as Record<string, unknown>)['tcList'])),
      '扁平结构不该有 tcList',
    );
    assertEqual(flatten(NO_ARRANGED).length, 2, '两行应铺成两个教学班');
  });

  it('课程名 / 学分来自行内自己（扁平结构没有课程级可回退）', () => {
    const all = flatten(NO_ARRANGED);
    assert(
      all.every((c) => c.courseName !== ''),
      '扁平行里自带 courseName',
    );
    // 逐行核对，不写「都是 1」——两行学分本来就不一样（1 / 2）
    assertDeepEqual(
      all.map((c) => c.credit),
      [1, 2],
      '扁平行里自带 credit（"1" / "2" → 数字）',
    );
  });

  it('校区在扁平行里才有值（与 programCourse 恰好相反）', () => {
    const all = flatten(NO_ARRANGED);
    assert(
      all.every((c) => c.campus === '01'),
      '扁平行的 campus 是 "01"',
    );
  });

  it('教学时间为空时归一化成空串、容量为 null', () => {
    const all = flatten(NO_ARRANGED);
    assert(
      all.every((c) => c.teachingPlace === ''),
      'sample 里 teachingPlace 是 null → 归一化成空串',
    );
    assert(
      all.every((c) => c.classCapacity === null && c.numberOfFirstVolunteer === null),
      '容量字段是 null',
    );
    assert(
      all.every((c) => remainOf(c) === null),
      '容量拿不到时剩余名额必须是 null，不能算成 0（0 会被误判成满课）',
    );
  });

  it('isFavorite 是 "0" ⇒ false（与 programCourse 的 null 形成对照）', () => {
    const all = flatten(NO_ARRANGED);
    assert(
      all.every((c) => c.isFavorite === false),
      '这一栏站点给了 "0"，就该是 false 而不是 null',
    );
  });

  it('isConflict 是 null ⇒ 归一化成 null（站点没给结论，别当成 false）', () => {
    const all = flatten(NO_ARRANGED);
    assert(
      all.every((c) => c.isConflict === null),
      'null 表示"站点没说"，与"站点说没冲突"是两回事',
    );
  });

  it('两类结构的教学班可以混在一个数组里消费（字段形状一致）', () => {
    const merged = [...flatten(PROGRAM), ...flatten(NO_ARRANGED)];
    assertEqual(merged.length, 35, '33 + 2');
    const keys = Object.keys(merged[0]!).sort();
    for (const c of merged) {
      assertDeepEqual(Object.keys(c).sort(), keys, '每个教学班的字段集合应完全一致');
    }
    assertEqual(keys.length, 18, 'BkxkClass 应是 18 个字段');
  });
});

// ------------------------------------------------------- 4 结构异常与兜底

describe('courses · 结构异常与兜底', () => {
  it('listFrom 只认顶层 dataList，其余一律 null', () => {
    assertEqual(listFrom({ dataList: [] })?.length, 0, '空数组应认');
    assertEqual(listFrom(null), null, 'null → null');
    assertEqual(listFrom('{}'), null, '字符串 → null');
    assertEqual(listFrom([]), null, '数组 → null');
    assertEqual(listFrom({}), null, '没有这个键 → null');
    assertEqual(listFrom({ dataList: 'x' }), null, '不是数组 → null');
  });

  it('旧仓库的写法（data.dataList）在真实响应上取不到任何东西', () => {
    // 这条是回归：旧脚本 `flatten = json.data.dataList` 永远拿到空数组，
    // 「类别监控」实际是坏的。新实现只认顶层，所以下面两个都必须空。
    const wrapped = { code: '1', totalCount: 1, data: { dataList: [{ teachingClassID: 'x' }] } };
    assertEqual(listFrom(wrapped), null, '只有顶层才算，data 里的不算');
    assertEqual(flatten(wrapped).length, 0, '取不到就是空数组');
  });

  it('取不到 dataList 时落一条 warn（不静默变空）', () => {
    // ⚠️ 不能用 entries() 去翻缓冲：别的套件会把日志等级改掉（log.test.ts 收尾停在 error），
    // 按等级过滤就什么都看不见。subscribe 收到的是全部条目，与等级无关。
    const seen: string[] = [];
    const off = logSubscribe((e) => {
      if (e.scope === 'bkxk/courses') seen.push(`${e.level}:${e.message}`);
    });
    try {
      flatten({ data: { dataList: [] } });
    } finally {
      off();
    }
    assert(
      seen.some((s) => s.startsWith('warn:') && s.includes('dataList')),
      `取不到顶层 dataList 时应有 warn 日志留痕，实际收到：${seen.join(' | ') || '（无）'}`,
    );
  });

  it('dataList 非空但条目不是对象时不抛错', () => {
    assertEqual(flatten({ dataList: [null, 'x', 7] }).length, 3, '每个坏条目当一条空教学班处理');
    const one = asClass(flatten({ dataList: [null] })[0]);
    assertEqual(one.teachingClassID, '', '坏条目 → 空 ID');
    assertEqual(one.classCapacity, null, '坏条目 → 容量 null');
  });

  it('classesOf：tcList 是空数组时返回空数组（不凭空造一行）', () => {
    assertEqual(classesOf({ courseName: 'A', tcList: [] }).length, 0, '空 tcList 没有可操作的教学班');
  });

  it('classesOf：tcList 不是数组时按扁平行处理', () => {
    const one = asClass(classesOf({ courseName: 'A', tcList: 'x' })[0]);
    assertEqual(one.courseName, 'A', 'tcList 不是数组 → 这一行自己就是教学班');
  });

  it('normClass 不改动入参', () => {
    const tc = { teachingClassID: '1', classCapacity: '3', isFavorite: null };
    const course = { courseName: '高数' };
    const before = JSON.stringify([tc, course]);
    normClass(tc, course);
    assertEqual(JSON.stringify([tc, course]), before, '归一化必须只读');
  });

  it('remainOf：容量拿不到给 null，拿得到就相减', () => {
    assertEqual(remainOf({ classCapacity: 40, numberOfFirstVolunteer: 12 }), 28, '40-12=28');
    assertEqual(remainOf({ classCapacity: 0, numberOfFirstVolunteer: 0 }), 0, '0-0=0 是合法结果');
    assertEqual(remainOf({ classCapacity: null, numberOfFirstVolunteer: 1 }), null, '缺一不可');
    assertEqual(remainOf({ classCapacity: 1, numberOfFirstVolunteer: null }), null, '缺一不可');
  });
});

// --------------------------------------------------------- 5 fetchCategory

describe('courses · fetchCategory（假 send）', () => {
  it('正常路径：URL / 动作名 / 请求体都对得上站点实测形态', async () => {
    const send = fakeSend(reply('1', { dataList: PROGRAM.dataList, totalCount: 3 }));
    const r = await fetchCategory({
      category: 'FANKC',
      studentCode: STUDENT,
      batchCode: BATCH_FROM_SAMPLE,
      origin: ORIGIN,
      send: send.fn,
    });

    assertEqual(send.calls.length, 1, '应只发一次请求');
    const o = send.calls[0]!;
    assertEqual(
      o.url,
      `${ORIGIN}${BASE_PATH}elective/programCourse.do`,
      'FANKC 应对应 programCourse.do',
    );
    assertEqual(o.action, '列表:FANKC', '动作名里应带类别，便于日志与落档');
    assertEqual(o.token, '', '没传 token 时应是空串');

    const setting = querySetting(o.body ?? '');
    assertDeepEqual(
      setting['data'],
      {
        studentCode: STUDENT,
        campus: '01',
        electiveBatchCode: BATCH_FROM_SAMPLE,
        isMajor: '1',
        teachingClassType: 'FANKC',
        checkConflict: '2',
        checkCapacity: '2',
        queryContent: 'YCJX:2,MOOC:2,',
      },
      '请求体内层字段应与实测一致',
    );
    assertEqual(setting['pageSize'], '10', '缺省每页 10 条');
    assertEqual(setting['pageNumber'], '0', '缺省第 0 页');
    assertEqual(setting['orderBy'], 'courseNumber', '缺省按课程号排序');

    assertEqual(r.ok, true, 'code=1 应判成功');
    assertEqual(r.status, 200, 'HTTP 状态透传');
    assertEqual(r.code, '1', '响应码透传');
    assertEqual(r.classes.length, 33, '33 个教学班');
    assert(r.raw !== null, '应把原始结果交回调用方');
  });

  it('类别换了，端点也跟着换（推荐课走 recommendedCourse）', async () => {
    const send = fakeSend(reply('1'));
    await fetchCategory({
      category: 'TJKC',
      studentCode: STUDENT,
      batchCode: BATCH_FROM_SAMPLE,
      origin: ORIGIN,
      send: send.fn,
    });
    assertEqual(
      send.calls[0]?.url,
      `${ORIGIN}${BASE_PATH}elective/recommendedCourse.do`,
      'TJKC 应对应 recommendedCourse.do',
    );
    assertEqual(querySetting(send.calls[0]?.body ?? '')['data'] !== null, true, '请求体应能解析');
  });

  it('分页与校区可以显式传入', async () => {
    const send = fakeSend(reply('1'));
    await fetchCategory({
      category: 'FANKC',
      studentCode: STUDENT,
      batchCode: BATCH_FROM_SAMPLE,
      campus: '02',
      pageSize: 50,
      pageNumber: 3,
      origin: ORIGIN,
      send: send.fn,
    });
    const setting = querySetting(send.calls[0]?.body ?? '');
    assertEqual(setting['pageSize'], '50', '显式每页条数应生效');
    assertEqual(setting['pageNumber'], '3', '显式页码应生效');
    assertEqual((setting['data'] as Record<string, unknown>)['campus'], '02', '显式校区应生效');
  });

  it('学到的批次码从响应里回交给调用方', async () => {
    const send = fakeSend(reply('1', { dataList: NO_ARRANGED.dataList, totalCount: 2 }));
    const r = await fetchCategory({
      category: 'FANKC',
      studentCode: STUDENT,
      batchCode: 'old-old-old',
      origin: ORIGIN,
      send: send.fn,
    });
    assertEqual(r.batchCode, BATCH_FROM_SAMPLE, '响应里的 electiveBatchCode 应被提取出来');
  });

  it('响应里没有批次码时给 null（不要瞎猜）', async () => {
    const send = fakeSend(JSON.stringify(PROGRAM));
    const r = await fetchCategory({
      category: 'FANKC',
      studentCode: STUDENT,
      batchCode: BATCH_FROM_SAMPLE,
      origin: ORIGIN,
      send: send.fn,
    });
    assertEqual(r.batchCode, null, 'programCourse 响应里没有 electiveBatchCode');
  });

  it('业务拒绝（code=2）时不算成功，也不解析列表', async () => {
    const send = fakeSend(reply('2', {}, '不在选课时间内'), 200);
    const r = await fetchCategory({
      category: 'FANKC',
      studentCode: STUDENT,
      batchCode: BATCH_FROM_SAMPLE,
      origin: ORIGIN,
      send: send.fn,
    });
    assertEqual(r.ok, false, '业务拒绝应判失败');
    assertEqual(r.kind, 'business', '应把 kind 透传给调用方');
    assertEqual(r.classes.length, 0, '失败时不该有教学班');
    assertEqual(r.msg, '不在选课时间内', '服务端的话要留给调用方');
  });

  it('登录失效（HTTP 403）时判未登录', async () => {
    const send = fakeSend('', 403);
    const r = await fetchCategory({
      category: 'FANKC',
      studentCode: STUDENT,
      batchCode: BATCH_FROM_SAMPLE,
      origin: ORIGIN,
      send: send.fn,
    });
    assertEqual(r.ok, false, '403 应判失败');
    assertEqual(r.kind, 'unauthenticated', '403 应判未登录');
  });

  it('未识别响应（不是 JSON）时不当作成功', async () => {
    const send = fakeSend('<html>502 Bad Gateway</html>', 502);
    const r = await fetchCategory({
      category: 'FANKC',
      studentCode: STUDENT,
      batchCode: BATCH_FROM_SAMPLE,
      origin: ORIGIN,
      send: send.fn,
    });
    assertEqual(r.ok, false, '看不懂就不能当成功');
    assertEqual(r.kind, 'unknown', '应判未识别（调用方会落档）');
  });

  it('缺 origin 时直接失败，且一个字都不发', async () => {
    const send = fakeSend(reply('1'));
    const r = await fetchCategory({
      category: 'FANKC',
      studentCode: STUDENT,
      batchCode: BATCH_FROM_SAMPLE,
      send: send.fn,
    });
    // Node 里没有 location ⇒ currentOrigin() 给空串
    assertEqual(typeof location, 'undefined', '前提：测试环境没有 location');
    assertEqual(send.calls.length, 0, '参数不全时不该发请求');
    assertEqual(r.ok, false, '应判失败');
    assertEqual(r.status, 0, 'status=0 表示根本没发请求');
    assertEqual(r.raw, null, '没发请求就没有原始结果');
    assertEqual(r.msg, '取不到 origin', '说清为什么没发');
  });

  it('缺学号时直接失败，不发请求', async () => {
    const send = fakeSend(reply('1'));
    const r = await fetchCategory({
      category: 'FANKC',
      studentCode: '',
      batchCode: BATCH_FROM_SAMPLE,
      origin: ORIGIN,
      send: send.fn,
    });
    assertEqual(send.calls.length, 0, '不该发请求');
    assertEqual(r.status, 0, 'status=0');
    assertEqual(r.msg, '缺少学号', '应指明缺什么');
  });

  it('缺批次码（null 与空串都算）时直接失败，不发请求', async () => {
    for (const batch of [null, '']) {
      const send = fakeSend(reply('1'));
      const r = await fetchCategory({
        category: 'FANKC',
        studentCode: STUDENT,
        batchCode: batch,
        origin: ORIGIN,
        send: send.fn,
      });
      assertEqual(send.calls.length, 0, `批次码=${JSON.stringify(batch)} 时不该发请求`);
      assertEqual(r.status, 0, 'status=0');
      assertEqual(r.msg, '缺少选课批次码', '应指明缺什么');
    }
  });

  it('token 只交给 send，不出现在返回值里', async () => {
    const send = fakeSend(reply('1'));
    const r = await fetchCategory({
      category: 'FANKC',
      studentCode: STUDENT,
      batchCode: BATCH_FROM_SAMPLE,
      token: 'SECRET-TOKEN',
      origin: ORIGIN,
      send: send.fn,
    });
    assertEqual(send.calls[0]?.token, 'SECRET-TOKEN', 'token 应原样交给发送出口');
    assert(
      !JSON.stringify({ ...r, raw: undefined }).includes('SECRET-TOKEN'),
      'token 不该出现在返回值里（红线 R3）',
    );
    assert(
      !JSON.stringify(r.classes).includes('SECRET-TOKEN'),
      'token 不该混进教学班数据',
    );
  });

  it('send 抛错时异常向上传播（不吞掉）', async () => {
    const boom: SendFn = async () => {
      throw new Error('queue closed');
    };
    let caught: unknown = null;
    try {
      await fetchCategory({
        category: 'FANKC',
        studentCode: STUDENT,
        batchCode: BATCH_FROM_SAMPLE,
        origin: ORIGIN,
        send: boom,
      });
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof Error, 'send 抛错时不该被吞成"失败结果"（否则调用方分不清网络炸了还是业务拒绝）');
  });
});

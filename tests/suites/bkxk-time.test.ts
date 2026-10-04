/**
 * 档 1：`src/sites/bkxk/time.ts` 的纯函数冒烟（批 2）。
 *
 * 前两组用例直接吃 `tests/fixtures/` 里的**真实响应样本**
 * （由 `node tools/make-bkxk-fixtures.mjs` 从旧仓库脱敏裁剪生成，
 * 见 `tests/fixtures/README.md`）——这是本套件的价值所在：
 * 不是「我编几个字符串，正则能过」，而是「站点真实吐出来的 49 条地点串、
 * 14 条周次位图，全都能解析且自洽」。
 *
 * 因为 tsconfig 没开 `resolveJsonModule`，fixture 用 `node:fs` 读。
 */

import { readFileSync } from 'node:fs';
import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  CN_WEEKDAY,
  DEFAULT_WEEK_BITMAP_LEN,
  WEEKDAY,
  bitmapMatchesWeekRange,
  bitmapWeekCount,
  bitmapWeeks,
  bitmapsOverlap,
  buildWeekBitmap,
  cn2num,
  findConflicts,
  maxBitmapLength,
  parsePlace,
  parseSegment,
  parseWeekRange,
  placesConflict,
  sectionsOverlap,
  segmentsConflict,
  weekText,
} from '../../src/sites/bkxk/time.ts';

// ------------------------------------------------------------- fixture

interface PlaceCorpus {
  readonly rawCount: number;
  readonly distinctCount: number;
  readonly places: readonly string[];
}

interface TimeRow {
  readonly dayOfWeek: string;
  readonly dayOfWeekName: string;
  readonly weekName: string;
  readonly week: string;
  readonly beginSection: string;
  readonly endSection: string;
  readonly teachingPlace: string;
}

interface TimeFixture {
  readonly totalCount: number;
  readonly dataList: readonly TimeRow[];
}

function load<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

const corpus = load<PlaceCorpus>('bkxk-teaching-place.json');
const timetable = load<TimeFixture>('bkxk-teachingTime.json');

/** 取数组某位并断言存在（`noUncheckedIndexedAccess` 之下拿不到就直接失败，不静默）。 */
function at<T>(list: readonly T[], i: number, what: string): T {
  const v = list[i];
  assert(v !== undefined, `${what}：下标 ${i} 不存在（长度 ${list.length}）`);
  return v;
}

describe('教学时间解析（批 2）', () => {
  it('真实语料：49 条 teachingPlace 每条都能解析出至少一段', () => {
    assertEqual(corpus.distinctCount, 49, 'fixture 里去重地点数应为 49');
    const bad: string[] = [];
    for (const text of corpus.places) {
      if (parsePlace(text).length === 0) bad.push(text);
    }
    assertDeepEqual(bad, [], '这些真实地点串一段都没解析出来');
  });

  it('真实语料：解析结果自洽（有星期、地点非空、周次与节次有序）', () => {
    const problems: string[] = [];
    for (const text of corpus.places) {
      for (const seg of parsePlace(text)) {
        if (seg.day === null) problems.push(`${text} → day 为 null`);
        if (seg.place === '') problems.push(`${text} → place 为空`);
        if (seg.weekFrom > seg.weekTo) problems.push(`${text} → 周次颠倒`);
        if (seg.sectionFrom > seg.sectionTo) problems.push(`${text} → 节次颠倒`);
      }
    }
    assertDeepEqual(problems, [], '真实语料的自洽性检查未通过');
  });

  it('真实语料：段数分布与语料一致（一段 36 条、两段 9 条、三段 4 条）', () => {
    const counts = new Map<number, number>();
    for (const text of corpus.places) {
      const n = parsePlace(text).length;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    assertEqual(counts.get(1), 36, '一段的地点串条数不符');
    assertEqual(counts.get(2), 9, '两段的地点串条数不符');
    assertEqual(counts.get(3), 4, '三段的地点串条数不符');
    assertEqual(counts.size, 3, '出现了意料之外的段数');
    let sum = 0;
    for (const n of counts.values()) sum += n;
    assertEqual(sum, corpus.distinctCount, '各档条数之和应等于去重地点数');
  });

  it('解析单段：无空格写法（站点真实风格）', () => {
    const seg = parseSegment('5-18周星期二3-5节汇文楼H1-201');
    assert(seg !== null, '应当解析成功');
    assertDeepEqual(seg, {
      weekFrom: 5,
      weekTo: 18,
      parity: null,
      day: 2,
      sectionFrom: 3,
      sectionTo: 5,
      place: '汇文楼H1-201',
      raw: '5-18周星期二3-5节汇文楼H1-201',
    });
  });

  it('解析单段：带空格写法（旧 HAR 风格）也要吃', () => {
    const seg = parseSegment('5-18周 星期二 1-2节 汇文楼H3-104');
    assert(seg !== null, '带空格的写法应当解析成功');
    assertEqual(seg.day, 2, '星期应解析为 2');
    assertEqual(seg.sectionFrom, 1, '起始节应为 1');
    assertEqual(seg.sectionTo, 2, '结束节应为 2');
    assertEqual(seg.place, '汇文楼H3-104', '地点不应带前导空格');
  });

  it('双位数节次不会被周次正则吃掉：13-14 节', () => {
    const seg = parseSegment('1-18周星期二13-14节汇文楼H2-403');
    assert(seg !== null, '应当解析成功');
    assertEqual(seg.weekFrom, 1, '起始周应为 1');
    assertEqual(seg.weekTo, 18, '结束周应为 18');
    assertEqual(seg.sectionFrom, 13, '起始节应为 13');
    assertEqual(seg.sectionTo, 14, '结束节应为 14');
    assertEqual(seg.place, '汇文楼H2-403', '地点应为汇文楼H2-403');
  });

  it('同起止节次（6-6节）解析为单节', () => {
    const seg = parseSegment('5-18周星期五6-6节致腾楼324');
    assert(seg !== null, '应当解析成功');
    assertEqual(seg.sectionFrom, 6, '起始节应为 6');
    assertEqual(seg.sectionTo, 6, '结束节应为 6');
  });

  it('单双周后缀：(单) / (双) / 全角括号都吃，写成单周则区间只剩奇数周', () => {
    const odd = parseSegment('7-11周(单)星期二11-12节致理楼L1-202');
    assert(odd !== null, '单周应当解析成功');
    assertEqual(odd.parity, '单', '应识别为单周');
    assertEqual(segmentsConflict(odd, { ...odd, parity: '双' }), false, '单双周不应冲突');
    const even = parseWeekRange('2-8周（双）');
    assert(even !== null, '全角括号也应当解析成功');
    assertEqual(even.parity, '双', '应识别为双周');
  });

  it('单周写法（3周）等于起止相同', () => {
    const r = parseWeekRange('3周');
    assert(r !== null, '应当解析成功');
    assertDeepEqual(r, { weekFrom: 3, weekTo: 3, parity: null });
  });

  it('只有周次、没有节次 → 返回 null（该用 parseWeekRange）', () => {
    assertEqual(parseSegment('5-18周'), null, '缺节次应返回 null');
    assert(parseWeekRange('5-18周') !== null, 'parseWeekRange 应当能解析');
  });

  it('异常输入一律给 null / 空数组，不抛异常、不猜', () => {
    assertEqual(parseSegment(null), null, 'null');
    assertEqual(parseSegment(undefined), null, 'undefined');
    assertEqual(parseSegment(''), null, '空串');
    assertEqual(parseSegment('   '), null, '空白');
    assertEqual(parseSegment('课程待定'), null, '非时间文本');
    assertEqual(parseSegment('9-3周星期二1-2节某楼'), null, '周次颠倒应当拒绝');
    assertDeepEqual(parsePlace(null), [], 'null 给空数组');
    assertDeepEqual(parsePlace(undefined), [], 'undefined 给空数组');
    assertDeepEqual(parsePlace(''), [], '空串给空数组');
  });

  it('没写星期也能解析，但 day 为 null', () => {
    const seg = parseSegment('5-18周3-5节某楼');
    assert(seg !== null, '应当解析成功');
    assertEqual(seg.day, null, 'day 应为 null');
  });

  it('中文数字与星期表', () => {
    assertEqual(cn2num('3'), 3, '阿拉伯数字原样返回');
    assertEqual(cn2num('十二'), 12, '十二');
    assertEqual(cn2num('十'), 10, '十');
    assertEqual(cn2num('七'), 7, '七');
    assertEqual(WEEKDAY['天'], 7, '天 = 7');
    assertEqual(WEEKDAY['日'], 7, '日 = 7');
    assertEqual(CN_WEEKDAY.length, 8, 'CN_WEEKDAY 长度应为 8（下标即星期）');
    assertEqual(CN_WEEKDAY[1], '星期一', '下标 1 是星期一');
    assertEqual(CN_WEEKDAY[7], '星期日', '下标 7 是星期日');
  });
});

describe('冲突判定（批 2）', () => {
  const mon35 = parsePlace('5-18周星期一3-5节汇德楼A508');
  const mon79 = parsePlace('5-18周星期一7-9节汇德楼A508');
  const tue35 = parsePlace('5-18周星期二3-5节汇文楼H1-201');

  it('同一天、节次重叠、周次有交集 → 冲突', () => {
    const a = at(mon35, 0, 'mon35');
    const b = parseSegment('5-18周星期一4-6节某楼');
    assert(b !== null, '样本应解析成功');
    assertEqual(segmentsConflict(a, b), true, '节次 3-5 与 4-6 重叠，应冲突');
    assertEqual(placesConflict('5-18周星期一3-5节汇德楼A508', '5-18周星期一1-2节汇德楼B101'), false, '节次不重叠不应冲突');
  });

  it('同一天但节次不重叠 → 不冲突', () => {
    assertEqual(segmentsConflict(at(mon35, 0, 'mon35'), at(mon79, 0, 'mon79')), false, '3-5 与 7-9 不重叠');
  });

  it('不同天 → 不冲突', () => {
    assertEqual(segmentsConflict(at(mon35, 0, 'mon35'), at(tue35, 0, 'tue35')), false, '周一与周二');
  });

  it('周次无交集 → 不冲突', () => {
    const a = parseSegment('1-4周星期一3-5节某楼');
    const b = parseSegment('5-18周星期一3-5节某楼');
    assert(a !== null && b !== null, '样本应解析成功');
    assertEqual(segmentsConflict(a, b), false, '1-4 与 5-18 不相邻且无交集');
  });

  it('单周 vs 每周：同一区间仍冲突（有共同周）', () => {
    const odd = parseSegment('7-11周(单)星期二11-12节致理楼L1-202');
    const all = parseSegment('5-18周星期二11-12节致理楼L1-202');
    assert(odd !== null && all !== null, '样本应解析成功');
    assertEqual(segmentsConflict(odd, all), true, '第 7 周两者都有课，应冲突');
  });

  it('两侧都是单周且区间一致 → 冲突；一单一双 → 不冲突', () => {
    const odd1 = parseSegment('7-11周(单)星期二11-12节A');
    const odd2 = parseSegment('7-11周(单)星期二11-12节B');
    const even = parseSegment('7-11周(双)星期二11-12节C');
    assert(odd1 !== null && odd2 !== null && even !== null, '样本应解析成功');
    assertEqual(segmentsConflict(odd1, odd2), true, '单周 vs 单周应冲突');
    assertEqual(segmentsConflict(odd1, even), false, '单周 vs 双周不应冲突');
  });

  it('任一侧不可解析（空串 / null / 无星期）→ 一律不冲突（宁可漏报不误报）', () => {
    assertEqual(placesConflict('', '5-18周星期一3-5节某楼'), false, '空串');
    assertEqual(placesConflict(null, '5-18周星期一3-5节某楼'), false, 'null');
    assertEqual(placesConflict(undefined, undefined), false, 'undefined');
    assertEqual(placesConflict('课程待定', '5-18周星期一3-5节某楼'), false, '不可解析文本');
    const noDay = parseSegment('5-18周3-5节某楼');
    assert(noDay !== null, '样本应解析成功');
    assertEqual(segmentsConflict(noDay, at(mon35, 0, 'mon35')), false, 'day 为 null 时不误报');
  });

  it('多段地点：任一段冲突即算冲突', () => {
    const three = '5-18周星期一3-4节汇文楼H1-205,5-18周星期三3-4节汇文楼H1-205,5-18周星期五7-8节汇文楼H1-205';
    assertEqual(placesConflict(three, '5-18周星期三3-4节汇文楼H1-205'), true, '第二段应命中');
    assertEqual(placesConflict(three, '5-18周星期三6-7节汇文楼H1-205'), false, '节次都不重叠');
    assertEqual(placesConflict(three, '5-18周星期四3-4节汇文楼H1-205'), false, '星期都不对');
  });

  it('sectionsOverlap 是闭区间判断', () => {
    const a = parseSegment('5-18周星期一3-5节某楼');
    const b = parseSegment('5-18周星期一5-6节某楼');
    const c = parseSegment('5-18周星期一6-7节某楼');
    assert(a !== null && b !== null && c !== null, '样本应解析成功');
    assertEqual(sectionsOverlap(a, b), true, '3-5 与 5-6 在 5 节相接，算重叠');
    assertEqual(sectionsOverlap(a, c), false, '3-5 与 6-7 不重叠');
  });

  it('findConflicts 只挑出冲突的课，且不改动入参', () => {
    const courses = [
      { name: 'A', teachingPlace: '5-18周星期一3-5节汇德楼A508' },
      { name: 'B', teachingPlace: '5-18周星期二3-5节汇文楼H1-201' },
      { name: 'C', teachingPlace: '5-18周星期一4-5节某楼' },
      { name: 'D', teachingPlace: '' },
      { name: 'E' },
    ];
    const snapshot = JSON.stringify(courses);
    const hit = findConflicts('5-18周星期一3-5节汇德楼A508', courses);
    assertDeepEqual(
      hit.map((c) => c.name),
      ['A', 'C'],
      '应命中 A（全同）与 C（节次重叠）',
    );
    assertEqual(JSON.stringify(courses), snapshot, 'findConflicts 不得改动入参');
  });
});

describe('周次位图（批 2）', () => {
  it('buildWeekBitmap：长度 18 的 5-18 周与站点样本逐字一致', () => {
    const row = at(timetable.dataList, 0, 'teachingTime[0]');
    assertEqual(row.week.length, 18, '该行位图长度应为 18');
    assertEqual(buildWeekBitmap(5, 18, null, row.week.length), row.week, '位图应与站点一致');
  });

  it('buildWeekBitmap：长度 20 的 5-18 周（尾巴补 0）与站点样本逐字一致', () => {
    const row = at(timetable.dataList, 4, 'teachingTime[4]');
    assertEqual(row.week.length, 20, '该行位图长度应为 20');
    assertEqual(row.week, '00001111111111111100', '该行位图应如样本');
    assertEqual(buildWeekBitmap(5, 18, null, 20), row.week, '位图应与站点一致');
  });

  it('buildWeekBitmap：单双周与站点样本逐字一致', () => {
    const row = at(timetable.dataList, 11, 'teachingTime[11]');
    assertEqual(row.weekName, '7-11周(单)', '该行应为单周样本');
    assertEqual(row.week.length, 11, '该行位图长度应为 11');
    assertEqual(buildWeekBitmap(7, 11, '单', 11), row.week, '位图应与站点一致');
  });

  it('真实 teachingTime 全部 14 条：站点位图与 weekName 互相印证', () => {
    assertEqual(timetable.totalCount, 14, 'fixture 应有 14 条');
    assertEqual(timetable.dataList.length, 14, 'dataList 长度应为 14');
    const bad: string[] = [];
    for (const row of timetable.dataList) {
      if (!bitmapMatchesWeekRange(row.week, row.weekName)) {
        bad.push(`${row.weekName} / 长度 ${row.week.length} / ${row.week}`);
      }
    }
    assertDeepEqual(bad, [], '这些行的位图与 weekName 对不上');
  });

  it('真实 teachingTime：位图长度只有 11 / 18 / 20 三种，最长 20', () => {
    const lens = [...new Set(timetable.dataList.map((r) => r.week.length))].sort((a, b) => a - b);
    assertDeepEqual(lens, [11, 18, 20], '实测位图长度集合');
    assertEqual(maxBitmapLength(timetable.dataList.map((r) => r.week)), 20, '最长应为 20');
    assertEqual(maxBitmapLength([]), 0, '空数组给 0');
  });

  it('bitmapWeeks / bitmapWeekCount', () => {
    assertDeepEqual(bitmapWeeks('000011111111111111'), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18], '5-18 周');
    assertDeepEqual(bitmapWeeks('00000010101'), [7, 9, 11], '单周 7-11');
    assertDeepEqual(bitmapWeeks(''), [], '空位图');
    assertDeepEqual(bitmapWeeks('000'), [], '全 0');
    assertEqual(bitmapWeekCount('000011111111111111'), 14, '5-18 共 14 周');
    assertEqual(bitmapWeekCount('00000010101'), 3, '单周共 3 周');
  });

  it('bitmapsOverlap：长度不等按短的比，长位图多出的尾巴不参与', () => {
    assertEqual(bitmapsOverlap('000011111111111111', '00001111111111111100'), true, '同区间应重叠');
    assertEqual(bitmapsOverlap('101010101010101010', '010101010101010101'), false, '互补不重叠');
    // 短位图只有 15 位（第 15 周有课），长位图第 18 周才有课 —— 尾巴上的 1 不算命中
    assertEqual(bitmapsOverlap('000000000000001', '000000000000000001'), false, '只在长位图尾巴上的 1 不算');
    assertEqual(bitmapsOverlap('0000000000000010', '00001111111111111100'), true, '短位图第 14 周有课，长位图也覆盖第 14 周');
    assertEqual(bitmapsOverlap('', '111'), false, '空位图不重叠');
  });

  it('buildWeekBitmap：非法长度回落到默认 18', () => {
    assertEqual(buildWeekBitmap(5, 18, null, 0).length, DEFAULT_WEEK_BITMAP_LEN, '0 回落默认');
    assertEqual(buildWeekBitmap(5, 18, null, Number.NaN).length, DEFAULT_WEEK_BITMAP_LEN, 'NaN 回落默认');
    assertEqual(buildWeekBitmap(5, 18, null).length, DEFAULT_WEEK_BITMAP_LEN, '缺省即默认');
    assertEqual(buildWeekBitmap(20, 25, null, 18), '000000000000000000', '区间超出长度时全 0');
  });

  it('weekText 三种形态', () => {
    assertEqual(weekText({ weekFrom: 5, weekTo: 18, parity: null }), '5-18周', '区间');
    assertEqual(weekText({ weekFrom: 7, weekTo: 11, parity: '单' }), '7-11周(单)', '单周');
    assertEqual(weekText({ weekFrom: 3, weekTo: 3, parity: null }), '3周', '单周次');
  });

  it('bitmapMatchesWeekRange：解析不出周次时返回 false（不误判为一致）', () => {
    assertEqual(bitmapMatchesWeekRange('000011111111111111', '待定'), false, '无法解析');
    assertEqual(bitmapMatchesWeekRange('000011111111111111', null), false, 'null');
    assertEqual(bitmapMatchesWeekRange('000011111111111111', '5-18周'), true, '正常情形');
    assertEqual(bitmapMatchesWeekRange('000011111111111110', '5-18周'), false, '最后一格不符应报 false');
  });
});

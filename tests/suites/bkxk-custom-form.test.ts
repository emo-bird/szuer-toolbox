/**
 * 纯函数冒烟（档1）：【自定义课程】结构化表单的逻辑层。
 *
 * 这一套守的是三件事：
 *   1. **校验文案**：所有用户可见的报错都产生在这里，界面只负责显示 ——
 *      文案漂了用户就看不懂该改哪个框；
 *   2. **生成与解析互为逆运算**：表单拼出来的 `place` 必须能被 `time.ts` 的
 *      `parsePlace` 解回同样的五字段（周次 / 单双周 / 星期 / 节次 / 地点），
 *      否则用户存的课要么不参与冲突、要么算错冲突。**这一条用 49 条真实地点语料验。**
 *   3. **默认值与边界**：`emptySegment()` 必须是副本（多个输入框不能共享一个对象）。
 *
 * ⚠️ 涉及真实样本的期望值（`49` 条地点、`66` 段）都是**先跑一次数出来**的，
 * 不是凭印象写的 —— 见开发文档「踩坑留档」。
 */

import { readFileSync } from 'node:fs';
import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  DEFAULT_SEGMENT,
  DRAFT_LIMITS,
  draftFromSegment,
  draftsFromText,
  emptySegment,
  intOf,
  placeFromDraft,
  segmentFromDraft,
  validateDraft,
  validateSegment,
} from '../../src/sites/bkxk/custom-form.ts';
import type { SegmentDraft } from '../../src/sites/bkxk/custom-form.ts';
import { parsePlace, parseSegment } from '../../src/sites/bkxk/time.ts';
import type { TimeSegment } from '../../src/sites/bkxk/time.ts';

/** 带地点的合法草稿（默认值 = 第 1-18 周、每周、星期一、1-2 节） */
function draft(patch: Partial<SegmentDraft> = {}): SegmentDraft {
  return { ...DEFAULT_SEGMENT, place: '致理楼L1-707', ...patch };
}

/** 判「同一段课」时只比这五件事，`raw` 文本的写法可以不同 */
function fieldsOf(seg: TimeSegment): readonly (number | string | null)[] {
  return [seg.weekFrom, seg.weekTo, seg.parity, seg.day, seg.sectionFrom, seg.sectionTo, seg.place];
}

describe('bkxk/custom-form —— intOf', () => {
  it('正经整数（含带空格的）转得出来', () => {
    assertEqual(intOf('3'), 3);
    assertEqual(intOf(' 4 '), 4);
    assertEqual(intOf('0'), 0);
    assertEqual(intOf('-1'), -1);
    assertEqual(intOf('18'), 18);
  });

  it('不是纯整数的统统给 null（不 Number() 猜）', () => {
    assertEqual(intOf(''), null);
    assertEqual(intOf('   '), null);
    assertEqual(intOf('3.5'), null);
    assertEqual(intOf('abc'), null);
    assertEqual(intOf('1e3'), null);
    assertEqual(intOf('+3'), null);
    assertEqual(intOf('１２３'), null, '全角数字不接受');
    assertEqual(intOf('3周'), null);
  });

  it('超出安全整数范围给 null（免得算出个假数）', () => {
    assertEqual(intOf('99999999999999999999'), null);
  });
});

describe('bkxk/custom-form —— 校验（文案就是界面报错）', () => {
  it('默认草稿是合法的', () => {
    assertEqual(validateSegment(draft()), null);
    assertEqual(validateDraft('线性代数', [draft()]), null);
  });

  it('周次：空 / 小数 / 越界都报同一句', () => {
    const msg = `周次要填 ${String(DRAFT_LIMITS.WEEK_MIN)}-${String(DRAFT_LIMITS.WEEK_MAX)} 之间的整数`;
    assertEqual(validateSegment(draft({ weekFrom: '' })), msg);
    assertEqual(validateSegment(draft({ weekFrom: '3.5' })), msg);
    assertEqual(validateSegment(draft({ weekFrom: '0' })), msg);
    assertEqual(validateSegment(draft({ weekFrom: '53' })), msg);
    assertEqual(validateSegment(draft({ weekTo: '99' })), msg);
    assertEqual(validateSegment(draft({ weekTo: 'abc' })), msg);
  });

  it('周次起止颠倒单独报一句（不是笼统的「填得不对」）', () => {
    assertEqual(validateSegment(draft({ weekFrom: '18', weekTo: '5' })), '周次起止颠倒：起始周不能大于结束周');
  });

  it('节次：空 / 小数 / 越界都报同一句，颠倒单独一句', () => {
    const msg = `节次要填 ${String(DRAFT_LIMITS.SECTION_MIN)}-${String(DRAFT_LIMITS.SECTION_MAX)} 之间的整数`;
    assertEqual(validateSegment(draft({ sectionFrom: '' })), msg);
    assertEqual(validateSegment(draft({ sectionTo: '21' })), msg);
    assertEqual(validateSegment(draft({ sectionFrom: 'abc' })), msg);
    assertEqual(validateSegment(draft({ sectionFrom: '5', sectionTo: '3' })), '节次起止颠倒：起始节不能大于结束节');
  });

  it('星期：只能 1~7', () => {
    assertEqual(validateSegment(draft({ day: '' })), '请选择星期几');
    assertEqual(validateSegment(draft({ day: '0' })), '请选择星期几');
    assertEqual(validateSegment(draft({ day: '8' })), '请选择星期几');
    assertEqual(validateSegment(draft({ day: '七' })), '请选择星期几');
    assertEqual(validateSegment(draft({ day: '7' })), null);
  });

  it('地点必填，全是空白也不算填了', () => {
    assertEqual(validateSegment(draft({ place: '' })), '请填地点（例如 致理楼L1-707）');
    assertEqual(validateSegment(draft({ place: '   ' })), '请填地点（例如 致理楼L1-707）');
  });

  it('整张表单：课名 → 段数 → 段内容，先报前面的', () => {
    assertEqual(validateDraft('', [draft()]), '请填课程名');
    assertEqual(validateDraft('   ', [draft()]), '请填课程名');
    assertEqual(validateDraft('线性代数', []), '至少填一段上课时间');
  });

  it('段数上限：只想拦住误触「再加一段」', () => {
    const tooMany: SegmentDraft[] = [];
    for (let i = 0; i <= DRAFT_LIMITS.MAX_SEGMENTS; i += 1) tooMany.push(draft());
    assertEqual(validateDraft('课', tooMany), `最多 ${String(DRAFT_LIMITS.MAX_SEGMENTS)} 段`);
    assertEqual(validateDraft('课', tooMany.slice(0, DRAFT_LIMITS.MAX_SEGMENTS)), null);
  });

  it('多段时错误带「第 N 段：」前缀，单段时不带', () => {
    assertEqual(validateDraft('课', [draft({ place: '' })]), '请填地点（例如 致理楼L1-707）');
    assertEqual(validateDraft('课', [draft(), draft({ place: '' })]), '第 2 段：请填地点（例如 致理楼L1-707）');
    assertEqual(validateDraft('课', [draft({ day: '' }), draft()]), '第 1 段：请选择星期几');
  });

  it('取值范围常量与站点实际课时口径一致（周 1-52、节 1-20、最多 8 段）', () => {
    assertEqual(DRAFT_LIMITS.WEEK_MIN, 1);
    assertEqual(DRAFT_LIMITS.WEEK_MAX, 52);
    assertEqual(DRAFT_LIMITS.SECTION_MIN, 1);
    assertEqual(DRAFT_LIMITS.SECTION_MAX, 20);
    assertEqual(DRAFT_LIMITS.MAX_SEGMENTS, 8);
  });
});

describe('bkxk/custom-form —— 生成 place 文本', () => {
  it('一段：周次 星期 节次 地点，单空格连接', () => {
    const seg = segmentFromDraft(draft());
    assert(seg !== null, '合法草稿应生成成功');
    assertEqual(seg.weekFrom, 1);
    assertEqual(seg.weekTo, 18);
    assertEqual(seg.parity, null);
    assertEqual(seg.day, 1);
    assertEqual(seg.sectionFrom, 1);
    assertEqual(seg.sectionTo, 2);
    assertEqual(seg.place, '致理楼L1-707');
    assertEqual(seg.raw, '1-18周 星期一 1-2节 致理楼L1-707');
  });

  it('单双周写成站点认的 (单) / (双)', () => {
    const odd = segmentFromDraft(draft({ parity: '单' }));
    const even = segmentFromDraft(draft({ parity: '双' }));
    assert(odd !== null && even !== null, '都该生成成功');
    assertEqual(odd.parity, '单');
    assertEqual(odd.raw, '1-18周(单) 星期一 1-2节 致理楼L1-707');
    assertEqual(even.raw, '1-18周(双) 星期一 1-2节 致理楼L1-707');
  });

  it('起止相同时不写「-」：3周 / 9节', () => {
    const seg = segmentFromDraft(draft({ weekFrom: '3', weekTo: '3', sectionFrom: '9', sectionTo: '9' }));
    assert(seg !== null, '应生成成功');
    assertEqual(seg.raw, '3周 星期一 9节 致理楼L1-707');
  });

  it('地点与教师的空格不写进 place；地点前后空白被丢掉', () => {
    const seg = segmentFromDraft(draft({ place: '  致理楼L1-707  ' }));
    assert(seg !== null, '应生成成功');
    assertEqual(seg.place, '致理楼L1-707');
    assertEqual(seg.raw, '1-18周 星期一 1-2节 致理楼L1-707');
  });

  it('不合法的草稿一律给 null，不硬凑一个看着合法的段', () => {
    assertEqual(segmentFromDraft(draft({ day: '' })), null);
    assertEqual(segmentFromDraft(draft({ place: '' })), null);
    assertEqual(segmentFromDraft(draft({ weekFrom: '30', weekTo: '10' })), null);
  });

  it('多段用逗号连接（与 parsePlace 的切分口径一致）', () => {
    const place = placeFromDraft([draft(), draft({ day: '3', sectionFrom: '5', sectionTo: '6' })]);
    assertEqual(place, '1-18周 星期一 1-2节 致理楼L1-707,1-18周 星期三 5-6节 致理楼L1-707');
    assert(place !== null, '应生成成功');
    assertEqual(parsePlace(place).length, 2);
  });

  it('任一段不合法 → 整串给 null（界面应先 validateDraft 再调它）', () => {
    assertEqual(placeFromDraft([draft(), draft({ place: '' })]), null);
    assertEqual(placeFromDraft([]), '', '空表单给空串（界面另有「至少一段」的校验拦着）');
  });
});

describe('bkxk/custom-form —— 与 time.ts 往返一致（真实语料）', () => {
  interface PlaceFixture {
    readonly note: string;
    readonly rawCount: number;
    readonly distinctCount: number;
    readonly places: readonly string[];
  }
  const fixture = JSON.parse(
    readFileSync(new URL('../fixtures/bkxk-teaching-place.json', import.meta.url), 'utf8'),
  ) as PlaceFixture;

  it('语料本身的前提：49 条去重地点（与 fixture 自述一致）', () => {
    assertEqual(fixture.places.length, 49);
    assertEqual(fixture.places.length, fixture.distinctCount);
    const unique = new Set(fixture.places);
    assertEqual(unique.size, 49, '语料里不该有重复');
  });

  it('49 条真实地点全部能被解析，合计 66 段', () => {
    let segTotal = 0;
    const bad: string[] = [];
    for (const p of fixture.places) {
      const segs = parsePlace(p);
      segTotal += segs.length;
      if (segs.length === 0) bad.push(p);
    }
    assertDeepEqual(bad, [], '有地点解析不出（期望值来自实测，改解析规则要重数）');
    assertEqual(segTotal, 66);
  });

  it('每条真实地点：place → 表单 → place 之后解析出来的仍是同样几段课', () => {
    for (const place of fixture.places) {
      const drafts = draftsFromText(place);
      assert(drafts.length > 0, `解析不出：${place}`);
      const back = placeFromDraft(drafts);
      assert(back !== null, `回填后再生成失败：${place}`);
      const before = parsePlace(place);
      const after = parsePlace(back);
      assertEqual(after.length, before.length, `段数变了：${place} → ${back}`);
      assertDeepEqual(after.map(fieldsOf), before.map(fieldsOf), `五字段变了：${place} → ${back}`);
    }
  });

  it('解析不出的文本给空数组（界面据此提示「请重填」），不抛异常也不猜', () => {
    assertDeepEqual(draftsFromText('胡说八道'), []);
    assertDeepEqual(draftsFromText(''), []);
    assertDeepEqual(draftsFromText('   '), []);
    assertDeepEqual(draftsFromText(null), []);
    assertDeepEqual(draftsFromText(undefined), []);
  });

  it('缺星期几的历史段能回填成「未选」而不是崩掉（day 空着，校验会拦）', () => {
    const seg = parseSegment('1-8周 3-4节 A');
    assert(seg !== null, '这条语料本身应该能解析');
    assertEqual(seg.day, null);
    const d = draftFromSegment(seg);
    assertEqual(d.day, '');
    assertEqual(d.parity, '');
    assertEqual(validateSegment(d), '请选择星期几');
  });

  it('真语料回填成草稿后，weekFrom / sectionFrom 的字符串形态能直接喂进输入框', () => {
    const first = fixture.places[0];
    assert(first !== undefined, '语料非空');
    const d = draftsFromText(first)[0];
    assert(d !== undefined, '应能回填出草稿');
    assert(/^\d+$/.test(d.weekFrom), `周次应是纯数字串：${d.weekFrom}`);
    assert(/^\d+$/.test(d.sectionFrom), `节次应是纯数字串：${d.sectionFrom}`);
    assert(['', '单', '双'].includes(d.parity), `单双周取值异常：${d.parity}`);
    assert(/^[1-7]$/.test(d.day), `星期应是 1~7：${d.day}`);
  });
});

describe('bkxk/custom-form —— 默认值与副本', () => {
  it('emptySegment() 的值就是 DEFAULT_SEGMENT，但必须是副本', () => {
    assertDeepEqual(emptySegment(), DEFAULT_SEGMENT);
    assert(emptySegment() !== DEFAULT_SEGMENT, '必须返回新对象，否则多个输入框共享一个草稿');
  });

  it('改一份草稿不会污染默认值', () => {
    const a = emptySegment();
    Object.assign(a, { weekFrom: '5', place: '改过的' });
    assertEqual(DEFAULT_SEGMENT.weekFrom, '1', '默认值对象被改了');
    assertEqual(DEFAULT_SEGMENT.place, '');
    assertEqual(emptySegment().weekFrom, '1');
  });

  it('默认草稿是「第 1-18 周、每周、星期一、1-2 节、地点空着」', () => {
    assertEqual(DEFAULT_SEGMENT.weekFrom, '1');
    assertEqual(DEFAULT_SEGMENT.weekTo, '18');
    assertEqual(DEFAULT_SEGMENT.parity, '');
    assertEqual(DEFAULT_SEGMENT.day, '1');
    assertEqual(DEFAULT_SEGMENT.sectionFrom, '1');
    assertEqual(DEFAULT_SEGMENT.sectionTo, '2');
    assertEqual(DEFAULT_SEGMENT.place, '');
  });
});

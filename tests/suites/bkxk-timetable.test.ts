/**
 * `bkxk/timetable-model.ts` 的档 1 冒烟：纯几何、列解析、读站点卡片、派单表。
 *
 * 只测纯函数 —— `timetable.ts` 碰 `document`，测不了（本项目档 1 的既定边界）。
 * 站点 DOM 契约由手测确认（见 `docs/手测清单-自绘课表.md`）。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import type { CustomCourse } from '../../src/common/custom/courses.ts';
import { withSegments } from '../../src/sites/bkxk/custom.ts';
import type { BkxkCustomCourse } from '../../src/sites/bkxk/custom.ts';
import { parsePlace } from '../../src/sites/bkxk/time.ts';
import {
  DAY_COLUMN_NAMES,
  DEFAULT_SLOT_H,
  DEFAULT_TOP0,
  SITE_CARD_CLASS,
  SITE_CARD_SELECTOR,
  SITE_LESSON_CLASS,
  SITE_LESSON_SELECTOR,
  TT_CARD_CLASS,
  TT_CONFLICT_TIP,
  TT_LINES_CLASS,
  TT_TAG_TEXT,
  classTokens,
  conflictsWithCards,
  dayColumnName,
  findDayColumnIndex,
  hasClassToken,
  needsRescan,
  pickSlotH,
  planInjection,
  readExistingCards,
  renderedCourseNames,
  segLabel,
  shouldRefetchSite,
  slotHeight,
  slotTop,
} from '../../src/sites/bkxk/timetable-model.ts';
import type { ExistingCard, RawCard } from '../../src/sites/bkxk/timetable-model.ts';

// ------------------------------------------------------------ 素材

function raw(className: string | null, parts: readonly string[]): RawCard {
  return { className, parts };
}

/** 站点卡片的典型形状（课名 / 时间、地点 / 教师） */
function siteCard(name: string, time: string, place = '', teacher = ''): RawCard {
  const parts = [name, place === '' ? time : `${time} ${place}`];
  if (teacher !== '') parts.push(teacher);
  return raw(`${SITE_CARD_CLASS} cv-top-line`, parts);
}

function card(courseName: string, timeText: string): ExistingCard {
  return { courseName, timeText };
}

function course(id: string, name: string, place: string, enabled = true): CustomCourse {
  return { id, name, teacher: '', place, color: '#e8f2fd', enabled };
}

/** 建一门带 `segs` 的自定义课程（`segs` 由 `place` 真实解析，不手写） */
function custom(id: string, name: string, place: string, enabled = true): BkxkCustomCourse {
  const list = withSegments([course(id, name, place, enabled)]);
  const first = list[0];
  assert(first !== undefined, 'fixture 课程必须能解析出一个对象');
  return first;
}

// ------------------------------------------------------------ 类名

describe('bkxk/timetable · 类名判定', () => {
  it('classTokens：空白切分，空串 / null / undefined 得空数组', () => {
    assertDeepEqual(classTokens('a b  c'), ['a', 'b', 'c'], '多类名与多余空白');
    assertDeepEqual(classTokens('   '), [], '全空白');
    assertDeepEqual(classTokens(''), [], '空串');
    assertDeepEqual(classTokens(null), [], 'null');
    assertDeepEqual(classTokens(undefined), [], 'undefined');
  });

  it('hasClassToken 按整词判：前缀相同但不是一个类名时不算命中', () => {
    assert(hasClassToken('cv-lesson cv-top-line', SITE_LESSON_CLASS), '整词命中');
    assert(!hasClassToken(TT_CARD_CLASS, SITE_CARD_CLASS), `${TT_CARD_CLASS} 不是 ${SITE_CARD_CLASS}`);
    assert(!hasClassToken('cv-lesson-extra', SITE_LESSON_CLASS), '前缀命中不算（旧仓库用 indexOf 会误判）');
    assert(!hasClassToken('sztb-bkxk-tt-card-extra', TT_CARD_CLASS), '我们的类名同样整词判');
    assert(!hasClassToken(null, TT_CARD_CLASS), 'null 不崩');
  });

  it('选择器与类名同源（改一处即两边都改）', () => {
    assertEqual(SITE_LESSON_SELECTOR, `.${SITE_LESSON_CLASS}`, '课节选择器');
    assertEqual(SITE_CARD_SELECTOR, `.${SITE_CARD_CLASS}`, '卡片选择器');
    assert(TT_CARD_CLASS.startsWith('sztb-bkxk-'), '我们的类名带项目前缀');
    assert(!hasClassToken(SITE_CARD_CLASS, TT_CARD_CLASS), '站点类名里没有我们的标记');
  });
});

// ------------------------------------------------------------ 几何

describe('bkxk/timetable · 几何', () => {
  it('pickSlotH：取第一个能用的值', () => {
    assertEqual(pickSlotH(['54px']), 54, '行内 style 的带单位值');
    assertEqual(pickSlotH([54]), 54, '直接给数字');
    assertEqual(pickSlotH([null, '', '60px']), 60, '跳过后面的值');
    assertEqual(pickSlotH([]), DEFAULT_SLOT_H, '空数组用默认');
  });

  it('pickSlotH：非正值 / 非数字 / 非有限一律视为量不到', () => {
    assertEqual(pickSlotH(['0px']), DEFAULT_SLOT_H, '0');
    assertEqual(pickSlotH([-5]), DEFAULT_SLOT_H, '负数');
    assertEqual(pickSlotH(['abc']), DEFAULT_SLOT_H, '非数字');
    assertEqual(pickSlotH([Number.NaN]), DEFAULT_SLOT_H, 'NaN');
    assertEqual(pickSlotH([Number.POSITIVE_INFINITY]), DEFAULT_SLOT_H, 'Infinity');
    assertEqual(pickSlotH([undefined, null]), DEFAULT_SLOT_H, '全是空值');
  });

  it('slotTop：第 1 节落在表头下面，逐节等差', () => {
    assertEqual(slotTop(1), DEFAULT_TOP0, '第 1 节');
    assertEqual(slotTop(2), DEFAULT_TOP0 + DEFAULT_SLOT_H, '第 2 节');
    assertEqual(slotTop(14), DEFAULT_TOP0 + 13 * DEFAULT_SLOT_H, '第 14 节');
    assertEqual(slotTop(3, 60, 30), 30 + 2 * 60, '自定义单节高度与表头高度');
  });

  it('slotHeight：连堂按节数乘，额外 +1 与旧仓库一致', () => {
    assertEqual(slotHeight(1, 2), 2 * DEFAULT_SLOT_H + 1, '两节');
    assertEqual(slotHeight(3, 5), 3 * DEFAULT_SLOT_H + 1, '三节连堂');
    assertEqual(slotHeight(4, 4), DEFAULT_SLOT_H + 1, '单节也要 +1');
    assertEqual(slotHeight(1, 1, 100), 101, '自定义单节高度');
  });

  it('dayColumnName：1..7 对应周一到周七，越界给空串', () => {
    for (let d = 1; d <= 7; d += 1) {
      assertEqual(dayColumnName(d), DAY_COLUMN_NAMES[d - 1], `第 ${String(d)} 天`);
    }
    assertEqual(dayColumnName(0), '', '0');
    assertEqual(dayColumnName(8), '', '8');
    assertEqual(dayColumnName(null), '', 'null');
    assertEqual(dayColumnName(1.5), '', '小数');
  });

  it('findDayColumnIndex：先按列头文本认，列头全对得上时下标就是 day-1', () => {
    for (let d = 1; d <= 7; d += 1) {
      assertEqual(findDayColumnIndex(DAY_COLUMN_NAMES, d), d - 1, `标准列头第 ${String(d)} 天`);
    }
  });

  it('findDayColumnIndex：列头乱序 / 有多余文本时仍按文本认', () => {
    const heads = ['周三课表', '周一课表', '周五课表'];
    assertEqual(findDayColumnIndex(heads, 1), 1, '周一在第二列');
    assertEqual(findDayColumnIndex(heads, 3), 0, '周三在第一列');
    assertEqual(findDayColumnIndex(heads, 5), 2, '周五在第三列');
  });

  it('findDayColumnIndex：列头认不出时按第 day 列兜底，都不行给 -1', () => {
    const odd = ['第一列', '第二列', '第三列'];
    assertEqual(findDayColumnIndex(odd, 2), 1, '兜底第 2 列');
    assertEqual(findDayColumnIndex(odd, 4), -1, '只有 3 列，第 4 天无处可放');
    assertEqual(findDayColumnIndex([], 1), -1, '没有列');
    assertEqual(findDayColumnIndex(DAY_COLUMN_NAMES, 9), -1, '第 9 天');
    assertEqual(findDayColumnIndex(DAY_COLUMN_NAMES, null), -1, '不知道星期几');
  });
});

// ------------------------------------------------------------ 读站点卡片

describe('bkxk/timetable · 读站点已选课程', () => {
  it('课名取第一个非空文本，时间取第一个长得像周次的文本', () => {
    const cards = readExistingCards([
      siteCard('高等数学', '5-18周 星期二 3-4节', '汇德楼A508', '张三'),
    ]);
    assertEqual(cards.length, 1, '应读出一门');
    const first = cards[0];
    assert(first !== undefined, '读出一门');
    assertEqual(first.courseName, '高等数学', '课名');
    assertEqual(first.timeText, '5-18周 星期二 3-4节 汇德楼A508', '时间整串（含地点）');
  });

  it('跳过我们自己注入的卡片（整词判标记类）', () => {
    const mine = raw(`${SITE_CARD_CLASS} ${TT_CARD_CLASS}`, ['我加的课', '5-18周3-5节']);
    const cards = readExistingCards([mine, siteCard('高等数学', '5-18周 星期二 3-4节')]);
    assertEqual(cards.length, 1, '只留站点自己的那门');
    const first = cards[0];
    assert(first !== undefined, '读出一门');
    assertEqual(first.courseName, '高等数学', '留下的应是站点那门');
  });

  it('读不到时间的卡片直接丢（判冲突必须有时间）', () => {
    const cards = readExistingCards([
      raw(SITE_CARD_CLASS, ['某门课', '周三 3-4节 汇德楼A508']),
      raw(SITE_CARD_CLASS, ['', '']),
      siteCard('线性代数', '1-8周 星期一 1-2节'),
    ]);
    assertEqual(cards.length, 1, '只留有时间的那门');
    const first = cards[0];
    assert(first !== undefined, '读出一门');
    assertEqual(first.courseName, '线性代数', '留下的应是线性代数');
  });

  it('className 为 null / 空串时不崩，也不会被误当成我们的卡片', () => {
    const cards = readExistingCards([raw(null, ['体育', '3-16周 星期四 5-6节']), raw('', ['英语', '1-16周 星期五 1-2节'])]);
    assertEqual(cards.length, 2, '两门都读出来');
  });

  it('空清单 → 空数组', () => {
    assertDeepEqual(readExistingCards([]), [], '没有卡片');
  });
});

// ------------------------------------------------------------ 冲突

describe('bkxk/timetable · 与已选课程判冲突', () => {
  it('时间重叠则冲突，不重叠则不冲突', () => {
    const cards = [card('高等数学', '5-18周 星期二 3-4节 汇德楼A508')];
    assert(conflictsWithCards('5-18周星期二3-4节汇德楼A509', cards), '同天同节次同周 → 冲突');
    assert(!conflictsWithCards('5-18周星期三3-4节汇德楼A509', cards), '换一天 → 不冲突');
    assert(!conflictsWithCards('5-18周星期二5-6节汇德楼A509', cards), '换节次 → 不冲突');
    assert(!conflictsWithCards('1-4周星期二3-4节汇德楼A509', cards), '周次不重叠 → 不冲突');
  });

  it('没有已选课程、或地点解析不出来 → 不冲突', () => {
    assert(!conflictsWithCards('5-18周星期二3-4节汇德楼A509', []), '课表空的');
    assert(!conflictsWithCards('', [card('高等数学', '5-18周 星期二 3-4节')]), '地点空串');
    assert(!conflictsWithCards('未安排', [card('高等数学', '5-18周 星期二 3-4节')]), '地点解析不出');
  });
});

// ------------------------------------------------------------ 派单

describe('bkxk/timetable · 派单表', () => {
  it('segLabel 是卡片第二行的文案（不带星期，位置由列表达）', () => {
    const segs = parsePlace('5-18周星期一3-5节自定义教室');
    const first = segs[0];
    assert(first !== undefined, '解析出一段');
    assertEqual(segLabel(first), '5-18周3-5节', '文案');
  });

  it('一门课一段 → 一条派单，几何算好', () => {
    const plans = planInjection([custom('c1', '我的课', '5-18周星期一3-5节自定义教室')], []);
    assertEqual(plans.length, 1, '一条');
    const p = plans[0];
    assert(p !== undefined, '一条');
    assertEqual(p.courseId, 'c1', '课程 id');
    assertEqual(p.segIndex, 0, '节次下标');
    assertEqual(p.top, DEFAULT_TOP0 + 2 * DEFAULT_SLOT_H, '起始第 3 节');
    assertEqual(p.height, 3 * DEFAULT_SLOT_H + 1, '连堂 3-5 节');
    assertEqual(p.conflict, false, '没有已选课程 → 不冲突');
    assertEqual(p.seg.day, 1, '星期一');
  });

  it('一门课多段 → 每段一条派单，几何各自算', () => {
    const plans = planInjection(
      [custom('c1', '我的课', '1-8周星期一1-2节 A, 9-16周星期三3-4节 B')],
      [],
    );
    assertEqual(plans.length, 2, '两段');
    assertDeepEqual(plans.map((p) => p.segIndex), [0, 1], '下标按解析顺序');
    assertDeepEqual(plans.map((p) => p.seg.day), [1, 3], '星期一与星期三');
    assertDeepEqual(
      plans.map((p) => p.top),
      [DEFAULT_TOP0, DEFAULT_TOP0 + 2 * DEFAULT_SLOT_H],
      'top 各自算',
    );
  });

  it('day === null 的节次跳过（不知道星期几，不猜）', () => {
    const plans = planInjection([custom('c1', '我的课', '1-8周 3-4节 A')], []);
    assertEqual(plans.length, 0, '一段都不派');
  });

  it('关掉的课程不派单（即便调用方没滤）', () => {
    const plans = planInjection([custom('c1', '我的课', '5-18周星期一3-5节 A', false)], []);
    assertEqual(plans.length, 0, 'enabled=false');
  });

  it('冲突是整门课一个布尔：一处冲突则所有节次都标冲突', () => {
    const cards = [card('高等数学', '5-18周 星期三 3-4节 汇德楼A508')];
    const plans = planInjection([custom('c1', '我的课', '1-8周星期一1-2节 A, 9-16周星期三3-4节 B')], cards);
    assertEqual(plans.length, 2, '两段');
    assertDeepEqual(
      plans.map((p) => p.conflict),
      [true, true],
      '星期三那一段撞上了，星期一那一段跟着标',
    );
  });

  it('几何参数可传：单节高度与表头高度都由调用方给', () => {
    const plans = planInjection([custom('c1', '我的课', '5-18周星期一3-5节 A')], [], { slotH: 60, top0: 30 });
    const p = plans[0];
    assert(p !== undefined, '一条');
    assertEqual(p.top, 30 + 2 * 60, 'top');
    assertEqual(p.height, 3 * 60 + 1, 'height');
  });

  it('多门课按入参顺序派单，派单里带着课程对象', () => {
    const a = custom('c1', '甲课', '1-8周星期一1-2节 A');
    const b = custom('c2', '乙课', '1-8周星期二3-4节 B');
    const plans = planInjection([a, b], []);
    assertDeepEqual(plans.map((p) => p.courseId), ['c1', 'c2'], '顺序');
    assert(plans[0]?.course === a, '派单里是同一门课对象');
  });

  it('空课程清单 → 空派单表', () => {
    assertDeepEqual(planInjection([], []), [], '没有课程');
  });

  it('不改动入参（课程与节次都只读）', () => {
    const one = custom('c1', '我的课', '5-18周星期一3-5节 A');
    const before = JSON.stringify(one);
    planInjection([one], [card('高等数学', '5-18周 星期一 3-5节')]);
    assertEqual(JSON.stringify(one), before, '课程对象一个字段都不许被改');
  });

  it('注入文案常量与卡片结构对齐', () => {
    assertEqual(TT_TAG_TEXT, '自定义', '标签文案');
    assertEqual(TT_CONFLICT_TIP, '与已选课程冲突', '冲突提示文案');
  });
});

// ------------------------------------------------------------ 重绘判据（v0.26）

describe('bkxk/timetable —— 站点重绘后要不要重画（v0.26）', () => {
  it('我们的节点还在 → 不重画（否则就是自触发死循环）', () => {
    assertEqual(needsRescan(6, 1), false, '节点还在说明那次变动是我们自己造成的');
  });

  it('节点被站点抹掉了、且还有启用的自定义课程 → 重画', () => {
    assertEqual(needsRescan(0, 1), true, '站点重绘后要补回来');
  });

  it('没有启用的自定义课程 → 永不重画（开了开关也不会自己动）', () => {
    assertEqual(needsRescan(0, 0), false, '无课程时不必清也不必画');
    assertEqual(needsRescan(6, 0), false, '课程被全部停用/删除后，交给 refreshTimetable 清理');
  });

  it('课名字层类名带了项目前缀（只作用于我们自己的节点）', () => {
    assert(TT_LINES_CLASS.startsWith('sztb-bkxk-'), '我们的类名带前缀');
    assert(!hasClassToken(SITE_CARD_CLASS, TT_LINES_CLASS), '与站点类名不撞');
  });
});

// ------------------------------------------------------------ 晚到补偿与去重（v0.27）

describe('bkxk/timetable —— 晚到补偿：什么时候该请站点重新请求一次（v0.27）', () => {
  /** 满足全部五条前提的那一次判定 */
  const ready = {
    hijackOn: true,
    didRewrite: false,
    alreadyTried: false,
    enabledCourses: 1,
    siteCards: 14,
  };

  it('五条前提都满足 → 触发（站点画完了、我们没赶上、开关开着、有课、没试过）', () => {
    assertEqual(shouldRefetchSite(ready), true, '这正是普通刷新下会中的那种情况');
  });

  it('接管开关关着 → 不触发（再请它请求一次也不会被改写）', () => {
    assertEqual(shouldRefetchSite({ ...ready, hijackOn: false }), false);
  });

  it('我们改写过课表响应 → 不触发（站点画出来的那份已经含我们的课）', () => {
    assertEqual(shouldRefetchSite({ ...ready, didRewrite: true }), false);
  });

  it('补偿试过了 → 不触发（否则与站点你来我往地互相重绘）', () => {
    assertEqual(shouldRefetchSite({ ...ready, alreadyTried: true }), false);
  });

  it('没有启用的自定义课程 → 不触发（无事可做）', () => {
    assertEqual(shouldRefetchSite({ ...ready, enabledCourses: 0 }), false);
  });

  it('表里还没有站点画的卡片 → 先不触发（请求很可能还在飞，我们并不晚）', () => {
    assertEqual(shouldRefetchSite({ ...ready, siteCards: 0 }), false);
  });
});

describe('bkxk/timetable —— 站点已画过就不自绘（v0.27 去重）', () => {
  const mine = custom('c1', '我的课', '1-18周 星期一 1-2节 致理楼L1-707');

  it('renderedCourseNames：取站点卡片里的课名，去空白、丢掉空名', () => {
    const names = renderedCourseNames([card('  我的课 ', '1-18周'), card('', '3-4周'), card('  ', 'x')]);
    assertDeepEqual([...names], ['我的课'], '只留下非空的课名');
  });

  it('接管成功时站点会自己画出我们的课 → 自绘跳过它，不出现两份卡片', () => {
    const cards = [card('我的课', '1-18周 星期一 1-2节')];
    const plans = planInjection([mine], cards);
    assertEqual(plans.length, 0, '站点画过就不该再自绘一份');
  });

  it('站点没画过我们的课（接管失败）→ 照常自绘', () => {
    const plans = planInjection([mine], [card('线性代数', '5-18周 星期二 9-10节')]);
    assertEqual(plans.length, 1, '这时全靠自绘兜底');
  });

  it('只跳过站点画过的那门，别的课照画', () => {
    const other = custom('c2', '另一门', '1-18周 星期三 3-4节 汇文楼H1-202');
    const plans = planInjection([mine, other], [card('我的课', '1-18周 星期一 1-2节')]);
    assertEqual(plans.length, 1);
    assertEqual(plans[0]?.courseId, 'c2', '剩下的是没有被站点画过的那门');
  });
});

/**
 * 纯函数冒烟（档1）：选课列表注入的解析与入队规则。
 *
 * 为什么不测 `list.ts` 本身：它整个是 DOM 操作（`document` 在 node 里不存在），
 * 要测就得引 jsdom —— 本项目零依赖，不引。所以：
 *   · 这里测**所有能从 DOM 抽出来的判定**（tcId 解析、类别映射、按钮文案、地点解析）；
 *   · `list.ts` 的注入效果由用户手测（档3，见 docs/手测清单-*）。
 *
 * 最值得钉的是这两条：
 *   1. **教学班 id 的形态闸门**。站点给的元素上 `tcid` 到处都有（退选按钮、选择按钮、
 *      课程图标），而课程号（`5201890010`，10 位）长得也像数字 —— 一旦放宽成
 *      「只要数字就用」，抢课请求就会拿课程号去下错单。
 *   2. **类别只能从容器 id 推**。采样实测多个页签的列表同时留在 DOM 里，
 *      按激活页签推类别会把隐藏列表里的教学班标错 `teachingClassType`。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  BODY_CATEGORY,
  addMonitor,
  addTask,
  categoryOfBodyId,
  cleanText,
  grabButtonLabel,
  hasMonitor,
  hasTask,
  idLineText,
  isTcId,
  monitorButtonLabel,
  pickTcId,
  placeFromTimeText,
  readMonitorStore,
  readTaskStore,
  removeMonitor,
  tcIdFromCardId,
  teacherFromTitle,
  toggleMonitor,
} from '../../src/sites/bkxk/list-model.ts';

/** 采样里出现过的真教学班 id（21 位） */
const REAL_TC = '202620271520189001039';
const REAL_TC2 = '202620271520189001035';
/** 采样里出现过的课程号（10 位）—— 绝不能当成教学班 id */
const COURSE_NO = '5201890010';

describe('bkxk 列表注入 —— 教学班 id 识别', () => {
  it('接受实数长度的教学班 id', () => {
    assert(isTcId(REAL_TC), '采样里的真 id 必须通过');
    assert(isTcId('123456789012345'), '15 位（下限）通过');
    assert(isTcId('123456789012345678901234'), '24 位（上限）通过');
  });

  it('拒绝课程号、14 位、带空格、非数字', () => {
    assert(!isTcId(COURSE_NO), '课程号只有 10 位，必须拒绝 —— 否则会拿课程号去下单');
    assert(!isTcId('12345678901234'), '14 位低于下限');
    assert(!isTcId('1234567890123456789012345'), '25 位高于上限');
    assert(!isTcId(` ${REAL_TC}`), '带前导空格必须拒绝');
    assert(!isTcId(`${REAL_TC}_courseDiv`), '带后缀必须拒绝（那是卡片 id，不是 id 本身）');
    assert(!isTcId('20262027152018900abcd'), '非数字必须拒绝');
    assert(!isTcId(''), '空串必须拒绝');
    assert(!isTcId(null), 'null 必须拒绝');
    assert(!isTcId(undefined), 'undefined 必须拒绝');
    assert(!isTcId(202620271520189001039), '数字类型也要拒绝：站点给的是字符串');
  });

  it('从卡片 id 里剥出教学班 id', () => {
    assertEqual(tcIdFromCardId(`${REAL_TC}_courseDiv`), REAL_TC, '采样里的真卡片 id');
    assertEqual(tcIdFromCardId(`  ${REAL_TC2}_courseDiv  `), REAL_TC2, '首尾空白要容忍');
    assertEqual(tcIdFromCardId(REAL_TC), null, '没有 _courseDiv 后缀不算卡片 id');
    assertEqual(tcIdFromCardId(`${COURSE_NO}_courseDiv`), null, '课程号拼出来的也要拒绝');
    assertEqual(tcIdFromCardId(null), null);
    assertEqual(tcIdFromCardId(''), null);
  });

  it('按候选顺序取第一个合法 id', () => {
    assertEqual(
      pickTcId(['', COURSE_NO, REAL_TC, REAL_TC2]),
      REAL_TC,
      '跳过空串与课程号，取第一个合法值',
    );
    assertEqual(pickTcId([]), null, '空候选返回 null');
    assertEqual(pickTcId([COURSE_NO, '', null]), null, '一个合法值都没有时返回 null');
  });
});

describe('bkxk 列表注入 —— 文本清理', () => {
  it('折叠空白并去掉前导装饰', () => {
    assertEqual(cleanText('  · 5-18周\n  星期二\t1-2节  '), '5-18周 星期二 1-2节');
    assertEqual(cleanText('课容量:已满/58 不可选'), '课容量:已满/58 不可选');
    assertEqual(cleanText(''), '');
    assertEqual(cleanText(null), '');
    assertEqual(cleanText(undefined), '');
  });

  it('教师名去掉站点内部的方括号编号', () => {
    assertEqual(teacherFromTitle('[39]教师N'), '教师N', '采样里的真 title');
    assertEqual(teacherFromTitle('  [35]邓建英  '), '邓建英');
    assertEqual(teacherFromTitle('教师A'), '教师A', '列表页本来就是纯姓名');
    assertEqual(teacherFromTitle('[39]'), '', '只剩编号时返回空串');
    assertEqual(teacherFromTitle(null), '');
  });
});

describe('bkxk 列表注入 —— 类别映射', () => {
  it('容器 id 一一映射到站点类别码', () => {
    assertEqual(categoryOfBodyId('programBody'), 'FANKC');
    assertEqual(categoryOfBodyId('publicBody'), 'XGXK');
    assertEqual(categoryOfBodyId('moocBody'), 'MOOC');
    assertEqual(categoryOfBodyId('schoolBody'), 'XGXK', '全校课程沿用旧仓库的处理：按校公选');
  });

  it('未知容器一律空串，不许猜', () => {
    assertEqual(categoryOfBodyId('someNewBody'), '', '站点新增容器时宁可空着，让批 4 报警告');
    assertEqual(categoryOfBodyId(''), '');
    assertEqual(categoryOfBodyId(null), '');
    assertEqual(categoryOfBodyId(undefined), '');
  });

  it('映射里没有空值', () => {
    for (const [key, value] of Object.entries(BODY_CATEGORY)) {
      const code: string | undefined = value;
      assert(code !== undefined && code !== '', `${key} 映射到了空值 —— 类别映射表里不许有洞`);
    }
  });
});

describe('bkxk 列表注入 —— 按钮与 id 行文案', () => {
  it('按钮文案反映状态', () => {
    assertEqual(grabButtonLabel(false), '添加抢课');
    assertEqual(grabButtonLabel(true), '已加抢课');
    assertEqual(monitorButtonLabel(false), '添加监控');
    assertEqual(monitorButtonLabel(true), '移除监控', '监控是开关，文案要说明再点会取消');
  });

  it('教学班 id 原样显示，不做任何格式化', () => {
    assertEqual(idLineText(REAL_TC), `教学班ID ${REAL_TC}`);
    assert(!idLineText(REAL_TC).includes(','), '不能加千位分隔符 —— 用户要拿去核对 / 上报');
    assert(!idLineText(REAL_TC).replace('教学班ID ', '').includes(' '), 'id 内部不能有空格');
  });
});

describe('bkxk 列表注入 —— 上课地点解析', () => {
  it('从卡片的时间地点原文里取地点', () => {
    assertEqual(
      placeFromTimeText('5-18周 星期二 1-2节 汇文楼H3-104,5-18周 星期四 3-4节 汇文楼H3-201'),
      '汇文楼H3-104',
      '取第一段的最后一个词',
    );
    assertEqual(placeFromTimeText('5-18周 星期二 1-2节'), '', '这段没写地点，不许把「1-2节」当地点');
    assertEqual(placeFromTimeText('5-18周 星期二 3-4节'), '');
    assertEqual(placeFromTimeText(''), '');
    assertEqual(placeFromTimeText(null), '');
  });
});

describe('bkxk 列表注入 —— 抢课队列', () => {
  const base = {
    tcId: REAL_TC,
    courseName: '大学英语（1）',
    teacherName: '教师N',
    category: 'FANKC',
    teachingPlace: '汇文楼H3-104',
    now: 1700000000000,
    retryMode: 'smart',
  };

  it('首次加入：补齐旧仓库 tasks.js 的全部落盘字段', () => {
    const { store, added } = addTask({ seq: 0, items: [] }, base);
    assert(added, '首次加入应当 added=true');
    assertEqual(store.seq, 1);
    assertEqual(store.items.length, 1);
    assertDeepEqual(store.items[0], {
      id: 't1',
      seq: 1,
      teachingClassID: REAL_TC,
      courseName: '大学英语（1）',
      teacherName: '教师N',
      category: 'FANKC',
      priority: 0,
      enabled: true,
      status: 'pending',
      retryMode: 'smart',
      attempts: 0,
      lastMsg: '',
      lastKind: '',
      addedAt: 1700000000000,
    }, '字段名必须与旧仓库一致，否则用户已排队的任务读不出来');
  });

  it('重复加入：原样返回，不覆盖用户调过的字段', () => {
    const first = addTask({ seq: 0, items: [] }, base);
    const tweaked = {
      ...first.store,
      items: [{ ...first.store.items[0]!, retryMode: 'never', priority: 9, enabled: false }],
    };
    const second = addTask(tweaked, { ...base, retryMode: 'always' });
    assert(!second.added, '重复加入应当 added=false');
    assertEqual(second.store, tweaked, 'store 必须原引用返回，一个字段都不许动');
    assertEqual(second.store.items[0]!.retryMode, 'never', '用户改过的重试策略不能被冲掉');
  });

  it('hasTask / hasMonitor 按教学班 id 判', () => {
    const { store } = addTask({ seq: 0, items: [] }, base);
    assert(hasTask(store, REAL_TC), '已加入的教学班应当命中');
    assert(!hasTask(store, REAL_TC2), '别的教学班不该命中');
    assert(!hasTask(store, COURSE_NO), '课程号不是教学班 id，不该命中');
  });

  it('课程名与教师名入队前会被清洗', () => {
    const { store } = addTask({ seq: 0, items: [] }, {
      ...base,
      courseName: '  大学英语 （1）\n',
      teacherName: ' [39]教师N ',
    });
    assertEqual(store.items[0]!.courseName, '大学英语 （1）');
    assertEqual(store.items[0]!.teacherName, '[39]教师N', '清空白但不动内容（教师名由调用方剥前缀）');
  });
});

describe('bkxk 列表注入 —— 监控列表与开关语义', () => {
  const base = {
    tcId: REAL_TC,
    courseName: '大学英语（1）',
    teacherName: '教师N',
    category: 'FANKC',
    teachingPlace: '汇文楼H3-104',
    now: 1700000000000,
  };

  it('加入监控：remain / checkedAt 先留 null（本轮不查容量）', () => {
    const { store, added } = addMonitor({ items: [], hitCount: 0 }, base);
    assert(added, '首次加入监控应当 added=true');
    assertDeepEqual(store.items[0], {
      teachingClassID: REAL_TC,
      courseName: '大学英语（1）',
      teacherName: '教师N',
      teachingPlace: '汇文楼H3-104',
      category: 'FANKC',
      remain: null,
      checkedAt: null,
      hits: 0,
      lastMsg: '',
    }, '字段名必须与旧仓库 monitor.js 一致');
    assertEqual(store.hitCount, 0, '加入监控不该动 hitCount');
  });

  it('「添加监控」是开关：点两次回到原样', () => {
    const s0 = { items: [], hitCount: 0 };
    const s1 = toggleMonitor(s0, base);
    assert(s1.on, '第一次应当是「已监控」');
    assertEqual(s1.store.items.length, 1);
    const s2 = toggleMonitor(s1.store, base);
    assert(!s2.on, '第二次应当取消监控');
    assertEqual(s2.store.items.length, 0);
    assertDeepEqual(s2.store, s0);
  });

  it('移除不存在的项：removed=false 且 store 原样返回', () => {
    const s0 = { items: [], hitCount: 3 };
    const res = removeMonitor(s0, REAL_TC);
    assert(!res.removed, '列表里没有这一项，应当 removed=false');
    assertEqual(res.store, s0);
    assertEqual(res.store.hitCount, 3, '移除不该动 hitCount');
  });

  it('移除只按教学班 id 命中，不动别的项', () => {
    const a = addMonitor({ items: [], hitCount: 0 }, base).store;
    const b = addMonitor(a, { ...base, tcId: REAL_TC2 }).store;
    const res = removeMonitor(b, REAL_TC);
    assert(res.removed, '这一项在列表里，应当 removed=true');
    assertEqual(res.store.items.length, 1);
    assertEqual(res.store.items[0]!.teachingClassID, REAL_TC2);
    assert(hasMonitor(res.store, REAL_TC2), '另一个教学班要留着');
  });
});

describe('bkxk 列表注入 —— 读旧数据（迁移兼容）', () => {
  it('旧仓库 tasks 形状读出来一个字段都不丢', () => {
    const legacy = {
      seq: 7,
      items: [
        {
          id: 't7',
          seq: 7,
          teachingClassID: REAL_TC,
          courseName: '体育（1）',
          teacherName: '李老师',
          category: 'TYKC',
          priority: 5,
          enabled: false,
          status: 'failed',
          retryMode: 'never',
          attempts: 3,
          lastMsg: '人数已满',
          lastKind: 'full',
          addedAt: 1699999999999,
        },
      ],
    };
    const store = readTaskStore(legacy);
    assertEqual(store.seq, 7);
    assertDeepEqual(store.items[0], legacy.items[0], '旧数据必须原样保留，包括 enabled/priority/lastKind');
  });

  it('旧仓库 monitor 形状读出来保留 hitCount 与容量快照', () => {
    const legacy = {
      items: [
        {
          teachingClassID: REAL_TC2,
          courseName: '艺术陶冶与审美体验',
          teacherName: '教师A',
          teachingPlace: '汇文楼H1-101',
          category: 'XGXK',
          remain: 12,
          checkedAt: 1699999999999,
          hits: 2,
          lastMsg: '有容量',
        },
      ],
      hitCount: 4,
    };
    const store = readMonitorStore(legacy);
    assertEqual(store.hitCount, 4);
    assertDeepEqual(store.items[0], legacy.items[0]);
  });

  it('垃圾值一律退回空 store，不抛错', () => {
    for (const junk of [null, undefined, 0, '', 'x', [], {}, { items: 'nope' }, { items: [null, 1] }]) {
      assertDeepEqual(readTaskStore(junk), { seq: 0, items: [] }, `tasks 垃圾值 ${JSON.stringify(junk)}`);
      assertDeepEqual(readMonitorStore(junk), { items: [], hitCount: 0 }, `monitor 垃圾值 ${JSON.stringify(junk)}`);
    }
  });

  it('缺 teachingClassID 的条目被丢掉（它没法执行）', () => {
    const store = readTaskStore({
      seq: 3,
      items: [{ id: 't1', courseName: '没有 id 的课' }, { id: 't2', teachingClassID: REAL_TC }],
    });
    assertEqual(store.items.length, 1);
    assertEqual(store.items[0]!.id, 't2');
  });

  it('seq 缺失时用条目数兜底，且不小于已有 id 序号', () => {
    const store = readTaskStore({
      items: [{ id: 't1', teachingClassID: REAL_TC }, { id: 't2', teachingClassID: REAL_TC2 }],
    });
    assertEqual(store.seq, 2, 'seq 丢了也要能继续加，不然 id 会重号');
  });
});

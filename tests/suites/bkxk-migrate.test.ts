/**
 * 纯函数冒烟（档1）：bkxk 旧数据迁移规划。
 *
 * 这一套守的是三条**安全约定**，不是功能覆盖：
 *   1. 迁移**绝不**替用户打开 🟠 / 🔴 开关（用户拍板方案 A）
 *   2. 迁移是「清洗」不是「照搬」——认不出的形状要丢弃并报告，不能带进新结构
 *   3. 安全配置项（间隔 / 批次码 / 监控类别…）要正常搬过来
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  BKXK_SITE_CUSTOM_KEY,
  BKXK_STORE_KEY,
  CARRY_FLAG_KEY,
  LEGACY_SETTINGS_KEY,
  LEGACY_STORE_PREFIX,
  planCustomCarry,
  planMigration,
} from '../../src/sites/bkxk/legacy.ts';
import type { LegacySnapshot } from '../../src/sites/bkxk/legacy.ts';
import { CUSTOM_COURSES_KEY } from '../../src/common/custom/courses.ts';

function snapshot(patch: Partial<LegacySnapshot> = {}): LegacySnapshot {
  return { settings: null, customCourses: null, monitor: null, tasks: null, ...patch };
}

function settingsOf(obj: Record<string, unknown>): LegacySnapshot {
  return snapshot({ settings: JSON.stringify(obj) });
}

function entryKeys(plan: ReturnType<typeof planMigration>): string[] {
  return plan.entries.map((e) => e.key);
}

describe('bkxk/legacy —— 旧键名常量', () => {
  it('旧设置键不带 store 前缀（这是两个不同的键空间）', () => {
    assertEqual(LEGACY_SETTINGS_KEY, 'szubkxk.settings.v2');
    assertEqual(LEGACY_STORE_PREFIX, 'szubkxk.v2.');
  });

  it('监控 / 任务键集中在 BKXK_STORE_KEY 里，自定义课程改用跨站点通用键', () => {
    assertEqual(BKXK_STORE_KEY.MONITOR, 'bkxk:monitor');
    assertEqual(BKXK_STORE_KEY.TASKS, 'bkxk:tasks');
    assertEqual(CUSTOM_COURSES_KEY, 'custom:courses');
    assertEqual(BKXK_SITE_CUSTOM_KEY, 'bkxk:customCourses', '批 1 的误落点，只给搬运逻辑读');
    assertEqual(CARRY_FLAG_KEY, 'migrate:bkxk:custom-to-common');
  });
});

describe('bkxk/legacy —— 危险开关绝不自动打开（方案 A）', () => {
  it('旧版 writeApiEnabled=true 时**不产生任何开关条目**', () => {
    const plan = planMigration(settingsOf({ writeApiEnabled: true, intervalMs: 600 }), false);
    assert(
      !entryKeys(plan).some((k) => k.startsWith('toggle:')),
      `迁移不得写任何开关，实际写了：${entryKeys(plan).join(',')}`,
    );
  });

  it('但必须提示用户手动去勾', () => {
    const plan = planMigration(settingsOf({ writeApiEnabled: true }), false);
    assert(
      plan.notices.some((n) => n.includes('写接口')),
      `应有写接口的提示，实际：${JSON.stringify(plan.notices)}`,
    );
  });

  it('两个 hijack 开关同样只提示、不写入', () => {
    const plan = planMigration(settingsOf({ hijackTimetable: true, hijackListConflict: true }), false);
    assertEqual(entryKeys(plan).filter((k) => k.startsWith('toggle:')).length, 0);
    assertEqual(plan.notices.filter((n) => n.includes('课表注入') || n.includes('列表冲突')).length, 2);
  });

  it('旧值为 false 时不产生噪音提示', () => {
    const plan = planMigration(settingsOf({ writeApiEnabled: false, hijackTimetable: false }), false);
    assertEqual(plan.notices.filter((n) => n.includes('旧版曾开启')).length, 0);
  });
});

describe('bkxk/legacy —— 安全配置项正常迁移', () => {
  it('三个时间参数与三个文本项都迁过来', () => {
    const plan = planMigration(
      settingsOf({
        intervalMs: 800,
        retryIntervalMs: 2000,
        pollIntervalMs: 1200,
        batchCode: 'B999',
        monitorMode: 'class',
        monitorCategory: 'XGXK',
        retryMode: 'always',
      }),
      false,
    );
    const keys = entryKeys(plan);
    for (const k of [
      'value:bkxk:intervalMs',
      'value:bkxk:retryIntervalMs',
      'value:bkxk:pollIntervalMs',
      'value:bkxk:batchCode',
      'value:bkxk:monitorMode',
      'value:bkxk:monitorCategory',
      'value:bkxk:retryMode',
    ]) {
      assert(keys.includes(k), `应迁移 ${k}，实际：${keys.join(',')}`);
    }
  });

  it('数字项被转成字符串（配置项统一以字符串存储）', () => {
    const plan = planMigration(settingsOf({ intervalMs: 800 }), false);
    const e = plan.entries.find((x) => x.key === 'value:bkxk:intervalMs');
    assert(e !== undefined, '应写入自定义课程条目');
    assertEqual(e!.value, '800');
  });

  it('空串的文本项不写入（免得用空值覆盖新默认值）', () => {
    const plan = planMigration(settingsOf({ batchCode: '' }), false);
    assert(!entryKeys(plan).includes('value:bkxk:batchCode'), '空串不该写入');
  });

  it('非正数的数字项被拒绝并列进 notices', () => {
    const plan = planMigration(settingsOf({ intervalMs: 0, retryIntervalMs: -5 }), false);
    assert(!entryKeys(plan).includes('value:bkxk:intervalMs'), '0 不是有效正数，不该写入');
    assert(plan.notices.filter((n) => n.includes('不是有效正数')).length === 2, JSON.stringify(plan.notices));
  });

  it('未识别的新设置项被忽略（旧版可能有我们不认识的键）', () => {
    const plan = planMigration(settingsOf({ 未来功能: 123, themeColor: 'red' }), false);
    assertEqual(entryKeys(plan).filter((k) => !k.startsWith('value:')).length, 0);
  });

  it('设置字符串坏掉时报 notic 且不崩', () => {
    const plan = planMigration(snapshot({ settings: '{坏 JSON' }), false);
    assert(plan.notices.some((n) => n.includes('无法解析')), JSON.stringify(plan.notices));
  });
});

describe('bkxk/legacy —— 数据块清洗', () => {
  const goodCourse = { id: 'c1', name: '高等数学', teacher: '张老师', place: '1-16周 星期一 1-2节', color: '#fff', enabled: true };

  it('自定义课程只保留已知字段（丢掉派生数据 segs）', () => {
    const withSegs = { ...goodCourse, segs: [{ day: 1 }], 额外字段: 'x' };
    const plan = planMigration(snapshot({ customCourses: JSON.stringify([withSegs]) }), false);
    const e = plan.entries.find((x) => x.key === CUSTOM_COURSES_KEY);
    assert(e !== undefined, '应写入自定义课程');
    assertDeepEqual(e!.value, [goodCourse]);
  });

  it('缺 name 或 id 的条目被丢弃并报告数量', () => {
    const plan = planMigration(
      snapshot({
        customCourses: JSON.stringify([goodCourse, { id: 'c2' }, { name: '没有 id' }, null, 'x']),
      }),
      false,
    );
    const e = plan.entries.find((x) => x.key === CUSTOM_COURSES_KEY);
    assertEqual((e!.value as unknown[]).length, 1);
    assert(plan.notices.some((n) => n.includes('已丢弃')), JSON.stringify(plan.notices));
  });

  it('enabled 缺省视为 true（与旧版一致）', () => {
    const plan = planMigration(
      snapshot({ customCourses: JSON.stringify([{ id: 'c1', name: 'A' }]) }),
      false,
    );
    const e = plan.entries.find((x) => x.key === CUSTOM_COURSES_KEY);
    assertEqual((e!.value as Array<{ enabled: boolean }>)[0]?.enabled, true);
  });

  it('自定义课程不是数组时跳过并报告', () => {
    const plan = planMigration(snapshot({ customCourses: JSON.stringify({ a: 1 }) }), false);
    assert(!entryKeys(plan).includes(CUSTOM_COURSES_KEY), '非数组不该写入');
    assert(plan.notices.some((n) => n.includes('不是数组')), '应报告「不是数组」');
  });

  it('空数组仍会写入（表示「用户确实没有自定义课程」）', () => {
    const plan = planMigration(snapshot({ customCourses: '[]' }), false);
    const e = plan.entries.find((x) => x.key === CUSTOM_COURSES_KEY);
    assert(e !== undefined, '空数组也应写入');
    assertDeepEqual(e!.value, []);
  });

  it('监控 / 任务进度是对象时原样搬过来', () => {
    const plan = planMigration(
      snapshot({ monitor: JSON.stringify({ hitCount: 3 }), tasks: JSON.stringify({ seq: 7 }) }),
      false,
    );
    assertDeepEqual(
      plan.entries.find((x) => x.key === BKXK_STORE_KEY.MONITOR)?.value,
      { hitCount: 3 },
    );
    assertDeepEqual(plan.entries.find((x) => x.key === BKXK_STORE_KEY.TASKS)?.value, { seq: 7 });
  });

  it('监控 / 任务进度不是对象时跳过并报告', () => {
    const plan = planMigration(snapshot({ monitor: JSON.stringify([1, 2]) }), false);
    assert(!entryKeys(plan).includes(BKXK_STORE_KEY.MONITOR), '非对象不该写入');
    assert(plan.notices.some((n) => n.includes('不是对象')), '应报告「不是对象」');
  });
});

describe('bkxk/legacy —— 自定义课程搬运（站点键 → 通用键）', () => {
  const course = (id: string, name: string): Record<string, unknown> => ({
    id,
    name,
    teacher: '张老师',
    place: '1-16周 星期一 1-2节 致理楼L1-707',
    color: '#fff',
    enabled: true,
  });

  it('通用键为空时把站点键里的课程搬过去', () => {
    const plan = planCustomCarry([course('c1', 'A'), course('c2', 'B')], []);
    assertEqual(plan.empty, false);
    assertEqual(plan.entries.length, 1);
    assertEqual(plan.entries[0]?.key, CUSTOM_COURSES_KEY);
    assertDeepEqual(plan.entries[0]?.value, [course('c1', 'A'), course('c2', 'B')]);
    assert(plan.report.some((l) => l.includes('自定义课程 2 门')), JSON.stringify(plan.report));
  });

  it('站点键里没有东西时什么都不做（且没有 notice）', () => {
    for (const v of [null, undefined, [], {}, 'x', 7]) {
      const plan = planCustomCarry(v, []);
      assertEqual(plan.empty, true, `siteValue=${String(v)}`);
      assertEqual(plan.entries.length, 0, `siteValue=${String(v)}`);
      assertEqual(plan.notices.length, 0, `siteValue=${String(v)}`);
    }
  });

  it('通用键里已有课程时**不覆盖**，只出一条提醒', () => {
    const plan = planCustomCarry([course('c1', '旧的')], [course('c9', '新的')]);
    assertEqual(plan.empty, true);
    assertEqual(plan.entries.length, 0);
    assert(
      plan.notices.some((n) => n.includes('未搬运')),
      `应说明未搬运，实际：${JSON.stringify(plan.notices)}`,
    );
  });

  it('缺 name / id 的条目丢弃并报告数量', () => {
    const plan = planCustomCarry([course('c1', 'A'), { id: 'c2' }, { name: '无 id' }, null], []);
    assertDeepEqual(plan.entries[0]?.value, [course('c1', 'A')]);
    assert(
      plan.notices.some((n) => n.includes('3 条')),
      `应报告丢弃 3 条，实际：${JSON.stringify(plan.notices)}`,
    );
  });

  it('搬运是清洗不是照抄：派生字段 segs 不落盘', () => {
    const withSegs = { ...course('c1', 'A'), segs: [{ day: 1 }], 额外: 1 };
    const plan = planCustomCarry([withSegs], []);
    assertDeepEqual(plan.entries[0]?.value, [course('c1', 'A')]);
  });
});

describe('bkxk/legacy —— 空与重复', () => {
  it('已迁移过就什么都不做', () => {
    const plan = planMigration(settingsOf({ intervalMs: 800 }), true);
    assertEqual(plan.entries.length, 0);
    assertEqual(plan.empty, true);
  });

  it('完全没有旧数据时 entries 为空、empty 为 true', () => {
    const plan = planMigration(snapshot(), false);
    assertEqual(plan.entries.length, 0);
    assertEqual(plan.empty, true);
    assertEqual(plan.notices.length, 0, '没旧数据不是「问题」，不该有 notice');
  });

  it('有内容时 empty 为 false', () => {
    assertEqual(planMigration(settingsOf({ batchCode: 'B1' }), false).empty, false);
  });
});

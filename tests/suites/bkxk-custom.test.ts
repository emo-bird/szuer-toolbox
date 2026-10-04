/**
 * 纯函数冒烟（档1）：bkxk 侧对自定义课程的**派生视图**。
 *
 * 这一套守的是三件事：
 *   1. `withSegments` 只做一件事：把 `place` 原文用本站的 `time.ts` 解析成时段，
 *      解析不出就空数组 —— **课程仍在**，只是不参与冲突与注入；
 *   2. **总开关闸门**：设置里的「自定义课程」关掉时 `readEnabledCustomCourses()`
 *      必须返回空数组（用户拍板 A：关掉就是整条功能停用）。这里是 `hijack` 与
 *      `timetable` 唯一的数据入口，闸门放这一处才不会出现
 *      「开关关了但课表上还有卡片」的半死状态；
 *   3. `countSelfConflicts` 只数**自定义课程之间**的冲突对（两两组合），
 *      关掉的课不算、解析不出的课不算、单门课永远 0。
 *
 * ⚠️ 开关**不在** `registerBkxkSettings()` 里注册：`BKXK_TOGGLES` 随适配器的
 * `toggles` 字段由 `src/sites/index.ts` 灌进注册表。测试里必须走同一条路
 * （`registerToggles`），否则 `isEnabled` 对未注册的开关恒返回 false，
 * 这一整套会因为「闸门默认关」而集体误判。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import { clearAll, write } from '../../src/common/core/storage.ts';
import { resetRegistry as resetSettings, registerToggles, setEnabled } from '../../src/common/core/settings.ts';
import { CUSTOM_COURSES_KEY } from '../../src/common/custom/courses.ts';
import type { CustomCourse } from '../../src/common/custom/courses.ts';
import { BKXK_TOGGLES, registerBkxkSettings, SITE_ID, TOGGLE } from '../../src/sites/bkxk/settings.ts';
import { countSelfConflicts, readEnabledCustomCourses, withSegments } from '../../src/sites/bkxk/custom.ts';

const PLACE_A = '1-18周 星期一 1-2节 致理楼L1-707';
/** 与 A 同天、节次在第 2 节重叠、周次（单周 5-18）与 A 有共同周 ⇒ 一定撞 */
const PLACE_A2 = '5-18周(单) 星期一 2-4节 汇文楼H1-202';
const PLACE_B = '1-18周 星期三 5-6节 致理楼L1-707';
const PLACE_BAD = '未安排';

function boot(): void {
  clearAll();
  resetSettings();
  registerToggles(SITE_ID, '本科选课', BKXK_TOGGLES);
  registerBkxkSettings();
}

function course(id: string, place: string, enabled = true): CustomCourse {
  return { id, name: `课${id}`, teacher: '', place, color: '#e8f2fd', enabled };
}

describe('bkxk/custom —— 解析成时段', () => {
  it('给课程附上 segs，课程本身的字段一个不少', () => {
    const out = withSegments([course('c1', PLACE_A)]);
    assertEqual(out.length, 1);
    const c = out[0];
    assert(c !== undefined, '应有一门课');
    assertEqual(c.id, 'c1');
    assertEqual(c.place, PLACE_A);
    assertEqual(c.segs.length, 1);
    assertEqual(c.segs[0]?.day, 1);
    assertEqual(c.segs[0]?.place, '致理楼L1-707');
  });

  it('多段的课解析出多段（逗号分隔）', () => {
    const out = withSegments([course('c1', `${PLACE_A},${PLACE_B}`)]);
    assertEqual(out[0]?.segs.length, 2);
  });

  it('解析不出的课仍在清单里，只是 segs 为空数组（不丢课、不崩）', () => {
    const out = withSegments([course('c1', PLACE_BAD)]);
    assertEqual(out.length, 1);
    assertDeepEqual(out[0]?.segs, []);
  });

  it('不改动入参', () => {
    const input = [course('c1', PLACE_A)];
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;
    withSegments(input);
    assertDeepEqual(JSON.parse(JSON.stringify(input)) as unknown, snapshot);
  });
});

describe('bkxk/custom —— 读启用中的课程（含总开关闸门）', () => {
  it('默认（开关开着）只返回启用中的课', () => {
    boot();
    write(CUSTOM_COURSES_KEY, [course('c1', PLACE_A), course('c2', PLACE_B, false)]);
    const out = readEnabledCustomCourses();
    assertEqual(out.length, 1);
    assertEqual(out[0]?.id, 'c1');
  });

  it('总开关关掉 → 空数组（关掉就是整条功能停用）', () => {
    boot();
    write(CUSTOM_COURSES_KEY, [course('c1', PLACE_A)]);
    assertEqual(readEnabledCustomCourses().length, 1, '先确认开着时读得到');
    setEnabled(SITE_ID, TOGGLE.CUSTOM_COURSES, false);
    assertDeepEqual(readEnabledCustomCourses(), []);
  });

  it('再打开又读得到（闸门是当前状态，不是「关过一次就永久停用」）', () => {
    boot();
    write(CUSTOM_COURSES_KEY, [course('c1', PLACE_A)]);
    setEnabled(SITE_ID, TOGGLE.CUSTOM_COURSES, false);
    assertEqual(readEnabledCustomCourses().length, 0);
    setEnabled(SITE_ID, TOGGLE.CUSTOM_COURSES, true);
    assertEqual(readEnabledCustomCourses().length, 1);
  });

  it('开关没注册时视为关着（所以测试必须先 registerToggles）', () => {
    clearAll();
    resetSettings();
    write(CUSTOM_COURSES_KEY, [course('c1', PLACE_A)]);
    assertDeepEqual(readEnabledCustomCourses(), [], '未注册的开关 isEnabled 恒为 false');
  });

  it('库里没有课程 → 空数组', () => {
    boot();
    assertDeepEqual(readEnabledCustomCourses(), []);
  });
});

describe('bkxk/custom —— 自定义课程之间的冲突计数', () => {
  it('单门课永远 0（自己跟自己不算冲突）', () => {
    boot();
    assertEqual(countSelfConflicts([course('c1', PLACE_A)]), 0);
    assertEqual(countSelfConflicts([]), 0);
  });

  it('两门撞时间算 1 对（同天 + 节次重叠 + 有共同周）', () => {
    boot();
    assertEqual(countSelfConflicts([course('c1', PLACE_A), course('c2', PLACE_A2)]), 1);
  });

  it('不同天 / 不同节 / 周次不重叠都不算', () => {
    boot();
    assertEqual(countSelfConflicts([course('c1', PLACE_A), course('c2', PLACE_B)]), 0);
    assertEqual(
      countSelfConflicts([course('c1', PLACE_A), course('c2', '1-18周 星期一 5-6节 致理楼L1-707')]),
      0,
    );
    assertEqual(
      countSelfConflicts([course('c1', PLACE_A), course('c2', '20-22周 星期一 1-2节 致理楼L1-707')]),
      0,
    );
  });

  it('单双周错开不算冲突，同为单周才算', () => {
    boot();
    const odd = '5-18周(单) 星期一 1-2节 致理楼L1-707';
    const even = '5-18周(双) 星期一 1-2节 致理楼L1-707';
    assertEqual(countSelfConflicts([course('c1', odd), course('c2', even)]), 0);
    assertEqual(countSelfConflicts([course('c1', odd), course('c2', odd)]), 1);
  });

  it('三门课两两都撞 → 3 对（组合数，不是「有冲突的课数」）', () => {
    boot();
    const place = '1-18周 星期一 1-2节 致理楼L1-707';
    assertEqual(
      countSelfConflicts([course('c1', place), course('c2', place), course('c3', place)]),
      3,
    );
  });

  it('关掉的课不参与计数（与注入口径一致）', () => {
    boot();
    assertEqual(countSelfConflicts([course('c1', PLACE_A), course('c2', PLACE_A2, false)]), 0);
    assertEqual(
      countSelfConflicts([course('c1', PLACE_A, false), course('c2', PLACE_A2), course('c3', PLACE_A)]),
      1,
      '只数开着的两门',
    );
  });

  it('解析不出地点的课不参与计数（也不崩）', () => {
    boot();
    assertEqual(countSelfConflicts([course('c1', PLACE_BAD), course('c2', PLACE_A)]), 0);
  });
});

/**
 * 纯函数冒烟（档1）：跨站点通用的「自定义课程」数据层。
 *
 * 这一套守的是三件事：
 *   1. **存储位置**：键是 `custom:courses`（跨站点通用），不是 `bkxk:` 命名空间
 *      —— 办事大厅的「我的课程表」将来要读同一份数据，写错位置就永远读不到；
 *   2. **清洗口径**：缺 name / id 的一律丢弃、只保留已知字段（派生数据 `segs` 不进库），
 *      这样界面里不会出现点不动的空条目；
 *   3. **写入层**：增删改一律是纯变换（返回新数组、不改入参），
 *      配色按门数轮转而不是按 id，`id` / `color` / `enabled` 不会因为改文字被顺手改掉。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import { clearAll, read, write } from '../../src/common/core/storage.ts';
import {
  CUSTOM_COLORS,
  CUSTOM_COURSES_KEY,
  LEGACY_SITE_CUSTOM_KEY,
  appendCourse,
  colorAt,
  enabledCourses,
  makeCourseId,
  parseCustomCourses,
  readCustomCourses,
  removeCourse,
  setCourseEnabled,
  slimCustomCourse,
  updateCourse,
  writeCustomCourses,
} from '../../src/common/custom/courses.ts';
import type { CustomCourse, CustomCourseDraft } from '../../src/common/custom/courses.ts';

const FULL = {
  id: 'c1',
  name: '高等数学',
  teacher: '张老师',
  place: '1-16周 星期一 1-2节 致理楼L1-707',
  color: '#e8f2fd',
  enabled: true,
} as const;

function boot(): void {
  clearAll();
}

describe('custom/courses —— 存储位置', () => {
  it('键是跨站点通用键，不带站点前缀', () => {
    boot();
    assertEqual(CUSTOM_COURSES_KEY, 'custom:courses');
    assert(!CUSTOM_COURSES_KEY.includes('bkxk'), '自定义课程不属于 bkxk');
  });

  it('批 1 的旧落点常量仍然指向站点键（供搬运逻辑读）', () => {
    assertEqual(LEGACY_SITE_CUSTOM_KEY, 'bkxk:customCourses');
    // 用 String() 包一层：两个常量的字面量类型没有交集，直接比 TS 会报「比较无意义」
    assert(String(LEGACY_SITE_CUSTOM_KEY) !== String(CUSTOM_COURSES_KEY), '两者必须是不同的键');
  });

  it('readCustomCourses 读的是通用键', () => {
    boot();
    write(CUSTOM_COURSES_KEY, [FULL]);
    assertEqual(readCustomCourses().length, 1);
    // 站点键里放东西**不该**被读到
    write(LEGACY_SITE_CUSTOM_KEY, [FULL, FULL]);
    assertEqual(readCustomCourses().length, 1);
  });

  it('库里没有这个键时返回空数组', () => {
    boot();
    assertDeepEqual(readCustomCourses(), []);
  });
});

describe('custom/courses —— 清洗一条', () => {
  it('只保留已知字段，派生数据与额外字段丢弃', () => {
    const out = slimCustomCourse({ ...FULL, segs: [{ day: 1 }], 备注: 'x' });
    assertDeepEqual(out, FULL);
  });

  it('name 去首尾空白；只有空白的 name 丢弃', () => {
    assertEqual(slimCustomCourse({ id: 'c1', name: '  数学  ' })?.name, '数学');
    assertEqual(slimCustomCourse({ id: 'c1', name: '   ' }), null);
    assertEqual(slimCustomCourse({ id: 'c1', name: '' }), null);
  });

  it('缺 id 或 id 为空串丢弃', () => {
    assertEqual(slimCustomCourse({ name: 'A' }), null);
    assertEqual(slimCustomCourse({ id: '', name: 'A' }), null);
    assertEqual(slimCustomCourse({ id: 3, name: 'A' }), null, 'id 必须是字符串');
  });

  it('非对象一律丢弃（null / 数组 / 字符串 / 数字）', () => {
    for (const v of [null, undefined, [], 'x', 7, true]) {
      assertEqual(slimCustomCourse(v), null, `输入 ${String(v)}`);
    }
  });

  it('缺省字段补空串，enabled 缺省为 true（只有显式 false 才算关）', () => {
    const base = { id: 'c1', name: 'A' };
    assertDeepEqual(slimCustomCourse(base), {
      id: 'c1',
      name: 'A',
      teacher: '',
      place: '',
      color: '',
      enabled: true,
    });
    assertEqual(slimCustomCourse({ ...base, enabled: false })?.enabled, false);
    assertEqual(slimCustomCourse({ ...base, enabled: 0 })?.enabled, true, '0 不是 false');
    assertEqual(slimCustomCourse({ ...base, enabled: 'false' })?.enabled, true, '字符串不算');
  });

  it('非字符串的 teacher / place / color 归成空串', () => {
    const out = slimCustomCourse({ id: 'c1', name: 'A', teacher: 1, place: null, color: {} });
    assertDeepEqual(out, { id: 'c1', name: 'A', teacher: '', place: '', color: '', enabled: true });
  });
});

describe('custom/courses —— 清洗一批', () => {
  it('不是数组返回空数组（不抛错）', () => {
    for (const v of [null, undefined, {}, 'x', 7]) {
      assertDeepEqual(parseCustomCourses(v), [], `输入 ${String(v)}`);
    }
  });

  it('坏条目被跳过，好条目保留原顺序', () => {
    const out = parseCustomCourses([
      { id: 'c1', name: 'A' },
      { id: 'c2' },
      null,
      { id: 'c3', name: 'C' },
    ]);
    assertDeepEqual(
      out.map((c) => c.id),
      ['c1', 'c3'],
    );
  });

  it('enabledCourses 只留启用中的', () => {
    const list = parseCustomCourses([
      { id: 'c1', name: 'A' },
      { id: 'c2', name: 'B', enabled: false },
      { id: 'c3', name: 'C' },
    ]);
    assertDeepEqual(
      enabledCourses(list).map((c) => c.id),
      ['c1', 'c3'],
    );
  });

  it('库里存了坏形状时读出来是空数组（不崩）', () => {
    boot();
    write(CUSTOM_COURSES_KEY, { 不是: '数组' });
    assertDeepEqual(readCustomCourses(), []);
    write(CUSTOM_COURSES_KEY, '废字符串');
    assertDeepEqual(readCustomCourses(), []);
    write(CUSTOM_COURSES_KEY, [1, 2, 3]);
    assertDeepEqual(readCustomCourses(), []);
  });

  it('读回的形状就是落盘形状（往返一致）', () => {
    boot();
    const list = parseCustomCourses([FULL]);
    write(CUSTOM_COURSES_KEY, list);
    assertDeepEqual(readCustomCourses(), [FULL]);
    assertDeepEqual(read<unknown>(CUSTOM_COURSES_KEY, null), [FULL]);
  });
});

describe('custom/courses —— 配色', () => {
  it('六个颜色，按顺序循环', () => {
    assertEqual(CUSTOM_COLORS.length, 6);
    assertEqual(colorAt(0), CUSTOM_COLORS[0]);
    assertEqual(colorAt(5), CUSTOM_COLORS[5]);
    assertEqual(colorAt(6), CUSTOM_COLORS[0], '第 7 门绕回第一个颜色');
  });

  it('负数 / 小数 / 非数字都能拿到颜色（界面上不该出现透明块）', () => {
    assertEqual(colorAt(-1), CUSTOM_COLORS[5]);
    assertEqual(colorAt(-7), CUSTOM_COLORS[5]);
    assertEqual(colorAt(1.7), CUSTOM_COLORS[1]);
    assertEqual(colorAt(Number.NaN), CUSTOM_COLORS[0]);
    assertEqual(colorAt(Number.POSITIVE_INFINITY), CUSTOM_COLORS[0]);
  });

  it('每个颜色都是合法色值', () => {
    for (const c of CUSTOM_COLORS) assert(/^#[0-9a-f]{6}$/i.test(c), `色值不合法：${c}`);
  });
});

describe('custom/courses —— 写入层（增删改）', () => {
  const D1 = { name: '  线性代数  ', teacher: '', place: ' 5-18周 星期一 3-4节 致理楼L1-707 ' };

  function draft(name: string, place: string, teacher = ''): CustomCourseDraft {
    return { name, teacher, place };
  }

  it('makeCourseId 的形态：c + 时间戳 + 三位随机（随机数可注入才测得住）', () => {
    assertEqual(makeCourseId(1700000000000, 0.5), 'c1700000000000-500');
    assertEqual(makeCourseId(1, 0.0004), 'c1-000', '不足三位补零');
    assertEqual(makeCourseId(1, 0.0009), 'c1-000');
    assertEqual(makeCourseId(1, 0.9999), 'c1-999');
  });

  it('makeCourseId 对垃圾输入不崩、也不产出怪串', () => {
    assertEqual(makeCourseId(Number.NaN, 0.5), 'c0-500');
    assertEqual(makeCourseId(Number.POSITIVE_INFINITY, 0.5), 'c0-500');
    assertEqual(makeCourseId(1.9, Number.NaN), 'c1-000');
    assertEqual(makeCourseId(1, Number.POSITIVE_INFINITY), 'c1-000');
    assertEqual(makeCourseId(1, -0.25), 'c1-250', '负数取绝对值');
    assertEqual(makeCourseId(1, 1.0009), 'c1-000', '越界的一次绕回 000，不产出四位数字');
  });

  it('appendCourse 补 id / 配色 / 启用状态，并把三段文字去首尾空白', () => {
    boot();
    const next = appendCourse([], D1, 'c1');
    assertDeepEqual(next, [
      {
        id: 'c1',
        name: '线性代数',
        teacher: '',
        place: '5-18周 星期一 3-4节 致理楼L1-707',
        color: CUSTOM_COLORS[0],
        enabled: true,
      },
    ]);
  });

  it('appendCourse 不动入参（纯变换）', () => {
    boot();
    const before = parseCustomCourses([FULL]);
    const snapshot = JSON.parse(JSON.stringify(before)) as unknown;
    const next = appendCourse(before, draft('新科', '1-8周 星期二 1-2节 A'), 'c2');
    assertEqual(before.length, 1, '入参长度不变');
    assertDeepEqual(JSON.parse(JSON.stringify(before)) as unknown, snapshot);
    assertEqual(next.length, 2);
    assert(next !== before, '必须返回新数组');
  });

  it('配色按当前门数轮转：删掉中间一门不会让后面的课换色', () => {
    boot();
    let list: readonly CustomCourse[] = [];
    for (let i = 0; i < 6; i += 1) {
      list = appendCourse(list, draft(`课${String(i)}`, '1-8周 星期一 1-2节 A'), `c${String(i)}`);
    }
    assertEqual(list.length, 6);
    assertDeepEqual(
      list.map((c) => c.color),
      [...CUSTOM_COLORS],
    );
    // 删掉第 3 门，第 4~6 门的颜色必须原样不懂
    const after = removeCourse(list, 'c2');
    assertDeepEqual(
      after.map((c) => c.color),
      [CUSTOM_COLORS[0], CUSTOM_COLORS[1], CUSTOM_COLORS[3], CUSTOM_COLORS[4], CUSTOM_COLORS[5]],
    );
    // 再加一门：按「当前门数」= 5 ⇒ 第 6 个颜色
    const added = appendCourse(after, draft('新课', '1-8周 星期一 1-2节 A'), 'c9');
    const last = added[added.length - 1];
    assert(last !== undefined, '应能取到最后一门');
    assertEqual(last.color, CUSTOM_COLORS[5]);
  });

  it('updateCourse 只改文字，id / 配色 / 启用状态都不动', () => {
    boot();
    const list = setCourseEnabled(appendCourse([], D1, 'c1'), 'c1', false);
    const next = updateCourse(list, 'c1', draft('线性代数（重修）', '2-9周 星期三 5-6节 汇文楼H1-202', '李老师'));
    assertEqual(next.length, 1);
    const c = next[0];
    assert(c !== undefined, '应有一门课');
    assertEqual(c.id, 'c1');
    assertEqual(c.color, CUSTOM_COLORS[0]);
    assertEqual(c.enabled, false, '改文字不该顺手把它打开');
    assertEqual(c.name, '线性代数（重修）');
    assertEqual(c.teacher, '李老师');
    assertEqual(c.place, '2-9周 星期三 5-6节 汇文楼H1-202');
  });

  it('updateCourse 的 id 不在库里时内容原样（不新插入，也不造出重复条目）', () => {
    boot();
    const list = appendCourse([], D1, 'c1');
    const next = updateCourse(list, '不存在', draft('幽灵课', '1-8周 星期一 1-2节 A'));
    assertDeepEqual(next, list);
    assertEqual(next.length, 1);
  });

  it('removeCourse 只删指定的那门；id 不存在时长度不变', () => {
    boot();
    const list = appendCourse(appendCourse([], D1, 'c1'), draft('第二门', '1-8周 星期二 1-2节 B'), 'c2');
    const next = removeCourse(list, 'c1');
    assertEqual(next.length, 1);
    assertEqual(next[0]?.id, 'c2');
    assertEqual(removeCourse(list, '不存在').length, 2);
    assertEqual(list.length, 2, '入参不变');
  });

  it('setCourseEnabled 只动那一门，别的课与入参都不动', () => {
    boot();
    const list = appendCourse(appendCourse([], D1, 'c1'), draft('第二门', '1-8周 星期二 1-2节 B'), 'c2');
    const next = setCourseEnabled(list, 'c2', false);
    assertEqual(next[0]?.enabled, true);
    assertEqual(next[1]?.enabled, false);
    assertEqual(list[1]?.enabled, true, '入参不变');
    assertEqual(next.length, 2);
  });

  it('writeCustomCourses 是唯一写盘出口：写完能读回，写空数组也真的写空', () => {
    boot();
    writeCustomCourses(appendCourse([], D1, 'c1'));
    assertEqual(readCustomCourses().length, 1);
    assertEqual(readCustomCourses()[0]?.name, '线性代数');
    writeCustomCourses([]);
    assertDeepEqual(readCustomCourses(), []);
  });
});

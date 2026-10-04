/**
 * 纯函数冒烟（档1）：跨站点通用的「自定义课程」数据层。
 *
 * 这一套守的是三件事：
 *   1. **存储位置**：键是 `custom:courses`（跨站点通用），不是 `bkxk:` 命名空间
 *      —— 办事大厅的「我的课程表」将来要读同一份数据，写错位置就永远读不到；
 *   2. **清洗口径**：缺 name / id 的一律丢弃、只保留已知字段（派生数据 `segs` 不进库），
 *      这样界面里不会出现点不动的空条目；
 *   3. **只读**：本批没有写入口（增删改是批 4）。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import { clearAll, read, write } from '../../src/common/core/storage.ts';
import {
  CUSTOM_COLORS,
  CUSTOM_COURSES_KEY,
  LEGACY_SITE_CUSTOM_KEY,
  colorAt,
  enabledCourses,
  parseCustomCourses,
  readCustomCourses,
  slimCustomCourse,
} from '../../src/common/custom/courses.ts';

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

/**
 * `sites/bkxk/courses.ts` 的纯函数冒烟（档1）。
 *
 * 只测取数与归一化：`fetchCategory` / `learnBatchCode` 要网络与 storage，属档2/手测范围。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import { pick, normClass, classesOf, flatten, remainOfRow } from '../../src/sites/bkxk/courses.ts';

describe('bkxk/courses —— pick', () => {
  it('取第一个非 null / undefined / 空串的值', () => {
    assertEqual(pick(undefined, null, '', 'A'), 'A');
    assertEqual(pick(null, 0, 'A'), 0, '0 是有效值');
    assertEqual(pick(false, 'A'), false, 'false 是有效值');
  });

  it('全无效返回 null', () => {
    assertEqual(pick(), null);
    assertEqual(pick(undefined, null, ''), null);
  });

  it('对象 / 数组不放行（结构变了就走未识别路径，别把对象传下去）', () => {
    assertEqual(pick({ a: 1 }, 'B'), 'B');
    assertEqual(pick([1, 2]), null);
  });
});

describe('bkxk/courses —— normClass', () => {
  it('教学班字段优先于课程级字段', () => {
    const r = normClass({ courseName: '教学班名', teacherName: '张老师' }, { courseName: '课程名', teacherName: '李老师' });
    assertEqual(r.courseName, '教学班名');
    assertEqual(r.teacherName, '张老师');
  });

  it('教学班字段为 null 时不覆盖课程级字段（HAR 实测的坑）', () => {
    const r = normClass(
      { courseName: null, classCapacity: null, courseNumber: undefined },
      { courseName: '课程名', classCapacity: '40', courseNumber: 'MATH101' },
    );
    assertEqual(r.courseName, '课程名');
    assertEqual(r.classCapacity, '40');
    assertEqual(r.courseNumber, 'MATH101');
  });

  it('teachingClassId 拼写变体与 title 兜底', () => {
    assertEqual(normClass({ teachingClassId: 'T1' }, {}).teachingClassID, 'T1');
    assertEqual(normClass({ title: '标题' }, {}).courseName, '标题');
  });

  it('缺字段一律 null，不是空串也不是 0', () => {
    const r = normClass({}, {});
    assertEqual(r.teachingClassID, null);
    assertEqual(r.isFull, null);
    assertEqual(r.credit, null);
  });

  it('非对象入参不抛错', () => {
    assertEqual(normClass(null, null).courseName, null);
    assertEqual(normClass('x', 3).courseName, null);
  });
});

describe('bkxk/courses —— classesOf', () => {
  it('嵌套结构：tcList 每项一个教学班，课程级字段兜底', () => {
    const out = classesOf({ courseName: '课', tcList: [{ teachingClassID: 'T1' }, { teachingClassID: 'T2' }] });
    assertEqual(out.length, 2);
    assertEqual(out[1]!.teachingClassID, 'T2');
    assertEqual(out[1]!.courseName, '课');
  });

  it('扁平结构：item 自己就是一个教学班（publicCourse.do）', () => {
    const out = classesOf({ teachingClassID: 'T1', courseName: '课' });
    assertEqual(out.length, 1);
    assertEqual(out[0]!.teachingClassID, 'T1');
  });

  it('tcList 为空数组时返回空（不退化成一个扁平教学班）', () => {
    assertEqual(classesOf({ tcList: [] }).length, 0);
  });

  it('非对象返回空数组', () => {
    assertEqual(classesOf(null).length, 0);
    assertEqual(classesOf('x').length, 0);
  });
});

describe('bkxk/courses —— flatten', () => {
  it('dataList → 全量教学班', () => {
    const json = {
      code: '1',
      data: {
        dataList: [
          { courseName: 'A', tcList: [{ teachingClassID: 'A1' }, { teachingClassID: 'A2' }] },
          { courseName: 'B', tcList: [{ teachingClassID: 'B1' }] },
        ],
      },
    };
    const out = flatten(json);
    assertEqual(out.length, 3);
    assertDeepEqual(
      out.map((c) => c.teachingClassID),
      ['A1', 'A2', 'B1'],
    );
  });

  it('结构不符一律返回空数组，不抛错', () => {
    assertEqual(flatten(null).length, 0);
    assertEqual(flatten({}).length, 0);
    assertEqual(flatten({ data: {} }).length, 0);
    assertEqual(flatten({ data: { dataList: '不是数组' } }).length, 0);
  });
});

describe('bkxk/courses —— remainOfRow', () => {
  it('classCapacity - numberOfFirstVolunteer', () => {
    assertEqual(remainOfRow(normClass({ classCapacity: 40, numberOfFirstVolunteer: 13 }, {})), 27);
  });

  it('字符串数字照样算（站点返回的就是字符串）', () => {
    assertEqual(remainOfRow(normClass({ classCapacity: '40', numberOfFirstVolunteer: '40' }, {})), 0);
  });

  it('满课返回 0，不是 null —— 0 与「取不到」必须区分', () => {
    assertEqual(remainOfRow(normClass({ classCapacity: 30, numberOfFirstVolunteer: 30 }, {})), 0);
  });

  it('字段缺失 / 非法返回 null（不是 0）', () => {
    assertEqual(remainOfRow(normClass({}, {})), null);
    assertEqual(remainOfRow(normClass({ classCapacity: 40 }, {})), null);
    assertEqual(remainOfRow(normClass({ classCapacity: 40, numberOfFirstVolunteer: 'x' }, {})), null);
    assertEqual(remainOfRow(null), null);
    assertEqual(remainOfRow(undefined), null);
  });

  it('超卖给负数，不钳到 0（真实超出就是负的，调用方自己决定怎么显示）', () => {
    const r = remainOfRow(normClass({ classCapacity: 10, numberOfFirstVolunteer: 12 }, {}));
    assert(r !== null && r === -2, `期望 -2，实际 ${String(r)}`);
  });
});

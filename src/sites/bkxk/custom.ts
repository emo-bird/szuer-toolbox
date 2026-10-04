/**
 * 自定义课程在 bkxk 侧的**派生视图**。
 *
 * 数据本身住在 `common/custom/courses.ts`（跨站点通用键 `custom:courses`），
 * 这里只补一件 bkxk 独有的事：把 `place` 原文用本站的 `time.ts` 解析成时段 `segs`。
 *
 * 【为什么不在 common 里解析】`place` 的格式（`5-18周 星期二 3-4节 致理楼L1-707`）
 * 是**本科选课系统的写法**，解析规则属于 `sites/bkxk/time.ts`。
 * `common/` 不该反向依赖某个站点模块 —— 将来 ehall 的课表要读同一份数据时，
 * 由它自己决定怎么解析。
 *
 * 【只读】增删改在批 4。
 */

import { readCustomCourses, enabledCourses } from '../../common/custom/courses.ts';
import type { CustomCourse } from '../../common/custom/courses.ts';
import { parsePlace } from './time.ts';
import type { TimeSegment } from './time.ts';

/** 自定义课程 + 解析好的时段 */
export interface BkxkCustomCourse extends CustomCourse {
  /** 由 `place` 现场解析；解析不出就是空数组（课程仍在，只是不参与冲突与注入） */
  readonly segs: readonly TimeSegment[];
}

/** 给课程附上解析好的时段（纯函数） */
export function withSegments(courses: readonly CustomCourse[]): readonly BkxkCustomCourse[] {
  return courses.map((c) => ({ ...c, segs: parsePlace(c.place) }));
}

/**
 * 读启用中的自定义课程（含 `segs`）。
 *
 * `hijack` 与 `timetable` 都只关心启用中的，所以关掉的在这里就滤掉 ——
 * 免得每个消费方各写一遍 `if (!c.enabled) continue`（旧仓库里就散在三处）。
 */
export function readEnabledCustomCourses(): readonly BkxkCustomCourse[] {
  return withSegments(enabledCourses(readCustomCourses()));
}

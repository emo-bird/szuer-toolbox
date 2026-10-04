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
 * 【只读视图】写入（增删改）走 `common/custom/courses.ts` 的写入层，
 * 界面在 `sites/bkxk/tabs/custom.ts`。
 */

import { readCustomCourses, enabledCourses } from '../../common/custom/courses.ts';
import type { CustomCourse } from '../../common/custom/courses.ts';
import { isEnabled } from '../../common/core/settings.ts';
import { SITE_ID, TOGGLE } from './settings.ts';
import { parsePlace, placesConflict } from './time.ts';
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
 *
 * 【v0.23：这里同时是站点总开关的闸门】设置里的「自定义课程」（🟢 `custom-courses`）
 * 关掉时整条功能停用 ⇒ 返回空数组，于是 `hijack` 不会追加冲突、`timetable`
 * 会把已注入的卡片清掉。放在这一个函数里是因为**它是两个消费方唯一的入口**，
 * 漏一处就会出现「开关关了但课表上还有卡片」这种半死不活的状态。
 * 界面侧另有一道闸：`tabs/custom.ts` 关掉时整页禁用（用户拍板 A）。
 */
export function readEnabledCustomCourses(): readonly BkxkCustomCourse[] {
  if (!isEnabled(SITE_ID, TOGGLE.CUSTOM_COURSES)) return [];
  return withSegments(enabledCourses(readCustomCourses()));
}

/**
 * 数一数**自定义课程之间**有几对撞时间（两两组合，与旧仓库 `custom.js` 的
 * `selfConflicts()` 语义一致）。
 *
 * 只比启用中的课程 —— 关掉的课不参与任何冲突计算（与注入口径保持一致）。
 * 与**已选课程**的冲突不在这里算：那需要站点的课表数据，由 `hijack` 在响应里追加。
 */
export function countSelfConflicts(courses: readonly CustomCourse[]): number {
  const live = enabledCourses(courses);
  let n = 0;
  for (let i = 0; i < live.length; i += 1) {
    const a = live[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < live.length; j += 1) {
      const b = live[j];
      if (b === undefined) continue;
      if (placesConflict(a.place, b.place)) n += 1;
    }
  }
  return n;
}

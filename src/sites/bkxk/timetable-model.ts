/**
 * 课表页的纯逻辑 —— v0.29 起**只剩一件事**：判断要不要再请站点画一次。
 *
 * 【v0.29 的大转弯：不再自绘】
 * v0.22–v0.28 这一块是「自己按课表列算 `top`/`height`、写一组 `.cv-lesson` 进去」：
 * 几何（`slotTop` / `slotHeight` / `pickSlotH`）、派单表（`planInjection`）、
 * 读已选课程（`readExistingCards` / `RawCard`）、冲突判色（`conflictsWithCards`）、
 * 去重（`renderedCourseNames`）、重画判据（`needsRescan`）以及一堆 DOM 常量，
 * 还有配套的自绘样式与 🟢`自绘课表` 开关。
 * 用户第十一轮拍板改成 **以站点绘制为主**：卡片由站点画，我们只往自定义课程那一行的
 * 课名里塞一个「自定义」标签（见 `tt-mark.ts`）⇒ 上面那一整套全部删掉。
 *
 * 【为什么还留一个判据】
 * 接管是**异步**投递的（Tampermonkey 把用户脚本投进页面要 200ms 之后），而站点在暖缓存下
 * 75ms 就把 `teachingTime.do` 发出去了（实测）。那一发响应改不到，站点画出来的卡里就没有
 * 我们的标签 —— 这时唯一的办法是**再请站点画一次**（它会重新请求，这次能经过我们的包装）。
 * 这个判据就是决定「要不要请」的那一步，纯函数，可档 1 测试。
 */

/** 课表容器（站点自己写的 id） */
export const SITE_TABLE_ID = 'myCourseTable';
/** 容器兜底选择器（站点结构见 `docs/curriculum.do.html`） */
export const SITE_TABLE_SELECTOR = '.cv-my-course';
/** 站点「一张课程卡片」的类名 */
export const SITE_CARD_CLASS = 'cv-course-card-single';
export const SITE_CARD_SELECTOR = `.${SITE_CARD_CLASS}`;

/** 页面加载后最多**自动**补请几次（用户在【自定义】里改课程触发的不算，见 `timetable.ts`） */
export const MAX_REFETCH_TRIES = 3;

export interface RefetchInput {
  /** 站点接管开关（🟠【课表注入】）开着吗 —— 关着的话再请求一次也不会被改写 */
  readonly hijackOn: boolean;
  /** 已经自动补请过几次 */
  readonly tried: number;
  readonly maxTries: number;
  /** 启用中的自定义课程门数 */
  readonly enabledCourses: number;
  /** 表里站点已经画出来的卡片数 */
  readonly siteCards: number;
  /** 表里我们标记节点的数量（`[data-sztb-tt]`） */
  readonly tags: number;
}

/**
 * 要不要请站点再画一次课表。
 *
 * 五条**全真**才动手：
 *   1. `hijackOn`：接管开关开着 —— 否则重画一次还是老样子；
 *   2. `tried < maxTries`：自动补请有次数上限，避免和站点你来我往地互相触发；
 *   3. `enabledCourses > 0`：没有启用的自定义课程就无事可做；
 *   4. `siteCards > 0`：表里**已经有站点画的卡片** —— 说明「站点这一轮画完了」这个前提成立；
 *      表还空着（站点正在画）就再等等，此时动手等于白请一次；
 *   5. `tags === 0`：表里**一个我们的标记都没有** —— 这是最直接的证据，
 *      说明站点画的这一版里没有我们的课（我们晚到了）。有一条就说明这一轮接住了，不用动。
 *
 * ⚠️ 刻意**不看时钟**：不去比较「我们的落点」与「请求发出时刻」，只看页面上的事实
 * （有站点卡片、没有我们的标记）。时钟只用来在日志里解释原因（`timetable.ts`）。
 */
export function shouldRefetchSite(input: RefetchInput): boolean {
  return (
    input.hijackOn &&
    input.tried < input.maxTries &&
    input.enabledCourses > 0 &&
    input.siteCards > 0 &&
    input.tags === 0
  );
}

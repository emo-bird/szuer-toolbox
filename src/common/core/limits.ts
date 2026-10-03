/**
 * 时间参数的唯一下限/上限来源。
 *
 * 为什么单独成模块：改一个下限要同步改的地方散在 api / tasks / monitor / ui 四处，
 * 漏改任一处就会出现「输入被 UI 拦下」或「保存后被静默夹回」的错配。
 * 这里集中定义，其它模块一律引用，**禁止再写裸数字**。
 *
 * ⚠️ 与旧仓库 szu_bkxk 的差异（用户明确拍板，见需求文档 Q-AF）：
 *   旧仓库把 200ms 做成**硬下限**（低于它直接钳上去）。现在改成**软提示**——
 *   `min` 只防负数与荒谬值，低于 `recommended`（200ms）只在日志里警告，
 *   **不修改用户输入的值**。理由：限流是用户自己的账号在承担后果，
 *   脚本不该替用户否决他的显式选择；但站点的真实风控行为要在文档与提示里讲清楚。
 */

export interface LimitSpec {
  /** 硬边界：只防非法值（负数、NaN、荒谬大值），**不是**安全建议值 */
  readonly min: number;
  readonly max: number;
  readonly def: number;
  /**
   * 安全建议下限。低于它可用，但会 warn。
   * 该值来源：szu_bkxk 实测「站点对高频请求会直接终止会话」时使用的保守阈值。
   */
  readonly recommended: number;
}

export const LIMITS = {
  /** 全局串行队列里相邻两条请求的**开始时刻**最小间隔 */
  intervalMs: { min: 0, max: 60000, def: 500, recommended: 200 },
  /** 抢课重试：一轮跑完等多久再开下一轮 */
  retryIntervalMs: { min: 0, max: 60000, def: 1500, recommended: 200 },
  /** 监控轮询间隔 */
  pollIntervalMs: { min: 0, max: 60000, def: 1500, recommended: 200 },
} as const satisfies Record<string, LimitSpec>;

export type LimitKey = keyof typeof LIMITS;

/**
 * 统一钳位入口：非数字退回该键的默认值，再夹到 [min, max]。
 * **不会**因为低于 `recommended` 而改动数值 —— 那件事由 `isBelowRecommended` 负责提示。
 */
export function clampLimit(key: LimitKey, value: unknown): number {
  const spec: LimitSpec = LIMITS[key];

  // 空串 / 纯空白要按「没填」处理，不能按 Number('') === 0 处理 ——
  // 否则用户清空输入框再保存，间隔会静默变成 0（比推荐值低 200 倍）。
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    n = Number(value.trim());
  } else {
    n = Number.NaN;
  }

  if (!Number.isFinite(n)) n = spec.def;
  return Math.min(spec.max, Math.max(spec.min, n));
}

/** 该值是否低于安全建议下限（调用方据此 warn，不要据此改值） */
export function isBelowRecommended(key: LimitKey, value: number): boolean {
  return value < LIMITS[key].recommended;
}

/** 供 UI 显示的一句话提示，例如「500 ms（建议不低于 200 ms）」 */
export function describeLimit(key: LimitKey, value: number): string {
  const spec: LimitSpec = LIMITS[key];
  const suffix = value < spec.recommended ? `（低于建议下限 ${spec.recommended} ms）` : '';
  return `${value} ms${suffix}`;
}

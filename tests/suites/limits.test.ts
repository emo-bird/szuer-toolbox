/**
 * 纯函数冒烟（档1）：时间参数区间与建议下限。
 *
 * 背景：旧仓库把 200ms 定为**硬下限**（红线 R2）。本项目按用户 Q-AF 拍板
 * 改成「只提示、不钳制」—— 所以本套件要同时钉住两件事：
 *   1. 低于建议下限的值**原样保留**（不悄悄改动用户设置）
 *   2. 真正非法的值（负数 / 超上限 / 非数字）仍然被钳制
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import { LIMITS, clampLimit, isBelowRecommended, describeLimit } from '../../src/common/core/limits.ts';

describe('common/core/limits —— 时间参数', () => {
  it('三个时间参数的建议下限都是 200ms，且与旧仓库一致', () => {
    for (const key of ['intervalMs', 'retryIntervalMs', 'pollIntervalMs'] as const) {
      assertEqual(LIMITS[key].recommended, 200, `${key} 的建议下限应为 200ms`);
    }
  });

  it('缺省值与旧仓库一致（500 / 1500 / 1500）', () => {
    assertEqual(LIMITS.intervalMs.def, 500);
    assertEqual(LIMITS.retryIntervalMs.def, 1500);
    assertEqual(LIMITS.pollIntervalMs.def, 1500);
  });

  it('低于建议下限的值原样保留（Q-AF：不再钳制）', () => {
    assertEqual(clampLimit('intervalMs', 50), 50);
    assertEqual(clampLimit('intervalMs', 0), 0);
    assert(isBelowRecommended('intervalMs', 50), '50ms 应被判定为低于建议下限');
  });

  it('达到建议下限的值不算低', () => {
    assert(!isBelowRecommended('intervalMs', 200), '200ms 正好达标');
    assert(!isBelowRecommended('intervalMs', 900), '高于下限');
  });

  it('非法值才被钳制（负数 / 超上限 / 非数字 / 空串）', () => {
    assertEqual(clampLimit('intervalMs', -1), 0, '负数钳到 min');
    assertEqual(clampLimit('intervalMs', 999999), 60000, '超大值钳到 max');
    assertEqual(clampLimit('intervalMs', Number.NaN), LIMITS.intervalMs.def, 'NaN 回落缺省值');
    assertEqual(clampLimit('intervalMs', ''), LIMITS.intervalMs.def, '空串回落缺省值');
    assertEqual(clampLimit('intervalMs', 'abc'), LIMITS.intervalMs.def, '非数字字符串回落缺省值');
  });

  it('数字字符串按数字处理', () => {
    assertEqual(clampLimit('intervalMs', '1200'), 1200);
    assertEqual(clampLimit('intervalMs', ' 800 '), 800, '两侧空白应被容忍');
  });

  it('describeLimit 在低于建议下限时会提示', () => {
    assert(describeLimit('intervalMs', 100).includes('200'), '描述里应出现建议下限 200');
    assert(!describeLimit('intervalMs', 800).includes('低于'), '达标时不应出现「低于」字样');
  });
});

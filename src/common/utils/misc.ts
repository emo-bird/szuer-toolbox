/**
 * 零散工具函数。
 *
 * 这里的两个函数都是从旧仓库 `C:\Project\szu_bkxk\src\core.js` 搬过来的，
 * 搬之前分别散落在两个地方，合并时保留了旧签名 —— 旧调用点的语义不能变：
 *   - `core.js:245` 的 `NS.util.text(el)`
 *   - `core.js:240` 的 `NS.util.clamp(v, lo, hi, dflt)`（**四参数**，非有限数回落 `dflt`）
 *
 * ⚠️ 与 `common/core/limits.ts` 的 `clampLimit(key, value)` **不是一回事**：
 * 那个按 `LIMITS` 表钳制设置项输入并回落该表的 `def`，是有业务含义的；
 * 本文件这个是无业务含义的纯数值钳制，只做类型保护。
 */

/**
 * 取元素文本：折叠所有空白为单个空格并去掉首尾空白。
 *
 * 用于比对页面上的课程名 / 教师名 —— 站点 HTML 里有大量换行与缩进，
 * 直接 `textContent` 会带上它们，比对必然失败。
 */
export function text(el: Element | null | undefined): string {
  if (el === null || el === undefined) return '';
  return String(el.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 把 `value` 钳制到 `[min, max]`。
 *
 * 三条规则（合成旧仓库两个同名函数的行为）：
 *   1. `Number(value)` 不是有限数 → 返回 `dflt`（旧 `core.js` 版；**不要**改成返回 NaN，
 *      旧调用点 `tasks.js:213` 的 `clamp(p, -1, 1, 0)` 依赖这个回落值）；
 *   2. `max < min`（区间退化，常见于「视口剩下的空间已经比最小尺寸还小」）→ 返回 `min`；
 *   3. 其余 → `Math.min(max, Math.max(min, n))`。
 *
 * 规则 2 与 3 的先后顺序不能换：`max < min` 时 `Math.min(max, Math.max(min, n))` 会返回 `max`，
 * 也就是把元素缩到比最小值还小。
 *
 * ⚠️ `null` 与 `''` 经 `Number()` 得到 `0`，是**有效值**，不会回落 `dflt`。
 * 这是旧实现的既有行为（`Number(null) === 0`），移植时原样保留 —— 别顺手「修」，
 * 否则 `clamp(pos.left, MARGIN, maxLeft, MARGIN)` 这类调用点的行为会变。
 */
export function clamp(value: unknown, min: number, max: number, dflt: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return dflt;
  if (max < min) return min;
  return Math.min(max, Math.max(min, n));
}

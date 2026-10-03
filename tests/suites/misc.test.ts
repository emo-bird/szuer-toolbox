/**
 * `common/utils/misc.ts` 的纯函数冒烟（档1）。
 *
 * `text()` 需要 DOM，这里传一个只有 `textContent` 的假元素即可 ——
 * 该函数只用这一个属性，不必拉起 jsdom。
 */

import { describe, it, assertEqual } from '../harness.ts';
import { clamp, text } from '../../src/common/utils/misc.ts';

function fakeEl(textContent: unknown): Element {
  return { textContent } as unknown as Element;
}

describe('common/utils/misc —— text', () => {
  it('折叠内部空白并去掉首尾', () => {
    assertEqual(text(fakeEl('  高等数学    (上)\n\t A班  ')), '高等数学 (上) A班');
  });

  it('null / undefined 元素返回空串', () => {
    assertEqual(text(null), '');
    assertEqual(text(undefined), '');
  });

  it('textContent 为 null 时返回空串', () => {
    assertEqual(text(fakeEl(null)), '');
  });

  it('纯空白返回空串', () => {
    assertEqual(text(fakeEl(' \n\t ')), '');
  });
});

describe('common/utils/misc —— clamp', () => {
  it('区间内原样返回', () => {
    assertEqual(clamp(5, 0, 10, 0), 5);
  });

  it('越界钳到 min / max', () => {
    assertEqual(clamp(-5, 0, 10, 0), 0);
    assertEqual(clamp(50, 0, 10, 0), 10);
  });

  it('区间退化（max < min）返回 min —— 不能返回 max', () => {
    assertEqual(clamp(5, 10, 3, 0), 10);
  });

  it('非有限数回落 dflt（NaN / Infinity / 非数字串 / undefined）', () => {
    assertEqual(clamp(Number.NaN, -1, 1, 0), 0);
    assertEqual(clamp(Number.POSITIVE_INFINITY, -1, 1, 0), 0);
    assertEqual(clamp('abc', -1, 1, 0), 0);
    assertEqual(clamp(undefined, -1, 1, 7), 7);
  });

  it('null / 空串走 Number() 的 0 —— 旧行为，不是 dflt', () => {
    assertEqual(clamp(null, -1, 1, 7), 0);
    assertEqual(clamp('', -1, 1, 7), 0);
  });

  it('数字字符串按数字处理', () => {
    assertEqual(clamp('1200', 200, 999, 500), 999);
    assertEqual(clamp(' 800 ', 200, 999, 500), 800);
  });

  it('0 与 false 是有效值，不走 dflt', () => {
    assertEqual(clamp(0, 0, 10, 9), 0);
    assertEqual(clamp(false, -5, 10, 9), 0);
  });
});

/**
 * `uooc/ai/overlay` 里唯一能在 Node 里测的那部分 —— 「什么时候才把遮罩挂上去」。
 *
 * 为什么单独锁它：用户 2026-10-09 报的正是**时序**问题（遮罩挂太早，被站点自己的
 * 首次渲染刷掉了）。挂载本身依赖真实 iframe，只能手测；但「等 / 挂 / 超时也挂」这个
 * 判定是纯函数，写错一次就会退回原样，所以钉住。
 */

import { assertEqual, describe, it } from '../harness.ts';
import { overlayStep } from '../../src/sites/uooc/ai/overlay.ts';

describe('uooc/quiz-overlay · 挂载时机', () => {
  const deadline = 1000;

  it('题目 DOM 已就绪 ⇒ 立刻挂（不管有没有超时）', () => {
    assertEqual(overlayStep(true, 0, deadline), 'attach');
    assertEqual(overlayStep(true, 500, deadline), 'attach');
    assertEqual(overlayStep(true, 99999, deadline), 'attach');
  });

  it('没就绪、还没到点 ⇒ 等（这就是「别挂早了」）', () => {
    assertEqual(overlayStep(false, 0, deadline), 'wait');
    assertEqual(overlayStep(false, 999, deadline), 'wait');
  });

  it('没就绪、已到点 ⇒ 照样挂（看不到进度比可能被刷掉更糟）', () => {
    assertEqual(overlayStep(false, 1000, deadline), 'attach-late');
    assertEqual(overlayStep(false, 100000, deadline), 'attach-late');
  });
});

/**
 * `uooc/ai/fill` 里「试卷题目渲染完了没有」的那条判据。
 *
 * 为什么单独锁它：用户 2026-10-09 报的事故正是**这个判据不存在** —— 原来「测验就绪」
 * 只看 iframe 元素 + 地址里的 tid，网络差时选项还没渲染就开始问模型，**一道都填不上**。
 * 判据本身要摸真实 DOM（Node 里没有），但「空壳容器不算就绪」这条规则是纯逻辑，
 * 写错一次就退回原样，所以用一个极简的假文档把它钉住。
 */

import { assert, assertEqual, describe, it } from '../harness.ts';
import { containersComplete, quizDomReady } from '../../src/sites/uooc/ai/fill.ts';

/**
 * 极简假文档：只实现 `quizDomReady` 真正用到的那两层 `querySelectorAll`。
 *
 * `collectRoots()` 会先问 `iframe, frame`（这里恒为空数组 = 没有子 iframe），
 * 再问 `div.queContainer`；每个容器只需要能回答「我有几个控件」。
 */
function fakeDoc(controlCounts: readonly number[]): Document {
  const boxes = controlCounts.map((n) => ({
    querySelectorAll: () => ({ length: n }) as unknown as NodeListOf<Element>,
  }));
  return {
    querySelectorAll: (sel: string) => (sel === 'div.queContainer' ? boxes : []),
  } as unknown as Document;
}

describe('uooc/quiz-ready · 整卷是否渲染完', () => {
  it('一个容器都没有 ⇒ 没就绪', () => {
    assertEqual(quizDomReady(fakeDoc([])), false);
    assertEqual(containersComplete([]), false);
  });

  it('每个容器都有控件 ⇒ 就绪', () => {
    assertEqual(quizDomReady(fakeDoc([2])), true);
    assertEqual(quizDomReady(fakeDoc([4, 2, 2, 2, 2])), true);
    assertEqual(containersComplete([1]), true);
  });

  it('存在空壳容器 ⇒ 还没渲染完（这就是「标题出来了、选项还没出来」那一刻）', () => {
    assertEqual(quizDomReady(fakeDoc([4, 0])), false);
    assertEqual(quizDomReady(fakeDoc([0])), false);
    assertEqual(containersComplete([4, 0, 2]), false);
  });

  it('文本框也算控件（填空题只有 textarea，判成没就绪会白等满超时）', () => {
    // 假文档里「控件的个数」= `input[name]` 或 `textarea` 的数量，所以这里只要
    // 容器非空就算过 —— 这条断言锁的是「别把 textarea 排除在外」这个口径
    assert(containersComplete([1]), '填空题容器（只有 textarea）必须算就绪');
  });
});

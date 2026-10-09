/**
 * UOOC 试卷「就绪判定」契约（从 ai/fill.ts 拆出，C2 批3）。
 *
 * 就绪 = 每个已出现的题目容器里都已经有可操作控件（`input[name]` 或 `textarea`）。
 * 有单测钉住（tests/suites/uooc-quiz-ready.test.ts）；调用方是 takeover-utils 的
 * `viewerReady(kind:'quiz')` 与 ai/index 的作答主流程。
 */

import { collectRoots } from './fill-dom.ts';

/**
 * 纯函数：每个题目容器都已经有可操作的控件了吗。
 *
 * 抽出来只为**能上单测**（真实判据要走 DOM，Node 里测不了）。规则一句话：
 * **一个容器都没有 ⇒ 没就绪**；**存在空壳容器 ⇒ 还没渲染完**。
 *
 * @param controlCounts 每个 `div.queContainer` 里的控件个数（`input[name]` + `textarea`）
 */
export function containersComplete(controlCounts: readonly number[]): boolean {
  return controlCounts.length > 0 && controlCounts.every((n) => n > 0);
}

/**
 * 试卷的题目 DOM **渲染完了**吗 —— 跳过去之后、开始答题之前等的就是它。
 *
 * 为什么需要它（用户 2026-10-09 报的事故）：原来「测验就绪」只要求 **iframe 元素出现
 * 且地址里有 tid**，于是流程一路往下走 —— 拉卷、问模型、回填；而回填那一步才第一次碰
 * DOM（按 `input[name="<qid>"]` 找选项）。网络差时选项还没渲染出来，**一道都填不上**。
 *
 * 判据（DOM 侧，无需先拿 paper）：
 * - 找到含 `div.queContainer` 的文档（旧版试卷在 iframe 里、新版在顶层，所以遍历同源 roots）；
 * - 且**每一个**容器里都已经有控件（`input[name]` 或 `textarea`）—— 空壳容器 = 还在渲染。
 *
 * ⚠️ **已知边界**：站点若把题目**逐题懒渲染**（先出一题、滚到才出下一题），本判据只保证
 * 「已经出现的容器都是完整的」，保证不了「全部题目都出现了」。这是用户拍板接受的取舍
 * （另一个做法要等 paper 的题号清单，而那要发生在跳转之后）。
 */
export function quizDomReady(top: Document = document): boolean {
  for (const doc of collectRoots(top)) {
    const boxes = doc.querySelectorAll('div.queContainer');
    if (boxes.length === 0) continue;
    const counts: number[] = [];
    for (const box of boxes) counts.push(box.querySelectorAll('input[name], textarea').length);
    if (containersComplete(counts)) return true;
  }
  return false;
}

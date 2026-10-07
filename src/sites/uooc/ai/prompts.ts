/**
 * AI 答题的提示词。
 *
 * 出处：`docs/UOOC-AI提示词-草稿.md`（用户 m04071「提示词草稿可以」）。
 *
 * ## 为什么要 5 套
 *
 * 需求细则 §B.1：一共 5 套模板，**核心相同、输出格式相同、只有提示词不同**；
 * 每次请求随机抽一套、**抽过的不放回**；每题独立（答完一题池子重置，用户 m01877）。
 * 请求体里**不传 `temperature`** —— 多样性完全由这 5 套提示词提供。
 *
 * ## 输出格式为什么写得这么死
 *
 * 解析器逐行认 `^\s*(\d+)\s*[.、．:：)）]\s*(.+)$`（见 `parse.ts`）。
 * 模型多写一句解释、多插一个空行，后面的题就会整段错位 ——
 * **错位比答错更麻烦，因为它不报错**：题号对不上时我们会拿到别人的答案。
 */

import type { ExamQuestion } from './paper.ts';

export interface PromptTemplate {
  /** 稳定 id，日志与测试用 */
  readonly id: string;
  /** 面板上显示的名字 */
  readonly label: string;
  /** 模板正文（拼在共用指令**前面**） */
  readonly body: string;
}

/** 五套共用的「答题指令」，拼在每个模板正文之后 */
export const SHARED_INSTRUCTION = [
  '请回答下列题目。要求：',
  '1. 只输出答案行，每题一行，格式为「题号. 答案」，题号从 1 开始。',
  '2. 单选题只写一个字母，如 A。',
  '3. 多选题写多个字母，用英文逗号分隔，按字母升序，如 A,C。',
  '4. 判断题写 A（正确）或 B（错误）。',
  '5. 填空题写答案原文，不要写字母；一道题有多个空时，按空序用竖线 | 分隔。',
  '6. 不要输出解释、标题、空行、代码块或任何多余字符。',
  '',
].join('\n');

/**
 * 五套模板。顺序固定（测试与日志依赖这个顺序），
 * **运行时抽签由 `runner.ts` 负责**，不要在这里洗牌。
 */
export const TEMPLATES: readonly PromptTemplate[] = [
  {
    id: 'direct',
    label: '直答',
    body: '你是一名严谨的答题助手。直接依据题干与选项作答。\n不需要展示推理过程。',
  },
  {
    id: 'reason',
    label: '先推理',
    body: '你是一名严谨的答题助手。作答前请在心里逐步推理，确认无误后给出答案。\n不要把你的推理过程写出来。',
  },
  {
    id: 'expert',
    label: '学科专家',
    body: '你是这门课程的资深教师，熟悉该学科的标准答案口径。\n请以专业判断作答，不要受选项表述顺序影响。',
  },
  {
    id: 'eliminate',
    label: '排除法',
    body: '你是一名严谨的答题助手。先用排除法剔除明显错误的选项，\n再从剩下的选项里确定最终答案。不要输出排除过程。',
  },
  {
    id: 'double-check',
    label: '自检复核',
    body: '你是一名严谨的答题助手。先在心里给出初步答案，再默读一遍题目复核；\n如果发现错误就改正。最终只输出复核后的答案。',
  },
];

/** 把一道题的选项渲染成一行：`A. 经济  B. 外交` */
function renderOptions(q: ExamQuestion): string {
  if (q.options.length === 0) return '';
  return q.options.map((o) => `${o.key}. ${o.text}`).join('  ');
}

/**
 * 拼完整提示词。
 *
 * 题号**从 1 开始、按传入顺序**——这是解析器的对齐依据，
 * 所以调用方必须用同一份数组（长度、顺序都不能变）去解析结果。
 */
export function buildPrompt(
  questions: readonly ExamQuestion[],
  template: PromptTemplate,
): string {
  const lines: string[] = [template.body, '', SHARED_INSTRUCTION, '题目：'];
  questions.forEach((q, i) => {
    // 题型名一并给模型：它自己知道「多选题要写 A,C」，不给反而容易只写一个字母
    const tag = q.typeText === '' ? '' : `[${q.typeText}] `;
    lines.push(`${i + 1}. ${tag}${q.stem}`);
    const opts = renderOptions(q);
    if (opts !== '') lines.push(`   ${opts}`);
  });
  return lines.join('\n');
}

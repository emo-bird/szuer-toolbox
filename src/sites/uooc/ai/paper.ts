/**
 * 答题页（`/exam/…`）的题目模型与拉题接口。
 *
 * 契约出处：`local/paper-shape3.txt`（实测响应 dump），字段清单见
 * `docs/UOOC-连播与答题-需求细则.md` §B.3 / §D14。
 *
 * ⚠️ 三条容易踩的事实：
 *  1. `getTaskPaper` 的 `questions[].id` **就是答题页 DOM 里 `input[name=…]` 的那个 name**
 *     —— 回填全靠这个数字对齐，改题号的任何逻辑都会静默填错题。
 *  2. `question` 是**纯文本**（不带 HTML）；单选题的 `options` 是 `{A:'经济', B:'外交'}` 这种
 *     字母→文本的对象，填空题的 `options` 是 `{第1空: ''}`（**键不是字母**）。
 *  3. **未提交时没有 `answer` 字段**（用户 m01816 实测）⇒ 答案只能来自 LLM，
 *     不要回头去调 `/exam/view` 抄标准答案。
 *  4. 填空题的 `options` 键不是字母（`第1空`），作答走**另一条路**：DOM 里是
 *     `textarea.ue-container1`（没有 name），答案按空序用 `|` 分隔 ——
 *     见 `fill.ts` / `fill-dom.ts`；这里只负责把「几个空」算出来（`blankCount`）。
 */

import { PRIORITY, qs, request } from '../../../common/core/http.ts';

/** 题型。`blank` = 填空题（用户 m00107 起参与自动作答）；`other` = 主观题，**仍不参与**。 */
export type QuestionKind = 'single' | 'multi' | 'judge' | 'blank' | 'other';

export interface ExamOption {
  /** 选项字母（判断题就是 A/B） */
  readonly key: string;
  readonly text: string;
}

export interface ExamQuestion {
  /** 题目 id —— 与 DOM 里 `input[name=…]` 的值相同 */
  readonly id: string;
  readonly kind: QuestionKind;
  /** 站点自己给的中文题型名（`type_text`），日志与提示词都用它 */
  readonly typeText: string;
  readonly stem: string;
  readonly options: readonly ExamOption[];
  readonly score: string;
  /**
   * 你这道题**已经填过的答案**（`student_answer`）。
   *
   * 实测：未作答时是**空数组** `[]`；作答后站点往数组里放字母（填空题放文本）。
   * 非空 ⇒ 这道题**不请求 LLM**，直接算「已答」（需求细则 §C.2 / §C.4.1）。
   */
  readonly studentAnswer: readonly string[];
  /**
   * 填空题**有几个空**（`options` 的键「第1空」「第2空」…的个数）；其余题型恒为 0。
   *
   * 为什么要单独留一个字段：`toOptions` 只留字母键，填空的键全被丢掉 ——
   * 空数在「答案怎么切段」（`fill.ts` 的 `blankSegments`）和提示词里都要用。
   */
  readonly blankCount?: number;
}

/**
 * 能自动作答的题型（其余题型跳过，不会让整份卷子失败）。
 *
 * 填空题从用户 m00107 起纳入：DOM 侧实测控件是 `textarea.ue-container1`
 * （没有 name），答案按空序用 `|` 分隔，详见 `fill-dom.ts` / `fill.ts`。
 */
export function isAnswerable(kind: QuestionKind): boolean {
  return kind === 'single' || kind === 'multi' || kind === 'judge' || kind === 'blank';
}

/**
 * 由 `type_text` / `type` 判定题型。
 *
 * **优先认 `type_text`**（需求细则 §D14）：中文题型名是站点直接给的，
 * 数字 `type` 编码站点改过版（旧版判断题为 20、填空题 30），不可靠。
 */
export function kindOf(typeText: string, type: string): QuestionKind {
  const t = typeText.trim();
  if (t.includes('多选')) return 'multi';
  if (t.includes('单选')) return 'single';
  if (t.includes('判断')) return 'judge';
  if (t.includes('填空')) return 'blank';
  switch (type) {
    case '10':
      return 'single';
    case '11':
      return 'multi';
    case '20':
      return 'judge';
    case '30':
      return 'blank';
    default:
      return 'other';
  }
}

/** 把 `options` 归一成 `[{key,text}]`；键不是单个字母的（填空题的「第1空」）一律丢掉 */
function toOptions(raw: unknown): ExamOption[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: ExamOption[] = [];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[A-Za-z]$/.test(key)) continue;
    out.push({ key: key.toUpperCase(), text: String(value ?? '').trim() });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

function asString(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/**
 * `question` **可能带 HTML**（实测 tid=736720049 的填空题是
 * `<p><span style="…">…</span></p>`，tid=291597830 的单选题却是纯文本）
 * ⇒ 有标签就剥掉再给模型，否则提示词里全是噪音。
 */
function stripHtml(s: string): string {
  if (!s.includes('<')) return s;
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `student_answer` 归一成字符串数组：空 ⇒ `[]` */
function toStudentAnswer(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => asString(x).trim()).filter((s) => s !== '');
  }
  const s = asString(raw).trim();
  return s === '' ? [] : [s];
}

/**
 * 填空题有几个空。
 *
 * 接口给的是**对象** `{第1空: '', 第2空: ''}`（`local/paper-shape3.txt`），
 * 但页面 scope 里同一个字段是**数组** `[{text:'',key:'第1空'}]` —— 两种都认，
 * 免得哪天接口换了形状就把空数算成 1。
 *
 * 导出只为可测：真正调用它的只有下面的 `toExamQuestion`。
 */
export function blankCountOf(raw: unknown, kind: QuestionKind): number {
  if (kind !== 'blank') return 0;
  if (Array.isArray(raw)) return raw.length;
  if (raw !== null && typeof raw === 'object') return Object.keys(raw as Record<string, unknown>).length;
  return 0;
}

/** 把 `getTaskPaper` 的一条 question 转成我们的模型；字段缺失时返回 null 而不是抛异常 */
function toExamQuestion(raw: unknown): ExamQuestion | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = asString(o['id']).trim();
  if (id === '') return null;
  const typeText = asString(o['type_text']);
  const kind = kindOf(typeText, asString(o['type']));
  return {
    id,
    kind,
    typeText,
    stem: stripHtml(asString(o['question'])),
    options: toOptions(o['options']),
    score: asString(o['score']),
    studentAnswer: toStudentAnswer(o['student_answer']),
    blankCount: blankCountOf(o['options'], kind),
  };
}

export interface ExamPaper {
  readonly questions: readonly ExamQuestion[];
  /** 「一、单选题」这类分组标题行；目前只用于日志 */
  readonly courseTitle: string;
}

/** 拉一份试卷 */
export async function fetchPaper(tid: string): Promise<ExamPaper> {
  const res = await request({
    url: `${location.origin}/exam/getTaskPaper?${qs({ tid })}`,
    responseType: 'json',
    priority: PRIORITY.HIGH,
    // 用户 m01884 报备 2 拍板：拉试卷也跟 AI 接口一样给足 60 秒（原来是 20 秒）
    timeoutMs: 60000,
  });
  const body = res.json as Record<string, unknown> | null;
  const data = (body?.['data'] ?? null) as Record<string, unknown> | null;
  const list = Array.isArray(data?.['questions']) ? (data['questions'] as unknown[]) : null;
  if (list === null) throw new Error('getTaskPaper 响应里没有 questions');

  const questions: ExamQuestion[] = [];
  for (const item of list) {
    const q = toExamQuestion(item);
    if (q !== null) questions.push(q);
  }
  const paper = (data?.['paper'] ?? null) as Record<string, unknown> | null;
  return { questions, courseTitle: asString(paper?.['course_title']) };
}

/**
 * 把模型的自由文本回答解析成「题号 → 答案」，并用多数投票定稿。
 *
 * ## 解析口径（需求细则 §B.3，沿用旧参考脚本 `utils/quiz.js`）
 *
 *  - 主路径：逐行认 `^\s*(\d+)\s*[.、．:：)）]\s*(.+)$`；
 *  - 回退：整段扫 `(?:^|\s)(\d+)\s*[.、．:：)）]\s*([A-Za-z]…)+`，救「全挤在一行」的回答；
 *  - 字母一律转大写；多选题内部按字母升序 —— **`A,C` 与 `C, A` 必须算同一个答案**，
 *    否则投票会把同一个意思拆成两票，白白多要一次请求。
 *
 * ## 投票口径（需求细则 §B.2）
 *
 * 一句话：**少数服从多数；平局就再要一次；最终仍平局取最后一次。**
 * 展开成 `majority()` 的规则：任意答案出现 2 次即定稿；
 * 到第 4 次仍无重复，就取第 4 次（最后一次）。
 */

/** 一次回答最多要几次（需求细则 §B.2） */
export const MAX_SAMPLES = 4;

/** 全角字母 → 半角 */
function toHalfWidth(s: string): string {
  return s.replace(/[\uFF21-\uFF3A\uFF41-\uFF5A]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

/**
 * 归一化「选择题」答案：只留字母，去分隔符，转大写，升序去重。
 * 认不出来（含中文、含数字等）返回 `null`。
 *
 * 单选/多选/判断共用本函数：判断题答案本来就是 A/B 两个字母。
 */
export function normalizeChoice(raw: string): string | null {
  const s = toHalfWidth(raw)
    .replace(/[，、；;/\s]+/g, ',')
    .replace(/[.。]+$/g, '')
    .trim();
  if (s === '') return null;

  // 判断题常见的非字母写法，先归一成 A/B
  const judge = judgeToLetter(s);
  if (judge !== null) return judge;

  const letters = s.split(',').filter((p) => p !== '');
  if (letters.length === 0) return null;
  for (const p of letters) {
    if (!/^[A-Za-z]$/.test(p)) return null;
  }
  const uniq = [...new Set(letters.map((p) => p.toUpperCase()))].sort();
  return uniq.join(',');
}

/** 「正确/对/T/True/√」→ A，「错误/错/F/False/×」→ B；不像判断题则返回 null */
export function judgeToLetter(s: string): 'A' | 'B' | null {
  const t = s.replace(/\s+/g, '');
  if (/^(正确|对|是|√|✓|T|TRUE)$/i.test(t)) return 'A';
  if (/^(错误|错|否|×|✗|X|F|FALSE)$/i.test(t)) return 'B';
  return null;
}

/**
 * 按题型归一化一条答案。归一不出来返回 `null`（调用方会把它当成「这次回答作废」）。
 *
 * ⚠️ 填空题（用户 m00107 起参与自动作答）走的是「原文」口径，**不做字母归一** ——
 * 多个空按空序用竖线 `|` 原样保留，切段由 `fill.ts` 的 `blankSegments` 负责。
 */
export function normalizeAnswer(raw: string, kind: 'single' | 'multi' | 'judge' | 'blank' | 'other'): string | null {
  if (kind === 'blank' || kind === 'other') {
    const t = raw.trim();
    return t === '' ? null : t;
  }
  return normalizeChoice(raw);
}

/**
 * 整段/整行扫「题号 + 字母答案」，救「全挤在一行」的回答（旧脚本的兜底正则）。
 *
 * 只在**同一行能看到 2 个以上题号**时才用（见 `parseAnswerLines`），
 * 否则「1. 第2.3条」这种正文里的数字会被误当成题号。
 */
const INLINE_RE = /(?:^|[\s（(])(\d+)\s*[.、．:：)）]\s*([A-Za-z](?:\s*[,，]\s*[A-Za-z])*)/g;

function scanInline(text: string): Map<number, string> {
  const found = new Map<number, string>();
  for (const m of text.matchAll(INLINE_RE)) {
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n <= 0) continue;
    if (!found.has(n)) found.set(n, (m[2] ?? '').trim());
  }
  return found;
}

/**
 * 逐行解析成 `题号(1-based) → 原文答案`。
 *
 * 同一题号出现多次时**保留第一次**：模型偶尔会把答案抄两遍，
 * 后一遍常带上括号注释之类的噪声。
 */
export function parseAnswerLines(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const body = stripFence(text);

  for (const line of body.split(/\r?\n/)) {
    // ⚠️ 「一行挤了好几题」（`1.A 2.B 3.C`）必须先分流掉。
    // 按「一行一题」硬解析的话，第一题的答案会变成 `A 2.B 3.C` ——
    // 归一化认不出来 ⇒ **整行答案全废**（不是只废一道题）。
    // 只有 inline 扫出 ≥2 题时才走这条路，免得把正文里的数字误当题号。
    const inline = scanInline(line);
    if (inline.size >= 2) {
      for (const [n, ans] of inline) if (!out.has(n)) out.set(n, ans);
      continue;
    }

    const m = /^\s*(\d+)\s*[.、．:：)）]\s*(.+?)\s*$/.exec(line);
    if (m === null) continue;
    const n = Number(m[1]);
    const ans = (m[2] ?? '').trim();
    if (!Number.isInteger(n) || n <= 0 || ans === '') continue;
    if (!out.has(n)) out.set(n, ans);
  }
  if (out.size > 0) return out;

  // 兜底：整段就没解析出东西时，再整段扫一次
  for (const [n, ans] of scanInline(body)) if (!out.has(n)) out.set(n, ans);
  return out;
}

/** 去掉 ``` 围栏（模型偶尔会把答案包进代码块） */
function stripFence(text: string): string {
  return text.replace(/^\s*```[a-zA-Z]*\s*$/gm, '').replace(/```/g, '');
}

/**
 * 解析出一整份卷子的答案。
 *
 * 返回长度恒等于 `count`；第 i 项是第 i+1 题归一化后的答案，`null` 表示这一题模型没给或给得看不懂。
 * **长度恒等是刻意的**：调用方要靠下标对齐题号，允许变长就等于允许错位。
 */
export function parseAnswers(
  text: string,
  kinds: readonly ('single' | 'multi' | 'judge' | 'blank' | 'other')[],
): (string | null)[] {
  const lines = parseAnswerLines(text);
  return kinds.map((kind, i) => {
    const raw = lines.get(i + 1);
    if (raw === undefined) return null;
    return normalizeAnswer(raw, kind);
  });
}

export interface Verdict {
  /** true = 已经可以定稿 */
  readonly decided: boolean;
  /** 定稿时的答案；`decided === false` 时是空串 */
  readonly answer: string;
}

/**
 * 多数投票（需求细则 §B.2）。
 *
 * - 任意答案出现 ≥2 次 → 定稿（多个答案都 ≥2 票时，**取先出现的那个**，
 *   这样同一批样本永远给同一个结果，测试才立得住）；
 * - 还没到 `MAX_SAMPLES` → 继续要；
 * - 到 `MAX_SAMPLES` 仍无多数 → 取最后一次。
 */
export function majority(samples: readonly string[]): Verdict {
  if (samples.length === 0) return { decided: false, answer: '' };

  const counts = new Map<string, number>();
  for (const s of samples) counts.set(s, (counts.get(s) ?? 0) + 1);

  for (const s of samples) {
    if ((counts.get(s) ?? 0) >= 2) return { decided: true, answer: s };
  }
  if (samples.length >= MAX_SAMPLES) {
    return { decided: true, answer: samples[samples.length - 1] ?? '' };
  }
  return { decided: false, answer: '' };
}

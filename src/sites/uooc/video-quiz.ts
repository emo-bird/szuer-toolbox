/**
 * 视频随机小测（进度条上那些 `span.vjs-seekbar-point`）。
 *
 * 用户 m05960 的需求 + m06055 的拍板：**读 DOM 里现成的答案 → 点选 → 点「确定」**。
 *
 * ## 关键发现：答案就在视频容器的 `source` 属性里
 *
 * 视频容器是这么渲染的（`ng-if="source.type == 10"`，浏览器 `getAttribute` 返回**已反转义**的 JSON）：
 *
 * ```json
 * {"quiz":[{"id":1277026166,"set_time":"469",
 *           "question":"<p>…</p>",
 *           "options":"{\"A\":\"对\",\"B\":\"错\"}",
 *           "answer":"[\"A\"]",      ← 正确答案（字符串化的 JSON 数组）
 *           "eanswer":"A",           ← 正确答案（已解析好的）
 *           "voptions":{"A":"对","B":"错"}}]}
 * ```
 *
 * ⇒ **不用试错、不用读 `wrongTip`、不用发任何请求**（这个小测本身就是纯前端的）。
 *
 * ## 怎么把弹层里的题对回 `quiz[]`
 *
 * 弹层里每个选项是：
 *
 * ```html
 * <input type="radio" name="answer_1277026166" ng-model="qsource.canswer" value="A">
 * ```
 *
 * ⭐ 那个 `answer_<数字>` 里的数字就是 `quiz[].id` —— 这是唯一可靠的 join key
 * （题干是 `ng-bind-html` 渲染的富文本，拿去比对又脆又费劲）。
 *
 * ## 不做的事
 *
 * - **不留开关**（用户 m06055：「已经可以直接读取答案了，不需要此功能了，从需求中移除」）
 *   —— 视频小测**无条件**自动作答，两个开关（「小测自动答题」与「关闭视频小测答案枚举」）都不做。
 * - **不猜**：找不到答案的题一律原样留着等用户，绝不点第一项糊过去。
 * - **不发请求**：视频小测没有对应的后端接口，走 LLM 是另一条路（`ai/`），本文件不碰。
 */

import { scoped } from '../../common/core/log.ts';

const log = scoped('uooc/video-quiz');

/** 弹层本体。站点用 layui，`#quizLayer` 是题目容器 */
const LAYER_SEL = '#quizLayer';
/** 打上就代表这一层已经处理过（同一层不重复点，防抖动/防双触发） */
const DONE_ATTR = 'data-sztb-quiz-done';
/** 选项的 id 前缀：`name="answer_<quizId>"` */
const INPUT_SEL = 'input[name^="answer_"]';
const ANSWER_ID_RE = /^answer_(.+)$/;
/** 站内「确定」按钮（两个都留：前者是语义选择器，后者是实测类名） */
const SURE_SEL = '[ng-click^="sureAnswer"]';
const SURE_FALLBACK_SEL = 'button.btn.btn-success.fl_right';
/** 找视频容器的 `source` 属性：先精确、再放宽 */
const VIDEO_SOURCE_SEL = '[uooc-video][source]';
const ANY_SOURCE_SEL = '[source]';

/** DOM 变动去抖（与 `video.ts` 同一口径） */
const RESCAN_DEBOUNCE_MS = 200;
/** 点完「确定」后再看一眼的间隔：还在就说明没点掉（答案不对 / 按钮变灰） */
const AFTER_SURE_MS = 800;

/** 从 `source` 属性里抽出的一条小测 */
interface VideoQuiz {
  readonly id: string;
  readonly letters: readonly string[];
}

/**
 * 把 `eanswer` / `answer` 归一成选项字母数组。
 *
 * 站点两种字段并存，格式还飘（`"A"` / `"[\"A\"]"` / `["A","B"]`），所以逐个试：
 * 先 `eanswer` 再看 `answer`。**只在整串确实是一串字母时才认**，避免把中文答案
 * 里的英文字母当成选项（那会把 `eng...` 之类的文本拆成 A~Z）。
 */
function lettersOf(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const arr = raw
      .map((v) => String(v).trim().toUpperCase())
      .filter((v) => v !== '');
    return arr.length > 0 ? arr : [];
  }
  if (typeof raw !== 'string') return [];

  const s = raw.trim();
  if (s === '') return [];

  // `["A","B"]` 这种字符串化的 JSON 数组
  if (s.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return lettersOf(parsed);
    } catch {
      /* 不是合法 JSON 就往下走 */
    }
  }

  // `A` / `A,B` / `A，B` / `A、B` / `A B` / `AB` 都认；只要不是**整串皆字母**就放弃
  if (!/^[A-Za-z](?:[\s,，、]*[A-Za-z])*$/.test(s)) return [];
  return s.toUpperCase().match(/[A-Z]/g) ?? [];
}

/** 一条 `quiz[]` 记录 → `VideoQuiz`；拿不到答案就返回 null（宁可留着给用户，也不瞎猜） */
function toVideoQuiz(raw: unknown): VideoQuiz | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o['id'] ?? '');
  if (id === '') return null;

  const letters = lettersOf(o['eanswer'] ?? '');
  const fallback = letters.length > 0 ? letters : lettersOf(o['answer'] ?? '');
  if (fallback.length === 0) return null;

  return { id, letters: fallback };
}

/**
 * 读出页面上所有视频小测的答案，按 `id` 索引。
 *
 * 先用最精确的选择器（`[uooc-video][source]`，实测的视频容器），拿不到再退到
 * 「任何带 `source` 且里面写着 `"quiz"` 的元素」—— 站点换模板时不至于直接失效。
 */
function videoQuizAnswers(): Map<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();

  for (const sel of [VIDEO_SOURCE_SEL, ANY_SOURCE_SEL]) {
    for (const el of document.querySelectorAll(sel)) {
      const raw = el.getAttribute('source');
      if (raw === null || !raw.includes('"quiz"')) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        log.warn('视频容器的 source 属性不是合法 JSON，跳过');
        continue;
      }
      if (parsed === null || typeof parsed !== 'object') continue;

      const quiz = (parsed as Record<string, unknown>)['quiz'];
      if (!Array.isArray(quiz)) continue;

      for (const item of quiz) {
        const q = toVideoQuiz(item);
        if (q !== null && !out.has(q.id)) out.set(q.id, q.letters);
      }
    }
    if (out.size > 0) break;
  }

  return out;
}

/** 一次作答的结果，只用于日志与返回值 */
export interface VideoQuizOutcome {
  /** 这一层里认出来的题数 */
  readonly questions: number;
  /** 成功点选的题数 */
  readonly answered: number;
  /** 有没有点下去「确定」 */
  readonly sure: boolean;
}

/**
 * 处理一个弹层：按 `answer_<id>` 把题对回答案 → 点选 → 点「确定」。
 *
 * 不抛异常。可能返回 `null`（这一层还没渲染出选项，等下一轮扫描再看）。
 */
async function answerVideoQuizLayer(layer: HTMLElement): Promise<VideoQuizOutcome | null> {
  const inputs = Array.from(layer.querySelectorAll<HTMLInputElement>(INPUT_SEL));
  if (inputs.length === 0) return null; // 还没渲染出来，下一轮再说

  const answers = videoQuizAnswers();
  if (answers.size === 0) {
    log.warn('弹层里有题，但页面上找不到 quiz 数据（视频容器的 source 属性变了？），留给用户');
    return null;
  }

  // 按 quizId 分组：单选一组一个 input，多选一组多个
  const groups = new Map<string, HTMLInputElement[]>();
  for (const inp of inputs) {
    const m = ANSWER_ID_RE.exec(inp.name);
    if (m === null || m[1] === undefined) continue;
    const key = m[1];
    const arr = groups.get(key);
    if (arr === undefined) groups.set(key, [inp]);
    else arr.push(inp);
  }

  let answered = 0;
  let missing = 0;
  for (const [id, list] of groups) {
    const want = answers.get(id);
    if (want === undefined) {
      missing += 1;
      log.warn(`小测 ${id} 在页面的 quiz 数据里找不到，留给用户`);
      continue;
    }
    const wantSet = new Set(want.map((s) => s.toUpperCase()));
    let hit = 0;
    for (const inp of list) {
      if (!wantSet.has(inp.value.toUpperCase())) continue;
      if (!inp.checked) inp.click();
      hit += 1;
    }
    if (hit > 0) answered += 1;
    else {
      missing += 1;
      log.warn(`小测 ${id} 的答案 [${want.join(',')}] 在选项里找不到对应项，留给用户`);
    }
  }

  if (answered === 0) return { questions: groups.size, answered: 0, sure: false };

  const box = layer.closest('.layui-layer') ?? layer;
  const sure =
    box.querySelector<HTMLElement>(SURE_SEL) ?? box.querySelector<HTMLElement>(SURE_FALLBACK_SEL);
  if (sure === null) {
    log.warn('小测弹层里没有【确定】按钮，答案已选好，请你点一下');
    return { questions: groups.size, answered, sure: false };
  }

  layer.setAttribute(DONE_ATTR, '1');
  sure.click();
  log.info(
    `视频小测已作答：${answered}/${groups.size} 题（${missing} 题没对上），已点【确定】`,
  );

  // 点完再看一眼：还在就说明没点掉（答案不对 / 按钮变灰），只报告不重试
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, AFTER_SURE_MS);
  });
  if (layer.isConnected) {
    log.warn('点了【确定】但小测弹层还在 —— 可能答案不对，交给用户处理（不重试）');
  }

  return { questions: groups.size, answered, sure: true };
}

/**
 * 启动视频小测助手。
 *
 * @returns 卸载函数
 */
export function startVideoQuiz(): () => void {
  let timer: number | null = null;
  let stopped = false;

  const scan = (): void => {
    if (stopped) return;
    for (const el of document.querySelectorAll<HTMLElement>(LAYER_SEL)) {
      if (el.hasAttribute(DONE_ATTR)) continue;
      void answerVideoQuizLayer(el);
    }
  };

  const schedule = (): void => {
    if (stopped || timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      scan();
    }, RESCAN_DEBOUNCE_MS);
  };

  scan();

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  // 站内 hash 路由换集不重载页面
  window.addEventListener('hashchange', schedule);

  log.debug('视频小测助手已挂载（读 DOM 里的答案，无声作答）');

  return () => {
    stopped = true;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    observer.disconnect();
    window.removeEventListener('hashchange', schedule);
  };
}

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
 * - 由【AI 作答】页的「自动提交视频小题」控制。
 * - **不猜**：找不到答案的题一律原样留着等用户，绝不点第一项糊过去。
 * - **不发请求**：视频小测没有对应的后端接口，走 LLM 是另一条路（`ai/`），本文件不碰。
 */

import { scoped } from '../../common/core/log.ts';
import { isEnabled, subscribeToggle } from '../../common/core/settings.ts';
import { SITE_ID, TOGGLE } from './settings.ts';

const log = scoped('uooc/video-quiz');

/** 弹层本体。站点用 layui，`#quizLayer` 是题目容器 */
const LAYER_SEL = '#quizLayer';
/** 打上就代表这一层已经处理过（同一层不重复点，防抖动/防双触发） */
const DONE_ATTR = 'data-sztb-quiz-done';
/** 选项的 id 前缀：`name="answer_<quizId>"` */
const INPUT_SEL = 'input[name^="answer_"]';
const ANSWER_ID_RE = /^answer_(.+)$/;
/** 站内「确定」按钮（两个都留：前者是语义选择器，后者是实测类名） */
const SURE_SEL = '[ng-click*="sureAnswer"]';
const SURE_FALLBACK_SEL = 'button.btn.btn-success.fl_right';
/** 找视频容器的 `source` 属性：先精确、再放宽 */
const VIDEO_SOURCE_SEL = '[uooc-video][source]';
const ANY_SOURCE_SEL = '[source]';

/** DOM 变动去抖（与 `video.ts` 同一口径） */
const RESCAN_DEBOUNCE_MS = 200;
/** 分开点选和确认，给站点时间同步小测答案。 */
const ANSWER_SETTLE_MS = 300;
/** 点完「确定」后再看一眼的间隔：还在就说明没点掉（答案不对 / 按钮变灰） */
const AFTER_SURE_MS = 800;

/** 从 `source` 属性里抽出的一条小测 */
interface VideoQuiz {
  readonly id: string;
  readonly letters: readonly string[];
}

function isVisible(element: HTMLElement): boolean {
  const { width, height } = element.getBoundingClientRect();
  return width > 0 && height > 0 &&
    !element.closest('[hidden], [aria-hidden="true"]') &&
    (element.checkVisibility?.({ visibilityProperty: true, opacityProperty: true }) ?? true);
}

function isVideoQuizOpen(layer: HTMLElement): boolean {
  if (!isVisible(layer)) return false;
  const { top, right, bottom, left } = layer.getBoundingClientRect();
  // 站点关闭弹窗后会把题目容器放回播放器下方，容器仍有尺寸，但已离开视口。
  return bottom > 0 && right > 0 && top < window.innerHeight && left < window.innerWidth;
}

export function hasOpenVideoQuiz(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(LAYER_SEL)).some(isVideoQuizOpen);
}

function findConfirm(layer: HTMLElement): HTMLElement | undefined {
  const box = layer.closest('.layui-layer') ?? layer;
  const usable = (button: HTMLElement): boolean =>
    isVisible(button) && !button.closest(':disabled, [aria-disabled="true"], .layui-btn-disabled, .disabled');
  return Array.from(box.querySelectorAll<HTMLElement>(SURE_SEL))
    .find((button) => /^\s*(?:vm\.)?sureAnswer\s*\(/.test(button.getAttribute('ng-click') ?? '') && usable(button)) ??
    Array.from(box.querySelectorAll<HTMLElement>(SURE_FALLBACK_SEL)).find(usable) ??
    Array.from(box.querySelectorAll<HTMLElement>('.layui-layer-btn .layui-layer-btn0'))
      .find((button) => /^(?:确定|确认|提交)$/.test(button.textContent?.trim() ?? '') && usable(button));
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

/**
 * 处理一个弹层：按 `answer_<id>` 把题对回答案 → 点选 → 点「确定」。
 */
async function answerVideoQuizLayer(
  layer: HTMLElement,
  readyAfter: WeakMap<HTMLElement, number>,
  schedule: () => void,
): Promise<void> {
  const inputs = Array.from(layer.querySelectorAll<HTMLInputElement>(INPUT_SEL));
  if (inputs.length === 0) return; // 还没渲染出来，下一轮再说

  const answers = videoQuizAnswers();
  if (answers.size === 0) {
    log.warn('弹层里有题，但页面上找不到 quiz 数据（视频容器的 source 属性变了？），留给用户');
    return;
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

  const selections = new Map<HTMLInputElement, boolean>();
  for (const [id, list] of groups) {
    const want = answers.get(id);
    if (want === undefined) return;
    const wantSet = new Set(want);
    const match = list.filter((inp) => wantSet.has(inp.value.toUpperCase()));
    if (match.length !== wantSet.size || (list.some((inp) => inp.type === 'radio') && match.length !== 1)) return;
    for (const inp of list) {
      selections.set(inp, match.includes(inp));
    }
  }

  if (selections.size === 0) return;
  let changed = false;
  for (const [inp, checked] of selections) {
    if (inp.checked !== checked && (checked || inp.type === 'checkbox')) {
      inp.click();
      changed ||= inp.checked === checked;
    }
  }
  if (changed || !readyAfter.has(layer)) readyAfter.set(layer, performance.now() + ANSWER_SETTLE_MS);
  if (performance.now() < (readyAfter.get(layer) ?? 0)) {
    schedule();
    return;
  }
  if ([...selections].some(([inp, checked]) => !inp.isConnected || inp.checked !== checked)) return;

  const sure = findConfirm(layer);
  if (sure === undefined) return;

  layer.setAttribute(DONE_ATTR, '1');
  sure.click();
  log.info(`视频小测已点【确定】，共 ${groups.size} 题`);

  // 点完再看一眼：还在就说明没点掉（答案不对 / 按钮变灰），只报告不重试
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, AFTER_SURE_MS);
  });
  if (layer.isConnected && isVideoQuizOpen(layer)) {
    log.warn('点了【确定】但小测弹层还在 —— 可能答案不对，交给用户处理（不重试）');
  }

}

/**
 * 启动视频小测助手。
 *
 * @returns 卸载函数
 */
export function startVideoQuiz(): () => void {
  let timer: number | null = null;
  let stopped = false;
  const readyAfter = new WeakMap<HTMLElement, number>();

  const scan = (): void => {
    if (stopped || !isEnabled(SITE_ID, TOGGLE.VIDEO_QUIZ_AUTO_SUBMIT)) return;
    for (const el of document.querySelectorAll<HTMLElement>(LAYER_SEL)) {
      if (!isVideoQuizOpen(el)) {
        readyAfter.delete(el);
        el.removeAttribute(DONE_ATTR);
        continue;
      }
      if (el.hasAttribute(DONE_ATTR)) continue;
      void answerVideoQuizLayer(el, readyAfter, schedule);
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
  const unsubscribe = subscribeToggle(SITE_ID, TOGGLE.VIDEO_QUIZ_AUTO_SUBMIT, schedule);

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled', 'aria-disabled', 'source', 'ng-click'],
  });
  // 站内 hash 路由换集不重载页面
  window.addEventListener('hashchange', schedule);

  log.debug('视频小测助手已挂载');

  return () => {
    stopped = true;
    unsubscribe();
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    observer.disconnect();
    window.removeEventListener('hashchange', schedule);
  };
}

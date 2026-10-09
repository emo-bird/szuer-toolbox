/**
 * 试卷 iframe 的进度遮罩（用户 m02281 第 1 条）。
 *
 * 试卷是**页内同源 iframe**（`/exam/{tid}`），所以遮罩**直接注入 iframe 内部**
 * （用户选 A2）—— 位置天然跟着试卷走，不用监听 resize/scroll 去对齐外层。
 *
 * ⚠️ **2026-10-09 用户反馈「遮罩被刷掉」的两个真因**（都跟 iframe 的生命周期有关）：
 * 1. **挂早了**：`quizOverlayOpen()` 在拉到试卷的那一刻就执行，而此刻 iframe 可能还停在
 *    `about:blank` 或刚发起导航 ⇒ 我们那块挂在**一份马上就被换掉的 document** 上。
 *    现在等站点的题目容器 `div.queContainer` 出现（与 `fill.ts` 同一份契约）才挂，
 *    超时（`WAIT_TIMEOUT_MS`）仍挂上并记一条 warn —— 看不到进度比「可能被刷掉」更糟。
 * 2. **挂回去也看不见**：重挂写的是 `o.doc.body.appendChild(...)`，而 `doc` 是**开遮罩那一刻
 *    缓存下来的**。iframe 一导航，那份 document 就作废了，重挂等于挂进一个死文档。
 *    现在**每次都现取** `frame.contentDocument`，并用 `appendChild` 的隐式 adopt
 *    （同源，允许）把节点搬进当前那份。
 * 3. 兜底：一个 250ms 的巡检同时管三件事 —— 等就绪、补挂、iframe 换 document 后重挂。
 *    用轮询而不是 `MutationObserver`，正是因为**导航会换 document**，观察器本身也得跟着重装，
 *    轮询把「换 document」这件事一并解决，且只有几行。
 *
 * 行为口径（全部来自用户 m02281 的拍板）：
 * - 内容 = 阶段一句话 + 「第 N/M 题」 + 进度条 + **每题一行的小列表**（C2）
 * - 走到「已点提交，等你过人机验证码」这一段**自动让开**，截获到交卷响应再回来（B1）
 * - 右上角「隐藏遮罩」；点掉之后**本次测验内不再出现**，下一个任务点自动恢复（F1）
 */

import { scoped } from '../../../common/core/log.ts';
import { waitTimeoutMs } from '../settings.ts';
import {
  QUIZ_PHASE_TEXT,
  QUESTION_STATUS_TEXT,
  monitorState,
  subscribeMonitor,
  type QuestionProgress,
} from './monitor.ts';

const log = scoped('uooc/quiz-overlay');

/**
 * 「试卷渲染好了没」的判据：站点的题目容器。
 *
 * 与 `fill.ts:404-427` 用的是**同一份契约**（`div.queContainer > div.queBox > div.smallTest
 * > input[name="<qid>"]`），实测那次采样里 5 组。**故意只要求容器出现**，不要求题目齐全 ——
 * 遮罩只需要知道「站点已经渲染过」，题目少几道不影响它显示进度。
 */
const READY_SELECTOR = 'div.queContainer';

/**
 * 巡检间隔（毫秒）。
 *
 * 一次 `querySelector` + 两个布尔判断，按秒级跑完全无感；换来的是一件事：
 * **iframe 导航会换 document**，观察器得跟着重装，而轮询天然免疫。
 */
const POLL_MS = 250;

/** 跟着试卷走的那块遮罩 */
interface Overlay {
  readonly tid: string;
  /** 试卷 iframe —— 每次要挂之前都现取它的 `contentDocument`（导航会换） */
  readonly frame: HTMLIFrameElement;
  readonly node: HTMLElement;
  /** 动态区（阶段/进度/题目列表），每次渲染重建，静态的头部与底部不重建 */
  readonly live: HTMLElement;
  /** 用户点过「隐藏遮罩」 */
  hidden: boolean;
  off: (() => void) | null;
  /** 巡检定时器（关遮罩时清掉） */
  timer: number | null;
  /** 就绪等待的截止时刻（毫秒时间戳） */
  deadline: number;
  /** 「等到超时仍没就绪」的告警只发一次 */
  warnedLate: boolean;
  /** 当前挂在哪份 document 上（iframe 导航后会换） */
  attached: Document | null;
}

let cur: Overlay | null = null;

const ROOT_CSS = [
  'position:fixed',
  'inset:0',
  'z-index:2147483000',
  'box-sizing:border-box',
  'display:flex',
  'flex-direction:column',
  'gap:10px',
  'padding:18px 20px',
  'background:rgba(17,21,27,.9)',
  'color:#f2f4f7',
  'font:13px/1.55 -apple-system,"Segoe UI",system-ui,sans-serif',
].join(';');

const HIDE_BTN_CSS = [
  'flex:none',
  'cursor:pointer',
  'border:1px solid rgba(255,255,255,.35)',
  'border-radius:6px',
  'background:transparent',
  'color:#f2f4f7',
  'font:12.5px/1 inherit',
  'padding:7px 12px',
].join(';');

const BAR_CSS = 'height:6px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden';
const BAR_FILL_CSS = 'height:100%;width:0;background:#3b82f6;transition:width .2s ease';
const LIST_CSS = [
  'flex:1',
  'min-height:0',
  'overflow:auto',
  'border:1px solid rgba(255,255,255,.14)',
  'border-radius:8px',
  'padding:6px 10px',
  'font-size:12.5px',
  'line-height:1.75',
].join(';');

/** `el()` 用的是顶层 `document`，这里必须用**试卷自己的** document，所以单独来一个 */
function mk<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  css: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function questionLine(doc: Document, q: QuestionProgress): HTMLElement {
  const status = QUESTION_STATUS_TEXT[q.status];
  const answer = q.answer === '' ? '—' : q.answer;
  const tail = q.note === '' ? '' : `（${q.note}）`;
  return mk(
    doc,
    'div',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
    `#${q.no} [${q.typeText}] ${status} → ${answer} · 请求 ${q.requests} 次${tail}`,
  );
}

function buildRoot(doc: Document): { node: HTMLElement; live: HTMLElement } {
  const node = mk(doc, 'div', ROOT_CSS);
  node.setAttribute('data-sztb', 'quiz-overlay');

  const head = mk(doc, 'div', 'display:flex;align-items:center;gap:10px');
  head.appendChild(mk(doc, 'div', 'flex:1;font-weight:600;font-size:14px', '脚本正在作答这张试卷'));
  const hide = mk(doc, 'button', HIDE_BTN_CSS, '隐藏遮罩');
  hide.setAttribute('type', 'button');
  hide.addEventListener('click', () => {
    if (cur === null) return;
    cur.hidden = true;
    log.info('用户点了【隐藏遮罩】，本次测验内不再显示');
    render(cur);
  });
  head.appendChild(hide);
  node.appendChild(head);

  const live = mk(doc, 'div', 'display:flex;flex-direction:column;gap:10px;flex:1;min-height:0');
  node.appendChild(live);

  node.appendChild(
    mk(
      doc,
      'div',
      'flex:none;font-size:12px;opacity:.72',
      '遮罩只挡视线，不影响脚本作答；走到「等你过人机验证码」那一步会自动让开。',
    ),
  );
  return { node, live };
}

/**
 * 取 iframe **当前**那份 document。
 *
 * 必须现取：iframe 一导航就换 document，缓存下来的那份是死文档（挂进去永远不可见）。
 * 跨域取 `contentDocument` 会抛，试卷是同源 iframe，真抛了就当没准备好。
 */
function frameDoc(o: Overlay): Document | null {
  let doc: Document | null = null;
  try {
    doc = o.frame.contentDocument;
  } catch {
    return null;
  }
  return doc === null || doc.body === null ? null : doc;
}

/**
 * 把节点挂到 iframe 当前那份 document 上（没挂 / 被抹掉 / 换了 document 都走这里）。
 *
 * 节点原本属于哪份 document 都行 —— `appendChild` 会隐式 adopt（同源 iframe 允许），
 * 这也是「iframe 导航后遮罩还能回来」的关键。
 *
 * @returns 挂上了返回 true
 */
function ensureAttached(o: Overlay): boolean {
  const doc = frameDoc(o);
  if (doc === null) return false;
  if (o.attached !== doc) {
    if (o.attached !== null) log.info('试卷 iframe 换了 document，遮罩已挂到新页面上');
    doc.body!.appendChild(o.node);
    o.attached = doc;
    return true;
  }
  if (!o.node.isConnected) {
    doc.body!.appendChild(o.node);
    log.debug('遮罩被站点重渲染抹掉，已重新挂回');
    return true;
  }
  return false;
}

/**
 * 巡检该干什么 —— 抽成纯函数只为**能上单测**（DOM 侧的东西在 Node 里测不了）。
 *
 * 口径（用户 2026-10-09 拍板）：**就绪才挂**；等到超时仍没就绪则**照样挂**，
 * 因为「看不到进度」比「可能被站点刷掉一次」更糟。
 */
export function overlayStep(ready: boolean, now: number, deadline: number): 'attach' | 'attach-late' | 'wait' {
  if (ready) return 'attach';
  return now >= deadline ? 'attach-late' : 'wait';
}

/** 巡检：等就绪 → 挂上 → 之后一直盯着（被抹掉就补挂，换 document 就搬过去） */
function poll(o: Overlay): void {
  if (cur !== o) return;

  const doc = frameDoc(o);
  const ready = doc !== null && doc.querySelector(READY_SELECTOR) !== null;

  switch (overlayStep(ready, Date.now(), o.deadline)) {
    case 'attach':
      // 站点已经渲染过试卷了，挂上（被抹掉/换了 document 都会在这里被补回来）
      if (ensureAttached(o)) render(o);
      return;

    case 'wait':
      // 还没就绪：**先不挂**（挂早了会被站点自己的首次渲染刷掉）
      return;

    default:
      // 等到超时仍没就绪 ⇒ 照样挂，但如实告警一次
      if (!o.warnedLate) {
        o.warnedLate = true;
        log.warn(
          `等题目 DOM 超时（${waitTimeoutMs()} ms）仍没见到 ${READY_SELECTOR}，先把遮罩挂上（站点重渲染时会被刷掉一次）`,
        );
      }
      if (ensureAttached(o)) render(o);
      return;
  }
}

function render(o: Overlay): void {
  const doc = frameDoc(o) ?? o.node.ownerDocument;
  const state = monitorState();
  // 监视状态里那份必须是**这张试卷**的，否则（换了一场测验）不该拿别人的进度来显示
  const quiz = state.quiz !== null && state.quiz.tid === o.tid ? state.quiz : null;
  const phase = quiz === null ? 'idle' : quiz.phase;
  // 到「已点提交、等你过验证码」这一段自动让开（B1）；用户点过隐藏就一直藏着（F1）
  const submitting = phase === 'submitting';
  const visible = !o.hidden && !submitting;

  ensureAttached(o);
  o.node.style.setProperty('display', visible ? 'flex' : 'none');
  if (!visible) return;

  o.live.textContent = '';
  if (quiz === null) return;

  o.live.appendChild(mk(doc, 'div', 'font-weight:600;font-size:14px', QUIZ_PHASE_TEXT[quiz.phase]));
  if (quiz.message !== '') {
    o.live.appendChild(mk(doc, 'div', 'opacity:.85', quiz.message));
  }
  o.live.appendChild(
    mk(
      doc,
      'div',
      'opacity:.85',
      `第 ${quiz.done}/${quiz.total} 题已定稿 · 任务 tid=${quiz.tid}${o.hidden ? ' · 遮罩已隐藏' : ''}`,
    ),
  );

  const bar = mk(doc, 'div', BAR_CSS);
  const fill = mk(doc, 'div', BAR_FILL_CSS);
  const pct = quiz.total <= 0 ? 0 : Math.round((quiz.done / quiz.total) * 100);
  fill.style.setProperty('width', `${pct}%`);
  bar.appendChild(fill);
  o.live.appendChild(bar);

  const list = mk(doc, 'div', LIST_CSS);
  if (quiz.questions.length === 0) {
    list.appendChild(mk(doc, 'div', 'opacity:.7', '还没读到题目'));
  } else {
    for (const q of quiz.questions) list.appendChild(questionLine(doc, q));
  }
  o.live.appendChild(list);
}

/**
 * 开始给这份试卷盖遮罩。新的一次测验会重置「隐藏」状态（F1）。
 *
 * **不立刻挂** —— 先等 iframe 里的题目 DOM（`div.queContainer`）出现，
 * 否则站点自己的首次渲染会把我们那块刷掉（用户 2026-10-09 反馈）。
 * 函数本身仍是同步返回：遮罩只是给人看的，**不许**阻塞作答流程。
 */
export function quizOverlayOpen(frame: HTMLIFrameElement | null, tid: string): void {
  quizOverlayClose();
  if (frame === null) {
    log.info('整页答题页（页面上没有试卷 iframe），本次不盖遮罩');
    return;
  }

  // 先在某份 document 上把节点建好（拿不到 iframe 的 doc 就用顶层这份），
  // 真正挂上去的时候 appendChild 会把它 adopt 过去
  const seed = frame.contentDocument ?? document;
  const { node, live } = buildRoot(seed);
  const o: Overlay = {
    tid,
    frame,
    node,
    live,
    hidden: false,
    off: null,
    timer: null,
    deadline: Date.now() + waitTimeoutMs(),
    warnedLate: false,
    attached: null,
  };
  cur = o;

  o.off = subscribeMonitor(() => {
    try {
      render(o);
    } catch (err) {
      log.warn('遮罩渲染抛错', String(err));
    }
  });

  // 巡检：等就绪 → 挂上 → 之后一直盯着（补挂 / 搬 document）
  o.timer = window.setInterval(() => {
    try {
      poll(o);
    } catch (err) {
      log.warn('遮罩巡检抛错', String(err));
    }
  }, POLL_MS);
  poll(o);

  log.info(`已开始等试卷 tid=${tid} 的题目 DOM 出现（判据 ${READY_SELECTOR}），就绪后再盖遮罩`);
}

/** 关掉并移除遮罩（测验结束/停止接管时调） */
export function quizOverlayClose(): void {
  const o = cur;
  if (o === null) return;
  cur = null;
  o.off?.();
  o.off = null;
  if (o.timer !== null) {
    window.clearInterval(o.timer);
    o.timer = null;
  }
  o.node.remove();
}

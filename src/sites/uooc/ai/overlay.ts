/**
 * 试卷 iframe 的进度遮罩（用户 m02281 第 1 条）。
 *
 * 试卷是**页内同源 iframe**（`/exam/{tid}`），所以遮罩**直接注入 iframe 内部**
 * （用户选 A2）—— 位置天然跟着试卷走，不用监听 resize/scroll 去对齐外层。
 * 代价是站点自己重渲染试卷时会把我们那块抹掉，所以每次渲染都查一遍
 * `node.isConnected`，掉了就重新挂回去。
 *
 * 行为口径（全部来自用户 m02281 的拍板）：
 * - 内容 = 阶段一句话 + 「第 N/M 题」 + 进度条 + **每题一行的小列表**（C2）
 * - 走到「已点提交，等你过人机验证码」这一段**自动让开**，截获到交卷响应再回来（B1）
 * - 右上角「隐藏遮罩」；点掉之后**本次测验内不再出现**，下一个任务点自动恢复（F1）
 */

import { scoped } from '../../../common/core/log.ts';
import {
  QUIZ_PHASE_TEXT,
  QUESTION_STATUS_TEXT,
  monitorState,
  subscribeMonitor,
  type QuestionProgress,
} from './monitor.ts';

const log = scoped('uooc/quiz-overlay');

/** 跟着试卷走的那块遮罩 */
interface Overlay {
  readonly tid: string;
  readonly doc: Document;
  readonly node: HTMLElement;
  /** 动态区（阶段/进度/题目列表），每次渲染重建，静态的头部与底部不重建 */
  readonly live: HTMLElement;
  /** 用户点过「隐藏遮罩」 */
  hidden: boolean;
  off: (() => void) | null;
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

function render(o: Overlay): void {
  const state = monitorState();
  // 监视状态里那份必须是**这张试卷**的，否则（换了一场测验）不该拿别人的进度来显示
  const quiz = state.quiz !== null && state.quiz.tid === o.tid ? state.quiz : null;
  const phase = quiz === null ? 'idle' : quiz.phase;
  // 到「已点提交、等你过验证码」这一段自动让开（B1）；用户点过隐藏就一直藏着（F1）
  const submitting = phase === 'submitting';
  const visible = !o.hidden && !submitting;

  if (!o.node.isConnected) {
    // 站点把试卷重渲染了，我们那块被抹掉 —— 挂回去
    const body = o.doc.body;
    if (body === null) return;
    body.appendChild(o.node);
    log.debug('遮罩被站点重渲染抹掉，已重新挂回');
  }
  o.node.style.setProperty('display', visible ? 'flex' : 'none');
  if (!visible) return;

  o.live.textContent = '';
  if (quiz === null) return;

  o.live.appendChild(mk(o.doc, 'div', 'font-weight:600;font-size:14px', QUIZ_PHASE_TEXT[quiz.phase]));
  if (quiz.message !== '') {
    o.live.appendChild(mk(o.doc, 'div', 'opacity:.85', quiz.message));
  }
  o.live.appendChild(
    mk(
      o.doc,
      'div',
      'opacity:.85',
      `第 ${quiz.done}/${quiz.total} 题已定稿 · 任务 tid=${quiz.tid}${o.hidden ? ' · 遮罩已隐藏' : ''}`,
    ),
  );

  const bar = mk(o.doc, 'div', BAR_CSS);
  const fill = mk(o.doc, 'div', BAR_FILL_CSS);
  const pct = quiz.total <= 0 ? 0 : Math.round((quiz.done / quiz.total) * 100);
  fill.style.setProperty('width', `${pct}%`);
  bar.appendChild(fill);
  o.live.appendChild(bar);

  const list = mk(o.doc, 'div', LIST_CSS);
  if (quiz.questions.length === 0) {
    list.appendChild(mk(o.doc, 'div', 'opacity:.7', '还没读到题目'));
  } else {
    for (const q of quiz.questions) list.appendChild(questionLine(o.doc, q));
  }
  o.live.appendChild(list);
}

/** 开始给这份试卷盖遮罩。新的一次测验会重置「隐藏」状态（F1） */
export function quizOverlayOpen(frame: HTMLIFrameElement | null, tid: string): void {
  quizOverlayClose();
  const doc = frame === null ? null : frame.contentDocument;
  if (doc === null || doc.body === null) {
    log.warn('拿不到试卷 iframe 的 document，本次不盖遮罩（不影响作答）');
    return;
  }
  const { node, live } = buildRoot(doc);
  doc.body.appendChild(node);
  const o: Overlay = { tid, doc, node, live, hidden: false, off: null };
  cur = o;
  o.off = subscribeMonitor(() => {
    try {
      render(o);
    } catch (err) {
      log.warn('遮罩渲染抛错', String(err));
    }
  });
  render(o);
  log.info(`已给试卷 tid=${tid} 盖上进度遮罩`);
}

/** 关掉并移除遮罩（测验结束/停止接管时调） */
export function quizOverlayClose(): void {
  const o = cur;
  if (o === null) return;
  cur = null;
  o.off?.();
  o.off = null;
  o.node.remove();
}

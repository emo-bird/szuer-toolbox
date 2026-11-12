/**
 * UOOC 的【监视】标签页 —— 提示历史 + 连播走到哪儿了 + AI 答题答到哪儿了。
 *
 * 需求细则 §C.6（用户 m04879 第 5 条）。数据源是 `ai/monitor.ts` 那个仓库，
 * 本文件**只负责画**：订阅 → 重画。不持有任何状态，
 * 所以关掉面板再打开，看到的还是最新进度。
 *
 * 四条表现约定：
 *  - **【接管状态】永远在第一块**（用户 m02281 第 2 条）：大字是接管状态行原文，
 *    下面是提示历史（时间 + 级别 + 文案，最新的在上）；
 *  - 课程进度 = **当前位置 index / 该层总数**（用户拍板口径），外加一句人话标题；
 *  - 答题进度 = 每一题一行：题号 / 题型 / 状态 / 请求次数 / 每次答案 / 定稿答案 / 备注；
 *    逐题一有结果就立刻刷新（不攒到最后）；
 *  - 全部只读 —— 这里是观察窗口，改答案去页面改，停止连播去【接管】页。
 */

import { scoped } from '../../../common/core/log.ts';
import { el } from '../../../common/utils/dom.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { SITE_ID } from '../settings.ts';
import {
  QUIZ_PHASE_TEXT,
  QUESTION_STATUS_TEXT,
  monitorState,
  subscribeMonitor,
  type QuestionProgress,
} from '../ai/monitor.ts';
import { isCurrentRow, type CourseRow } from '../catalog.ts';
import { clockText, noticeList, subscribeNotice, type Notice } from '../notice.ts';
import { subscribeTakeover, takeoverStatus } from '../takeover.ts';
import {
  applyReviewedAnswer, isQuizRunning, markReviewedAnswer, quizTidOnPage, runQuizAnswer,
  subscribeQuizRun, undoReviewedAnswers,
} from '../ai/index.ts';
import { currentReview, locateReviewQuestion, saveReviewDraft } from '../ai/review.ts';
import { isAnswerable } from '../ai/paper.ts';

const log = scoped('uooc/monitor-tab');

/** 提示历史每行前面的级别记号 */
const KIND_MARK: Record<Notice['kind'], string> = {
  info: '·',
  success: '✔',
  warn: '!',
  error: '✘',
};

/** 一条进度条（`done / total`） */
function bar(done: number, total: number): HTMLElement {
  const pct = total <= 0 ? 0 : Math.round((done / total) * 100);
  const fill = el('div', { class: 'sztb-bar-fill' });
  fill.style.width = `${pct}%`;
  return el(
    'div',
    { class: 'sztb-field' },
    el('div', { class: 'sztb-field-desc', text: `${done} / ${total}（${pct}%）` }),
    el('div', { class: 'sztb-bar' }, fill),
  );
}

/**
 * 「章 → 节 → 任务点」分层列表（§E.2）。
 *
 * 勾：✅ 完成 / ⬜ 未完成；章与「只是容器」的节不画勾（`done === null`）。
 * 当前正在处理的那一项按 `currentId` 命中 `ids` 高亮 —— 章、节也会被点亮，
 * 因为同一时刻你既想知道「现在在哪一段」又想知道「具体哪一项」。
 */
function courseTree(rows: readonly CourseRow[], currentId: string | null): HTMLElement {
  const box = el('div', { class: 'sztb-tree' });
  for (const row of rows) {
    const mark = row.done === null ? '　' : row.done ? '✅' : '⬜';
    const type = row.typeName === '' ? '' : `[${row.typeName}] `;
    const line = el('div', {
      class: 'sztb-tree-row',
      attrs: { 'data-depth': String(row.depth), 'data-current': String(isCurrentRow(row, currentId)) },
    });
    if (row.depth > 0) line.style.paddingLeft = `${4 + row.depth * 14}px`;
    line.appendChild(el('span', { class: 'sztb-tree-mark', text: mark }));
    line.appendChild(el('span', { text: `${type}${row.label}` }));
    box.appendChild(line);
  }
  return box;
}

const REVIEW_CSS = `
.sztb-review { display: grid; gap: 8px; container-type: inline-size; }
.sztb-review-actions { display: flex; flex-wrap: wrap; gap: 5px; }
.sztb-review-row { border: 1px solid var(--sztb-border); border-radius: 6px; padding: 7px 9px; }
.sztb-review-row summary { cursor: pointer; overflow-wrap: anywhere; }
.sztb-review-row p { margin: 4px 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.sztb-review-list { display: grid; gap: 6px; }
.sztb-review-status { font-size: .92em; color: var(--sztb-text); white-space: pre-line; }
@container (min-width: 530px) { .sztb-review-list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
`;

function mountReview(root: HTMLElement, ctx: TabContext): { draw: () => void; dispose: () => void } {
  const summary = el('div', { class: 'sztb-review-status', attrs: { role: 'status' } });
  const feedback = el('div', { class: 'sztb-review-status', attrs: { role: 'status' } });
  const list = el('div', { class: 'sztb-review-list' });
  const progress = el('progress', { attrs: { value: 0, max: 1, 'aria-label': '试卷处理进度' },
    style: { width: '100%' } });
  const filter = el('select', { class: 'sztb-input', attrs: { 'aria-label': '筛选题目' } },
    el('option', { text: '全部题目', attrs: { value: 'all' } }),
    el('option', { text: '需处理的题目', attrs: { value: 'attention' } }),
  );
  let busy = false;
  let disposed = false;
  let startedAt = 0;

  const action = (text: string, run: () => string | void | Promise<string | void>, danger = false): HTMLButtonElement =>
    el('button', {
      class: 'sztb-btn', text, attrs: { type: 'button', 'data-variant': danger ? 'danger' : undefined },
      on: { click: () => {
        if (busy || disposed) return;
        busy = true;
        feedback.textContent = '';
        draw();
        void Promise.resolve().then(run).then((message) => {
          if (!disposed && message !== undefined) feedback.textContent = message;
        }).catch((err: unknown) => {
          if (!disposed) feedback.textContent = err instanceof Error ? err.message : String(err);
        }).finally(() => { busy = false; if (!disposed) draw(); });
      } },
    });

  const runReview = async (intent: 'draft' | 'submit' | { ids: readonly string[] }): Promise<string | void> => {
    const tid = quizTidOnPage();
    if (tid === null) return '请先打开一张试卷';
    await runQuizAnswer(tid, ctx.host, undefined, intent);
  };

  const retry = action('仅重试失败题', async () => {
    const failed = monitorState().quiz?.questions.filter((q) => q.status === 'failed') ?? [];
    if (failed.length === 0) return '没有失败题';
    const entries = currentReview()?.entries;
    const ids: string[] = [];
    let reapplied = 0;
    for (const q of failed) {
      if (entries?.get(q.qid)?.suggestion === undefined) ids.push(q.qid);
      else if (await applyReviewedAnswer(q.qid, ctx.host)) reapplied += 1;
    }
    if (ids.length > 0) return runReview({ ids });
    return reapplied > 0 ? `已重新回填 ${reapplied} 道题` : '已有建议未能回填，请定位原题检查';
  });
  const save = action('保存草稿', async () => {
    const review = currentReview();
    if (review === null) return '请先生成答案';
    const count = await saveReviewDraft(review);
    return count > 0 ? `已将 ${count} 道题的建议保存到本机` : '没有可保存的建议';
  });
  const restore = action('恢复草稿', () => runReview('draft'));
  const undo = action('撤销本次回填', () => {
    const count = undoReviewedAnswers();
    return count > 0 ? `已恢复 ${count} 道题的原答案` : '没有可撤销的回填，或页面答案已被修改';
  });
  const submit = action('提交当前答案', () => runReview('submit'), true);
  root.append(el('h3', { class: 'sztb-group-title', text: 'AI 答案审核' }), summary, progress,
    el('div', { class: 'sztb-review-actions' }, retry, save, restore, undo, submit), feedback, filter, list);

  function createRow(qid: string) {
    const title = el('summary');
    const body = el('p');
    const locate = action('定位原题', () => { if (!locateReviewQuestion(qid)) return '当前页面找不到该题'; });
    const generate = action('重新生成', () => runReview({ ids: [qid] }));
    const apply = action('应用建议', async () => (await applyReviewedAnswer(qid, ctx.host))
      ? '已将建议写入页面' : '未应用，页面答案可能已变动');
    const approve = action('标记已核对', () => markReviewedAnswer(qid) ? '已标记' : '请先在页面上完整填写该题');
    const undoOne = action('撤销回填', () => undoReviewedAnswers(qid) > 0 ? '已恢复原答案' : '页面答案已变动，无法撤销');
    const node = el('details', { class: 'sztb-review-row' }, title, body,
      el('div', { class: 'sztb-review-actions' }, locate, generate, apply, approve, undoOne));
    return { node, title, body, locate, generate, apply, approve, undoOne };
  }
  const rows = new Map<string, ReturnType<typeof createRow>>();
  let tid = '';

  function draw(): void {
    const quiz = monitorState().quiz;
    const review = currentReview();
    const running = isQuizRunning();
    const disabled = running || busy;
    if (running && startedAt === 0) startedAt = Date.now();
    if (!running) startedAt = 0;
    if ((quiz?.tid ?? '') !== tid) {
      tid = quiz?.tid ?? '';
      rows.clear();
      list.replaceChildren();
    }
    const questions = quiz?.questions ?? [];
    const count = (status: QuestionProgress['status']): number => questions.filter((q) => q.status === status).length;
    const execution = quiz?.execution;
    const executionText = execution === undefined ? '' : ` · 请求 ${execution.requests}${execution.budget > 0 ? `/${execution.budget}` : ''}` +
      (execution.usageResponses > 0 ? ` · ${execution.totalTokens} token（${execution.usageResponses} 次有统计）` : '');
    const activity = execution?.phase === 'requesting' ? ' · 请求模型' : execution?.phase === 'retrying'
      ? ' · 等待重试' : execution?.phase === 'parsing' ? ' · 解析答案' : execution?.phase === 'cache' ? ' · 命中缓存' : '';
    const text = quiz === null ? '打开测验后开始作答，或恢复本机草稿。'
      : `${QUIZ_PHASE_TEXT[quiz.phase]} · ${quiz.done}/${quiz.total} 已处理${executionText}${running ? activity : ''}` +
        (startedAt ? ` · 已运行 ${Math.floor((Date.now() - startedAt) / 1000)} 秒` : '') +
        `\n回填/核对 ${count('answered')} · 待核对 ${count('review')} · 失败 ${count('failed')} · 不支持 ${count('unsupported')}` +
        (quiz.message ? `\n${quiz.message}` : '');
    if (summary.textContent !== text) summary.textContent = text;
    progress.max = quiz?.total || 1;
    progress.value = quiz?.done ?? 0;
    const entries = review?.entries;
    retry.disabled = disabled || entries === undefined || count('failed') === 0;
    restore.disabled = disabled;
    save.disabled = disabled || entries === undefined || ![...entries.values()].some((entry) => entry.suggestion !== undefined);
    undo.disabled = disabled || entries === undefined || ![...entries.values()].some((entry) => entry.applied !== undefined);
    submit.disabled = disabled || entries === undefined || entries.size === 0;
    const activeIds = new Set(questions.map((q) => q.qid));
    for (const [id, row] of rows) {
      if (!activeIds.has(id)) { row.node.remove(); rows.delete(id); }
    }
    for (const q of questions) {
      let row = rows.get(q.qid);
      if (row === undefined) {
        row = createRow(q.qid);
        rows.set(q.qid, row);
        list.appendChild(row.node);
      }
      const entry = entries?.get(q.qid);
      row.node.hidden = filter.value === 'attention' && !q.incomplete && q.status !== 'review' && q.status !== 'failed';
      const title = `第 ${q.no} 题 · ${q.typeText || '题目'} · ${QUESTION_STATUS_TEXT[q.status]}` +
        (q.incomplete ? ' · 未填完整' : '');
      if (row.title.textContent !== title) row.title.textContent = title;
      const details = [
        q.answer ? `答案 ${q.answer}` : '',
        entry?.suggestion && entry.suggestion !== q.answer ? `AI 建议 ${entry.suggestion}` : '',
        q.samples.length > 0 ? `采样 ${q.samples.map((value) => value ?? '无有效答案').join(' / ')}` : '',
        q.cached ? '来自缓存' : '',
        q.explanation ?? '',
        q.note,
      ].filter(Boolean).join('\n');
      if (row.body.textContent !== details) row.body.textContent = details;
      row.locate.disabled = entry === undefined;
      row.generate.disabled = disabled || entry === undefined || !isAnswerable(entry.question.kind);
      row.apply.disabled = disabled || entry?.suggestion === undefined;
      row.approve.disabled = disabled || entry === undefined;
      row.undoOne.disabled = disabled || entry?.applied === undefined;
    }
  }
  filter.addEventListener('change', draw);
  const timer = window.setInterval(() => { if (isQuizRunning()) draw(); }, 1000);
  return { draw, dispose: () => { disposed = true; window.clearInterval(timer); } };
}

/**
 * 【接管状态】块 —— 监视页的**第一块**（用户 m02281 第 2 条）。
 *
 * 上半是接管状态行的当前原文（大一点），下半是提示历史（最新在上）。
 * 历史来自 `notice.ts`，与右上角 Toast 是**同一份数据**，只是这里留着不回滚。
 */
function fillStatus(box: HTMLElement): void {
  box.appendChild(el('div', { class: 'sztb-group-title', text: '接管状态' }));
  box.appendChild(el('div', { class: 'sztb-status-line', text: takeoverStatus().text }));

  const items = noticeList();
  if (items.length === 0) {
    box.appendChild(el('div', { class: 'sztb-field-desc', text: '还没有任何提示' }));
    return;
  }
  const list = el('div', { class: 'sztb-notices' });
  // 最新的排最上面：倒着画
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const n = items[i]!;
    const row = el('div', { class: 'sztb-notice-row', data: { kind: n.kind } });
    row.appendChild(el('span', { class: 'sztb-notice-time', text: clockText(n.at) }));
    row.appendChild(el('span', { class: 'sztb-notice-kind', text: KIND_MARK[n.kind] }));
    row.appendChild(
      el('span', {
        class: 'sztb-notice-text',
        text: n.count > 1 ? `${n.text}（×${n.count}）` : n.text,
      }),
    );
    list.appendChild(row);
  }
  box.appendChild(list);
}

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const UOOC_MONITOR_TAB: TabRegistration = {
  id: `${SITE_ID}:monitor`,
  title: '监视',
  order: 230,
  css: REVIEW_CSS,
  mount(root: HTMLElement, ctx: TabContext): () => void {
    // 两块分开装：状态块永远在第一位，下面的进度块怎么长都挤不掉它
    const statusBox = el('div', { class: 'sztb-field' });
    root.appendChild(statusBox);
    const box = el('div', { class: 'sztb-field' });
    root.appendChild(box);
    const reviewBox = el('div', { class: 'sztb-review' });
    root.appendChild(reviewBox);
    const review = mountReview(reviewBox, ctx);

    const offs: (() => void)[] = [];
    let courseState: ReturnType<typeof monitorState>['course'] | undefined;
    let lastNotice: ReturnType<typeof noticeList> | undefined;
    let lastTakeover = '';
    const draw = (): void => {
      const s = monitorState();
      review.draw();
      const notices = noticeList();
      const takeover = takeoverStatus().text;
      if (lastNotice !== notices || lastTakeover !== takeover) {
        lastNotice = notices;
        lastTakeover = takeover;
        statusBox.replaceChildren();
        fillStatus(statusBox);
      }
      const course = s.course;
      if (course === courseState) return;
      courseState = course;
      box.replaceChildren();
      if (course === null) {
        box.appendChild(el('div', { class: 'sztb-group-title', text: '课程进度' }));
        box.appendChild(el('div', { class: 'sztb-field-desc', text: '接管还没开始（在【接管】页点【开始接管】）' }));
      } else {
        box.appendChild(el('div', { class: 'sztb-group-title', text: '课程进度' }));
        box.appendChild(el('div', { class: 'sztb-field-desc', text: course.label }));
        box.appendChild(bar(course.index, course.total));
        const rows = course.rows;
        if (rows !== undefined && rows.length > 0) {
          box.appendChild(courseTree(rows, course.currentId ?? null));
        }
      }

    };

    draw();
    let frame: number | null = null;
    const onChange = (): void => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => { frame = null; draw(); });
    };
    offs.push(subscribeMonitor(onChange), subscribeNotice(onChange), subscribeTakeover(onChange), subscribeQuizRun(onChange));
    log.debug('监视页已挂载');
    return () => {
      while (offs.length > 0) offs.pop()?.();
      if (frame !== null) window.cancelAnimationFrame(frame);
      review.dispose();
    };
  },
};

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

function questionRow(q: QuestionProgress): HTMLElement {
  const samples = q.samples.length === 0 ? '—' : q.samples.map((s) => (s === null ? '✗' : s)).join(' → ');
  return el(
    'tr',
    {},
    el('td', { text: String(q.no) }),
    el('td', { text: q.typeText === '' ? '—' : q.typeText }),
    el('td', { text: QUESTION_STATUS_TEXT[q.status] }),
    el('td', { text: String(q.requests) }),
    el('td', { text: samples }),
    el('td', { text: q.answer === '' ? '—' : q.answer }),
    el('td', { text: q.note === '' ? '—' : q.note }),
  );
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
  mount(root: HTMLElement, ctx: TabContext): void {
    // 两块分开装：状态块永远在第一位，下面的进度块怎么长都挤不掉它
    const statusBox = el('div', { class: 'sztb-field' });
    root.appendChild(statusBox);
    const box = el('div', { class: 'sztb-field' });
    root.appendChild(box);

    const offs: (() => void)[] = [];
    const draw = (): void => {
      const s = monitorState();
      statusBox.textContent = '';
      fillStatus(statusBox);
      box.textContent = '';

      const course = s.course;
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

      box.appendChild(el('div', { class: 'sztb-group-title', text: 'AI 答题进度' }));
      const quiz = s.quiz;
      if (quiz === null) {
        box.appendChild(el('div', { class: 'sztb-field-desc', text: '本次会话还没跑过答题' }));
      } else {
        box.appendChild(el('div', { class: 'sztb-field-desc', text: `任务 tid=${quiz.tid} —— ${QUIZ_PHASE_TEXT[quiz.phase]}` }));
        if (quiz.message !== '') box.appendChild(el('div', { class: 'sztb-field-desc', text: quiz.message }));
        box.appendChild(bar(quiz.done, quiz.total));
        const table = el(
          'table',
          { class: 'sztb-table' },
          el(
            'thead',
            {},
            el(
              'tr',
              {},
              el('th', { text: '题号' }),
              el('th', { text: '题型' }),
              el('th', { text: '状态' }),
              el('th', { text: '请求' }),
              el('th', { text: '每次答案' }),
              el('th', { text: '定稿' }),
              el('th', { text: '备注' }),
            ),
          ),
          el('tbody', {}, ...quiz.questions.map(questionRow)),
        );
        box.appendChild(table);
      }
      void ctx;
    };

    draw();
    const stop = (): void => {
      while (offs.length > 0) offs.pop()?.();
    };
    const onChange = (): void => {
      // 标签页被关掉（root 脱离文档）就自动退订，免得订阅表越积越多
      if (!root.isConnected) {
        stop();
        return;
      }
      draw();
    };
    // 三个源都要订：进度（ai/monitor）、提示流（notice）、接管状态行（takeover）
    offs.push(subscribeMonitor(onChange), subscribeNotice(onChange), subscribeTakeover(onChange));
    log.debug('监视页已挂载');
  },
};

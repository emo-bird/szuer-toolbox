/**
 * UOOC 的【监视】标签页 —— 连播走到哪儿了 + AI 答题答到哪儿了。
 *
 * 需求细则 §C.6（用户 m04879 第 5 条）。数据源是 `ai/monitor.ts` 那个仓库，
 * 本文件**只负责画**：订阅 → 重画。不持有任何状态，
 * 所以关掉面板再打开，看到的还是最新进度。
 *
 * 三条表现约定：
 *  - 课程进度 = **当前位置 index / 该层总数**（用户拍板口径），外加一句人话标题；
 *  - 答题进度 = 每一题一行：题号 / 题型 / 状态 / 请求次数 / 每次答案 / 定稿答案 / 备注；
 *    逐题一有结果就立刻刷新（不攒到最后）；
 *  - 全部只读 —— 这里是观察窗口，改答案去页面改，停止连播去【连播】页。
 */

import { scoped } from '../../../common/core/log.ts';
import { el } from '../../../common/utils/dom.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { SITE_ID } from '../settings.ts';
import {
  monitorState,
  subscribeMonitor,
  type QuestionProgress,
  type QuizPhase,
} from '../ai/monitor.ts';

const log = scoped('uooc/monitor-tab');

const PHASE_TEXT: Record<QuizPhase, string> = {
  idle: '空闲',
  fetching: '正在拉题…',
  answering: '正在问模型…',
  filling: '正在回填页面…',
  submitting: '已点提交，等待站点结果…（人机验证码要你手动点）',
  retrying: '未通过，正在重答低分题…',
  done: '已结束',
  error: '出错',
};

const STATUS_TEXT: Record<QuestionProgress['status'], string> = {
  pending: '等待中',
  answered: '已作答',
  failed: '没答出',
  skipped: '跳过',
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

function questionRow(q: QuestionProgress): HTMLElement {
  const samples = q.samples.length === 0 ? '—' : q.samples.map((s) => (s === null ? '✗' : s)).join(' → ');
  return el(
    'tr',
    {},
    el('td', { text: String(q.no) }),
    el('td', { text: q.typeText === '' ? '—' : q.typeText }),
    el('td', { text: STATUS_TEXT[q.status] }),
    el('td', { text: String(q.requests) }),
    el('td', { text: samples }),
    el('td', { text: q.answer === '' ? '—' : q.answer }),
    el('td', { text: q.note === '' ? '—' : q.note }),
  );
}

/** 固定 id：`ctx.host.activateTab()` 与测试都用它，别在别处写裸字符串 */
export const UOOC_MONITOR_TAB: TabRegistration = {
  id: `${SITE_ID}:monitor`,
  title: '监视',
  order: 230,
  mount(root: HTMLElement, ctx: TabContext): void {
    const box = el('div', { class: 'sztb-field' });
    root.appendChild(box);

    let off: (() => void) | null = null;
    const draw = (): void => {
      const s = monitorState();
      box.textContent = '';

      const course = s.course;
      if (course === null) {
        box.appendChild(el('div', { class: 'sztb-group-title', text: '课程进度' }));
        box.appendChild(el('div', { class: 'sztb-field-desc', text: '连播还没开始（在【连播】页点【开始连播】）' }));
      } else {
        box.appendChild(el('div', { class: 'sztb-group-title', text: '课程进度' }));
        box.appendChild(el('div', { class: 'sztb-field-desc', text: course.label }));
        box.appendChild(bar(course.index, course.total));
      }

      box.appendChild(el('div', { class: 'sztb-group-title', text: 'AI 答题进度' }));
      const quiz = s.quiz;
      if (quiz === null) {
        box.appendChild(el('div', { class: 'sztb-field-desc', text: '本次会话还没跑过答题' }));
      } else {
        box.appendChild(el('div', { class: 'sztb-field-desc', text: `任务 tid=${quiz.tid} —— ${PHASE_TEXT[quiz.phase]}` }));
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
    off = subscribeMonitor(() => {
      // 标签页被关掉（root 脱离文档）就自动退订，免得订阅表越积越多
      if (!root.isConnected) {
        off?.();
        off = null;
        return;
      }
      draw();
    });
    log.debug('监视页已挂载');
  },
};

/**
 * 本科选课自己的【任务】标签页 —— 抢课队列的界面。
 *
 * 【它和列表页按钮的分工】列表页的【添加抢课】只入队（`list.ts`），
 * 真正的执行全在这里：开始 / 停止、逐条勾选、改优先级与重试策略、清空。
 *
 * 【唯一的写入出口】所有改动都走 `updateTasks()`（读 → 变换 → 写 → 广播），
 * 再统一重画。本页**不自己写 storage**，也**不缓存队列快照** —— 缓存快照会让
 * 列表页那次写入把引擎刚写的状态回滚掉（见 `list.ts:onGrab` 的注释）。
 *
 * 【为什么要盯着写接口总开关】用户拍板：本页【开始抢课】**不弹二次确认框**
 * （真正的不可逆操作是引擎里那条 `volunteer.do`，它有自己的门禁），
 * 但开关没开时必须当场看得见 —— 否则点了【开始】毫无反应，用户会以为脚本坏了。
 * 开关在【设置】页改，两页都在同一个 Shadow DOM 里，这里拿不到「切回本页」的回调，
 * 所以用一个 1 秒的轻量轮询盯着它，**只在开关真的翻转时才重画**（无条件重画会把
 * 用户正在操作的下拉框重建掉）。
 *
 * 【运行状态不落盘】`running` 只在内存里，刷新页面即回到未运行（用户拍板）。
 * 所以「抢课中」提示读的是 `isTaskRunning()`，而不是队列里某条任务的 status。
 */

import { el } from '../../../common/utils/dom.ts';
import { scoped } from '../../../common/core/log.ts';
import { isEnabled } from '../../../common/core/settings.ts';
import { CATEGORY_NAME } from '../api.ts';
import { SITE_ID, TOGGLE } from '../settings.ts';
import {
  RETRY_MODE,
  RETRY_MODE_NAME,
  TASK_STATUS,
  clampPriority,
  clearTasks,
  kindLabel,
  priorityHint,
  removeTask,
  resetTasks,
  setPriority,
  setRetryMode,
  statusKey,
  statusLabel,
  summaryText,
  toggleTask,
} from '../tasks-model.ts';
import type { TaskItem } from '../list-model.ts';
import {
  isTaskRunning,
  loadTaskStore,
  startTasks,
  stopTasks,
  subscribeTasks,
  updateTasks,
} from '../tasks.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { TASKS_TAB_CSS } from './tasks-style.ts';

const log = scoped('bkxk/tasks-tab');

/** 本标签页的 id。任务 100 / 监控 120 / 自定义 150 /【设置】200。 */
export const BKXK_TASKS_TAB_ID = 'bkxk:tasks';

/** 策略下拉的取值顺序（与旧仓库一致） */
const MODE_ORDER: readonly string[] = [RETRY_MODE.SMART, RETRY_MODE.NEVER, RETRY_MODE.ALWAYS];

/** 盯着写接口总开关的间隔：只在它真的翻转时才重画 */
const GATE_POLL_MS = 1000;

export const BKXK_TASKS_TAB: TabRegistration = {
  id: BKXK_TASKS_TAB_ID,
  title: '任务',
  order: 100,
  css: TASKS_TAB_CSS,
  mount(root: HTMLElement, ctx: TabContext): () => void {
    return mountTasksTab(root, ctx);
  },
};

function mountTasksTab(root: HTMLElement, ctx: TabContext): () => void {
  // ── 静态结构 ──────────────────────────────────────────────────────────
  const note = el('div', {
    class: 'sztb-note',
    text:
      '这里管抢课队列。列表页点【添加抢课】只入队，必须回本页点【开始抢课】才会真正发请求。' +
      '抢课是不可逆操作（会直接产生选课结果），点之前请确认【设置】里的写接口总开关是你想要的状态。',
  });

  const gateWarn = el('div', { class: 'sztb-note sztb-bkxk-tk-warn' });
  gateWarn.hidden = true;

  const summary = el('div', { class: 'sztb-group-title' });

  const runningBox = el('div', { class: 'sztb-bkxk-tk-now' });
  runningBox.hidden = true;

  const startBtn = el('button', {
    class: 'sztb-btn',
    text: '开始抢课',
    attrs: { type: 'button', 'data-variant': 'primary' },
  });
  const stopBtn = el('button', { class: 'sztb-btn', text: '停止', attrs: { type: 'button' } });
  const resetBtn = el('button', {
    class: 'sztb-btn',
    text: '重置未成功',
    attrs: { type: 'button' },
  });
  const clearBtn = el('button', {
    class: 'sztb-btn',
    text: '清空队列',
    attrs: { type: 'button', 'data-variant': 'danger' },
  });
  const toolbar = el('div', { class: 'sztb-toolbar' }, startBtn, stopBtn, resetBtn, clearBtn);

  const listTitle = el('div', { class: 'sztb-group-title' });
  const listBox = el('div');

  root.appendChild(note);
  root.appendChild(gateWarn);
  root.appendChild(summary);
  root.appendChild(runningBox);
  root.appendChild(toolbar);
  root.appendChild(listTitle);
  root.appendChild(listBox);

  // ── 渲染 ──────────────────────────────────────────────────────────────
  function render(): void {
    const items = loadTaskStore().items;
    const running = isTaskRunning();

    summary.textContent = summaryText(items);
    listTitle.textContent = `队列（${String(items.length)} 条）`;

    runningBox.hidden = !running;
    if (running) {
      const left = items.filter(
        (t) => t.enabled && (t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.RUNNING),
      ).length;
      runningBox.textContent =
        `抢课进行中：还剩 ${String(left)} 条待抢。抢到的任务会留在队列里（不会自动移出）。` +
        '循环跑在本页里，关掉页面就等于停止抢课。';
    }

    stopBtn.disabled = !running;
    startBtn.disabled = running;

    listBox.textContent = '';
    if (items.length === 0) {
      listBox.appendChild(
        el('div', {
          class: 'sztb-empty',
          text: '队列是空的。到选课页的课程卡片上点【添加抢课】就会出现在这里。',
        }),
      );
      return;
    }
    for (const task of items) listBox.appendChild(buildItem(task));
  }

  /** 写接口总开关的状态与警示条。@returns 开关是否已打开 */
  function syncGate(): boolean {
    const on = isEnabled(SITE_ID, TOGGLE.WRITE_API);
    gateWarn.hidden = on;
    if (!on) {
      gateWarn.textContent =
        '写接口总开关未开启：点【开始抢课】不会发出任何请求。' +
        '要真的抢课，请到【设置】页打开「写接口总开关（抢课 / 退课）」。';
    }
    return on;
  }

  function metaText(task: TaskItem): string {
    const cat = CATEGORY_NAME[task.category as keyof typeof CATEGORY_NAME];
    return [
      task.teacherName === '' ? '教师未知' : task.teacherName,
      cat ?? (task.category === '' ? '类别未知' : task.category),
      `已试 ${String(task.attempts)} 次`,
      task.teachingClassID,
    ].join(' ｜ ');
  }

  function buildItem(task: TaskItem): HTMLElement {
    const item = el('div', {
      class: 'sztb-bkxk-tk-item',
      data: task.enabled ? {} : { off: 'true' },
    });

    // 第一行：勾选 + 课名与元信息 + 状态
    const top = el('div', { class: 'sztb-bkxk-tk-top' });

    const check = el('input', { attrs: { type: 'checkbox', title: '这条任务是否参与抢课' } });
    check.checked = task.enabled;
    check.addEventListener('change', () => {
      updateTasks((s) => toggleTask(s, task.id).store);
      log.info(
        `${task.enabled ? '取消勾选' : '勾选'}任务「${task.courseName === '' ? task.teachingClassID : task.courseName}」`,
      );
      render();
    });
    top.appendChild(check);

    const main = el('div', { class: 'sztb-bkxk-tk-main' });
    main.appendChild(el('span', { class: 'sztb-bkxk-tk-name', text: task.courseName || '（课名未知）' }));
    main.appendChild(el('span', { class: 'sztb-bkxk-tk-meta', text: metaText(task) }));

    const msg = el('span', { class: 'sztb-bkxk-tk-meta' });
    if (task.lastMsg === '') {
      msg.textContent = priorityHint(task.priority);
    } else {
      msg.textContent = `${kindLabel(task.lastKind)}：${task.lastMsg}`;
      if (task.lastKind !== 'ok' && task.lastKind !== 'retryable') {
        msg.classList.add('sztb-bkxk-tk-warn');
      }
    }
    main.appendChild(msg);
    top.appendChild(main);

    top.appendChild(
      el('span', {
        class: 'sztb-bkxk-tk-badge',
        text: statusLabel(task.status),
        data: { state: statusKey(task.status) },
      }),
    );
    item.appendChild(top);

    // 第二行：优先级、重试策略、删除
    const ops = el('div', { class: 'sztb-bkxk-tk-ops' });

    const down = el('button', {
      class: 'sztb-btn sztb-bkxk-tk-tiny',
      text: '−',
      attrs: { type: 'button', title: '优先级 -1（更先抢）' },
    });
    down.addEventListener('click', () => {
      updateTasks((s) => setPriority(s, task.id, clampPriority(task.priority - 1)));
      render();
    });

    const prio = el('span', {
      class: 'sztb-bkxk-tk-prio',
      text: String(task.priority),
      attrs: { title: priorityHint(task.priority) },
    });

    const up = el('button', {
      class: 'sztb-btn sztb-bkxk-tk-tiny',
      text: '＋',
      attrs: { type: 'button', title: '优先级 +1（更后抢）' },
    });
    up.addEventListener('click', () => {
      updateTasks((s) => setPriority(s, task.id, clampPriority(task.priority + 1)));
      render();
    });

    ops.appendChild(down);
    ops.appendChild(prio);
    ops.appendChild(up);

    const mode = el('select', { class: 'sztb-select sztb-bkxk-tk-mode', attrs: { title: '失败后怎么处理' } });
    for (const value of MODE_ORDER) {
      const opt = el('option', { text: RETRY_MODE_NAME[value] ?? value });
      opt.value = value;
      mode.appendChild(opt);
    }
    mode.value = RETRY_MODE_NAME[task.retryMode] === undefined ? RETRY_MODE.SMART : task.retryMode;
    mode.addEventListener('change', () => {
      updateTasks((s) => setRetryMode(s, task.id, mode.value));
      log.info(`任务「${task.courseName || task.teachingClassID}」的重试策略改为 ${mode.value}`);
      render();
    });
    ops.appendChild(mode);

    const del = el('button', {
      class: 'sztb-btn sztb-bkxk-tk-tiny',
      text: '删除',
      attrs: { type: 'button' },
    });
    del.addEventListener('click', () => {
      updateTasks((s) => removeTask(s, task.id).store);
      log.info(`已从队列删除任务「${task.courseName || task.teachingClassID}」`);
      render();
    });
    ops.appendChild(del);

    item.appendChild(ops);
    return item;
  }

  // ── 事件 ──────────────────────────────────────────────────────────────
  startBtn.addEventListener('click', () => {
    // 用户拍板：不弹二次确认框。开关未开时这里只补一条日志，toast 由引擎自己发
    // （`startTasks` 里那句「写接口总开关未开启，请先到【设置】里打开」）。
    if (!syncGate()) log.warn('写接口总开关未开，拒绝开始');
    const res = startTasks();
    if (!res.ok && res.reason === 'already-running') ctx.host.toast('已经在抢课中了', 'info');
    render();
  });

  stopBtn.addEventListener('click', () => {
    if (!stopTasks()) ctx.host.toast('当前没有在抢课', 'info');
    render();
  });

  resetBtn.addEventListener('click', () => {
    const stale = loadTaskStore().items.filter((t) => t.status === TASK_STATUS.FAILED).length;
    if (stale === 0) {
      ctx.host.toast('没有需要重置的任务', 'info');
      return;
    }
    void ctx.host
      .confirm({
        title: `重置 ${String(stale)} 条未成功的任务`,
        body:
          '会把「已停止」的任务改回待抢，并清空它们的重试次数与失败原因。' +
          '已抢到的任务不受影响，也不会被重新提交。',
        confirmText: '重置',
        cancelText: '取消',
      })
      .then((yes) => {
        if (!yes) return;
        updateTasks((s) => resetTasks(s));
        log.info(`已重置 ${String(stale)} 条未成功的任务`);
        ctx.host.toast('已重置', 'success');
        render();
      });
  });

  clearBtn.addEventListener('click', () => {
    const n = loadTaskStore().items.length;
    if (n === 0) {
      ctx.host.toast('队列已经是空的', 'info');
      return;
    }
    void ctx.host
      .confirm({
        title: `清空队列（${String(n)} 条）`,
        body:
          '会把整个抢课队列删掉。已经抢到的课不受影响（那是站点那边的选课结果），' +
          '但队列里的记录、优先级与重试次数都会丢失，无法撤销。',
        danger: true,
        confirmText: '清空',
        cancelText: '取消',
      })
      .then((yes) => {
        if (!yes) return;
        updateTasks(() => clearTasks());
        log.info(`已清空抢课队列（${String(n)} 条）`);
        ctx.host.toast('已清空队列', 'success');
        render();
      });
  });

  // ── 订阅与收尾 ────────────────────────────────────────────────────────
  const off = subscribeTasks(render);
  syncGate();
  render();

  let lastGate = isEnabled(SITE_ID, TOGGLE.WRITE_API);
  const gateTimer = window.setInterval(() => {
    const on = isEnabled(SITE_ID, TOGGLE.WRITE_API);
    if (on === lastGate) return;
    lastGate = on;
    syncGate();
    render();
  }, GATE_POLL_MS);

  return () => {
    off();
    window.clearInterval(gateTimer);
  };
}

/**
 * 本科选课自己的【监控】标签页 —— 余量监控的界面。
 *
 * 【它干什么】盯住若干教学班，定期查还有多少余量；有余量就提醒，
 * 写接口总开关开着的话顺手抢下来（用户拍板：完全照旧，不新增子开关）。
 *
 * 【两种查询模式，代价差很大】用户拍板：本页可以直接切模式与类别（双向写回设置）。
 *   - 按类别（默认）：走列表接口，一个类别整页拉回来（最多 4 页 × 50 条），
 *     一次请求覆盖同类别下的所有监控项，请求少。**要求监控项带类别代码**。
 *   - 逐个教学班：走 `capacity.do`，一节课一条请求，直观但请求多。
 * 切换只写设置，引擎下一轮自己重读，不需要通知它。
 *
 * 【「多久之前」得自己走】引擎只在检查完那一刻广播一次；如果用户盯着页面等，
 * 那个「12 秒前」不会自己变成「13 秒前」。所以这里用 1 秒的轻量 tick **就地改文本**，
 * 不重建 DOM —— 重建会把用户正拉开的模式下拉框合上。
 *
 * 【unmount 要退订】`tabs.ts` 会把 `mount` 的返回值当 dispose 用，卸载时调一次。
 */

import { el } from '../../../common/utils/dom.ts';
import { scoped } from '../../../common/core/log.ts';
import { getValue, isEnabled, setValue } from '../../../common/core/settings.ts';
import { CATEGORY_NAME } from '../api.ts';
import { SITE_ID, TOGGLE, VALUE } from '../settings.ts';
import type { MonitorItem } from '../list-model.ts';
import {
  MONITOR_MODE,
  MONITOR_MODE_NAME,
  checkedAgoText,
  clearMonitor,
  normalizeMonitorMode,
  remainKey,
  remainText,
  removeMonitorItem,
  resetMonitorStats,
  summaryText,
} from '../monitor-model.ts';
import {
  grabNow,
  isPolling,
  loadMonitorStore,
  pollOnce,
  pollStats,
  startPolling,
  stopPolling,
  subscribeMonitor,
  updateMonitor,
} from '../monitor.ts';
import type { TabContext, TabRegistration } from '../../types.ts';
import { MONITOR_TAB_CSS } from './monitor-style.ts';

const log = scoped('bkxk/monitor-tab');

/** 本标签页的 id。任务 100 / 监控 120 / 自定义 150 /【设置】200。 */
export const BKXK_MONITOR_TAB_ID = 'bkxk:monitor';

/** 「多久之前」与写开关的刷新间隔：只改文本，不重建 DOM */
const TICK_MS = 1000;

/** `grabNow` 的 reason → 给用户看的一句话 */
const GRAB_REASON: Readonly<Record<string, string>> = {
  'write-disabled': '写接口总开关未开启，现在不会抢',
  'no-session': '读不到学号或批次码，请刷新选课页后重试',
  'no-category': '这条监控项没有类别代码，无法抢 —— 请到列表页重新点一次「监控该教学班」',
  unauthenticated: '登录态失效，请刷新页面重新登录',
};

export const BKXK_MONITOR_TAB: TabRegistration = {
  id: BKXK_MONITOR_TAB_ID,
  title: '监控',
  order: 120,
  css: MONITOR_TAB_CSS,
  mount(root: HTMLElement, ctx: TabContext): () => void {
    return mountMonitorTab(root, ctx);
  },
};

function mountMonitorTab(root: HTMLElement, ctx: TabContext): () => void {
  // ── 静态结构 ──────────────────────────────────────────────────────────
  const note = el('div', {
    class: 'sztb-note',
    text:
      '这里盯余量。列表页点【监控该教学班】加入监控项，回本页点【开始监控】才会开始查询。' +
      '轮询跑在本页里，关掉页面就等于停止监控。',
  });

  const gateWarn = el('div', { class: 'sztb-note sztb-bkxk-mo-warn' });
  gateWarn.hidden = true;

  // 模式
  const modeRow = el('div', { class: 'sztb-bkxk-mo-row' });
  modeRow.appendChild(el('span', { text: '查询模式' }));
  const modeSelect = el('select', { class: 'sztb-select sztb-bkxk-mo-mode' });
  for (const value of [MONITOR_MODE.CATEGORY, MONITOR_MODE.SINGLE]) {
    const opt = el('option', { text: MONITOR_MODE_NAME[value] ?? value });
    opt.value = value;
    modeSelect.appendChild(opt);
  }
  modeRow.appendChild(modeSelect);
  modeSelect.addEventListener('change', () => {
    setValue(SITE_ID, VALUE.MONITOR_MODE, modeSelect.value);
    log.info(`监控模式改为 ${modeSelect.value}`);
    render();
  });

  // 类别：**没有这个下拉**（用户 m00846 拍板删掉）。
  // 每条监控项自己带着类别，引擎按 `groupByCategory()` 找出「当前有哪些类别」再逐类拉列表，
  // 不需要用户再指定一个类别；原先那个下拉只会让人误以为「只查我选的这一类」。
  const modeHint = el('span', { class: 'sztb-bkxk-mo-meta' });
  modeRow.appendChild(modeHint);

  const summary = el('div', { class: 'sztb-group-title' });

  const runningBox = el('div', { class: 'sztb-bkxk-mo-now' });
  runningBox.hidden = true;

  const startBtn = el('button', {
    class: 'sztb-btn',
    text: '开始监控',
    attrs: { type: 'button', 'data-variant': 'primary' },
  });
  const stopBtn = el('button', { class: 'sztb-btn', text: '停止', attrs: { type: 'button' } });
  const onceBtn = el('button', { class: 'sztb-btn', text: '立即检查', attrs: { type: 'button' } });
  const resetBtn = el('button', { class: 'sztb-btn', text: '重置统计', attrs: { type: 'button' } });
  const clearBtn = el('button', {
    class: 'sztb-btn',
    text: '清空列表',
    attrs: { type: 'button', 'data-variant': 'danger' },
  });
  const toolbar = el('div', { class: 'sztb-toolbar' }, startBtn, stopBtn, onceBtn, resetBtn, clearBtn);

  const listTitle = el('div', { class: 'sztb-group-title' });
  const listBox = el('div');

  root.appendChild(note);
  root.appendChild(gateWarn);
  root.appendChild(modeRow);
  root.appendChild(summary);
  root.appendChild(runningBox);
  root.appendChild(toolbar);
  root.appendChild(listTitle);
  root.appendChild(listBox);

  /** 「多久之前」的文本节点，tick 时就地改，不重建 DOM */
  const agoNodes = new Map<string, HTMLElement>();

  // ── 渲染 ──────────────────────────────────────────────────────────────
  function render(): void {
    agoNodes.clear();

    const mode = normalizeMonitorMode(getValue<string>(SITE_ID, VALUE.MONITOR_MODE));
    modeSelect.value = mode;

    const categoryMode = mode === MONITOR_MODE.CATEGORY;
    modeHint.textContent = categoryMode
      ? '自动按监控列表里出现过的类别逐类拉列表（请求少）。'
      : '每条监控各查一次容量（精确，但请求数是监控条数）。';

    const store = loadMonitorStore();
    const stats = pollStats();
    const now = Date.now();
    summary.textContent = summaryText(store, now);
    listTitle.textContent = `监控项（${String(store.items.length)} 条）`;

    const running = isPolling();
    startBtn.disabled = running;
    stopBtn.disabled = !running;
    runningBox.hidden = !running;
    if (running) {
      runningBox.textContent =
        `监控进行中（${mode === MONITOR_MODE.CATEGORY ? '按类别' : '逐个教学班'}）：` +
        `已跑 ${String(stats.pollCount)} 轮，上次检查 ${checkedAgoText(stats.lastPollAt, now)}。` +
        '命中余量时会提醒你；写接口总开关开着的话会直接帮你抢。';
    }

    listBox.textContent = '';
    if (store.items.length === 0) {
      listBox.appendChild(
        el('div', {
          class: 'sztb-empty',
          text: '没有监控项。到选课页的课程卡片上点【监控该教学班】就会出现在这里。',
        }),
      );
      return;
    }
    for (const item of store.items) listBox.appendChild(buildItem(item, now));
  }

  /** 只改会随时间变的文本（「多久之前」），不重建 DOM */
  function tick(): void {
    const now = Date.now();
    for (const [tcId, node] of agoNodes) {
      const item = loadMonitorStore().items.find((m) => m.teachingClassID === tcId);
      node.textContent = agoText(item, now);
    }
    summary.textContent = summaryText(loadMonitorStore(), now);
  }

  function agoText(item: MonitorItem | undefined, now: number): string {
    if (item === undefined) return '';
    return `上次检查 ${checkedAgoText(item.checkedAt, now)}`;
  }

  /** 写接口总开关的状态与警示条。@returns 开关是否已打开 */
  function syncGate(): boolean {
    const on = isEnabled(SITE_ID, TOGGLE.WRITE_API);
    gateWarn.hidden = on;
    if (!on) {
      gateWarn.textContent =
        '写接口总开关未开启：监控命中也只会提醒，不会自动抢。' +
        '要自动抢，请到【设置】页打开「写接口总开关（抢课 / 退课）」。';
    }
    return on;
  }

  function metaText(item: MonitorItem): string {
    const cat = CATEGORY_NAME[item.category as keyof typeof CATEGORY_NAME];
    const parts = [item.teacherName === '' ? '教师未知' : item.teacherName];
    parts.push(cat ?? (item.category === '' ? '类别未知' : item.category));
    parts.push(`累计命中 ${String(item.hits)} 次`);
    return parts.join(' ｜ ');
  }

  function buildItem(item: MonitorItem, now: number): HTMLElement {
    const row = el('div', { class: 'sztb-bkxk-mo-item' });

    const top = el('div', { class: 'sztb-bkxk-mo-top' });
    const main = el('div', { class: 'sztb-bkxk-mo-main' });
    main.appendChild(el('span', { class: 'sztb-bkxk-mo-name', text: item.courseName || '（课名未知）' }));
    main.appendChild(el('span', { class: 'sztb-bkxk-mo-meta', text: metaText(item) }));

    const ago = el('span', { class: 'sztb-bkxk-mo-meta', text: agoText(item, now) });
    agoNodes.set(item.teachingClassID, ago);
    main.appendChild(ago);

    if (item.lastMsg !== '') {
      main.appendChild(el('span', { class: 'sztb-bkxk-mo-meta sztb-bkxk-mo-warn', text: `上次抢课：${item.lastMsg}` }));
    }
    top.appendChild(main);

    const has = item.remain !== null && item.remain > 0;
    top.appendChild(
      el('span', {
        class: has ? 'sztb-bkxk-mo-badge sztb-bkxk-mo-hit' : 'sztb-bkxk-mo-badge',
        text: remainText(item.remain),
        data: { state: String(remainKey(item.remain)) },
      }),
    );
    row.appendChild(top);

    const ops = el('div', { class: 'sztb-bkxk-mo-ops' });

    const grab = el('button', {
      class: 'sztb-btn sztb-bkxk-mo-tiny',
      text: '抢课',
      attrs: { type: 'button', title: '立刻对这条发一次抢课请求' },
    });
    grab.addEventListener('click', () => {
      grab.disabled = true;
      void grabNow(item)
        .then((res) => {
          if (res.ok) return;
          if (res.reason === 'exception') {
            ctx.host.toast(`请求异常：${res.msg ?? ''}`, 'error');
            return;
          }
          ctx.host.toast(GRAB_REASON[res.reason] ?? `未成功（${res.reason}）${res.msg ?? ''}`, 'warn');
        })
        .finally(() => {
          grab.disabled = false;
          render();
        });
    });
    ops.appendChild(grab);

    const del = el('button', {
      class: 'sztb-btn sztb-bkxk-mo-tiny',
      text: '移除',
      attrs: { type: 'button' },
    });
    del.addEventListener('click', () => {
      updateMonitor((s) => removeMonitorItem(s, item.teachingClassID).store);
      log.info(`已移出监控列表：${item.courseName || item.teachingClassID}`);
      render();
    });
    ops.appendChild(del);

    row.appendChild(ops);
    return row;
  }

  // ── 事件 ──────────────────────────────────────────────────────────────
  startBtn.addEventListener('click', () => {
    startPolling();
    render();
  });

  stopBtn.addEventListener('click', () => {
    if (!stopPolling()) ctx.host.toast('当前没有在监控', 'info');
    render();
  });

  onceBtn.addEventListener('click', () => {
    if (isPolling()) {
      // 与轮询并发会让同一节课被查两次，也让命中计数翻倍
      ctx.host.toast('轮询正在跑，请先【停止】，或等这一轮结束', 'warn');
      return;
    }
    onceBtn.disabled = true;
    void pollOnce()
      .then((res) => {
        const hits = res.hits.length;
        ctx.host.toast(
          hits === 0
            ? `检查了 ${String(res.checked)} 条，没有余量`
            : `检查了 ${String(res.checked)} 条，发现 ${String(hits)} 条有余量`,
          hits === 0 ? 'info' : 'success',
        );
      })
      .finally(() => {
        onceBtn.disabled = false;
        render();
      });
  });

  resetBtn.addEventListener('click', () => {
    updateMonitor((s) => resetMonitorStats(s));
    log.info('已重置监控统计（余量、检查时间、命中次数与上次抢课结果）');
    ctx.host.toast('已重置统计，下次检查会重新填', 'success');
    render();
  });

  clearBtn.addEventListener('click', () => {
    const n = loadMonitorStore().items.length;
    if (n === 0) {
      ctx.host.toast('监控列表已经是空的', 'info');
      return;
    }
    void ctx.host
      .confirm({
        title: `清空监控列表（${String(n)} 条）`,
        body: '会移除全部监控项，并停掉轮询。已经抢到的课不受影响，但监控记录无法恢复。',
        danger: true,
        confirmText: '清空',
        cancelText: '取消',
      })
      .then((yes) => {
        if (!yes) return;
        stopPolling();
        updateMonitor(() => clearMonitor());
        log.info(`已清空监控列表（${String(n)} 条）`);
        ctx.host.toast('已清空监控列表', 'success');
        render();
      });
  });

  // ── 订阅与收尾 ────────────────────────────────────────────────────────
  const off = subscribeMonitor(render);
  syncGate();
  render();

  let lastGate = isEnabled(SITE_ID, TOGGLE.WRITE_API);
  const tickTimer = window.setInterval(() => {
    const on = isEnabled(SITE_ID, TOGGLE.WRITE_API);
    if (on !== lastGate) {
      lastGate = on;
      syncGate();
      render();
    }
    tick();
  }, TICK_MS);

  return () => {
    off();
    window.clearInterval(tickTimer);
  };
}

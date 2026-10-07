/**
 * 公共标签页「日志」。
 *
 * 直接读 core/log 的环形缓冲，并订阅增量。支持等级过滤、清空、复制全文。
 * 日志内容已由 core/log 兜底：不含请求头 / cookie / token。
 */

import { el, clear } from '../../utils/dom.ts';
import { copyText } from '../../utils/clipboard.ts';
import {
  entries,
  formatEntry,
  subscribe,
  setLevel,
  getLevel,
  clear as clearLog,
  passesLevel,
  rawCount,
} from '../../core/log.ts';
import type { LogEntry, LogLevel } from '../../core/log.ts';
import type { TabRegistration } from '../../../sites/types.ts';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** 复制全文。共用 `copyText()`：GM_setClipboard → execCommand → 剪贴板 API 三条路依次退。 */
async function copyAll(): Promise<void> {
  const text = entries().map(formatEntry).join('\n');
  await copyText(text);
}

const tabCss = `
/*
 * 日志页必须自己就是「有确定高度的容器」，否则粘底一定失效。
 * 根因：.sztb-body 是 padding:10px 的滚动盒（style.css:188），而 .sztb-pane 默认
 * 由内容撑高（style.css:194 只写了 display/flex-direction/gap）⇒ .sztb-log-wrap 的
 * height:100% 遇到「父高度 auto」会退化成 auto，.sztb-log 永远不产生溢出、
 * scrollTop 恒为 0，真正在滚的其实是外层 .sztb-body。
 * 于是「新日志到底」这段逻辑盯的是一个根本没在滚的元素，表现为日志一直停在顶上。
 * 把 pane 钉成 body 的内容高度，滚动权就交回日志区自己（顺带把工具栏固定住）。
 */
.sztb-pane[data-tab="common:log"] { height: 100%; min-height: 0; overflow: hidden; }
.sztb-log-wrap { display: flex; flex-direction: column; gap: 8px; height: 100%; min-height: 0; }
.sztb-log { overflow: auto; flex: 1 1 auto; }
.sztb-log-empty { padding: 20px 8px; text-align: center; color: var(--sztb-text-dim); font-size: 12.5px; }
`;

function renderTab(root: HTMLElement): () => void {
  const levelSelect = el('select', { class: 'sztb-input', style: { width: 'auto' } });
  for (const level of LEVELS) {
    const opt = el('option', { text: level, attrs: { value: level } });
    if (level === getLevel()) opt.selected = true;
    levelSelect.appendChild(opt);
  }
  levelSelect.addEventListener('change', () => {
    setLevel(levelSelect.value as LogLevel);
    repaint();
  });

  const clearBtn = el('button', {
    class: 'sztb-btn',
    text: '清空',
    attrs: { type: 'button' },
    on: {
      click: () => {
        clearLog();
        repaint();
      },
    },
  });

  const copyBtn = el('button', {
    class: 'sztb-btn',
    text: '复制全文',
    attrs: { type: 'button' },
    on: {
      click: () => {
        void copyAll();
      },
    },
  });

  const pre = el('div', { class: 'sztb-log' });
  const emptyHint = el('div', { class: 'sztb-log-empty' });
  const wrap = el(
    'div',
    { class: 'sztb-log-wrap' },
    el('div', { class: 'sztb-toolbar' }, levelSelect, clearBtn, copyBtn),
    pre,
    emptyHint,
  );
  root.appendChild(wrap);

  /**
   * 「粘底」判定：滚动条在底部（留 8px 容差）。
   * 用户往上翻看历史时 autoScroll 变 false，新日志就不会把他拽回底部。
   */
  const AT_BOTTOM_SLACK = 8;
  /** 跟随开关：用户往上翻即关，自己滑回底部即开 */
  let autoScroll = true;
  /** 停留态下记住的位置 —— 切走再切回来要回到这里，而不是被弹回顶部 */
  let lastTop = 0;
  /** 上一次观测到的可见性（隐藏时 clientHeight 是 0） */
  let visible = false;
  const atBottom = (): boolean =>
    pre.scrollTop + pre.clientHeight >= pre.scrollHeight - AT_BOTTOM_SLACK;

  pre.addEventListener('scroll', () => {
    // ⚠️ 隐藏时（`.sztb-pane { display:none }`，见 style.css:194）clientHeight 与
    // scrollHeight 都是 0，`atBottom()` 会退化成 true，把用户的「停留」悄悄改回「跟随」。
    // 用户 m01302 要求「切换悬浮窗页面不影响状态」，所以不可见时一律不更新状态。
    if (pre.clientHeight === 0) return;
    lastTop = pre.scrollTop;
    autoScroll = atBottom();
  });

  /** 滚到底（新日志到达且用户本来就在底部时调用） */
  function scrollToBottom(): void {
    pre.scrollTop = pre.scrollHeight;
  }

  /**
   * 切回日志页 / 展开面板时恢复现场（用户 m01302）：
   * 跟随态 → 直接滚到底；停留态 → 回到用户上次看的那一行。
   */
  function restoreScroll(): void {
    if (autoScroll) scrollToBottom();
    else pre.scrollTop = Math.min(lastTop, pre.scrollHeight);
  }

  /**
   * 隐藏的标签页是 `display:none`，尺寸为 0。尺寸从 0 变回非 0 就是「重新可见」，
   * 这时补一次恢复 —— 光靠新日志触发滚到底是不够的：日志停了以后切回来，
   * 元素还停在顶部（这正是用户 m01302 报的现象）。
   */
  const sizeObserver = new ResizeObserver(() => {
    const nowVisible = pre.clientHeight > 0;
    if (nowVisible === visible) return;
    visible = nowVisible;
    if (nowVisible) restoreScroll();
  });
  sizeObserver.observe(pre);

  function line(entry: LogEntry): HTMLElement {
    return el('div', {
      class: 'sztb-log-line',
      text: formatEntry(entry),
      data: { level: entry.level },
    });
  }

  /**
   * 空态文案：让用户分得清「真的没日志」和「被等级过滤了」。
   * v0.9 起 core/log 一律入缓冲，所以「被过滤掉几条」是真实可算的。
   */
  function syncEmptyHint(): void {
    const count = pre.childElementCount;
    pre.style.display = count === 0 ? 'none' : '';
    emptyHint.style.display = count === 0 ? '' : 'none';
    if (count > 0) return;

    const buffered = rawCount();
    const shown = entries().length;
    const filtered = buffered - shown;
    emptyHint.textContent =
      buffered === 0
        ? '暂无日志。'
        : `当前没有等级 ≥ ${getLevel()} 的日志（缓冲里另有 ${filtered} 条被过滤掉了）。`;
  }

  function repaint(): void {
    // 重绘前先记录用户是否停在底部 —— 切等级 / 清空都走这里，
    // 只有本来就在底部才滚下去，否则会把正在翻历史的用户拽走。
    const stick = autoScroll || atBottom();
    clear(pre);
    for (const entry of entries()) pre.appendChild(line(entry));
    syncEmptyHint();
    if (stick) scrollToBottom();
    autoScroll = stick;
  }

  repaint();
  const off = subscribe((entry) => {
    // core/log 现在一律入缓冲（v0.9），所以这里必须自己判等级：
    // 低于当前显示门槛的条目不进 DOM，但**留在缓冲里**，切回低等级能看到。
    if (!passesLevel(entry.level)) return;
    if (pre.style.display === 'none') pre.style.display = '';
    emptyHint.style.display = 'none';
    pre.appendChild(line(entry));
    // 缓冲满了之后 core/log 会丢最老的，这里同步保证 DOM 不会无限增长
    if (pre.childElementCount > 520) pre.firstElementChild?.remove();
    // 新需求：停在底部时新日志自动到底；正在往上翻则不动
    if (autoScroll) scrollToBottom();
  });

  return () => {
    sizeObserver.disconnect();
    off();
  };
}

export const logTab: TabRegistration = {
  id: 'common:log',
  title: '日志',
  order: 90,
  css: tabCss,
  mount(root) {
    return renderTab(root);
  },
};

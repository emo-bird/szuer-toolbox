/**
 * 公共标签页「日志」。
 *
 * 直接读 core/log 的环形缓冲，并订阅增量。支持等级过滤、清空、复制全文。
 * 日志内容已由 core/log 兜底：不含请求头 / cookie / token。
 */

import { el, clear } from '../../utils/dom.ts';
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

/** 复制全文。GM 环境优先用 GM_setClipboard，否则退回剪贴板 API。 */
async function copyAll(): Promise<void> {
  const text = entries().map(formatEntry).join('\n');
  const gm = (globalThis as Record<string, unknown>)['GM_setClipboard'];
  if (typeof gm === 'function') {
    (gm as (t: string) => void)(text);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* 用户拒绝授权或非安全上下文，静默失败 */
  }
}

const tabCss = `
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
  let autoScroll = true;
  const atBottom = (): boolean =>
    pre.scrollTop + pre.clientHeight >= pre.scrollHeight - AT_BOTTOM_SLACK;

  pre.addEventListener('scroll', () => {
    autoScroll = atBottom();
  });

  /** 滚到底（新日志到达且用户本来就在底部时调用） */
  function scrollToBottom(): void {
    pre.scrollTop = pre.scrollHeight;
  }

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

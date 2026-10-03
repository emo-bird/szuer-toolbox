/**
 * 公共标签页「日志」。
 *
 * 直接读 core/log 的环形缓冲，并订阅增量。支持等级过滤、清空、复制全文。
 * 日志内容已由 core/log 兜底：不含请求头 / cookie / token。
 */

import { el, clear } from '../../utils/dom.ts';
import { entries, formatEntry, subscribe, setLevel, getLevel, clear as clearLog } from '../../core/log.ts';
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

  let autoScroll = true;
  pre.addEventListener('scroll', () => {
    autoScroll = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 8;
  });

  function line(entry: LogEntry): HTMLElement {
    return el('div', {
      class: 'sztb-log-line',
      text: formatEntry(entry),
      data: { level: entry.level },
    });
  }

  /**
   * 空态文案：让用户分得清「真的没日志」和「被等级过滤了」。
   * 这一条是手测第 19 项暴露出来的 —— 原来清空后什么都不显示，看着像坏了。
   */
  function syncEmptyHint(): void {
    const count = pre.childElementCount;
    pre.style.display = count === 0 ? 'none' : '';
    emptyHint.style.display = count === 0 ? '' : 'none';
    if (count > 0) return;

    const buffered = entries().length;
    emptyHint.textContent =
      buffered === 0
        ? '暂无日志。'
        : `当前没有等级 ≥ ${getLevel()} 的日志（缓冲里还有 ${buffered} 条被过滤掉了）。`;
  }

  function repaint(): void {
    clear(pre);
    for (const entry of entries()) pre.appendChild(line(entry));
    syncEmptyHint();
    pre.scrollTop = pre.scrollHeight;
  }

  repaint();
  const off = subscribe((entry) => {
    // subscribe 只在等级通过时才会回调（core/log 已在 push 里过滤），
    // 所以这里无需再判等级；但清空 / 过滤后需要重算空态。
    if (pre.style.display === 'none') pre.style.display = '';
    emptyHint.style.display = 'none';
    pre.appendChild(line(entry));
    // 缓冲满了之后 core/log 会丢最老的，这里同步保证 DOM 不会无限增长
    if (pre.childElementCount > 520) pre.firstElementChild?.remove();
    if (autoScroll) pre.scrollTop = pre.scrollHeight;
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

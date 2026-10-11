/**
 * 【监控】标签页（余量监控）的专属样式。
 *
 * 与 `custom-style.ts` / `tasks-style.ts` 同一套做法：样式写在 `.ts` 里，
 * 因为 `tests/run.ts` 用 Node 原生加载 `.ts` 源码，`import './x.css'` 会
 * `ERR_UNKNOWN_FILE_EXTENSION` 把整轮测试崩掉。
 *
 * 类名一律 `sztb-bkxk-mo-` 前缀，只活在悬浮窗的 Shadow DOM 里。
 */

export const MONITOR_TAB_CSS = `
.sztb-bkxk-mo-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
}

.sztb-bkxk-mo-item:hover {
  background: var(--sztb-bg-alt);
}

.sztb-bkxk-mo-top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.sztb-bkxk-mo-main {
  flex: 1 1 auto;
  min-width: 0;
}

.sztb-bkxk-mo-name {
  font-size: 13px;
  word-break: break-word;
}

.sztb-bkxk-mo-meta {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sztb-text-dim);
  word-break: break-word;
}

/* 余量徽标：有货 / 没货 / 查不到，三种颜色 */
.sztb-bkxk-mo-badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--sztb-border);
  border-radius: 9px;
  font-size: 11px;
  white-space: nowrap;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-mo-badge[data-state="has"] {
  color: var(--sztb-ok);
  border-color: var(--sztb-ok);
  font-weight: 600;
}

.sztb-bkxk-mo-badge[data-state="none"] {
  color: var(--sztb-text-dim);
}

.sztb-bkxk-mo-ops {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.sztb-btn.sztb-bkxk-mo-tiny {
  padding: 1px 7px;
  font-size: 11.5px;
}

/* 模式与类别的两个下拉：窄一点，跟同行标签并排 */
.sztb-select.sztb-bkxk-mo-mode {
  width: auto;
  min-width: 96px;
  font-size: 12px;
}

.sztb-bkxk-mo-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-mo-row > span {
  flex: 0 0 auto;
  min-width: 62px;
}

/* 警示条：红色左边线（写开关未开 / 登录态失效） */
.sztb-bkxk-mo-warn {
  border-left-color: var(--sztb-danger);
  color: var(--sztb-danger);
}

.sztb-bkxk-mo-hit {
  color: var(--sztb-ok);
  font-weight: 600;
}

.sztb-bkxk-mo-now {
  margin: 0 0 6px;
  padding: 6px 8px;
  border-left: 2px solid var(--sztb-accent);
  border-radius: 0 5px 5px 0;
  background: var(--sztb-bg-alt);
  font-size: 12px;
  line-height: 1.6;
}

.sztb-bkxk-mo-now[hidden] {
  display: none;
}
`;

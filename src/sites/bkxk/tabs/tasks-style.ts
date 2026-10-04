/**
 * 【任务】标签页（抢课队列）的专属样式。
 *
 * 与 `custom-style.ts` 同一套做法：样式写在 `.ts` 里而不是 `.css`，
 * 因为 `tests/run.ts` 用 Node 原生加载 `.ts` 源码，`import './x.css'` 会
 * `ERR_UNKNOWN_FILE_EXTENSION` 把整轮测试崩掉。
 *
 * 类名一律 `sztb-bkxk-tk-` 前缀，只活在悬浮窗的 Shadow DOM 里，不会外泄。
 * 需要压公共样式的两处用「两个类名」提高特异性，不用 `!important`。
 */

export const TASKS_TAB_STYLE_ID = 'sztb-bkxk-tasks-style';

export const TASKS_TAB_CSS = `
.sztb-bkxk-tk-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
}

.sztb-bkxk-tk-item:hover {
  background: var(--sztb-bg-alt);
}

.sztb-bkxk-tk-top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.sztb-bkxk-tk-main {
  flex: 1 1 auto;
  min-width: 0;
}

.sztb-bkxk-tk-name {
  font-size: 13px;
  word-break: break-word;
}

.sztb-bkxk-tk-meta {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sztb-text-dim);
  word-break: break-word;
}

/* 未勾选的任务：名字划掉，一眼看出它这轮不参与 */
.sztb-bkxk-tk-item[data-off="true"] .sztb-bkxk-tk-name {
  color: var(--sztb-text-dim);
  text-decoration: line-through;
}

.sztb-bkxk-tk-badge {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--sztb-border);
  border-radius: 9px;
  font-size: 11px;
  white-space: nowrap;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-tk-badge[data-state="ok"] {
  color: var(--sztb-ok);
  border-color: var(--sztb-ok);
}

.sztb-bkxk-tk-badge[data-state="bad"] {
  color: var(--sztb-danger);
  border-color: var(--sztb-danger);
}

.sztb-bkxk-tk-badge[data-state="run"] {
  color: var(--sztb-accent);
  border-color: var(--sztb-accent);
}

.sztb-bkxk-tk-ops {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* 很小的按钮：上移 / 下移、删除。两个类名压住公共 .sztb-btn 的内边距 */
.sztb-btn.sztb-bkxk-tk-tiny {
  padding: 1px 7px;
  font-size: 11.5px;
}

.sztb-bkxk-tk-prio {
  font-size: 11.5px;
  color: var(--sztb-text-dim);
}

/* 策略下拉很窄，压掉公共 .sztb-select 的 width:100% */
.sztb-select.sztb-bkxk-tk-mode {
  width: auto;
  padding: 2px 4px;
  font-size: 11.5px;
}

/* 公共样式里勾选框只被 .sztb-row 管，这里的行不是 .sztb-row */
.sztb-bkxk-tk-item input[type="checkbox"] {
  flex: 0 0 auto;
  margin: 0;
  width: 15px;
  height: 15px;
  accent-color: var(--sztb-accent);
  cursor: pointer;
}

/* 失败原因 / 登录态失效：红色左边线，与「自定义课程」的警示条同款 */
.sztb-bkxk-tk-warn {
  border-left-color: var(--sztb-danger);
  color: var(--sztb-danger);
}

.sztb-bkxk-tk-ok {
  color: var(--sztb-ok);
}

.sztb-bkxk-tk-now {
  margin: 0 0 6px;
  padding: 6px 8px;
  border-left: 2px solid var(--sztb-accent);
  border-radius: 0 5px 5px 0;
  background: var(--sztb-bg-alt);
  font-size: 12px;
  line-height: 1.6;
}

.sztb-bkxk-tk-now[hidden] {
  display: none;
}
`;

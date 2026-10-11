/**
 * 【自定义课程】标签页的专属样式。
 *
 * 为什么单独一个文件：与 `list-style.ts` / `timetable-style.ts` 同一套做法 ——
 * 站点模块的 CSS 必须写在 `.ts` 里（`tests/run.ts` 走 Node 原生加载 `.ts` 源码，
 * `import './x.css'` 会 `ERR_UNKNOWN_FILE_EXTENSION` 把整轮测试崩掉）。
 *
 * 这些类名只活在本标签页的 DOM 里（悬浮窗是 Shadow DOM），所以：
 *   - 一律 `sztb-bkxk-` 前缀，不与站点页面、也不与公共组件撞名；
 *   - **不需要 `!important`** —— 唯一要压的是公共 `.sztb-input { width: 100% }`，
 *     用「两个类名」提高特异性就够（`.sztb-input.sztb-bkxk-num`）。
 */

export const CUSTOM_TAB_CSS = `
.sztb-bkxk-seg {
  border: 1px solid var(--sztb-border);
  border-radius: 6px;
  padding: 6px 8px 8px;
  margin-bottom: 6px;
}

.sztb-bkxk-seghead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 8px;
  align-items: center;
}

.sztb-bkxk-grid > .sztb-bkxk-key {
  font-size: 12px;
  color: var(--sztb-text-dim);
  white-space: nowrap;
}

.sztb-bkxk-line {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

/* 数字框很窄，得压掉公共 .sztb-input 的 width:100%（两个类名提高特异性） */
.sztb-input.sztb-bkxk-num {
  width: 48px;
  text-align: center;
}

.sztb-select.sztb-bkxk-parity {
  width: auto;
}

.sztb-bkxk-amp {
  font-size: 12px;
  color: var(--sztb-text-dim);
}

.sztb-bkxk-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
}

.sztb-bkxk-item:hover {
  background: var(--sztb-bg-alt);
}

.sztb-bkxk-color {
  flex: 0 0 auto;
  width: 4px;
  height: 30px;
  border-radius: 2px;
  border: 1px solid var(--sztb-border);
}

.sztb-bkxk-itemmain {
  flex: 1 1 auto;
  min-width: 0;
}

.sztb-bkxk-name {
  display: block;
  font-size: 13px;
}

.sztb-bkxk-meta {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sztb-text-dim);
  word-break: break-word;
}

.sztb-bkxk-item[data-off="true"] .sztb-bkxk-name {
  color: var(--sztb-text-dim);
  text-decoration: line-through;
}

.sztb-bkxk-ops {
  flex: 0 0 auto;
  display: flex;
  gap: 4px;
}

/* 公共样式里勾选框只被 .sztb-row input[type=checkbox] 管，这里的行不是 .sztb-row */
.sztb-bkxk-item input[type="checkbox"] {
  flex: 0 0 auto;
  margin: 0;
  width: 15px;
  height: 15px;
  accent-color: var(--sztb-accent);
  cursor: pointer;
}

/* 「自定义课程之间有几处冲突」的警示条：红色左边线 */
.sztb-bkxk-warn {
  border-left-color: var(--sztb-danger);
  color: var(--sztb-danger);
}

.sztb-bkxk-bad {
  color: var(--sztb-danger);
}
`;

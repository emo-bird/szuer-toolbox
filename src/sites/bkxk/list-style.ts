/**
 * 选课列表注入的样式（作为字符串，不写成 `.css` 文件）。
 *
 * 为什么不用 `list.css` + esbuild 的 `--loader:.css=text`（`src/main.ts:24` 那种写法）：
 * `tests/run.ts` 会 import 站点适配器（`sites-registered` 那套），而 node 原生不认识
 * `.css`，会直接 `ERR_UNKNOWN_FILE_EXTENSION` 把整轮测试打挂。项目里标签页的样式
 * 也一律写在 `.ts` 里（`src/common/ui/tabs/log.ts` 的 `tabCss`、`src/sites/demo/index.ts`
 * 的 `demoCss`），这里跟随同一约定。
 *
 * 样式进的是**页面**（`<style>` 塞进 `document.head`），不是悬浮窗的 shadow root ——
 * 因为我们改的是站点自己的行/卡片，必须和站点样式同处一个作用域。
 *
 * 三条自我约束：
 *   1. 所有类名一律 `sztb-bkxk-` 前缀 —— 站点自己的类名都是 `cv-` 开头，
 *      不前缀迟早撞上（旧仓库用 `szu-`，本项目统一改成 `sztb-`）。
 *   2. **改站点布局的规则全部带 `:has(> .sztb-bkxk-col)` 前置条件** ——
 *      只有我们真的往那一列插了节点，才把该容器改成 flex。
 *      否则一条 `.cv-row { display:flex }` 会外溢到页面上所有列表
 *      （包括我们没处理、也不该碰的那些）。
 *   3. 只改布局（display/float/flex），不写死宽度 —— 站点自己的列宽是行内 style，
 *      写死就会在站点调整时错位。
 */

export const LIST_STYLE_ID = 'sztb-bkxk-list-style';

export const LIST_CSS = `
.sztb-bkxk-block {
  display: block;
  margin: 2px 0;
  padding: 2px 6px;
  border-left: 2px solid #2a6df4;
  border-radius: 3px;
  background: rgba(42, 109, 244, 0.06);
  font-size: 12px;
  line-height: 1.5;
}

.sztb-bkxk-id {
  display: block;
  font-family: ui-monospace, Consolas, "Courier New", monospace;
  font-size: 11px;
  color: #1b4fd8;
  white-space: nowrap;
  cursor: pointer;
  /* 一整块可选中：复制失败时用户可以手动拖选，不用一个字符一个字符点 */
  user-select: all;
}

.sztb-bkxk-id:hover {
  text-decoration: underline;
}

.sztb-bkxk-ops {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.sztb-bkxk-btn {
  padding: 1px 6px;
  border: 1px solid #c9d4e6;
  border-radius: 3px;
  background: #fff;
  color: #333;
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}

.sztb-bkxk-btn:hover {
  border-color: #2a6df4;
  color: #2a6df4;
}

/* 已入队 / 已监控 */
.sztb-bkxk-btn-on {
  border-color: #2a6df4;
  background: #2a6df4;
  color: #fff;
}

.sztb-bkxk-btn-on:hover {
  color: #fff;
}

/* 新加的那一列：占满剩余宽度，最小宽度兜住两个按钮不换行 */
.sztb-bkxk-col {
  flex: 1 1 auto;
  min-width: 150px;
  box-sizing: border-box;
}

.sztb-bkxk-head {
  font-weight: bold;
}

/* ---- 只在被我们加过列的容器上改布局 ---- */

.cv-body:has(> .cv-row > .sztb-bkxk-col) > .cv-row {
  display: flex;
  align-items: center;
}

.cv-body:has(> .cv-row > .sztb-bkxk-col) > .cv-row > div {
  float: none;
  flex: 0 1 auto;
  min-width: 0;
}

.cv-head:has(> .sztb-bkxk-col) {
  display: flex;
  align-items: center;
}

.cv-head:has(> .sztb-bkxk-col) > * {
  float: none;
  flex: 0 1 auto;
}

.cv-head:has(> .sztb-bkxk-col) > .sztb-bkxk-col {
  flex: 1 1 auto;
}
`;

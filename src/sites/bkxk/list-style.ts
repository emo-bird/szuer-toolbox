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
 * 四条自我约束：
 *   1. 所有类名一律 `sztb-bkxk-` 前缀 —— 站点自己的类名都是 `cv-` 开头，
 *      不前缀迟早撞上（旧仓库用 `szu-`，本项目统一改成 `sztb-`）。
 *   2. **改站点布局的规则全部带 `:has(...)` 前置条件** ——
 *      行/表头只认「我们真的往那一列插了节点」，卡片只认「含我们注入块的那张卡」。
 *      否则一条 `.cv-row { display:flex }` 会外溢到页面上所有列表，包括我们没处理、
 *      也不该碰的那些（v0.17 新增的压行高规则更要注意这一点：它动的是**站点自己的**
 *      内边距与行高，没有 `:has(> .sztb-bkxk-block)` 就等于全站改版）。
 *   3. 只改布局与间距（display/float/flex/margin/padding/line-height），
 *      **不写死宽度** —— 站点自己的列宽是行内 style，写死就会在站点调整时错位。
 *   4. `!important` 只用在下述「压站点间距」那一组上：站点这几处多半是行内 style
 *      或高特异性选择器，不加 `!important` 根本压不住。我们自己的元素一律不加。
 */

export const LIST_STYLE_ID = 'sztb-bkxk-list-style';

export const LIST_CSS = `
/* ---- 我们自己的注入块（列表行与卡片共用，v0.17 起整体压缩高度） ---- */

.sztb-bkxk-block {
  display: block;
  margin: 0 0 1px;
  padding: 1px 5px;
  border-left: 2px solid #2a6df4;
  border-radius: 3px;
  background: rgba(42, 109, 244, 0.06);
  font-size: 12px;
  line-height: 1.35;
}

.sztb-bkxk-id {
  display: block;
  font-family: ui-monospace, Consolas, "Courier New", monospace;
  font-size: 11px;
  line-height: 1.4;
  color: #1b4fd8;
  white-space: nowrap;
  cursor: pointer;
  /* 一整块可选中：复制失败时用户可以手动拖选，不用一个字符一个字符点 */
  user-select: all;
}

.sztb-bkxk-id:hover {
  text-decoration: underline;
}

/* 两个按钮**必须在同一行**：列表页这一列只有 150px 上下，
   一旦允许换行就折成两行、把整行行高顶上去（v0.17 手测 #52 的反馈） */
.sztb-bkxk-ops {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  margin-top: 1px;
  white-space: nowrap;
}

.sztb-bkxk-btn {
  flex: 0 0 auto;
  padding: 0 6px;
  border: 1px solid #c9d4e6;
  border-radius: 3px;
  background: #fff;
  color: #333;
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
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

/* 新加的那一列：占满剩余宽度，最小宽度兜住「ID 一行 + 两个按钮一行」 */
.sztb-bkxk-col {
  flex: 1 1 auto;
  min-width: 150px;
  box-sizing: border-box;
}

.sztb-bkxk-head {
  font-weight: bold;
  /* 站点给表头单元格挂的排序箭头（伪元素或背景图）会连我们这份一起命中 ——
     我们的表头不是可排序列，v0.17 手测 #53 要求清掉（用户拍板保留「抢课模块」文字） */
  background-image: none !important;
  cursor: default;
}

.sztb-bkxk-head::before,
.sztb-bkxk-head::after {
  content: none !important;
  display: none !important;
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

/* ---- 卡片页：压站点自己的间距，一屏多显示几张卡（v0.17 手测 #54） ----
   严格限制在「含我们注入块的那张卡」上：没有注入的卡片一律不动。
   注入块是 .cv-info 的第一个子元素，所以锚点用 :has(> .sztb-bkxk-block)。 */

.cv-info:has(> .sztb-bkxk-block) {
  padding-top: 2px !important;
  padding-bottom: 2px !important;
}

.cv-info:has(> .sztb-bkxk-block) > h5 {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  line-height: 1.3 !important;
}

.cv-info:has(> .sztb-bkxk-block) > h5 > div,
.cv-info:has(> .sztb-bkxk-block) > div.cv-caption-text,
.cv-info:has(> .sztb-bkxk-block) > div.cv-caption-red {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  line-height: 1.3 !important;
}

.cv-info:has(> .sztb-bkxk-block) > div.cv-operate {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
}
`;

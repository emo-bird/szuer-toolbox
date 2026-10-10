/**
 * 选课列表注入的样式（作为字符串，不写成 `.css` 文件）。
 *
 * 为什么不用 `list.css` + esbuild 的 `--loader:.css=text`（`src/main.ts:24` 那种写法）：
 * `tests/run.ts` 会 import 站点适配器（`sites-registered` 那套），而 node 原生不认识
 * `.css`，会直接 `ERR_UNKNOWN_FILE_EXTENSION` 把整轮测试打挂。项目里标签页的样式
 * 也一律写在 `.ts` 里，这里跟随同一约定。
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

/* ---- 卡片页：卡片高度改为「按内容自适应」+ 缩小卡片内外边距（v0.17 手测 #54/#55，
        v0.18 按 v5 采样定稿）----

   **为什么必须让高度自适应**：站点给 .cv-course-card 写死了 210px 高（v5 采样实测 13 张卡
   的计算高度全是 210px，overflow 是 visible），而卡片里的 .cv-info 实际有 234–254px 高
   —— 各卡内容本来就不一样（有的多一行 .cv-caption-text / .cv-caption-red）。
   固定高度装不下，内容就从卡片下沿漏出去；也是因为这个写死的高度，我们压 h5 的行高
   在屏幕上一屏卡片数量毫无变化（用户手测「行高没有减少」的真正原因）。
   所以这里对含我们块的卡片改 height: auto（!important 压得住站点的行内 style），
   min-height 保留站点原值，以免内容少的卡变得比站点风格还矮。

   严格限制在「含我们注入块的那张卡」上：没有注入的卡片一律不动。
   注入块是 .cv-info 的第一个子元素，所以锚点用 :has(> .cv-info > .sztb-bkxk-block)。 */

.cv-course-card:has(> .cv-info > .sztb-bkxk-block) {
  height: auto !important;
  min-height: 210px;
  /* 站点是 16px。v0.18 先压到 8px 10px，手测反馈「过于不美观」⇒ v0.19 恢复一点点到 12px 14px：
     既比站点原样紧，又不至于内容贴边。想再松/再紧就改这一行。 */
  padding: 12px 14px !important;
  box-sizing: border-box;
}

.cv-info:has(> .sztb-bkxk-block) {
  padding: 2px 0 !important;
}

/* 卡片内容区里的每一层：上下外边距一律清零（站点给这些 div 挂了 margin-top: 4px）。
   这里用通配而不是逐个列举，是因为站点各卡的元素数量不同 ——
   列举漏掉的那一层就是「部分卡片还是溢出」的原因（v5 采样里那三个 20/16/32px 的 div）。 */
.cv-info:has(> .sztb-bkxk-block) > * {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

.cv-info:has(> .sztb-bkxk-block) > h5 {
  line-height: 1.3 !important;
}

.cv-info:has(> .sztb-bkxk-block) > h5 > div,
.cv-info:has(> .sztb-bkxk-block) > div.cv-caption-text,
.cv-info:has(> .sztb-bkxk-block) > div.cv-caption-red {
  line-height: 1.3 !important;
}

.cv-info:has(> .sztb-bkxk-block) > div.cv-operate {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
}

/* 卡片里我们的块：ID 与按钮保持两行（卡片只有 ~212px 宽，硬挤一行会把 ID 截断），
   但纵向间距再收一点。站点给 .cv-info 的子元素挂了 margin-top，这里要显式压掉。 */
.cv-info > .sztb-bkxk-block {
  margin-top: 0;
  margin-bottom: 2px;
}

/* ---- 站点节点的重新摆位（v0.20）----

   list.ts 会把站点自己的两个节点挪位置（见那边 relocateInUnit 的注释）：
     · 退选按钮 button.cv-delete-volunteer → 挪进 h5、「已选」标签旁边
     · 收藏星标 img.collection-img → 挪到课名（span.cv-info-title）前面
   搬完剩下的宽度问题由这里的样式解决。 */

/* h5 原来是「float:left 的课名 + inline-block 的标签」。
   课名浮动后不占文档流宽度，剩下的空间不够再塞一个退选按钮（h5 宽 216px，
   课名 136 + 已选 41 + 间隙 4 = 177，只剩 39px，而退选按钮要 41px）。
   改成 flex 之后三个元素一起参与排布，课名按内容自适应宽度，标签靠右。 */
.cv-info:has(> .sztb-bkxk-block) > h5 {
  display: flex !important;
  align-items: center;
  gap: 4px;
}

/* 课名：取消浮动、按内容宽度占位（min-width: 0 允许它在极窄时收缩，不撑破卡片） */
.cv-info:has(> .sztb-bkxk-block) > h5 > .cv-info-title {
  float: none !important;
  flex: 0 1 auto;
  min-width: 0;
}

/* h5 里的三个标签（星标 / 已选 / 退选）：不缩放、不换行，各自的 margin 由站点给 */
.cv-info:has(> .sztb-bkxk-block) > h5 > .cv-one,
.cv-info:has(> .sztb-bkxk-block) > h5 > .cv-delete-volunteer,
.cv-info:has(> .sztb-bkxk-block) > h5 > .collection-img {
  flex: 0 0 auto;
}

/* 星标搬进 h5 后，原本由它那层 div 提供的 20px 行高没了 —— 星标自己带
   vertical-align: middle 是给行内流用的，flex 下不生效，靠 align-items: center 对齐。
   站点给它的 inline style 里有 width/height: 20px，保留。 */
.cv-info:has(> .sztb-bkxk-block) > h5 > .collection-img {
  display: block;
  cursor: pointer;
}

/* 退选按钮搬走以后，站点那个只装它一个的 div.cv-caption-text 会变成空 div。
   站点在未选课时这个 div 本来就高 0，所以**不需要额外规则** —— 这里只兜一层保险：
   万一站点给空 div 补了伪元素或背景，也不让它冒出行高。 */
.cv-info:has(> .sztb-bkxk-block) > div.cv-caption-text:empty {
  height: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
}
`;

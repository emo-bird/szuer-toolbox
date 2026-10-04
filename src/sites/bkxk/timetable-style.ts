/**
 * 课表页里**我们的标签**的样式（字符串，不写独立 `.css` 文件）。
 *
 * v0.29 起课表卡片由站点自己画，我们只往自定义课程那一行的课名里塞一个
 * `<span class="sztb-bkxk-tt-tag">自定义</span>`（见 `tt-mark.ts`）——
 * 所以这里只剩这一条规则。注意不能再拿 `.sztb-bkxk-tt-card` 当作用域：
 * 那个类属于随自绘一起删掉的那一套。
 *
 * 与 `list-style.ts` 同一约定：类名一律 `sztb-bkxk-` 前缀（站点自己是 `cv-`）；
 * 样式进的是**页面**（`<style>` 塞进 `document.head`），不是悬浮窗的 shadow root ——
 * 标签待在站点自己的卡片里，必须和站点样式同处一个作用域；
 * 只动我们自己的节点，所以这一组规则不需要 `!important`。
 */

export const TT_STYLE_ID = 'sztb-bkxk-tt-style';

export const TT_CSS = `
/* ---- 站点画的卡片里、我们塞进去的「自定义」标签 ---- */

.sztb-bkxk-tt-tag {
  display: inline-block;
  font-size: 11px;
  line-height: 1.3;
  padding: 0 3px;
  border-radius: 2px;
  background: #047adc;
  color: #fff;
  margin-left: 3px;
  /* 站点的卡片文字可能被设成块级/绝对定位，这里把小标签按行内块摆稳 */
  vertical-align: middle;
}
`;

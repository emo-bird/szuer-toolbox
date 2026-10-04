/**
 * 自绘课表注入到站点课表页的样式（字符串，不写独立 `.css` 文件）。
 *
 * 与 `list-style.ts` 同一约定：
 *   - 类名一律 `sztb-bkxk-` 前缀（站点自己是 `cv-`）；
 *   - 样式进的是**页面**（`<style>` 塞进 `document.head`），不是悬浮窗的 shadow root ——
 *     改的是站点自己的课表列，必须和站点样式同处一个作用域；
 *   - 只动**我们自己注入的节点**（不写 `:has()` 条件式改站点布局，也不动站点卡片的宽高），
 *     所以这一组规则不需要 `!important`。
 */

export const TT_STYLE_ID = 'sztb-bkxk-tt-style';

export const TT_CSS = `
/* ---- 我们注入的自定义课程卡片（结构照站点 .cv-course-card-single） ---- */

.sztb-bkxk-tt-card {
  opacity: .92;
}

.sztb-bkxk-tt-card .sztb-bkxk-tt-tag {
  display: inline-block;
  font-size: 11px;
  line-height: 1.3;
  padding: 0 3px;
  border-radius: 2px;
  background: #047adc;
  color: #fff;
  margin-left: 3px;
}

/* 与站点已选课程冲突：整门课高亮（旧仓库口径） */
.sztb-bkxk-tt-card.sztb-bkxk-tt-conflict {
  outline: 2px solid #c0392b;
  outline-offset: -2px;
}

.sztb-bkxk-tt-card .sztb-bkxk-tt-conflict-tip {
  color: #c0392b;
  font-size: 11px;
}
`;

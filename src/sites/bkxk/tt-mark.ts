/**
 * 「这是我们加进去的课」的标记（v0.29 起，站点绘制为主）。
 *
 * 【为什么要把标签拼进**数据字段**】
 * 站点渲染一张课表卡的代码（`curriculum.min.js`，已落盘 `local/capture/curriculum-cards.txt`）是：
 *
 * ```js
 * n += '<div class="cv-course-card-single "><div><div>' + o + "</div><div>" + c + " " + d
 *      + "</div><div>" + v + "</div><div>" + h + "</div></div></div>"
 * ```
 * 其中 `o = courseName`（还可能被拼上 `-courseIndex`、`[sportName]`）、`c = weekName`、
 * `d = beginSection-endSection+"节"`、`v = teachingPlace`、`h = teacherName`。
 * **这些字段一律原样拼进 HTML、一个字都不转义**，而站点**不渲染任何数据属性**
 * （`wid` / `teachingClassID` / `data-*` 全没有）⇒ 想让站点画出来的卡片带我们的标记，
 * 唯一的路子就是**往某个文本字段里塞我们自己的 HTML**。
 *
 * 用户拍板：塞进 `courseName`（标签跟课名同一行，与旧版观感一致）；
 * 「与已选课程冲突」的红框**本轮不做**（站点那个 class 是写死的，红框只能靠渲染后加类）。
 *
 * ⚠️ 由此带来的责任：**我们**成了拼 HTML 的一方，所以这里对用户名/地点等**调用方传入的文本
 * 做转义**（`escapeText`）。站点自己不转义，等于把用户输入直接当 HTML 用；
 * 转义后浏览器会把 `&lt;` 还原成文本显示，观感与站点一致而不会破版。
 */

/** 标签自身的类名（我们自己给样式） */
export const TT_TAG_CLASS = 'sztb-bkxk-tt-tag';
/** 标记属性：认「这一行是我们加的」只认它，不认 class（class 可能被站点样式覆盖） */
export const TT_MARK_ATTR = 'data-sztb-tt';
/** 标签文字 */
export const TT_TAG_TEXT = '自定义';
/** 认标记节点用的选择器 */
export const TT_TAG_SELECTOR = `[${TT_MARK_ATTR}]`;
/** 拼进 `courseName` 的那段 HTML */
export const TT_TAG_HTML = `<span class="${TT_TAG_CLASS}" ${TT_MARK_ATTR}="1">${TT_TAG_TEXT}</span>`;

/** 转义会破坏 HTML 结构的四个字符（只做这层，够用且不改观感） */
export function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 课名 + 我们的标签 —— 这就是交给站点的 `courseName`。
 *
 * ⚠️ 站点会在它后面接着拼 `-courseIndex` / `[sportName]`：我们这两项都是 `null`，
 * 所以最终渲染出来就是「课名 + 蓝色「自定义」标签」。
 */
export function tagMarkedName(name: string): string {
  return `${escapeText(name)}${TT_TAG_HTML}`;
}

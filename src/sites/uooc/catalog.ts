/**
 * UOOC 资源类型字典（纯函数，可单测）。
 *
 * 新连播是**纯 DOM 点击**的（见 `autoplay.ts` 文件头），不再拉 `getCatalogList` /
 * `getUnitLearn` 自己算路线 ⇒ 原来的「解析 + 展平 + 拼 URL」整套随之删除
 * （用户 m05858 拍板全删；需要时可从 git 历史取回）。
 *
 * 这里只留一件东西：**资源类型号 → 动作种类**的映射。
 *
 * ⚠️ 类型号的**来源变了**：以前读接口响应里的 `unitSource[i].type`，
 * 现在读目录 DOM 上那颗类型图标的 `ng-if`：
 *
 * ```
 * <span class="tag-source-ico iconfont icon-video" ng-if="source.type == 10">
 * ```
 *
 * 站点自己的类型号没变，所以字典不用改，只是取材处换了。
 */

// --------------------------------------------------------------- 资源类型

/** `source.type` 的取值字典（接口与 DOM 里是同一套号） */
export const SOURCE_TYPE = {
  VIDEO: '10',
  ATTACH: '50',
  TEXT: '60',
  DISCUSSION: '70',
  QUIZ: '80',
} as const;

export type SourceKind = 'video' | 'attach' | 'text' | 'discussion' | 'quiz' | 'unknown';

/**
 * 把资源类型归一化成动作分派用的种类。
 *
 * ⚠️ `type` 有时是数字 `50`、有时是字符串 `"80"`（同一份响应里两种都实测到过），
 * 所以入参一律先 `String()`。
 */
export function classifySource(type: unknown): SourceKind {
  switch (String(type)) {
    case SOURCE_TYPE.VIDEO:
      return 'video';
    case SOURCE_TYPE.ATTACH:
      return 'attach';
    case SOURCE_TYPE.TEXT:
      return 'text';
    case SOURCE_TYPE.DISCUSSION:
      return 'discussion';
    case SOURCE_TYPE.QUIZ:
      return 'quiz';
    default:
      return 'unknown';
  }
}

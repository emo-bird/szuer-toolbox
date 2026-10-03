/**
 * 悬浮窗的几何计算 —— **纯函数，零 DOM**。
 *
 * 为什么要单独成文件：这里是「球与关闭键同坐标」这条交互不变量的**全部**数学，
 * 而 `panel.ts` 依赖 `document`、在 node 下测不了。抽出来之后
 * `tests/suites/panel-geometry.test.ts` 能钉住往返一致性（往返必须恒等），
 * 这正是「收起 / 展开看起来是在同一个点上缩放」的实现依据。
 *
 * ## 两个方向
 *
 * - `ballPosFromPanel()`：**收起时**用。球落到标题栏折叠按钮的中心，
 *   于是「点折叠 → 球落在原地」；
 * - `panelPosFromBall()`：**展开时**用。反过来把面板挪到球的位置，
 *   于是「点球 → 面板从球那里长出来」，用户把球拖到哪就在哪展开。
 *
 * 两者互为逆运算：`panelPosFromBall(ballPosFromPanel(p)) === p`（有测试钉住）。
 */

export interface Pos {
  left: number;
  top: number;
}

/** 悬浮球直径 */
export const BALL_SIZE = 44;
/** 面板与视口边界的最小间距（拖动、缩放、展开钳制都用它） */
export const VIEWPORT_MARGIN = 8;
/** 首次出现时的面板尺寸 */
export const DEFAULT_SIZE: { width: number; height: number } = { width: 344, height: 430 };
/** 缩放下限 */
export const MIN_SIZE: { width: number; height: number } = { width: 260, height: 180 };

/**
 * 标题栏高度 —— **与 style.css 的 `.sztb-head` 手工保持一致**
 * （上下 `padding: 8px` ×2 + 内容 22px，即 `.sztb-iconbtn` 的高度）。
 */
export const HEAD_HEIGHT = 37;

/**
 * 折叠按钮中心到面板右边缘的距离 —— 同样是从 CSS 反推：
 * `.sztb-head` 的 `padding-right: 10px` + 按钮宽 22px 的一半。
 *
 * ⚠️ 改样式必须同步改这两个常量，否则球会偏（差 1px 也看得出来）。
 */
export const COLLAPSE_BTN_INSET = 21;

export function isPos(v: unknown): v is Pos {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Pos).left === 'number' &&
    typeof (v as Pos).top === 'number'
  );
}

/** 面板位置 ⇒ 球的位置（球的中心 = 折叠按钮的中心） */
export function ballPosFromPanel(panelPos: Pos, size: { width: number; height: number }): Pos {
  return {
    left: panelPos.left + size.width - COLLAPSE_BTN_INSET - BALL_SIZE / 2,
    top: panelPos.top + HEAD_HEIGHT / 2 - BALL_SIZE / 2,
  };
}

/** 球的位置 ⇒ 面板位置（`ballPosFromPanel` 的逆运算，展开时用） */
export function panelPosFromBall(ballPos: Pos, size: { width: number; height: number }): Pos {
  return {
    left: ballPos.left + BALL_SIZE / 2 + COLLAPSE_BTN_INSET - size.width,
    top: ballPos.top + BALL_SIZE / 2 - HEAD_HEIGHT / 2,
  };
}

/**
 * 把元素左上角约束在视口内。
 *
 * 视口尺寸由调用方传入（浏览器里是 `window.innerWidth/innerHeight`），
 * 这样本函数保持纯净、可测。
 *
 * ⚠️ 视口比元素还小时 `max` 会小于下限，此时以 `VIEWPORT_MARGIN` 为准
 * （宁可溢出，也不让元素跑到负坐标去）。
 */
export function clampToViewport(
  pos: Pos,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): Pos {
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
  return {
    left: Math.min(Math.max(pos.left, VIEWPORT_MARGIN), maxLeft),
    top: Math.min(Math.max(pos.top, VIEWPORT_MARGIN), maxTop),
  };
}

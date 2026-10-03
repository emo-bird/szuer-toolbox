/**
 * 纯函数冒烟（档1）：悬浮窗几何 —— 「球与关闭键同坐标」这条交互不变量的全部数学。
 *
 * 用户提过两轮要求，方向刚好相反，两条都靠这几个纯函数满足：
 *   1. 收起时（v0.13）：球落到标题栏关闭键的中心 ——「点折叠，球落在原地」；
 *   2. 展开时（m00593）：面板反过来挪到球的位置，关闭键中心对齐球心 ——
 *      「球拖到哪，面板就在哪长出来」，越界时钳回视口并让球跟进。
 *
 * 所以这里是**互逆的一对**，往返必须恒等 —— 这条性质最容易在改 CSS 常量时被破坏
 * （`HEAD_HEIGHT` / `COLLAPSE_BTN_INSET` 是从 `.sztb-head` 的样式反推的手工常量），
 * 而在浏览器里只表现为「球偏了几个像素」，肉眼很难发现、更没法自动测。
 * `panel.ts` 自己碰 `document`、测不了，判定逻辑就全压在这里。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  BALL_SIZE,
  COLLAPSE_BTN_INSET,
  DEFAULT_SIZE,
  HEAD_HEIGHT,
  MIN_SIZE,
  VIEWPORT_MARGIN,
  ballPosFromPanel,
  clampToViewport,
  isPos,
  panelPosFromBall,
} from '../../src/common/ui/panel-geometry.ts';

/** 一个常规面板位置（右上角附近） */
const PANEL: { left: number; top: number } = { left: 920, top: 84 };
/** 常用视口 */
const VW = 1280;
const VH = 800;

describe('common/ui/panel-geometry —— 球与关闭键同坐标', () => {
  it('往返恒等：由面板推出的球位置，反推回来还是同一个面板位置', () => {
    const sizes = [DEFAULT_SIZE, { width: 600, height: 400 }, MIN_SIZE];
    const panels = [
      PANEL,
      { left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN },
      { left: 640.5, top: 301.25 },
    ];
    for (const size of sizes) {
      for (const panelPos of panels) {
        assertDeepEqual(
          panelPosFromBall(ballPosFromPanel(panelPos, size), size),
          panelPos,
          `尺寸 ${size.width}×${size.height}、面板 (${panelPos.left},${panelPos.top}) 的往返必须恒等`,
        );
      }
    }
  });

  it('球心正好落在关闭键中心上（横向与纵向都要对）', () => {
    const ball = ballPosFromPanel(PANEL, DEFAULT_SIZE);
    assertEqual(
      ball.left + BALL_SIZE / 2,
      PANEL.left + DEFAULT_SIZE.width - COLLAPSE_BTN_INSET,
      '横向：球心 = 面板右边缘 - 关闭键内边距',
    );
    assertEqual(ball.top + BALL_SIZE / 2, PANEL.top + HEAD_HEIGHT / 2, '纵向：球心 = 标题栏中线');
  });

  it('展开时面板从球那里长出来：关闭键中心回到球心', () => {
    const size = { width: 420, height: 500 };
    const ball = { left: 700, top: 260 };
    assertDeepEqual(ballPosFromPanel(panelPosFromBall(ball, size), size), ball);
  });

  it('球被拖到左上角时，反推的面板会跑到屏幕外 ⇒ 必须靠钳制救回来', () => {
    const ball = { left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN };
    const raw = panelPosFromBall(ball, DEFAULT_SIZE);
    // 横向差一整个面板宽度（球在左边缘，面板要向左长出 344px）⇒ 一定是负的
    assert(raw.left < 0, `前提：不钳制的话面板左上角为负（实际 ${raw.left}）`);
    // 纵向只差 HEAD_HEIGHT/2 − BALL_SIZE/2 = −3.5px，所以不会变负、但会把面板顶到
    // 比球更靠下的位置 —— 这正是「面板从球那里长出来」以标题栏中线对齐的结果
    assertEqual(raw.top, VIEWPORT_MARGIN + BALL_SIZE / 2 - HEAD_HEIGHT / 2);
    const clamped = clampToViewport(raw, DEFAULT_SIZE.width, DEFAULT_SIZE.height, VW, VH);
    assertEqual(clamped.left, VIEWPORT_MARGIN, '横向被钳到左边界内侧');
    assertEqual(clamped.top, raw.top, '纵向本来就在界内，钳制不该动它');
  });

  it('展开的完整流程（反推 → 钳制 → 球跟进）：球与面板最后都在视口内', () => {
    const size = DEFAULT_SIZE;
    // 用户把球拖到右下角
    const ball = { left: VW - BALL_SIZE, top: VH - BALL_SIZE };
    const panelPos = clampToViewport(
      panelPosFromBall(ball, size),
      size.width,
      size.height,
      VW,
      VH,
    );
    const ballAfter = ballPosFromPanel(panelPos, size);

    assert(panelPos.left >= VIEWPORT_MARGIN, '面板左边界不越界');
    assert(panelPos.left + size.width <= VW - VIEWPORT_MARGIN, '面板右边界不越界');
    assert(panelPos.top + size.height <= VH - VIEWPORT_MARGIN, '面板下边界不越界');
    assert(ballAfter.left >= VIEWPORT_MARGIN && ballAfter.left + BALL_SIZE <= VW, '球横向被拉回视口');
    assert(ballAfter.top >= VIEWPORT_MARGIN && ballAfter.top + BALL_SIZE <= VH, '球纵向被拉回视口');
    assertDeepEqual(
      ballAfter,
      ballPosFromPanel(panelPos, size),
      '球跟进之后仍然与关闭键同坐标（不变量不被钳制破坏）',
    );
  });
});

describe('common/ui/panel-geometry —— 视口钳制', () => {
  it('界内的坐标原样返回（不许无谓抖动）', () => {
    const pos = { left: 300, top: 200 };
    assertDeepEqual(clampToViewport(pos, 344, 430, VW, VH), pos);
  });

  it('越界时贴到边界内侧 VIEWPORT_MARGIN 处', () => {
    assertDeepEqual(clampToViewport({ left: -50, top: -80 }, 344, 430, VW, VH), {
      left: VIEWPORT_MARGIN,
      top: VIEWPORT_MARGIN,
    });
    assertDeepEqual(clampToViewport({ left: VW + 10, top: VH + 10 }, 344, 430, VW, VH), {
      left: VW - 344 - VIEWPORT_MARGIN,
      top: VH - 430 - VIEWPORT_MARGIN,
    });
  });

  it('视口比元素还小时以 VIEWPORT_MARGIN 为准（宁可溢出，也不让坐标变负）', () => {
    const clamped = clampToViewport({ left: 100, top: 100 }, 900, 900, 400, 400);
    assertDeepEqual(clamped, { left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN });
  });

  it('恰好等于边界值时不改动', () => {
    const clamped = clampToViewport(
      { left: VW - 344 - VIEWPORT_MARGIN, top: VH - 430 - VIEWPORT_MARGIN },
      344,
      430,
      VW,
      VH,
    );
    assertDeepEqual(clamped, { left: VW - 344 - VIEWPORT_MARGIN, top: VH - 430 - VIEWPORT_MARGIN });
  });
});

describe('common/ui/panel-geometry —— 存储值的形状校验', () => {
  it('isPos：只接受 left/top 都是数字的对象', () => {
    assert(isPos({ left: 0, top: 0 }), '零也是合法坐标');
    assert(isPos({ left: -5, top: 1.5 }), '小数与负数合法');
    assert(!isPos(null), 'null 不合法（storage 读不到时就是它）');
    assert(!isPos(undefined), 'undefined 不合法');
    assert(!isPos({ left: 0 }), '缺 top 不合法');
    assert(!isPos({ left: '0', top: 0 }), '字符串不合法');
    assert(!isPos('0,0'), '字符串整体不合法');
  });
});

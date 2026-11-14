/**
 * 悬浮窗外壳。
 *
 * 结构（全部在 Shadow DOM 内，见需求文档 §2.2 样式隔离【混合方案】）：
 *
 *   <div class="sztb-root" data-collapsed>       ← 悬浮球 / 面板 二选一显示
 *     <div class="sztb-ball">深</div>
 *     <div class="sztb-panel">
 *       <header class="sztb-head">…</header>     ← 拖拽手柄
 *       <nav class="sztb-tabbar">…</nav>          ← 一级平铺标签栏
 *       <div class="sztb-body">…</div>
 *       <div class="sztb-resize"></div>
 *     </div>
 *   </div>
 *   <div class="sztb-toasts">…</div>              ← 独立于面板，折叠时也能弹
 *   <div class="sztb-modal-mask">…</div>          ← 二次确认时临时插入
 *
 * 位置 / 大小 / 折叠状态**跨站点共用同一份存储**（需求文档 §4）：
 *   ui:panel-pos   { left, top }     面板左上角
 *   ui:size        { width, height }
 *   ui:collapsed   boolean
 *
 * 例外是「上次停留的标签页」`ui:active-tab:<页面>` —— 它**按页面分键**（scope 见
 * `tab-order.ts` 的 `pageScopeOf`）：位置是「我的面板在哪」（跨站共用才合理），
 * 标签是「我在这个页面看哪一页」，两者语义不同 —— bkxk 页面停在哪一页
 * 与 UOOC 页面停在哪一页必须互不干扰。
 *
 * 悬浮球**没有自己的坐标**（v0.13 改）：收起时球对齐到标题栏折叠按钮的中心，
 * 展开时反过来把面板挪到球那里（用户 m00593）—— 两个方向都走 `panel-geometry.ts`
 * 里的互逆函数，所以「球在哪」始终不构成第三份状态。
 */

import { el, clamp } from '../utils/dom.ts';
import { read, write } from '../core/storage.ts';
import { scoped } from '../core/log.ts';
import { TabView } from './tabs.ts';
import { applyDisplayPreferences } from './display.ts';
import { activeTabKey, pageScopeOf, resolveActiveTab } from './tab-order.ts';
import type { TabOrderInput } from './tab-order.ts';
import {
  BALL_SIZE,
  DEFAULT_SIZE,
  MIN_SIZE,
  VIEWPORT_MARGIN,
  ballPosFromPanel,
  clampToViewport,
  isPos,
  panelPosFromBall,
} from './panel-geometry.ts';
import type { Pos } from './panel-geometry.ts';
import { ToastStack } from './widgets/toast.ts';
import { showConfirm } from './widgets/confirm.ts';
import { showAuthAlert } from './widgets/auth-alert.ts';
import { closeModalAlerts, showModalAlert } from './widgets/modal.ts';
import type { PanelApi } from '../../sites/types.ts';

const log = scoped('ui/panel');

/** 一个待挂载的标签页 + 它归属的站点 id（公共标签页用 'common'） */
export type TabEntry = TabOrderInput;

export interface PanelOptions {
  /** 标题栏右侧显示的站点名；null 表示只显示「深大人工具箱」 */
  siteName: string | null;
}

export interface PanelHandle extends PanelApi {
  /** 完全销毁（页面卸载前调用） */
  destroy(): void;
}

const SIZE_KEY = 'ui:size';
const COLLAPSED_KEY = 'ui:collapsed';

/**
 * 面板位置。**球没有自己的键了**（v0.13）：球每次折叠都对齐到关闭键中心，
 * 那个坐标由面板位置 + 尺寸算出来，没有第三份状态可存。
 * 旧安装留下的 `ui:ball-pos` 已停用 —— 不再读取，也不主动删除（留着无害）。
 */
const PANEL_POS_KEY = 'ui:panel-pos';

function readPanelPos(): Pos | null {
  const raw = read<Pos | null>(PANEL_POS_KEY, null);
  return isPos(raw) ? raw : null;
}

function defaultPanelPos(): Pos {
  return {
    left: Math.max(VIEWPORT_MARGIN, window.innerWidth - DEFAULT_SIZE.width - 16),
    top: 84,
  };
}

function readSize(): { width: number; height: number } {
  const raw = read<{ width: number; height: number } | null>(SIZE_KEY, null);
  if (raw === null || typeof raw.width !== 'number' || typeof raw.height !== 'number') {
    return { ...DEFAULT_SIZE };
  }
  return raw;
}

/**
 * 把元素左上角约束在视口内。
 * 视口尺寸只有这里能拿到（`window`），几何算法本身在 `panel-geometry.ts`（纯函数、有档 1 测试）。
 */
function clampPosition(pos: Pos, width: number, height: number): Pos {
  return clampToViewport(pos, width, height, window.innerWidth, window.innerHeight);
}


/** 指针拖拽的通用封装：pointerdown 之后跟到 pointerup 为止 */
function startDrag(
  ev: PointerEvent,
  onMove: (dx: number, dy: number) => void,
  onEnd: () => void,
): void {
  ev.preventDefault();
  ev.stopPropagation();
  const startX = ev.clientX;
  const startY = ev.clientY;
  const pointerId = ev.pointerId;

  const move = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    e.preventDefault();
    onMove(e.clientX - startX, e.clientY - startY);
  };
  const up = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', up, true);
    onEnd();
  };

  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
}

/**
 * 创建悬浮窗。
 * @param baseCss 公共样式文本（由构建期以 text loader 打进包里的 style.css）
 * @param entries 初始标签页集合
 */
export function createPanel(
  baseCss: string,
  entries: readonly TabEntry[],
  options: PanelOptions,
): PanelHandle {
  const host = el('div', { class: 'sztb-host' });
  // 宿主元素本身不参与布局；隔离靠 shadow root 内的 :host { all: initial }
  host.style.setProperty('position', 'fixed');
  host.style.setProperty('inset', '0');
  host.style.setProperty('width', '0');
  host.style.setProperty('height', '0');
  host.style.setProperty('z-index', '2147483000');

  const shadow = host.attachShadow({ mode: 'open' });
  applyDisplayPreferences(host);

  const baseStyle = document.createElement('style');
  baseStyle.textContent = baseCss;
  shadow.appendChild(baseStyle);

  // ------------------------------------------------------------ 按键盾
  //
  // bkxk 站点自己挂了「禁止后退键」（抓包原文，见 docs/开发文档.md §4.3）：
  //   document.onkeydown = BH_UTILS.banBackSpace;
  //   // 事件源 type 不是 text/textarea/password/... 就吞掉 Backspace
  // 而 Shadow DOM 会把内部事件的 target **重定向为宿主元素**（.sztb-host，
  // 没有 type 属性）⇒ 站点判定「不是输入框」⇒ 面板内所有输入框的 Backspace
  // 被 preventDefault 掉。表现就是「退格删不掉前一个字符，只有 Delete 能用」。
  //
  // 对策：在 shadow root 的**冒泡阶段**把键盘事件截住，让它根本不出 shadow 树。
  //   ⚠️ 必须是冒泡阶段 —— 捕获阶段截会连输入框自己都收不到按键；
  //   ⚠️ 只 stopPropagation，**不要** preventDefault，否则输入框的编辑行为也没了。
  //   ⚠️ 用捕获阶段挂在 document 上的代码（如 confirm.ts 的 Esc 关闭）执行更早，不受影响。
  const blockKeyLeak = (ev: Event): void => {
    ev.stopPropagation();
  };
  shadow.addEventListener('keydown', blockKeyLeak);
  shadow.addEventListener('keypress', blockKeyLeak);

  const ball = el('div', {
    class: 'sztb-ball',
    text: '深',
    attrs: { role: 'button', tabindex: 0, 'aria-label': '展开深大人工具箱', title: '深大人工具箱（点击展开）' },
  });

  const titleText = el('span', { class: 'sztb-title' }, '深大人工具箱');
  if (options.siteName !== null) {
    titleText.appendChild(el('span', { class: 'sztb-site', text: ` · ${options.siteName}` }));
  }

  const collapseBtn = el('button', {
    class: 'sztb-iconbtn',
    text: '—',
    attrs: { type: 'button', title: '收起为悬浮球' },
  });
  const head = el(
    'header',
    { class: 'sztb-head' },
    titleText,
    collapseBtn,
  );

  const tabKey = activeTabKey(pageScopeOf(entries));
  const tabView = new TabView(shadow, (tabId) => write(tabKey, tabId));
  const resizeHandle = el('div', { class: 'sztb-resize', attrs: { title: '拖拽调整大小' } });

  const panelEl = el('div', { class: 'sztb-panel' }, head, tabView.tabbar, tabView.body, resizeHandle);

  const root = el('div', { class: 'sztb-root' }, ball, panelEl);
  shadow.appendChild(root);

  const toasts = new ToastStack(shadow);

  // ------------------------------------------------------------ 状态
  //
  // 折叠状态的取值优先级（需求变更 v0.8）：
  //   1. 用户上次手动设置的折叠态（跨站点共用）
  //   2. 没有记录时 ⇒ **默认展开**（初次访问任何匹配站点都显示悬浮窗）
  let collapsed = read(COLLAPSED_KEY, false);

  let size = readSize();
  let panelPos: Pos = readPanelPos() ?? defaultPanelPos();
  // 球的位置：永远由面板位置 + 尺寸推出「折叠按钮中心」，收起时球正好落在原地
  let ballPos: Pos = ballPosFromPanel(panelPos, size);

  function applyGeometry(): void {
    size = {
      width: Math.max(MIN_SIZE.width, size.width),
      height: Math.max(MIN_SIZE.height, size.height),
    };

    // 两个坐标都各自 clamp 到视口内
    panelPos = clampPosition(panelPos, size.width, size.height);
    ballPos = clampPosition(ballPos, BALL_SIZE, BALL_SIZE);

    panelEl.style.setProperty('left', `${panelPos.left}px`);
    panelEl.style.setProperty('top', `${panelPos.top}px`);
    panelEl.style.setProperty('width', `${size.width}px`);
    panelEl.style.setProperty('height', `${size.height}px`);

    ball.style.setProperty('left', `${ballPos.left}px`);
    ball.style.setProperty('top', `${ballPos.top}px`);

    root.dataset['collapsed'] = String(collapsed);
  }

  function setCollapsed(next: boolean): void {
    if (next === collapsed) return;
    collapsed = next;
    write(COLLAPSED_KEY, collapsed);
    if (collapsed) {
      // 收起：球落到标题栏折叠按钮的**中心**（用户拍板：两者同坐标，
      // 收起 / 展开看上去是在同一个点上的「缩 / 放」而不是「移动」）。
      ballPos = ballPosFromPanel(panelPos, size);
    } else {
      // 展开（用户 m00593 要求）：把面板挪到**球**的位置 —— 关闭键中心对齐球心，
      // 于是「球拖到哪，面板就在哪展开」。若这么算出来的面板会越出视口，
      // 先把它钳回视口内，再让球跟进到钳制后的关闭键处：
      // 「球与关闭键同坐标」这条不变量任何情况下都成立，代价是球的落点可能被边界拉回。
      // ⚠️ 这里**不落盘**：球的位置本就是会话内的临时落点（拖动球不记忆），
      //    落盘会把一次临时拖动升级成永久记忆。
      panelPos = clampPosition(panelPosFromBall(ballPos, size), size.width, size.height);
      ballPos = ballPosFromPanel(panelPos, size);
    }
    applyGeometry();
  }

  // ------------------------------------------------------------ 交互
  /** 悬浮球被拖动过就不触发点击展开 */
  let dragged = false;

  collapseBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setCollapsed(true);
    ball.focus();
  });

  ball.addEventListener('click', (ev) => {
    if (dragged) {
      dragged = false;
      ev.stopPropagation();
      return;
    }
    setCollapsed(false);
    collapseBtn.focus();
  });

  ball.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    setCollapsed(false);
    collapseBtn.focus();
  });

  /**
   * 给某个元素装上拖拽。
   * @param readPos 取当前位置
   * @param moveTo 拖动过程中只更新内存坐标，由 applyGeometry 约束到视口
   */
  function makeDraggable(
    handle: HTMLElement,
    read: () => Pos,
    moveTo: (p: Pos) => void,
    onEnd?: () => void,
  ): void {
    handle.addEventListener('pointerdown', (ev) => {
      const origin = read();
      dragged = false;
      startDrag(
        ev,
        (dx, dy) => {
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragged = true;
          moveTo({ left: origin.left + dx, top: origin.top + dy });
          applyGeometry();
        },
        () => {
          if (dragged) onEnd?.();
        },
      );
    });
  }

  makeDraggable(
    ball,
    () => ballPos,
    (p) => {
      // **只改内存、不落盘**（v0.13）：球的位置是「折叠按钮在哪」的导出量，
      // 存下来就会与下一次折叠的对齐结果打架。拖动仅在本次会话内有效。
      ballPos = p;
    },
  );

  makeDraggable(
    head,
    () => panelPos,
    (p) => { panelPos = p; },
    () => write(PANEL_POS_KEY, panelPos),
  );

  resizeHandle.addEventListener('pointerdown', (ev) => {
    const origin = { ...size };
    const startLeft = panelPos.left;
    const startTop = panelPos.top;
    startDrag(
      ev,
      (dx, dy) => {
        size = {
          width: clamp(
            origin.width + dx,
            MIN_SIZE.width,
            Math.max(MIN_SIZE.width, window.innerWidth - startLeft - VIEWPORT_MARGIN),
          ),
          height: clamp(
            origin.height + dy,
            MIN_SIZE.height,
            Math.max(MIN_SIZE.height, window.innerHeight - startTop - VIEWPORT_MARGIN),
          ),
        };
        applyGeometry();
      },
      () => {
        write(SIZE_KEY, size);
      },
    );
  });

  window.addEventListener('resize', applyGeometry);

  // ------------------------------------------------------------ PanelApi
  const api: PanelHandle = {
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
    isCollapsed: () => collapsed,
    toast: (message, kind, options) => toasts.show(message, kind ?? 'info', options ?? {}),
    confirm: (opts) => showConfirm(shadow, opts),
    alert: (opts) => showModalAlert(shadow, opts),
    alertAuthExpired: () => showAuthAlert(shadow),
    activateTab: (tabId) => tabView.activate(tabId),
    destroy: () => {
      window.removeEventListener('resize', applyGeometry);
      closeModalAlerts(shadow);
      try {
        tabView.destroy();
        toasts.destroy();
      } catch (err) {
        log.warn('销毁悬浮窗时抛错', err);
      }
      host.remove();
    },
  };

  applyGeometry();
  tabView.mount(entries, api, resolveActiveTab(entries, (key) => read<string | null>(key, null)));

  (document.documentElement ?? document.body).appendChild(host);

  log.info(
    `悬浮窗已装载：${entries.length} 个标签页，初始${collapsed ? '折叠（沿用上次）' : '展开'}，` +
      `面板=(${Math.round(panelPos.left)},${Math.round(panelPos.top)})，球=(${Math.round(ballPos.left)},${Math.round(ballPos.top)})`,
  );

  return api;
}

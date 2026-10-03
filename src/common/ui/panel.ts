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
 *   ui:pos         { left, top }     面板与悬浮球共用左上角
 *   ui:size        { width, height }
 *   ui:collapsed   boolean
 */

import { el, clamp } from '../utils/dom.ts';
import { read, write } from '../core/storage.ts';
import { scoped } from '../core/log.ts';
import { TabView } from './tabs.ts';
import { ToastStack } from './widgets/toast.ts';
import { showConfirm } from './widgets/confirm.ts';
import type { ConfirmOptions, PanelApi, TabContext, TabRegistration } from '../../sites/types.ts';

const log = scoped('ui/panel');

/** 一个待挂载的标签页 + 它归属的站点 id（公共标签页用 'common'） */
export interface TabEntry {
  readonly siteId: string;
  readonly tab: TabRegistration;
}

export interface PanelOptions {
  /** 标题栏右侧显示的站点名；null 表示只显示「深大人工具箱」 */
  siteName: string | null;
  /** 首屏是否折叠（由站点分派规则决定） */
  startCollapsed: boolean;
}

export interface PanelHandle extends PanelApi {
  /** 重建标签页集合 */
  setTabs(entries: readonly TabEntry[]): void;
  /** 完全销毁（页面卸载前调用） */
  destroy(): void;
  /** 当前页面标题等运行期信息，供调试 */
  readonly element: HTMLElement;
}

const POS_KEY = 'ui:pos';
const SIZE_KEY = 'ui:size';
const COLLAPSED_KEY = 'ui:collapsed';

const DEFAULT_SIZE = { width: 344, height: 430 };
const MIN_SIZE = { width: 260, height: 180 };
const BALL_SIZE = 44;
const VIEWPORT_MARGIN = 8;

interface Pos {
  left: number;
  top: number;
}

function posKeyFor(collapsed: boolean): string {
  // 球和面板的左上角共用一份坐标；折叠尺寸差异由下面 clampPosition 处理
  return `${POS_KEY}:${collapsed ? 'ball' : 'panel'}`;
}

function readPos(collapsed: boolean): Pos | null {
  const raw = read<Pos | null>(posKeyFor(collapsed), null);
  if (raw === null || typeof raw.left !== 'number' || typeof raw.top !== 'number') return null;
  return raw;
}

function writePos(collapsed: boolean, pos: Pos): void {
  write(posKeyFor(collapsed), pos);
}

function defaultPos(): Pos {
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

/** 把左上角约束在视口内（元素尺寸参与计算） */
function clampPosition(pos: Pos, width: number, height: number): Pos {
  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN);
  return {
    left: clamp(pos.left, VIEWPORT_MARGIN, maxLeft),
    top: clamp(pos.top, VIEWPORT_MARGIN, maxTop),
  };
}

/** 指针拖拽的通用封装：pointerdown 之后跟到 pointerup 为止 */
function startDrag(
  ev: PointerEvent,
  onMove: (dx: number, dy: number, e: PointerEvent) => void,
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
    onMove(e.clientX - startX, e.clientY - startY, e);
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

  const baseStyle = document.createElement('style');
  baseStyle.textContent = baseCss;
  shadow.appendChild(baseStyle);

  const ball = el('div', {
    class: 'sztb-ball',
    text: '深',
    attrs: { title: '深大人工具箱（点击展开）' },
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

  const tabView = new TabView(shadow);
  const resizeHandle = el('div', { class: 'sztb-resize', attrs: { title: '拖拽调整大小' } });

  const panelEl = el('div', { class: 'sztb-panel' }, head, tabView.tabbar, tabView.body, resizeHandle);

  const root = el('div', { class: 'sztb-root' }, ball, panelEl);
  shadow.appendChild(root);

  const toasts = new ToastStack(shadow);

  // ------------------------------------------------------------ 状态
  const storedCollapsed = read<boolean | null>(COLLAPSED_KEY, null);
  let collapsed = storedCollapsed ?? options.startCollapsed;
  let size = readSize();
  let pos: Pos = readPos(collapsed) ?? defaultPos();

  function applyGeometry(): void {
    if (collapsed) {
      pos = clampPosition(pos, BALL_SIZE, BALL_SIZE);
      ball.style.setProperty('left', `${pos.left}px`);
      ball.style.setProperty('top', `${pos.top}px`);
    } else {
      size = {
        width: Math.max(MIN_SIZE.width, size.width),
        height: Math.max(MIN_SIZE.height, size.height),
      };
      pos = clampPosition(pos, size.width, size.height);
      panelEl.style.setProperty('left', `${pos.left}px`);
      panelEl.style.setProperty('top', `${pos.top}px`);
      panelEl.style.setProperty('width', `${size.width}px`);
      panelEl.style.setProperty('height', `${size.height}px`);
    }
    root.dataset['collapsed'] = String(collapsed);
  }

  function setCollapsed(next: boolean, persist = true): void {
    if (next === collapsed) {
      applyGeometry();
      return;
    }
    collapsed = next;
    // 切换形态时按新形态的默认位置重新读，避免球跑出可视区
    pos = readPos(collapsed) ?? pos;
    applyGeometry();
    if (persist) write(COLLAPSED_KEY, collapsed);
  }

  // ------------------------------------------------------------ 交互
  /** 悬浮球被拖动过就不触发点击展开 */
  let dragged = false;

  collapseBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setCollapsed(true);
  });

  ball.addEventListener('click', (ev) => {
    if (dragged) {
      dragged = false;
      ev.stopPropagation();
      return;
    }
    setCollapsed(false);
  });

  function makeDraggable(handle: HTMLElement, sizeOf: () => { w: number; h: number }): void {
    handle.addEventListener('pointerdown', (ev) => {
      const origin = { ...pos };
      dragged = false;
      startDrag(
        ev,
        (dx, dy) => {
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragged = true;
          const { w, h } = sizeOf();
          pos = clampPosition({ left: origin.left + dx, top: origin.top + dy }, w, h);
          applyGeometry();
        },
        () => {
          if (dragged) {
            writePos(collapsed, pos);
            write(COLLAPSED_KEY, collapsed);
          }
        },
      );
    });
  }

  makeDraggable(ball, () => ({ w: BALL_SIZE, h: BALL_SIZE }));
  makeDraggable(head, () => ({ w: size.width, h: size.height }));

  resizeHandle.addEventListener('pointerdown', (ev) => {
    const origin = { ...size };
    const startLeft = pos.left;
    const startTop = pos.top;
    startDrag(
      ev,
      (dx, dy) => {
        size = {
          width: clamp(origin.width + dx, MIN_SIZE.width, Math.max(MIN_SIZE.width, window.innerWidth - startLeft - VIEWPORT_MARGIN)),
          height: clamp(origin.height + dy, MIN_SIZE.height, Math.max(MIN_SIZE.height, window.innerHeight - startTop - VIEWPORT_MARGIN)),
        };
        applyGeometry();
      },
      () => {
        write(SIZE_KEY, size);
      },
    );
  });

  window.addEventListener('resize', () => applyGeometry());

  // ------------------------------------------------------------ PanelApi
  const api: PanelHandle = {
    element: host,
    collapse: () => setCollapsed(true),
    expand: () => setCollapsed(false),
    isCollapsed: () => collapsed,
    toast: (message, kind) => toasts.show(message, kind ?? 'info'),
    confirm: (opts: ConfirmOptions) => showConfirm(shadow, opts),
    activateTab: (tabId) => tabView.activate(tabId),
    setTabs: (next: readonly TabEntry[]) => {
      const map = new Map<string, string>();
      for (const entry of next) map.set(entry.tab.id, entry.siteId);
      tabView.setTabs(
        next.map((e) => e.tab),
        makeContext(map),
      );
    },
    destroy: () => {
      try {
        tabView.destroy();
        toasts.destroy();
      } catch (err) {
        log.warn('销毁悬浮窗时抛错', err);
      }
      host.remove();
    },
  };

  /** 每个标签页拿到自己的 siteId */
  function makeContext(siteToId: Map<string, string>): TabContext {
    return {
      get siteId(): string {
        const active = tabView.activeTabId();
        return active !== null ? (siteToId.get(active) ?? 'common') : 'common';
      },
      host: api,
    };
  }

  applyGeometry();
  api.setTabs(entries);

  (document.documentElement ?? document.body).appendChild(host);
  log.info(`悬浮窗已装载：${entries.length} 个标签页，初始${collapsed ? '折叠' : '展开'}`);

  return api;
}

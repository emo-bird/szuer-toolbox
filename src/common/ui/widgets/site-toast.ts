/**
 * 页面级右上角提醒。
 *
 * 为什么不用 `widgets/toast.ts` 的 `ToastStack`：那个实例挂在悬浮窗的 shadow root 上，
 * 而 shadow root 是 `createPanel()` 建面板时才有的 —— 连播这种「面板关着也要能提示」
 * 的场景根本拿不到它。
 *
 * 所以这里自建一个**独立**的宿主元素（自带 shadow root，站点样式进不来、也漏不出去），
 * 固定右上角、不拦鼠标、到点自己消失；盒子空了就把宿主一并摘掉，不留残余。
 */

const HOST_ID = 'sztb-site-toast-host';

export type SiteToastKind = 'info' | 'warn' | 'error' | 'success';

/** 写死在字符串里（构建期会和其它 `*_CSS` 一起被压掉） */
const SITE_TOAST_CSS = `
:host {
  all: initial;
}
.box {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 340px;
  pointer-events: none;
  font: 13px/1.5 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
}
.item {
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(28, 30, 36, 0.94);
  color: #f5f6f8;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  word-break: break-word;
}
.item[data-kind="warn"] {
  background: rgba(122, 84, 12, 0.95);
}
.item[data-kind="error"] {
  background: rgba(140, 32, 32, 0.95);
}
.item[data-kind="success"] {
  background: rgba(24, 96, 56, 0.95);
}
`;

let hostEl: HTMLElement | null = null;
let boxEl: HTMLElement | null = null;

function ensureBox(): HTMLElement | null {
  if (boxEl !== null && boxEl.isConnected) return boxEl;
  const root = document.documentElement;
  if (root === null) return null;

  // 脚本重装时上一轮可能留下过宿主，直接删掉重建，避免累积
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = SITE_TOAST_CSS;
  const box = document.createElement('div');
  box.className = 'box';
  shadow.append(style, box);
  root.appendChild(host);

  hostEl = host;
  boxEl = box;
  return box;
}

function dropBoxIfEmpty(box: HTMLElement): void {
  if (box.childElementCount > 0) return;
  hostEl?.remove();
  hostEl = null;
  boxEl = null;
}

/**
 * 右上角弹一条提醒。
 *
 * @param durationMs 停留时长；到点自动消失（默认 6 秒）
 */
export function siteToast(message: string, kind: SiteToastKind = 'info', durationMs = 6000): void {
  const box = ensureBox();
  if (box === null) return;

  const node = document.createElement('div');
  node.className = 'item';
  node.dataset['kind'] = kind;
  node.textContent = message;
  box.appendChild(node);

  window.setTimeout(() => {
    node.remove();
    dropBoxIfEmpty(box);
  }, Math.max(600, durationMs));
}

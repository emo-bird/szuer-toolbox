/**
 * 极简 DOM 构造工具。刻意不引入任何模板/虚拟 DOM —— 悬浮窗的 DOM 结构是固定的，
 * 手写足够且体积最小。
 */

export interface ElProps {
  /** 会被拆分进 classList */
  class?: string;
  text?: string;
  /** 设置属性（null / undefined 会被跳过） */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  /** 内联样式 */
  style?: Partial<CSSStyleDeclaration>;
  /** 事件监听 */
  on?: Partial<{
    [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void;
  }>;
  /** dataset 键值 */
  data?: Record<string, string>;
}

type Child = Node | string | null | undefined | false;

/** 创建元素 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (props.class !== undefined) {
    for (const cls of props.class.split(/\s+/)) {
      if (cls !== '') node.classList.add(cls);
    }
  }
  if (props.text !== undefined) node.textContent = props.text;

  if (props.attrs !== undefined) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === null || v === undefined || v === false) continue;
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (props.style !== undefined) {
    for (const [k, v] of Object.entries(props.style)) {
      if (v === undefined || v === null) continue;
      node.style.setProperty(kebab(k), String(v));
    }
  }
  if (props.data !== undefined) {
    for (const [k, v] of Object.entries(props.data)) node.dataset[k] = v;
  }
  if (props.on !== undefined) {
    for (const [k, fn] of Object.entries(props.on)) {
      if (typeof fn !== 'function') continue;
      node.addEventListener(k, fn as EventListener);
    }
  }

  append(node, children);
  return node;
}

/** 批量追加子节点，自动跳过 null / undefined / false */
export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/** 清空一个元素的子节点 */
export function clear(node: Element): void {
  while (node.firstChild !== null) node.removeChild(node.firstChild);
}

function kebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** 把数字钳制到区间内 */
export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

// ------------------------------------------------------------ DOM 就绪

/**
 * 该 readyState 下能否安全挂载悬浮窗。
 *
 * `loading` 时 `document.body` 还不存在（`@run-at document-start` 就处在这个状态），
 * 往 `<html>` 上挂节点虽然浏览器一般也接受，但会早于站点的样式表生效，
 * 造成一次可见的布局跳动，所以统一等到 DOM 就绪。
 *
 * 单独抽成纯函数是为了能在 node 下直接测（`document` 不存在也能测判定逻辑）。
 */
export function readyStateAllowsMount(state: string): boolean {
  return state === 'interactive' || state === 'complete';
}

/** 当前文档是否已可挂载 */
export function isDomReady(): boolean {
  return readyStateAllowsMount(document.readyState);
}

/**
 * DOM 就绪后执行；已就绪则**立即同步**执行。
 *
 * 用 `{ once: true }` 而不是自己 removeEventListener：后者在「fn 抛错」时
 * 会因为没走到 remove 而留下一个永远不会再触发的监听器。
 */
export function whenDomReady(fn: () => void): void {
  if (isDomReady()) {
    fn();
    return;
  }
  document.addEventListener('DOMContentLoaded', fn, { once: true });
}

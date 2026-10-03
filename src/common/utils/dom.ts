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

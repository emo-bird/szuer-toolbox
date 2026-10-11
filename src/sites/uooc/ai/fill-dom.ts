/**
 * UOOC 试卷 DOM 的基础工具（从 ai/fill.ts 拆出，C2 批3）。
 *
 * 只放「零业务」的 DOM 能力：跨 realm 元素收窄 / 可见性 / 点选项 / 收集同源 roots / 按题号找 input。
 * 一切关于「答什么、清什么、判就绪」的逻辑都不在这里。
 * 注意：跨 realm 判元素一律用鸭子类型（见 fill.ts 头注释的实测教训），这里不许用 instanceof。
 */

function isElement(node: Element | null | undefined): node is HTMLElement {
  return node !== null && node !== undefined && node.nodeType === 1;
}

/** `null` 安全的元素收窄（替代 `x instanceof HTMLElement`） */
export function asElement(node: Element | null): HTMLElement | null {
  return isElement(node) ? node : null;
}

/** 收窄成 input（替代 `x instanceof HTMLInputElement`） */
function asInput(node: Element | null): HTMLInputElement | null {
  return isElement(node) && node.tagName === 'INPUT'
    ? (node as unknown as HTMLInputElement)
    : null;
}

/** 元素是否在布局上可见（不可见的 radio 直接 `.click()` 不生效） */
export function isVisible(el: Element): boolean {
  const he = el as HTMLElement;
  if (typeof he.getBoundingClientRect !== 'function') return true;
  const r = he.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) return true;
  // 有 offsetParent 也算（覆盖 display 之外的老式可见判据）
  return he.offsetParent !== null;
}

/**
 * 点一个选项。
 *
 * 三级降级，顺序不能换：
 *  1. `input` 本身（旧版：radio/checkbox 是实体可见控件，实测 13×13）；
 *  2. 包着它的 `<label>`（**新版多选题的 radio 实测不可见**，子代理实测要点
 *     `label.ti-a` / `span.ti-a-i` —— 点 label 会转发到 input，这是 HTML 原生行为）；
 *  3. 同级/父级的 `span.ti-a-i`（新版最后一层兜底）。
 *
 * 每一步都 `try{}` 包住：站点自己的 `ng-click` 里抛异常不能把回填整个带崩。
 */
export function clickOption(input: HTMLInputElement): boolean {
  const attempts: (Element | null)[] = [
    input,
    input.closest('label'),
    input.parentElement?.querySelector('.ti-a-i') ?? null,
    input.parentElement,
  ];
  for (const el of attempts) {
    if (el === null) continue;
    if (el !== input && !isVisible(el)) continue;
    try {
      (el as HTMLElement).click();
      return true;
    } catch {
      // 换下一级
    }
  }
  try {
    input.click();
    return true;
  } catch {
    return false;
  }
}

/** 收集顶层文档 + 所有同源 iframe 的 document */
export function collectRoots(top: Document = document): Document[] {
  const roots: Document[] = [top];
  const frames = top.querySelectorAll('iframe, frame');
  for (const f of frames) {
    const el = f as HTMLIFrameElement;
    try {
      const doc = el.contentDocument;
      if (doc !== null && doc !== undefined) roots.push(doc);
    } catch {
      // 跨域：碰 contentDocument 会抛，跳过
    }
  }
  return roots;
}

/** 在已收集的 roots 里找某个题目 id 的全部选项 input */
export function inputsFor(roots: readonly Document[], qid: string): HTMLInputElement[] {
  const out: HTMLInputElement[] = [];
  for (const doc of roots) {
    let list: NodeListOf<Element>;
    try {
      list = doc.querySelectorAll(`input[name="${CSS.escape(qid)}"]`);
    } catch {
      // 极老的浏览器没有 CSS.escape；qid 是纯数字，退化成拼字符串
      list = doc.querySelectorAll(`input[name="${qid}"]`);
    }
    for (const el of list) {
      const input = asInput(el);
      if (input !== null) out.push(input);
    }
  }
  return out;
}

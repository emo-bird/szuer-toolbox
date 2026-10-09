/**
 * 把答案回填进答题页的 DOM。
 *
 * ## 为什么必须点 DOM，不能直接调接口
 *
 * 站点提交时那份 `data` 是**它自己从 Angular scope 里拼出来的**：
 * 页面 `vm.addAnswer()` 在 `ng-click` 上，我们点一下 `input` = 走站点自己的函数
 * ⇒ scope 更新 ⇒ 提交时数据自然是对的。
 * 反过来，直接 POST `/exam/save` 是**交白卷**（实测：`save` 与 `commit` 的报文
 * 在「手点」与「脚本点」两种情况下字节相同，都来自同一个 scope 快照）。
 *
 * ## 定位靠 `input[name="<题目id>"]`
 *
 * 题目 id 与 `getTaskPaper` 的 `questions[].id` 是**同一个数字**（见 `paper.ts` 顶部）。
 * 不要改用「第几个 queContainer」这类位置选择器 —— 站点的题号分组顺序会变。
 *
 * ## ⚠️ 新旧两版 + iframe
 *
 * 旧版试卷在 `top > frame[0]` 的 iframe 里，新版在顶层文档。
 * 所以这里**遍历顶层 + 所有同源 iframe**，谁有就点谁。
 * 跨域 iframe 直接跳过（碰不到 `contentDocument` 就是跨域）。
 */

import type { QuestionKind } from './paper.ts';
import { asElement, clickOption, collectRoots, inputsFor, isVisible } from './fill-dom.ts';

export * from './fill-dom.ts';
export * from './quiz-ready.ts';

export interface FillTarget {
  readonly qid: string;
  readonly kind: QuestionKind;
  /** 要选中的选项字母，已升序（`['A','C']`） */
  readonly letters: readonly string[];
}

export interface FillReport {
  /** 确实点成功了 */
  readonly filled: readonly string[];
  /** 在页面上找不到这道题（题不在当前卷子 / 页面还没渲染完） */
  readonly missing: readonly string[];
  /** 找到了元素但点不动（新版多选题的 radio 实测不可见，见下） */
  readonly failed: readonly string[];
}

/**
 * 元素判定一律**不许用 `instanceof`**（实测教训，2026-10-08）。
 *
 * 旧版试卷跑在 `top > iframe[src*="/exam/"]` 里，**iframe 有自己的 realm**：
 * `top.HTMLInputElement !== iframe.contentWindow.HTMLInputElement`，于是
 * `iframeDoc.querySelector('input') instanceof HTMLInputElement` 恒为 `false`。
 * 实测数据：`topRealm_instanceof=false / iframeRealm_instanceof=true / sameCtor=false`。
 *
 * 后果曾经是「模型答出来了，但页面里点不动这一题」——`inputsFor()` 被这一行过滤成空
 * 数组，`fillAnswers()` 把每一道题都归到 `missing`。`video.ts:81` 早就为
 * `HTMLVideoElement` 写过同一条教训，这里补齐。
 *
 * 改用鸭子类型：`nodeType === 1` 认元素，`tagName` 认标签 —— 跨 realm 都成立。
 */

/**
 * 回填一份答案。
 *
 * 幂等：已经勾上的不再点（多选题里重复点会把已选项**取消**，这是最危险的一种错）。
 * 单选/判断题：要换选项时直接点目标那个即可，radio 同 name 会自动互斥。
 */
export function fillAnswers(targets: readonly FillTarget[]): FillReport {
  const filled: string[] = [];
  const missing: string[] = [];
  const failed: string[] = [];

  const roots = collectRoots();
  for (const t of targets) {
    if (t.letters.length === 0) {
      missing.push(t.qid);
      continue;
    }
    const inputs = inputsFor(roots, t.qid);
    if (inputs.length === 0) {
      missing.push(t.qid);
      continue;
    }

    let allOk = true;
    for (const letter of t.letters) {
      const target = inputs.find((el) => (el.value ?? '').toUpperCase() === letter);
      if (target === undefined) {
        allOk = false;
        continue;
      }
      if (target.checked) continue; // 已经是想要的状态，别动
      if (!clickOption(target)) allOk = false;
    }

    // 复查：点完再读一遍 `checked`。点不动的时候 `click()` 一样不报错，
    // 不复查就会把「一道没填上的题」报成成功。
    const okNow = t.letters.every((letter) => {
      const el = inputs.find((i) => (i.value ?? '').toUpperCase() === letter);
      return el !== undefined && el.checked;
    });
    if (okNow) filled.push(t.qid);
    else if (allOk) failed.push(t.qid);
    else failed.push(t.qid);
  }

  return { filled, missing, failed };
}

/**
 * 答题页【提交】按钮的选择器。
 *
 * 旧版 `/exam/paper?cid=&tid=`：`button.btn.btn-danger`，`ng-click="vm.commitTask()"`，
 * 外面套 `ng-if="vm.paper.can_do"`。
 *
 * 本站只做旧版，所以只留这一个（新版那颗 `div.btn.btn-warning` 已随转向一起移除）。
 * 不写裸的 `div.btn.btn-warning` —— 页面上可能有别的警告按钮，宁可返回 null
 * 让调用方提示用户自己点。
 */
const SUBMIT_SELECTORS: readonly string[] = ['button.btn.btn-danger'];

/**
 * 答题页的【提交】按钮。
 *
 * ⚠️ 它同时是**「这份卷子还能不能交」的唯一现场证据**（旧版整颗按钮由
 * `vm.paper.can_do` 控制显隐）⇒ 自动作答前会先看它有没有，没有就说明卷子
 * 已经交过了/根本不能交，不该再往上填答案。
 */
export function findSubmitButton(top: Document = document): HTMLElement | null {
  for (const selector of SUBMIT_SELECTORS) {
    for (const doc of collectRoots(top)) {
      const el = doc.querySelector(selector);
      const he = asElement(el);
      if (he !== null) return he;
    }
  }
  return null;
}

/** 页面上有几个选项控件（radio / checkbox）—— 卷子渲染出来没有的判据 */
export function countOptionInputs(top: Document = document): number {
  let n = 0;
  for (const doc of collectRoots(top)) {
    try {
      n += doc.querySelectorAll('input[type="radio"], input[type="checkbox"]').length;
    } catch {
      // 忽略
    }
  }
  return n;
}

// ================================================================== 已答 / 清除（m04879）

/** 这道题在 DOM 上已经勾了答案吗（`student_answer` 之外的第二道判据） */
export function isAnsweredInDom(qid: string, top: Document = document): boolean {
  for (const el of inputsFor(collectRoots(top), qid)) {
    if (el.checked) return true;
  }
  return false;
}


/** Angular `ngModel` 控制器里我们用到的那两个方法 */
interface NgModelLike {
  $setViewValue?: (value: unknown) => void;
  $render?: () => void;
}

/**
 * 取这个元素身上的 Angular `ngModel` 控制器。
 *
 * ⚠️ 必须用**元素自己所在窗口**的 `angular`：旧版试卷在 `top > frame[0]` 的
 * iframe 里，拿顶层的 `window.angular` 去 `angular.element(iframe里的元素)`
 * 是不认的。所以这里从 `el.ownerDocument.defaultView` 取。
 */
function ngModelOf(el: Element): NgModelLike | null {
  const win = el.ownerDocument?.defaultView as
    | (Window & { angular?: unknown })
    | null;
  const angular = (win?.angular ?? null) as {
    element?: (e: Element) => { controller?: (name: string) => unknown };
  } | null;
  if (angular === null || typeof angular.element !== 'function') return null;
  try {
    const ctrl = angular.element(el).controller?.('ngModel') as NgModelLike | null;
    return ctrl ?? null;
  } catch {
    return null;
  }
}

/** 题型对应的「空值」（`ngModel.$setViewValue` 用什么把它清掉） */
function emptyValueFor(kind: QuestionKind): unknown {
  if (kind === 'multi') return [];
  if (kind === 'blank' || kind === 'other') return '';
  return undefined; // 单选 / 判断：radio 无法靠点击取消，只能把模型清成 undefined
}

/**
 * 清空一道题（需求细则 §C.4.1）。
 *
 * **走 Angular `ngModel.$setViewValue`，不走点击** —— 单选 radio 点第二下
 * 不是取消而是「重选同一项」，靠点击根本清不掉。
 *
 * 万一页面上没有 Angular（理论上不会），退化成直接把 DOM 的属性写回未选态
 * 并派发 `change`：至少让用户看到清掉了（此时与站点 scope 的同步可能不准，
 * 调用方应当 toast 提醒一句）。
 *
 * @returns `'ngModel'` = 走通了 / `'dom'` = 退化了 / `'missing'` = 找不到这道题
 */
export function clearQuestion(
  qid: string,
  kind: QuestionKind,
  top: Document = document,
): 'ngModel' | 'dom' | 'missing' {
  const inputs = inputsFor(collectRoots(top), qid);
  if (inputs.length === 0) return 'missing';

  const empty = emptyValueFor(kind);
  let viaModel = false;
  for (const el of inputs) {
    const ctrl = ngModelOf(el);
    if (ctrl === null || typeof ctrl.$setViewValue !== 'function') continue;
    try {
      ctrl.$setViewValue(empty);
      ctrl.$render?.();
      viaModel = true;
    } catch {
      // 换下一个 input
    }
  }
  if (viaModel) return 'ngModel';

  for (const el of inputs) {
    try {
      el.checked = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      // 忽略
    }
  }
  return 'dom';
}

/** 卷面上的一道题：题号元素 + 题目容器 + 反查出来的题目 id */
export interface QuestionAnchor {
  /** 题号文本，例如 `"1."` */
  readonly label: string;
  /** 题号元素（`div.index`）—— 小按钮插在它**前面** */
  readonly indexEl: HTMLElement;
  /** 题目容器（`div.queContainer`） */
  readonly container: HTMLElement;
  /** 题目 id（从容器里的 `input[name]` 反查；已交卷的卷子上可能是 null） */
  readonly qid: string | null;
}

/**
 * 找出卷面上每一道题的位置。
 *
 * 实测结构（`local/capture/dom-uooc-exam-旧-未完成-单选-多选-验证码.txt`
 * 的路径签名聚合）：
 * ```
 * div.queContainer > div.index            （题号，样例文本 "1."）
 * div.queContainer > div.queBox > div.smallTest > input[name="<qid>"]
 * div.queContainer > div.scores > label.ng-binding  （"( 4.00 分 )"）
 * ```
 * 不用位置选择器（第几个 `queContainer`）—— 题号分组顺序会变。
 */
export function findQuestionAnchors(top: Document = document): QuestionAnchor[] {
  const out: QuestionAnchor[] = [];
  for (const doc of collectRoots(top)) {
    let list: Element[];
    try {
      list = Array.from(doc.querySelectorAll('div.queContainer'));
    } catch {
      continue;
    }
    for (const c of list) {
      const container = asElement(c);
      if (container === null) continue;
      const indexEl = asElement(container.querySelector('div.index'));
      if (indexEl === null) continue;
      const input = container.querySelector('input[name]');
      out.push({
        label: (indexEl.textContent ?? '').trim(),
        indexEl,
        container,
        qid: input?.getAttribute('name') ?? null,
      });
    }
  }
  return out;
}

/**
 * 找「试卷标题」那个元素 —— 【清除全部答案】按钮挂它后面。
 *
 * ⚠️ **没有实证**：手上的 3 份旧版答题页采样
 * （`local/capture/dom-uooc-exam-旧-*.txt`）里都没有标题元素，
 * 只有侧边栏的章节名（`div.queList-title`）。
 * 所以这里按候选选择器依次试，全都没有就退回「第一道题容器的父节点」。
 * 拿到真实采样后**只改这一个函数**。
 */
const PAPER_TITLE_SELECTORS: readonly string[] = [
  'div.paperTitle',
  'div.paper-title',
  'div.examTitle',
  'h1.paperTitle',
  'h3.paperTitle',
];

function findPaperTitleAnchor(top: Document): HTMLElement | null {
  for (const doc of collectRoots(top)) {
    for (const sel of PAPER_TITLE_SELECTORS) {
      let el: Element | null = null;
      try {
        el = doc.querySelector(sel);
      } catch {
        continue;
      }
      const he = asElement(el);
      if (he !== null && isVisible(he)) return he;
    }
  }
  const first = findQuestionAnchors(top)[0];
  return first?.container.parentElement ?? null;
}

/** 注入按钮用的标记，重刷时先按它清干净 */
const CLEAR_MARK = 'data-sztb-uooc-clear';

/** 小按钮统一样式（内联，免得依赖面板的 CSS 打进 iframe） */
const CLEAR_BTN_STYLE =
  'margin:0 6px 0 0;padding:1px 8px;font-size:12px;line-height:18px;' +
  'border:1px solid #d9d9d9;border-radius:3px;background:#fff;color:#c0392b;' +
  'cursor:pointer;vertical-align:middle;';

function makeClearButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  btn.title = title;
  btn.setAttribute('style', CLEAR_BTN_STYLE);
  btn.setAttribute(CLEAR_MARK, 'one');
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onClick();
  });
  return btn;
}

/** 已经插进去的清除按钮全拔掉 */
function removeClearButtons(top: Document): void {
  for (const doc of collectRoots(top)) {
    let list: Element[];
    try {
      list = Array.from(doc.querySelectorAll(`[${CLEAR_MARK}]`));
    } catch {
      continue;
    }
    for (const el of list) el.remove();
  }
}

export interface ClearButtonsHandle {
  /** 重新按当前「哪些题已有答案」铺一遍按钮；返回铺了几颗 */
  refresh(answered: ReadonlySet<string>): number;
  /** 全部拔掉 */
  remove(): void;
}

/**
 * 往卷面上注入清除按钮（需求细则 §C.4.1）：
 *  - **已有答案的题**：题号（`div.index`）**前面**插一颗【清除答案】；
 *  - **试卷标题后面**插一颗【清除全部答案】。
 *
 * 为什么不一次性插完：答案会随「逐题回填」「清除」变化 ⇒ 每次变化后调
 * `refresh(answered)` 重铺一遍（先拔旧的再插新的，天然幂等）。
 */
export function injectClearButtons(opts: {
  /** 点【清除答案】时回调，参数是题目 id */
  readonly onClearOne: (qid: string) => void;
  /** 点【清除全部答案】时回调 */
  readonly onClearAll: () => void;
  readonly top?: Document;
  /** 控件失效时禁用（正在请求中） */
  readonly disabled?: boolean;
}): ClearButtonsHandle {
  const top = opts.top ?? document;

  return {
    refresh(answered: ReadonlySet<string>): number {
      removeClearButtons(top);

      if (opts.disabled === true) return 0;

      let count = 0;
      for (const a of findQuestionAnchors(top)) {
        const qid = a.qid;
        if (qid === null) continue;
        if (!answered.has(qid)) continue;
        const btn = makeClearButton('清除答案', `清空第 ${a.label} 题的答案`, () => {
          opts.onClearOne(qid);
        });
        try {
          a.indexEl.parentElement?.insertBefore(btn, a.indexEl);
          count++;
        } catch {
          // 插不进去就算了，不要因此中断
        }
      }

      const title = findPaperTitleAnchor(top);
      if (title !== null) {
        const btn = makeClearButton('清除全部答案', '清空整张卷子的答案', () => {
          opts.onClearAll();
        });
        try {
          title.insertAdjacentElement('afterend', btn);
          count++;
        } catch {
          // 同上
        }
      }
      return count;
    },
    remove(): void {
      removeClearButtons(top);
    },
  };
}

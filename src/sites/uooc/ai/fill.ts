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
import {
  asElement,
  clickOption,
  collectRoots,

  inputsFor,
  isVisible,
  textControlsFor,
} from './fill-dom.ts';

export * from './fill-dom.ts';
export * from './quiz-ready.ts';

export interface FillTarget {
  readonly qid: string;
  readonly kind: QuestionKind;
  /** 要选中的选项字母，已升序（`['A','C']`）；填空题为空数组 */
  readonly letters: readonly string[];
  /**
   * 填空题的答案原文（多个空用 `|` 分隔，见 `blankSegments`）。
   *
   * 选择题不传；填空题**只认它**，不看 `letters`。
   */
  readonly text?: string;
}

export interface FillReport {
  /** 确实点成功了 */
  readonly filled: readonly string[];
  /** 在页面上找不到这道题（题不在当前卷子 / 页面还没渲染完） */
  readonly missing: readonly string[];
  /** 找到了元素但点不动（新版多选题的 radio 实测不可见，见下） */
  readonly failed: readonly string[];
}

// ============================================================ 填空题（用户 m00107）

/**
 * 填空题答案切成「每个空一段」。
 *
 * 站点与提示词约定的格式就是「多个空按空序用竖线 `|` 分隔」（见 `prompts.ts` 第 5 条），
 * 这里再认一下全角 `｜`（模型偶尔把中文标点混进来）。
 *
 * **尾部空段丢掉**：模型多写一个竖线（`答案|`）时不该把第 2 个空写成空串，
 * 否则这道题会被判成「没填完」。
 */
export function blankSegments(text: string): string[] {
  const parts = text.split(/[|｜]/).map((s) => s.trim());
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/** 跨 realm 派发事件：构造函数必须取**元素自己所在文档**的（iframe 有自己的 realm） */
function dispatch(el: HTMLElement, type: string): void {
  const view = el.ownerDocument?.defaultView as (Window & typeof globalThis) | null;
  const Ctor = (view?.Event ?? Event) as typeof Event;
  for (const make of [() => new Ctor(type, { bubbles: true }), () => new Event(type, { bubbles: true })]) {
    try {
      el.dispatchEvent(make());
      return;
    } catch {
      // 换个 realm 的构造函数再试
    }
  }
}

/** 读文本框当前值（`textarea`/`input` 认 `value`，富文本认 `textContent`） */
function controlValue(el: HTMLElement): string {
  const v = (el as unknown as { value?: unknown }).value;
  if (typeof v === 'string') return v;
  return el.textContent ?? '';
}

/** 把答案写进一个文本框；值没变就不写、也不重复派发事件（幂等，重答不会打架） */
function setControlValue(el: HTMLElement, value: string): boolean {
  if (controlValue(el) === value) return true;
  try {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      (el as unknown as { value: string }).value = value;
    } else {
      el.textContent = value;
    }
  } catch {
    return false;
  }
  dispatch(el, 'input');
  dispatch(el, 'change');
  return true;
}

/** 元素身上的 Angular scope（跨 realm：用元素自己所在窗口的 `angular`） */
function angularScopeOf(el: HTMLElement): Record<string, unknown> | null {
  const win = el.ownerDocument?.defaultView as (Window & { angular?: unknown }) | null;
  const angular = (win?.angular ?? null) as {
    element?: (e: Element) => { scope?: () => unknown };
  } | null;
  if (angular === null || typeof angular.element !== 'function') return null;
  try {
    return (angular.element(el).scope?.() ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

/**
 * 让站点把文本框里的字**读进 Angular scope**（不读走，交卷报文里就是空的）。
 *
 * 实测（tid=1901349073，`vm.addAnswer` 的函数体是从页面自己身上读出来的）：
 * 填空题分支只做一件事 —— `_.each(question.options, (o, n) => answer.push($('#u' + question.id + n).val()))`
 * ⇒ 它读的是 **DOM value**，写进 `question.student_answer` 并重算 `question.checked`。
 *
 * 两条路，都留着（理由都是实测出来的，别顺手删）：
 *  1. 派发 `mouseleave` —— 站点把它挂在 `ng-mouseleave` 上。**实测在 jQuery 1.12.2 上不触发**：
 *     jQuery 的 `mouseleave` 是「特殊事件」，内部监听的是 `mouseover`/`mouseout`，
 *     手搓一个 `mouseleave` 事件派过去没有监听器接。纯 jqLite 页面上这条才是真路径，故保留。
 *  2. 直接调 `scope.vm.addAnswer(null, scope.question)` —— 填空题分支根本不看 `event`，
 *     实测这一下就把 `student_answer` 从 `[""]` 变成 `["绿水青山"]`、`checked` 变 `true`（还原后也如实回退）。
 *     ⇒ **真正靠得住的是这条**。
 *
 * @returns 第 2 条有没有走通（`false` = 只能靠事件，或页面没有 Angular）
 */
function commitBlank(el: HTMLElement): boolean {
  dispatch(el, 'mouseleave');
  const scope = angularScopeOf(el);
  const vm = (scope?.['vm'] ?? null) as { addAnswer?: (ev: unknown, q: unknown) => void } | null;
  const question = scope?.['question'] ?? null;
  if (vm === null || typeof vm.addAnswer !== 'function' || question === null) return false;
  try {
    vm.addAnswer(null, question);
    return true;
  } catch {
    return false;
  }
}

/**
 * 填一道填空题：第 i 段答案 → 第 i 个文本框（站点按空序渲染，见 `fill-dom.ts`）。
 *
 * 判「填好了」的口径 = **每个空都有字**：站点 `isComplete()` 就是这么判的，
 * 少填一个空这道题在站点眼里仍是未作答（白填）。
 */
function fillBlank(qid: string, text: string): 'filled' | 'missing' | 'failed' {
  const controls = textControlsFor(collectRoots(), qid);
  if (controls.length === 0) return 'missing';
  const segments = blankSegments(text);
  if (segments.length === 0) return 'missing';

  let ok = false;
  controls.forEach((el, i) => {
    const seg = segments[i] ?? '';
    if (seg === '') return;
    if (setControlValue(el, seg)) ok = true;
  });
  if (!ok) return 'failed';

  const first = controls[0];
  if (first !== undefined) commitBlank(first);

  // 复查：读完还得有字（被站点自己的监听器回滚过就白填了）
  return controls.every((el) => controlValue(el).trim() !== '') ? 'filled' : 'failed';
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
 * 填空题：走 `fillBlank`（文本框没有 name，得靠题目容器反查）。
 */
export function fillAnswers(targets: readonly FillTarget[]): FillReport {
  const filled: string[] = [];
  const missing: string[] = [];
  const failed: string[] = [];

  const roots = collectRoots();
  for (const t of targets) {
    if (t.kind === 'blank') {
      const how = fillBlank(t.qid, t.text ?? '');
      if (how === 'filled') filled.push(t.qid);
      else if (how === 'missing') missing.push(t.qid);
      else failed.push(t.qid);
      continue;
    }
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

// ================================================================== 已答 / 清除（m04879）

/** 这道题在 DOM 上已经勾了/填了答案吗（`student_answer` 之外的第二道判据） */
export function isAnsweredInDom(qid: string, top: Document = document): boolean {
  const roots = collectRoots(top);
  for (const el of inputsFor(roots, qid)) {
    if (el.checked) return true;
  }
  // 填空题没有任何 input：文本框里有字就算已答（否则会把用户自己填的答案再问一遍）
  for (const el of textControlsFor(roots, qid)) {
    if (controlValue(el).trim() !== '') return true;
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
  const roots = collectRoots(top);

  // 填空题先走文本框：它没有 input，走下面的路只会拿到 'missing'
  if (kind === 'blank') {
    const controls = textControlsFor(roots, qid);
    if (controls.length === 0) return 'missing';
    for (const el of controls) setControlValue(el, '');
    const first = controls[0];
    const viaModel = first !== undefined && commitBlank(first);
    return viaModel ? 'ngModel' : 'dom';
  }

  const inputs = inputsFor(roots, qid);
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
  /** 题目 id（`input[name]` 或题号元素的 `anchor<qid>` 反查；已交卷的卷子上可能是 null） */
  readonly qid: string | null;
}

/**
 * 找出卷面上每一道题的位置。
 *
 * 实测结构（`local/capture/dom-uooc-exam-旧-未完成-单选-多选-验证码.txt`
 * 的路径签名聚合）：
 * ```
 * div.queContainer > div.index            （题号，样例文本 "1."，id = "anchor<qid>"）
 * div.queContainer > div.queBox > div.smallTest > input[name="<qid>"]   （选择题）
 * div.queContainer > … > textarea.ue-container1                        （填空题）
 * div.queContainer > div.scores > label.ng-binding  （"( 4.00 分 )"）
 * ```
 * 不用位置选择器（第几个 `queContainer`）—— 题号分组顺序会变。
 */
function findQuestionAnchors(top: Document = document): QuestionAnchor[] {
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
      out.push({
        label: (indexEl.textContent ?? '').trim(),
        indexEl,
        container,
        qid: qidOf(container, indexEl),
      });
    }
  }
  return out;
}

/**
 * 从题目容器上反查题目 id：**两处都可能给**。
 *
 *  - 选择题：`input[name="<qid>"]`；
 *  - 填空题：一个 `input` 都没有，只能读题号元素的 `id="anchor<qid>"`（实测见 `fill-dom.ts`）。
 */
function qidOf(container: HTMLElement, indexEl: HTMLElement): string | null {
  const input = container.querySelector('input[name]');
  const named = input?.getAttribute('name') ?? '';
  if (named !== '') return named;
  const m = /^anchor(\d+)$/.exec(indexEl.getAttribute('id') ?? '');
  return m !== null && m[1] !== undefined ? m[1] : null;
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

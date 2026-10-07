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

/** 元素是否在布局上可见（不可见的 radio 直接 `.click()` 不生效） */
function isVisible(el: Element): boolean {
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
function clickOption(input: HTMLInputElement): boolean {
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
function inputsFor(roots: readonly Document[], qid: string): HTMLInputElement[] {
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
      if (el instanceof HTMLInputElement) out.push(el);
    }
  }
  return out;
}

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
 * 答题页【提交】按钮的选择器，**按版本分开写**（两版不是同一个元素，都在实测快照里出现过）：
 *
 *  - 旧版 `/exam/paper?cid=&tid=`：`button.btn.btn-danger`，`ng-click="vm.commitTask()"`，
 *    外面套 `ng-if="vm.paper.can_do"`；
 *  - 新版 `/exam/{tid}`：`div.btn.btn-warning`，`ng-click="vm.doCommitTask()"`，
 *    `ng-disabled="!vcode_params.captchaVerifyParam"`（要先过验证码才点得动）。
 *
 * `[ng-click*="commitTask"]` 同时覆盖 `vm.commitTask()` 与 `vm.doCommitTask()`，
 * 但不写裸的 `div.btn.btn-warning` —— 页面上可能有别的警告按钮，宁可返回 null
 * 让调用方提示用户自己点（现在的兜底就是这么做的）。
 */
const SUBMIT_SELECTORS: readonly string[] = [
  'button.btn.btn-danger',
  'div.btn.btn-warning[ng-click*="commitTask"]',
];

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
      if (el instanceof HTMLElement) return el;
    }
  }
  return null;
}

/** 答题页的【保存】按钮（`button.btn.btn-success`，ng-click = vm.saveTask）。当前流程不用它。 */
export function findSaveButton(top: Document = document): HTMLElement | null {
  for (const doc of collectRoots(top)) {
    const el = doc.querySelector('button.btn.btn-success');
    if (el instanceof HTMLElement) return el;
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

/**
 * 等卷子渲染出来 —— **自动作答的第一道闸**。
 *
 * 答题页是 AngularJS 异步渲染的，旧版还在 `top > frame[0]` 的 iframe 里，
 * iframe 自己也后加载 ⇒ 脚本一进页面就回填必然整卷 `missing`。
 * 所以先等到「页面上出现选项控件」再动手。
 *
 * 用 radio/checkbox 而不是 `input[name]`：答题页上只有选项是这两种，
 * 更不容易被页面上别的带 name 的输入框骗过去。
 *
 * @returns true = 等到了；false = 超时（调用方应当放弃，不要硬填）
 */
export function waitForOptionInputs(timeoutMs = 20000, intervalMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = (): void => {
      if (countOptionInputs() > 0) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, intervalMs);
    };
    tick();
  });
}

/**
 * 已完成的卷子上会亮出来的**答案解析区**（`div.answerBox`）。
 *
 * 出处：`local/capture/dom-uooc-exam-旧-已完成-单选-填空.txt` 里它是
 * `style="display:block;"`，而未完成的卷子上这一片不显示。
 *
 * ⚠️ 只用在「要不要自动跳回课程页」这一个决定上（判不出来就不跳，没有损失）。
 * 若实测与这里不符，**只改这一个函数**，别去动回填逻辑。
 */
export function isAnswerBoxVisible(top: Document = document): boolean {
  for (const doc of collectRoots(top)) {
    const el = doc.querySelector('div.answerBox');
    if (el !== null && isVisible(el)) return true;
  }
  return false;
}

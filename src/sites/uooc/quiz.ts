/**
 * 测验页（`/exam/*`）上的助手。
 *
 * 走法是用户拍板的（m01058 第 4 条）：**同一个标签页**跳过来 → 认准「交卷成功」
 * → 把地址**改回课程页**。不开新标签页、不做跨标签页通信。
 *
 * === 判据怎么来的 ===
 *
 * 不是猜的，是四份实测采样对出来的（`local/capture/dom-uooc-quiz-新-*.txt`）：
 *
 * | 采样 | 提交试卷 | 保存试卷 | `.queContainer` |
 * | --- | --- | --- | --- |
 * | `提交通过` | 1 | 1 | 2 |
 * | `提交未通过` | 1 | 1 | 25 |
 * | `已作答` | **0** | **0** | 2 |
 * | `点击确定通过按钮` | **0** | **0** | 2 |
 *
 * 交卷成功后「提交试卷」（`button.btn.btn-danger[ng-click="vm.commitTask()"]`）
 * 与「保存试卷」（`button.btn.btn-success[ng-click="vm.saveTask()"]`）**一起**
 * 从 DOM 消失 —— 两者都写 `ng-if="vm.paper.can_do…"`。所以有两条判据：
 *   1. **先见过提交按钮 → 之后它不见了**（主判据）；
 *   2. **卷子已渲染（有 `.queContainer`）但两个按钮都没有** → 这是一张
 *      **已经交过的只读视图**（目录里那一项状态过期时就会走到这种页面）。
 * 第 2 条不能省：没有它，点到一张已交过的卷子会永远卡在「等交卷」。
 *
 * ⚠️ 反过来的坑也堵上了：如果只是**页面还没加载完**，我们从没见过那个按钮、
 * 也没见过题目，那就什么都不做 —— 绝不能在没做过卷子的情况下判成「做完了」。
 */

import { scoped } from '../../common/core/log.ts';
import { siteToast } from '../../common/ui/widgets/site-toast.ts';
import { markQuizDone } from './quiz-return.ts';

const log = scoped('uooc/quiz');

/** 提交按钮：先精确认指令，认不到再退回类名（防新版改名） */
const SUBMIT_SELECTORS: readonly string[] = [
  'button.btn.btn-danger[ng-click="vm.commitTask()"]',
  'button.btn.btn-danger',
];

/** 保存按钮：和提交按钮**同生共死**，用来交叉验证 */
const SAVE_SELECTORS: readonly string[] = [
  'button.btn.btn-success[ng-click="vm.saveTask()"]',
  'button.btn.btn-success',
];

/** 题目容器：有它才说明这一页真的把卷子渲染出来了 */
const PAPER_SELECTOR = '.queContainer';

/** 轮询周期：交卷后要尽快跳回去，1 秒够快也不吵 */
const TICK_MS = 1000;

/** 条件成立后要连续维持多久才认 —— 防页面重绘抖动误判 */
const SETTLE_MS = 2000;

/** 跳回课程页前留一点时间让 toast 被看见 */
const BACK_DELAY_MS = 1000;

interface ExamParams {
  cid: string;
  taskId: string;
}

/**
 * 从地址栏里抠出 cid / tid。
 *
 * 两种形态都实测到过：
 *   - 新版答题页 `/exam/983779533`（**tid 直接写在路径里**，见 `index.ts` 的 PAGES 注释）
 *   - 另一入口 `/exam/paper?cid=&tid=`
 */
export function parseExamParams(
  search: string = location.search,
  pathname: string = location.pathname,
): ExamParams {
  let cid = '';
  let taskId = '';
  try {
    const params = new URLSearchParams(search);
    cid = params.get('cid') ?? '';
    taskId = params.get('tid') ?? params.get('task_id') ?? '';
  } catch {
    /* search 不是合法 query 时按空处理 */
  }
  if (taskId === '') {
    const m = /^\/exam\/(\d+)/.exec(pathname);
    const captured = m?.[1];
    if (captured !== undefined) taskId = captured;
  }
  return { cid, taskId };
}

function anyPresent(selectors: readonly string[]): boolean {
  for (const sel of selectors) {
    try {
      if (document.querySelector(sel) !== null) return true;
    } catch {
      /* 选择器不被支持就跳过 */
    }
  }
  return false;
}

function paperQuestionCount(): number {
  try {
    return document.querySelectorAll(PAPER_SELECTOR).length;
  } catch {
    return 0;
  }
}

/**
 * 启动测验页观察者。
 *
 * @returns 卸载函数
 */
export function startQuizWatcher(): () => void {
  const { taskId } = parseExamParams();

  let sawSubmit = false;
  let finished = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** 见到提交按钮的时刻 */
  const seenAt = { value: 0 };
  /** 见到「卷子已渲染但没有提交/保存按钮」的时刻 */
  const spareAt = { value: 0 };

  const onFinished = (reason: string): void => {
    finished = true;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }

    const state = markQuizDone();
    const back = state?.returnUrl ?? '';
    log.info(`判定 ${reason}（tid=${taskId || '(未知)'}），准备跳回课程页`);

    if (back === '') {
      // 没有回程地址：多半是用户自己在别处打开的卷子，不打扰，只提示一声
      siteToast('测验已完成', 'success', 4000);
      return;
    }

    siteToast('测验已完成，正在返回课程页…', 'success', BACK_DELAY_MS + 2000);
    window.setTimeout(() => {
      // 用 replace 而不是赋值：这趟是「替用户去了一趟又回来」，
      // 不该在浏览器历史里留下一条回不去的测验记录。
      location.replace(back);
    }, BACK_DELAY_MS);
  };

  const tick = (): void => {
    if (finished) return;

    const hasSubmit = anyPresent(SUBMIT_SELECTORS);
    const hasSave = anyPresent(SAVE_SELECTORS);
    const paper = paperQuestionCount();

    if (hasSubmit) {
      if (!sawSubmit) {
        sawSubmit = true;
        seenAt.value = Date.now();
      }
      return;
    }

    if (sawSubmit) {
      // 判据 1：见过提交按钮，现在它没了。
      // 刚进来那一瞬间也可能读到「按钮还没渲染」，所以要求见过之后至少 2 秒。
      if (Date.now() - seenAt.value >= SETTLE_MS) onFinished('提交按钮已消失');
      return;
    }

    // 判据 2：压根没有提交按钮，但卷子已经渲染出来、保存按钮也没有。
    if (paper > 0 && !hasSave) {
      if (spareAt.value === 0) {
        spareAt.value = Date.now();
        log.debug(`这张卷子没有提交/保存按钮（题目 ${paper} 道），可能是已交过的只读视图`);
        return;
      }
      if (Date.now() - spareAt.value >= SETTLE_MS) onFinished('这张卷子已经交过（只读视图）');
      return;
    }

    spareAt.value = 0;
  };

  timer = setInterval(tick, TICK_MS);
  tick();

  return () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

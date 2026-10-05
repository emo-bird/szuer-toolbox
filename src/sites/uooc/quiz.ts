/**
 * 测验页（`/exam/*`）上的助手 —— 通常是点测验时**新开的那一个标签页**。
 *
 * 只做一件事：**认准「交卷成功」**，然后
 *   1. 写一根跨标签页信号（`quiz-signal.ts`），让学习页接着连播；
 *   2. 如果这个标签页是连播替用户开的，就把它关掉
 *      （用户明确要求：「新版测验完成后应当是自动关闭标签页」）。
 *
 * === 判据怎么来的 ===
 *
 * 不是猜的，是实测的（`docs/UOOC-AI方案-逆向笔记.md` §2.5 的按钮清单）：
 *
 *   `button.btn.btn-danger`「提交试卷」，`ng-click="vm.commitTask()"`，
 *   **`ng-if="vm.paper.can_do"`**
 *
 * `can_do` 一旦变 false（交卷成功），这个按钮就**从 DOM 里消失**。
 * 所以信号是「**先见过提交按钮 → 现在它不见了**」——
 * 比盯「交卷成功」几个字靠谱：站点自己的 `ng-if` 才是权威，
 * 而且它天然排除了「点开试卷但还没做」的情况（那时按钮一直都在）。
 *
 * ⚠️ 反过来的坑也堵上了：如果只是**页面还没加载完**，我们从没见过那个按钮，
 * 那就什么都不做 —— 绝不能在没做过卷子的情况下通知学习页「做完了」。
 */

import { scoped } from '../../common/core/log.ts';
import { siteToast } from '../../common/ui/widgets/site-toast.ts';
import { readQuizOpening, writeQuizDone } from './quiz-signal.ts';

const log = scoped('uooc/quiz');

/** 提交按钮：先精确认指令，认不到再退回类名（防新版改名） */
const SUBMIT_SELECTORS: readonly string[] = [
  'button.btn.btn-danger[ng-click="vm.commitTask()"]',
  'button.btn.btn-danger',
];

/** 保存按钮：和提交按钮**同生共死**（两个都写 `ng-if="vm.paper.can_do…"`），用来交叉验证 */
const SAVE_SELECTORS: readonly string[] = [
  'button.btn.btn-success[ng-click="vm.saveTask()"]',
  'button.btn.btn-success',
];

/** 题目容器：有它才说明这一页真的把卷子渲染出来了 */
const PAPER_SELECTOR = '.queContainer';

/** 轮询周期：交卷后要尽快关标签页，1 秒够快也不吵 */
const TICK_MS = 1000;

/** 条件成立后要连续维持多久才认 —— 防页面重绘抖动误判 */
const SETTLE_MS = 2000;

/** 关标签页前留一点时间让 toast 被看见 */
const CLOSE_DELAY_MS = 1200;

interface ExamParams {
  cid: string;
  taskId: string;
}

/**
 * 从地址栏里抠出 cid / tid。
 *
 * 两种形态都实测到过：
 *   - 新版答题页 `/exam/983779533`（**tid 直接写在路径里**，见 `index.ts` 的 PAGES 注释）
 *   - 旧版/另一入口 `/exam/paper?cid=&tid=`
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
  const { cid, taskId } = parseExamParams();
  const opening = readQuizOpening();
  // 「这个标签页是连播开的」——只有拿得到对应的通行证才算，用户自己开的窗口不关
  const managed = opening !== null && (taskId === '' || opening.taskId === taskId);
  if (managed) log.info(`连播打开的测验页（tid=${taskId || '(未知)'}），交卷后会自动关闭`);

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
    const signal = {
      cid: cid !== '' ? cid : (opening?.cid ?? ''),
      taskId: taskId !== '' ? taskId : (opening?.taskId ?? ''),
      resourceId: opening?.resourceId ?? '',
    };
    writeQuizDone(signal);
    log.info(`判定 ${reason}，已通知学习页继续连播`);

    if (!managed) {
      siteToast('测验已完成，学习页会自动接着播', 'success', 4000);
      return;
    }

    siteToast('测验已完成，正在关闭这个标签页…', 'success', CLOSE_DELAY_MS + 3000);
    window.setTimeout(() => {
      window.close();
      // 浏览器不允许脚本关掉「不是脚本打开的」标签页时，close() 会静默失败 ——
      // 隔一会儿还在就如实提示用户自己关。
      window.setTimeout(() => {
        siteToast('这个标签页需要你手动关闭（浏览器不允许脚本关）', 'info', 6000);
      }, 800);
    }, CLOSE_DELAY_MS);
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
      // 情形一：见过提交按钮，现在它没了。实测：交卷成功后「提交试卷」与
      // 「保存试卷」会**一起**从 DOM 消失（两者都写 `ng-if="vm.paper.can_do…"`）。
      // 刚进来那一瞬间也可能读到「按钮还没渲染」，所以要求见过之后至少 2 秒。
      if (Date.now() - seenAt.value >= SETTLE_MS) onFinished('提交按钮已消失');
      return;
    }

    // 情形二：压根没有提交按钮，但卷子已经渲染出来、保存按钮也没有
    // —— 这是一张**已经交过的卷子**（点到了目录里状态过期的测验项时就会这样，
    // 实测采样 `dom-uooc-quiz-新-已作答.txt`：queContainer 2、提交/保存按钮皆 0）。
    // 不认这条的话，这种页面会永远卡在「等交卷」上。
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

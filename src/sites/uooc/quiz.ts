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

/** 轮询周期：交卷后要尽快关标签页，1 秒够快也不吵 */
const TICK_MS = 1000;

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

function hasSubmitButton(): boolean {
  for (const sel of SUBMIT_SELECTORS) {
    try {
      if (document.querySelector(sel) !== null) return true;
    } catch {
      /* 选择器不被支持就跳过 */
    }
  }
  return false;
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

  const seenAt = { value: 0 };

  const onFinished = (): void => {
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
    log.info('检测到交卷成功，已通知学习页继续连播');

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
    if (hasSubmitButton()) {
      if (!sawSubmit) {
        sawSubmit = true;
        seenAt.value = Date.now();
      }
      return;
    }
    if (!sawSubmit) return;
    // 见过按钮又没了 —— 但刚进来的那一瞬间也可能读到「按钮还没渲染」，
    // 所以要求「见过之后至少过了 2 秒」才认，避免页面重绘抖动误判。
    if (Date.now() - seenAt.value < 2000) return;
    onFinished();
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

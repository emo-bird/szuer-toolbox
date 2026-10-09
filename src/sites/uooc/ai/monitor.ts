/**
 * 【监视】页的数据源 —— 纯状态仓库 + 订阅，**不碰 DOM**。
 *
 * 需求细则 §C.6（用户 m04879 第 5 条）：面板新增一个【监视】标签页，看两样东西：
 *
 * 1. **课程进度**：连播现在走到哪儿了（当前位置 index / 总数 + 这一项的标题）。
 * 2. **AI 答题进度**：哪几道题、每题问了几次、每次模型给的是什么、最终定的是哪个、
 *    还有几道没答 —— 逐题得出答案就立刻更新（用户第 6 条要求「立即回填」，
 *    监视页自然也要同步「立即」）。
 *
 * ## 为什么单独一个模块
 *
 * 连播（`autoplay.ts`）与答题（`ai/index.ts`）都要往里写，而【监视】页
 * （`tabs/monitor.ts`）要读 —— 三方如果互相 import 就成了环。
 * 所以这里只依赖 `scoped` 日志，谁都能引。
 *
 * ## 线程模型
 *
 * 全部在**一个 JS 线程**里跑（油猴脚本没有 worker），所以不需要锁；
 * `emit()` 是同步的，订阅者自己别抛异常（抛了会被 catch 掉，只记日志）。
 */

import { scoped } from '../../../common/core/log.ts';
// ⚠️ 唯一一个跨模块依赖，而且是 `import type` ⇒ 编译后不产生运行时代码，
// 文件头「只依赖 scoped 日志、谁都能引」这条仍然成立，也不会成环
// （`catalog.ts` 谁也不引）。
import type { CourseRow } from '../catalog.ts';
import { noticePost, type NoticeKind } from '../notice.ts';

const log = scoped('uooc/ai/monitor');

/** 一道题在监视页上的状态 */
export type QuestionStatus =
  /** 已经排上队，还没轮到 */
  | 'pending'
  /** 模型给了答案 */
  | 'answered'
  /** 问了但没答出来 */
  | 'failed'
  /** 页面上已经有答案了，不重复请求 */
  | 'skipped';

/**
 * 状态中文（监视页与试卷遮罩共用，别在各自文件里再抄一份）。
 */
export const QUESTION_STATUS_TEXT: Record<QuestionStatus, string> = {
  pending: '等待中',
  answered: '已作答',
  failed: '没答出',
  skipped: '跳过',
};

/** 阶段中文（同上，两处共用） */
export const QUIZ_PHASE_TEXT: Record<QuizPhase, string> = {
  idle: '空闲',
  fetching: '正在拉题…',
  answering: '正在问模型…',
  filling: '正在回填页面…',
  submitting: '已点提交，等待站点结果…（人机验证码要你手动点）',
  retrying: '未通过，正在重答低分题…',
  done: '已结束',
  error: '出错',
};

export interface QuestionProgress {
  readonly qid: string;
  /** 从 1 开始的题号（监视页显示用） */
  readonly no: number;
  readonly typeText: string;
  readonly status: QuestionStatus;
  /** 定稿答案（`A,C` / `对` / 填空原文） */
  readonly answer: string;
  /** 一共发了几次请求 */
  readonly requests: number;
  /** 每次请求解析出的答案（含 null） */
  readonly samples: readonly (string | null)[];
  /** 备注：重答模式会说「模型没听排除」之类的 */
  readonly note: string;
}

/** 课程（连播）进度 */
export interface CourseProgress {
  /** 当前位置，从 1 开始 */
  readonly index: number;
  /** 当前这一层/这一章/这一节/这一项一共多少个 */
  readonly total: number;
  /** 人话标题，例如 `第 3 章 第 2 节「第一章测验」` */
  readonly label: string;
  /**
   * 「章 → 节 → 任务点」分层列表（§E.2，用户 2026-10-08 拍板要做）。
   *
   * **可选**：旧连播（`autoplay.ts`）发布进度时只给上面三个字段，不给这个；
   * 新接管（`takeover.ts`）会给。界面拿到就画列表、拿不到就只画进度条。
   */
  readonly rows?: readonly CourseRow[];
  /** 当前正在处理的任务点 id（`TaskPoint.nodeId`），给列表高亮用 */
  readonly currentId?: string | null;
}

/** 答题阶段（监视页顶部一句话） */
export type QuizPhase = 'idle' | 'fetching' | 'answering' | 'filling' | 'submitting' | 'retrying' | 'done' | 'error';

export interface QuizProgress {
  readonly tid: string;
  readonly total: number;
  /** 已经有最终答案（含页面上本来就有答案的）的题数 */
  readonly done: number;
  readonly phase: QuizPhase;
  /** 阶段说明（错误原因、重答原因都写这儿） */
  readonly message: string;
  readonly questions: readonly QuestionProgress[];
}

export interface MonitorState {
  readonly course: CourseProgress | null;
  readonly quiz: QuizProgress | null;
}

const EMPTY: MonitorState = { course: null, quiz: null };

let state: MonitorState = EMPTY;
const listeners = new Set<() => void>();

/** 当前快照（**只读**，调用方别改它） */
export function monitorState(): MonitorState {
  return state;
}

/** 订阅变更，返回退订函数 */
export function subscribeMonitor(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (err) {
      log.warn('监视页订阅者抛异常，已忽略', err instanceof Error ? err.message : String(err));
    }
  }
}

// ------------------------------------------------------------- 课程进度

/** 连播每走一步就调一次；传 null 清空 */
export function setCourseProgress(p: CourseProgress | null): void {
  state = { ...state, course: p };
  emit();
}

// ------------------------------------------------------------- 答题进度

let quiz: QuizProgress | null = null;

function publishQuiz(): void {
  state = { ...state, quiz };
  emit();
}

/** 开始一份卷子：登记题目清单，全部标 `pending` */
export function quizBegin(
  tid: string,
  questions: readonly { id: string; typeText: string; hasAnswer: boolean }[],
): void {
  quiz = {
    tid,
    total: questions.length,
    done: questions.filter((q) => q.hasAnswer).length,
    phase: 'fetching',
    message: '',
    questions: questions.map((q, i) => ({
      qid: q.id,
      no: i + 1,
      typeText: q.typeText,
      status: q.hasAnswer ? 'skipped' : 'pending',
      answer: '',
      requests: 0,
      samples: [],
      note: q.hasAnswer ? '页面上已有答案，不重复请求' : '',
    })),
  };
  log.debug(`监视：登记 ${tid}，共 ${questions.length} 题`);
  publishQuiz();
}

/** 改一道题的状态（按 qid 找，找不到就忽略） */
export function quizPatch(qid: string, patch: Partial<Omit<QuestionProgress, 'qid' | 'no'>>): void {
  if (quiz === null) return;
  let hit = false;
  const questions = quiz.questions.map((q) => {
    if (q.qid !== qid) return q;
    hit = true;
    return { ...q, ...patch };
  });
  if (!hit) return;
  const done = questions.filter((q) => q.status === 'answered' || q.status === 'skipped').length;
  quiz = { ...quiz, questions, done };
  publishQuiz();
}

/** 改阶段与说明 */
export function quizPhase(phase: QuizPhase, message = ''): void {
  if (quiz === null) return;
  quiz = { ...quiz, phase, message };
  publishQuiz();
  // 阶段变化就是「给用户看的进度」，从这里统一发出去（监视页 + Toast 一份，见 notice.ts）
  const detail = message === '' ? '' : ` —— ${message}`;
  noticePost(`${QUIZ_PHASE_TEXT[phase]}${detail}`, phase === 'error' ? 'error' : 'info');
}

/**
 * 一份卷子跑完了（成功或失败都调；之后监视页只展示不再动）。
 *
 * `kind` 决定 Toast 要不要常驻：通过用 `success`，没过/读不懂用 `warn`。
 */
export function quizEnd(message: string, kind: NoticeKind = 'info'): void {
  if (quiz === null) return;
  quiz = { ...quiz, phase: 'done', message };
  publishQuiz();
  noticePost(message, kind);
}

/** 换一份卷子/清空 */
export function quizClear(): void {
  quiz = null;
  publishQuiz();
}



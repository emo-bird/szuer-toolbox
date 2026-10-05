/**
 * 学习页 ↔ 测验页的**同一个标签页**内的状态传递。
 *
 * 用户拍板（m01058 第 4 条）：遇到未完成的测验，**把当前标签页地址改成测验地址**，
 * 测验页里检测到交卷再把地址**改回课程地址** —— 全程一个标签页，
 * 于是「跨标签页通信」这套东西整个不需要了（上一版用 `localStorage` + `storage`
 * 事件开新标签页，已随本次改动删除）。
 *
 * 用 `sessionStorage` 而不是 `localStorage`：`sessionStorage` 本来就是
 * 「一个标签页一份」，正好只服务这一次跳转 —— 不会打扰用户同时开着的其它课程页。
 */

const KEY = 'sztb:uooc:quiz';

/** 这份状态多久算过期（防止上次没走完的残留被当成这一次的） */
const TTL_MS = 12 * 60 * 60 * 1000;

export interface QuizState {
  /** 去测验**之前**的学习页地址；做完跳回这里 */
  returnUrl: string;
  cid: string;
  /** 测验的 tid（新版地址 `/exam/{tid}` 里那一段） */
  taskId: string;
  /** 目录里那一项的 id */
  resourceId: string;
  /** 写这份状态的时刻 */
  at: number;
  /** 测验页确认交卷后置 true */
  done: boolean;
}

function read(): QuizState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as Record<string, unknown>;
    const str = (k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : '');
    const state: QuizState = {
      returnUrl: str('returnUrl'),
      cid: str('cid'),
      taskId: str('taskId'),
      resourceId: str('resourceId'),
      at: typeof o['at'] === 'number' ? (o['at'] as number) : 0,
      done: o['done'] === true,
    };
    if (state.returnUrl === '') return null;
    if (Date.now() - state.at > TTL_MS) return null;
    return state;
  } catch {
    return null;
  }
}

function write(state: QuizState): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 隐私模式 / 配额满：失败了也不会出大事 —— 学习页只是拿不到「做完了」这个提示，
    // 目录里那一项变成已完成时还有一条兜底路（见 video.ts 的 checkWaitingQuiz）。
  }
}

/** 学习页：跳去测验之前调一次 */
export function beginQuiz(state: Omit<QuizState, 'at' | 'done'>): void {
  write({ ...state, at: Date.now(), done: false });
}

export function readQuizState(): QuizState | null {
  return read();
}

/** 测验页：确认交卷后调一次（保留 returnUrl 供调用方跳回） */
export function markQuizDone(): QuizState | null {
  const state = read();
  if (state === null) return null;
  write({ ...state, done: true, at: Date.now() });
  return state;
}

export function clearQuizState(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

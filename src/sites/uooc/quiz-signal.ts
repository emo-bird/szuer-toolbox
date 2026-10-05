/**
 * 学习页 ↔ 测验页（新标签页）之间的两根信号线。
 *
 * 为什么不用 `common/core/storage.ts`：那套在装了油猴时走 `GM_setValue`，是
 * **扩展侧**的存储，**不会**跨标签页派发 `storage` 事件 —— 学习页收不到「对面交卷了」。
 * 所以这里直接用同源 `localStorage`（两个标签页都是 uooc.net.cn），
 * 靠浏览器原生的 `storage` 事件通知对面。
 *
 * 两根线：
 *   - `OPENING_KEY`：学习页**替你点开测验之前**写下，测验页据此判断
 *     「这个标签页是连播开的」→ 交卷后才可以自己关掉自己。
 *     用户自己在别处点开的测验页不该被我们关，所以必须先有这张「通行证」。
 *   - `DONE_KEY`：测验页**确认交卷成功**后写下，学习页收到就继续连播。
 */

const PREFIX = 'sztb:uooc:';

/** 学习页写的「我正在替你打开这个测验」 */
export const QUIZ_OPENING_KEY = `${PREFIX}quizOpening`;

/** 测验页写的「这个测验交卷了」 */
export const QUIZ_DONE_KEY = `${PREFIX}quizDone`;

/** 「打开」这张通行证的有效期：超过这个时间的旧记录不再认 */
const OPENING_TTL_MS = 10 * 60 * 1000;

export interface QuizSignal {
  cid: string;
  /** 测验的 tid（地址栏 `/exam/paper?cid=&tid=` 里那个） */
  taskId: string;
  /** 目录里那一项的 id */
  resourceId: string;
  at: number;
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式 / 配额满：写不进去就退化成「学习页只能靠看目录判完成」
  }
}

function readJson(key: string): QuizSignal | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const o = parsed as Record<string, unknown>;
    const str = (k: string): string => (typeof o[k] === 'string' ? (o[k] as string) : '');
    return {
      cid: str('cid'),
      taskId: str('taskId'),
      resourceId: str('resourceId'),
      at: typeof o['at'] === 'number' ? (o['at'] as number) : 0,
    };
  } catch {
    return null;
  }
}

export function writeQuizOpening(signal: Omit<QuizSignal, 'at'>): void {
  writeJson(QUIZ_OPENING_KEY, { ...signal, at: Date.now() });
}

export function readQuizOpening(): QuizSignal | null {
  const s = readQuizOpeningRaw();
  if (s === null) return null;
  if (Date.now() - s.at > OPENING_TTL_MS) return null;
  return s;
}

function readQuizOpeningRaw(): QuizSignal | null {
  return readJson(QUIZ_OPENING_KEY);
}

export function clearQuizOpening(): void {
  try {
    localStorage.removeItem(QUIZ_OPENING_KEY);
  } catch {
    /* 忽略 */
  }
}

export function writeQuizDone(signal: Omit<QuizSignal, 'at'>): void {
  writeJson(QUIZ_DONE_KEY, { ...signal, at: Date.now() });
}

export function readQuizDone(): QuizSignal | null {
  return readJson(QUIZ_DONE_KEY);
}

export function clearQuizDone(): void {
  try {
    localStorage.removeItem(QUIZ_DONE_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 订阅「对面交卷了」；返回退订函数 */
export function onQuizDone(cb: (signal: QuizSignal) => void): () => void {
  const handler = (ev: StorageEvent): void => {
    // `key === null` 是 `clear()` 触发的，一并当作「有变化」处理
    if (ev.key !== null && ev.key !== QUIZ_DONE_KEY) return;
    const signal = readQuizDone();
    if (signal !== null) cb(signal);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

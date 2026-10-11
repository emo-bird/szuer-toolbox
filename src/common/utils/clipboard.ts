/**
 * 剪贴板写入 —— 三条路依次退，直到有一条成功。
 *
 * 为什么要退：**bkxk 是 `http://` 页面**（非安全上下文），Chromium 在这种页面上
 * 直接不暴露 `navigator.clipboard`（是 `undefined`，不是「调用后拒绝」）。
 * 原先只用 `navigator.clipboard.writeText` 的实现因此在真机上必然失败
 * （手测第五轮报：`复制教学班ID 失败：Error: 当前环境没有 navigator.clipboard`）。
 *
 * 三条路的取舍（顺序**不能随便调**）：
 *   1. `gm` —— Tampermonkey 的 `GM_setClipboard`。不挑安全上下文、不需要权限、
 *      **同步**完成（仍在点击手势里），是本项目的首选；header 里已 `@grant GM_setClipboard`。
 *   2. `exec` —— `document.execCommand('copy')` + 临时 textarea。同样是同步 API，
 *      所以能在点击手势内生效；虽已废弃，但 Chromium/Edge 至今可用，且 http 页面上照样能用。
 *   3. `modern` —— `navigator.clipboard.writeText`。语义最正，但需要安全上下文与权限，
 *      只能当最后一手；放在最后还因为它是**异步**的，`await` 之后就出了点击手势，
 *      失败再回头叫 `exec` 往往已经不被浏览器认作「用户触发」了。
 *
 * 三条都失败时本模块只回报失败，由调用方决定怎么提示（**绝不静默**）。
 */

/** 可用的写入方式 */
export type CopyMethod = 'gm' | 'exec' | 'modern' | 'none';

/** 当前环境具备哪些能力（真机探测结果，纯数据，便于测试） */
export interface CopyEnv {
  readonly hasGm: boolean;
  readonly hasClipboard: boolean;
  readonly hasExec: boolean;
}

/** 写入尝试的结果 */
export interface CopyOutcome {
  /** 是否成功写进剪贴板 */
  readonly ok: boolean;
  /** 最终采用（成功时）或最后一个尝试过（失败时）的方式 */
  readonly method: CopyMethod;
  /** 失败原因摘要，成功时为空串 */
  readonly detail: string;
}

const ORDER: readonly CopyMethod[] = ['gm', 'exec', 'modern'];

function has(env: CopyEnv, method: CopyMethod): boolean {
  if (method === 'gm') return env.hasGm;
  if (method === 'exec') return env.hasExec;
  if (method === 'modern') return env.hasClipboard;
  return false;
}

/** 按优先级列出**可用**的写入方式（纯函数，真机探测结果由 detectCopyEnv 提供） */
export function copyMethodOrder(env: CopyEnv): readonly CopyMethod[] {
  return ORDER.filter((m) => has(env, m));
}

/** 首选方式；一个都不可用时是 `'none'`（纯函数） */
export function pickCopyMethod(env: CopyEnv): CopyMethod {
  return copyMethodOrder(env)[0] ?? 'none';
}

/** 真机探测三个能力位 */
function detectCopyEnv(): CopyEnv {
  const g = globalThis as Record<string, unknown>;
  return {
    hasGm: typeof g['GM_setClipboard'] === 'function',
    // http 页面上这是 undefined；访问它本身也可能抛（极少），所以整段包起来
    hasClipboard: typeof navigator !== 'undefined' && navigator.clipboard !== undefined,
    hasExec: typeof document !== 'undefined' && typeof document.execCommand === 'function',
  };
}

/** 用临时 textarea + 选区走 `document.execCommand('copy')`；会**原样恢复**用户原有选区 */
function execCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.left = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  const sel = typeof document.getSelection === 'function' ? document.getSelection() : null;
  const saved: Range[] = [];
  if (sel !== null) {
    for (let i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i).cloneRange());
  }
  let ok = false;
  try {
    ta.select();
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  if (sel !== null) {
    sel.removeAllRanges();
    for (const r of saved) sel.addRange(r);
  }
  return ok;
}

/**
 * 写文本进剪贴板，依次尝试所有可用方式。
 *
 * 注意：**必须在用户点击的手势里调用**（`exec` 与 `gm` 都要求），
 * 不要在 `setTimeout` / `await` 之后才第一次调用。
 */
export async function copyText(text: string): Promise<CopyOutcome> {
  const methods = copyMethodOrder(detectCopyEnv());
  if (methods.length === 0) {
    return { ok: false, method: 'none', detail: '当前环境没有任何可用的剪贴板写入方式' };
  }
  let last: CopyMethod = 'none';
  let detail = '';
  for (const method of methods) {
    last = method;
    try {
      if (method === 'gm') {
        (globalThis as unknown as { GM_setClipboard: (t: string) => void }).GM_setClipboard(text);
        return { ok: true, method, detail: '' };
      }
      if (method === 'exec') {
        if (execCopy(text)) return { ok: true, method, detail: '' };
        detail = 'document.execCommand(copy) 返回 false';
        continue;
      }
      await navigator.clipboard.writeText(text);
      return { ok: true, method, detail: '' };
    } catch (err) {
      detail = `${method} 失败：${String(err)}`;
    }
  }
  return { ok: false, method: last, detail };
}

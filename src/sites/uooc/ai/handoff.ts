/**
 * 学习页 ↔ 答题页的「交接条」。
 *
 * ## 为什么需要它
 *
 * 答题页是**整页跳转**（`/exam/paper?cid=&tid=`，不是 SPA 里的 hash 导航），
 * 一跳过去学习页就整个卸载了，连播所在的脚本实例随之消失，两个页面之间
 * **没有任何共享内存**。而用户 m04227 要的是「把当前页换成答题页，答完题
 * 再把当前页换成课程页」⇒ 必须有人把「从哪来」记下来。
 *
 * ## 为什么用框架 storage 而不是 sessionStorage
 *
 * `src/common/core/storage.ts` 已经是全项目唯一的存储入口（GM 优先、退化
 * localStorage，见 `backendName()`）。学习页与答题页同源，这条记录天然跨页面可读。
 *
 * ## ⚠️ 它是**消费型**的
 *
 * `consumeHandoff()` 读一次就删，并且要求 `tid` 对得上、时间没过期。
 * 不做这两件事的话，用户下次自己点开任意一份测验，脚本会把他丢回
 * 半小时前那个课程页 —— 那是比「不自动返回」糟得多的 bug。
 */

import { read, remove, write } from '../../../common/core/storage.ts';

export interface QuizHandoff {
  /** 跳去答题页时所在的课程页地址（含 hash），返回时原样跳回 */
  readonly courseUrl: string;
  /** 这份交接条属于哪个测验（= tid）。对不上就当没有 */
  readonly tid: string;
  /** 写入时刻（毫秒），用于过期判断 */
  readonly at: number;
}

const KEY = 'uooc.ai.handoff';

/** 超过这么久没回来就作废（用户中途关页面 / 学习页崩了留下的残骸） */
export const HANDOFF_TTL_MS = 30 * 60 * 1000;

function isHandoff(v: unknown): v is QuizHandoff {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['courseUrl'] === 'string' &&
    typeof o['tid'] === 'string' &&
    typeof o['at'] === 'number'
  );
}

/** 学习页侧：整页跳去答题页**之前**记一笔 */
export function saveHandoff(tid: string, courseUrl: string = location.href): void {
  const record: QuizHandoff = { courseUrl, tid, at: Date.now() };
  write(KEY, record);
}

/**
 * 答题页侧：读一笔并**立刻删掉**。
 *
 * 只有「同 tid 且未过期」才返回记录，其余一律返回 null（但**同样会删掉**，
 * 免得残骸一直躺在存储里）。
 */
export function consumeHandoff(tid: string, now: number = Date.now()): QuizHandoff | null {
  const raw = read<unknown>(KEY, null);
  if (raw === null || raw === undefined) return null;
  remove(KEY);
  if (!isHandoff(raw)) return null;
  if (raw.tid !== tid) return null;
  if (now - raw.at > HANDOFF_TTL_MS) return null;
  return raw;
}

/** 手动丢弃（例如用户在答题页选择了「再等等」，不想再被带回课程页） */
export function clearHandoff(): void {
  remove(KEY);
}

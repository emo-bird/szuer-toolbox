/**
 * UOOC 提示流：**所有给用户看的进度/异常都从这里出去**，单一来源。
 *
 * 一份落成历史（监视页顶部的【接管状态】块，可回看），
 * 一份转成右上角 Toast（浮动栈，出错类不自动消失）。
 *
 * 为什么不直接在各自模块里 `host.toast`：`ai/*` 里若干处拿不到 `host`，
 * 而监视页需要**时间序**的历史；两处各写一份必然对不上。
 */

import { scoped } from '../../common/core/log.ts';
import type { PanelApi } from '../types.ts';

export type NoticeKind = 'info' | 'success' | 'warn' | 'error';

export interface Notice {
  readonly id: number;
  /** `Date.now()` */
  readonly at: number;
  readonly kind: NoticeKind;
  readonly text: string;
  /** 连续重复的相同文案被合并时 +1（界面上显示 `×N`） */
  readonly count: number;
}

/** 监视页只展示最近这么多条 */
export const MAX_NOTICES = 40;

const log = scoped('uooc/notice');

let seq = 0;
let list: readonly Notice[] = [];
const listeners = new Set<() => void>();

/** Toast 出口。站点模块拿不到 shadow root，只能由面板侧在 `init` 时绑进来 */
let sink: PanelApi | null = null;

export function noticeBind(host: PanelApi | null): void {
  sink = host;
}

export function noticeList(): readonly Notice[] {
  return list;
}

export function subscribeNotice(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function clearNotices(): void {
  list = [];
  seq = 0;
  emit();
}

/** `1700000000000` → `12:34:56` */
export function clockText(at: number): string {
  const d = new Date(at);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export interface NoticeOptions {
  /** true = 只记进监视页，不弹 Toast */
  readonly quiet?: boolean;
  /** 与上一条完全相同时合并计数而不是新增一条（默认开，防刷屏） */
  readonly dedupe?: boolean;
}

function emit(): void {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (err) {
      log.warn('提示流订阅者抛错', String(err));
    }
  }
}

export function noticePost(text: string, kind: NoticeKind = 'info', options: NoticeOptions = {}): void {
  const msg = text.trim();
  if (msg === '') return;

  const last = list.length === 0 ? undefined : list[list.length - 1];
  if (options.dedupe !== false && last !== undefined && last.text === msg && last.kind === kind) {
    const merged: Notice = { ...last, at: Date.now(), count: last.count + 1 };
    list = [...list.slice(0, -1), merged];
    emit();
    return;
  }

  seq += 1;
  list = [...list, { id: seq, at: Date.now(), kind, text: msg, count: 1 }].slice(-MAX_NOTICES);
  emit();

  if (options.quiet === true) return;
  // 出错/警告不自动消失（错过了就查不到），普通进度 2.6 秒后自己走
  const sticky = kind === 'warn' || kind === 'error';
  if (sink === null) {
    log.debug(`面板还没绑 Toast 出口，只记监视页：${msg}`);
    return;
  }
  try {
    sink.toast(msg, kind, { sticky });
  } catch (err) {
    log.warn('Toast 出口抛错', String(err));
  }
}

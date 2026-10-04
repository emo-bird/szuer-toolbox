/**
 * 站点会话上下文：把「发请求需要的那几样东西」收在一处。
 *
 * 为什么单独一个模块：抢课引擎（`tasks.ts`）与监控引擎（`monitor.ts`）都需要
 * 同一套「学号 / 批次码 / 校区 / token」，而 `batchCode` 的两级来源
 * （sessionStorage 优先、设置项兜底）极易被各自实现成两套略有差别的版本。
 * 一旦不一致，表现是「任务能抢、监控查不到容量」这种难查的问题。
 *
 * ⚠️ token **只在内存中传递**，绝不写 storage、绝不进日志（红线 R3）。
 * 本模块刻意不提供任何序列化入口。
 */

import { getValue } from '../../common/core/settings.ts';
import { readSession } from './session.ts';
import { SITE_ID, VALUE } from './settings.ts';

export interface BkxkContext {
  readonly studentCode: string;
  readonly batchCode: string;
  readonly campus: string;
  readonly token: string;
  readonly loggedIn: boolean;
}

/**
 * 取当前会话上下文。
 *
 * `batchCode` 两级来源（旧仓库 `list.js:151` 同此）：
 *   ① sessionStorage 的 `studentInfo` 里的 `electiveBatch.code`
 *   ② 用户在【设置】里手填的 `batchCode`
 *
 * ⚠️ 目前**没有任何模块把列表响应里学到的批次码写回设置**（那是批 2 的活），
 * 所以这里只读不写 —— 引擎不偷偷改用户设置。
 */
export function bkxkContext(): BkxkContext {
  const s = readSession();
  const stored = getValue<unknown>(SITE_ID, VALUE.BATCH_CODE);
  const fallback = typeof stored === 'string' ? stored.trim() : '';
  return {
    studentCode: s.studentCode,
    batchCode: s.batchCode === null || s.batchCode === '' ? fallback : s.batchCode,
    campus: s.campus,
    token: s.token,
    loggedIn: s.loggedIn,
  };
}

/** 当前页面 origin。非浏览器环境（档 1 冒烟）返回空串，调用方不要据此发请求 */
export function pageOrigin(): string {
  return typeof location === 'undefined' ? '' : location.origin;
}

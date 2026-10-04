/**
 * 晚到补偿（选项 1+2，分支 `feat/bkxk-tt-late-render`）。
 *
 * 【问题】Tampermonkey 把用户脚本投进页面是**异步**的（本机实测落点在
 * `performance.now()` 约 200ms 之后），而站点在暖缓存下 **75ms 就发出**
 * `teachingTime.do`（见 `docs/开发文档.md` §4.4.3 的实测对照表）。
 * 那一发请求用的是**原生** XHR —— 我们的包装当时还不存在 ⇒ 响应接管完全没赶上，
 * 而且**不报错、静默**（硬刷新或限速 3G 时反而总赶上，因为站点变慢了）。
 *
 * 【本模块干什么】补一次请求：我们自己取一遍 `teachingTime.do`（走站点的
 * `bkxkSend` 出口，带 token，**不过接管**），用 `augmentTimetable` 把自定义课程
 * 合并进 `dataList`，然后把合并后的行交给**站点自己的渲染器**画
 * （调用点在 `timetable.ts`，因为那需要页面世界的 `jQuery`）。
 *
 * 【为什么不用 `fetch` 直接抓】红线：本站所有 bkxk 请求一律走 `bkxkSend`
 * （见 `api.ts` 顶部说明）——它统一带 token、统一分类响应、统一落档未识别响应。
 *
 * 【为什么带 `judgeLate`】用户给的关键线索是「硬刷新能中、普通刷新不能中、
 * 限速 3G 反而总能中」⇒ 病因是**谁快谁慢**。所以补偿触发时要把「站点那一刻在
 * 几毫秒、我们在几毫秒」写进日志，不然下次只能靠猜。
 */

import { scoped } from '../../common/core/log.ts';
import { EP, appendTimestamp, bkxkSend, buildTeachingTimeBody, endpointUrl } from './api.ts';
import type { SendOptions, SendResult } from './api.ts';
import { augmentTimetable } from './hijack.ts';
import { pageRecord } from './page-realm.ts';
import type { BkxkCustomCourse } from './custom.ts';

const log = scoped('bkxk/timetable-late');

/** 拿页面 origin；不在页面上（单元测试）时为空串 */
function currentOrigin(): string {
  return typeof location !== 'undefined' ? location.origin : '';
}

// ------------------------------------------------------------ 谁快谁慢

/** `performance.getEntriesByType('resource')` 里我们关心的那两个字段 */
export interface ResourceStart {
  readonly name: string;
  readonly startTime: number;
}

/**
 * 从资源计时里挑出 `teachingTime.do` 那几条的 `startTime`（毫秒，相对导航开始）。
 *
 * 纯函数：`startTime` 与 `performance.now()` 是**同一个时钟**，所以可以直接和
 * 「我们装上接管的时刻」比大小。
 */
export function teachingTimeStarts(entries: readonly ResourceStart[]): readonly number[] {
  const out: number[] = [];
  for (const e of entries) {
    if (!e.name.includes('teachingTime.do')) continue;
    if (!Number.isFinite(e.startTime)) continue;
    out.push(e.startTime);
  }
  out.sort((a, b) => a - b);
  return out;
}

/** 读页面世界的资源计时；读不到给空数组（不抛错） */
export function readTeachingTimeStarts(): readonly number[] {
  const perf = pageRecord()['performance'];
  if (perf === null || typeof perf !== 'object') return [];
  const get = (perf as Record<string, unknown>)['getEntriesByType'];
  if (typeof get !== 'function') return [];
  try {
    const list = (get as (this: unknown, type: string) => unknown).call(perf, 'resource');
    if (!Array.isArray(list)) return [];
    const entries: ResourceStart[] = [];
    for (const raw of list) {
      if (raw === null || typeof raw !== 'object') continue;
      const rec = raw as Record<string, unknown>;
      const name = rec['name'];
      const startTime = rec['startTime'];
      if (typeof name !== 'string' || typeof startTime !== 'number') continue;
      entries.push({ name, startTime });
    }
    return teachingTimeStarts(entries);
  } catch {
    return [];
  }
}

export interface LateVerdict {
  /** 站点那条请求**早于**我们装上接管 ⇒ 我们没赶上 */
  readonly late: boolean;
  /** 站点那条请求发生在几毫秒（没有证据时为 null） */
  readonly requestAtMs: number | null;
  /** 晚了几毫秒（没有证据时为 null） */
  readonly gapMs: number | null;
  /** 直接进日志的一句话 */
  readonly text: string;
}

/**
 * 判断「我们是不是来晚了」。给**日志**用，不做任何决策
 * （要不要补偿由 `shouldOwnRender` 看页面事实决定，不看时钟 —— 时钟只是证据）。
 */
export function judgeLate(installedAtMs: number, starts: readonly number[]): LateVerdict {
  // 不假设入参已排序（`teachingTimeStarts` 会排，但这里自己取最小值更稳）
  let first: number | undefined;
  for (const t of starts) {
    if (!Number.isFinite(t) || t < 0) continue;
    if (first === undefined || t < first) first = t;
  }
  if (first === undefined) {
    return { late: false, requestAtMs: null, gapMs: null, text: '查不到 teachingTime.do 的资源计时（缓存或已被清理），无法判断谁快谁慢' };
  }
  const gap = installedAtMs - first;
  if (gap > 0) {
    return {
      late: true,
      requestAtMs: first,
      gapMs: gap,
      text: `站点在 ${first.toFixed(0)}ms 就请求了 teachingTime.do，我们到 ${installedAtMs.toFixed(0)}ms 才装上接管 ⇒ 晚了 ${gap.toFixed(0)}ms（那一发是原生 XHR，我们改不到）`,
    };
  }
  return {
    late: false,
    requestAtMs: first,
    gapMs: gap,
    text: `站点 ${first.toFixed(0)}ms 请求 teachingTime.do，我们 ${installedAtMs.toFixed(0)}ms 已装上接管 ⇒ 赶上了（若仍没生效，病因不是速度）`,
  };
}

// ------------------------------------------------------------ 补一次请求

export interface LateFetchParams {
  /** 启用中的自定义课程（空数组 ⇒ 没什么可补的，直接算失败） */
  readonly items: readonly BkxkCustomCourse[];
  /** 学号（`readSession().studentCode`） */
  readonly studentCode: string;
  /** 会话令牌。**只在内存里过一手，不落盘不打日志** */
  readonly token: string;
  /** 站点 origin；不给就用 `location.origin` */
  readonly origin?: string;
  /** 发送出口；测试可注入。默认 `bkxkSend` */
  readonly send?: (o: SendOptions) => Promise<SendResult>;
}

export interface LateFetchResult {
  readonly ok: boolean;
  /** 失败原因（人话，可直接进日志）；成功时为空串 */
  readonly reason: string;
  /** 我们合并进去的段数 */
  readonly added: number;
  /** 合并后的 `dataList`（失败时为空数组），交给站点渲染器画 */
  readonly dataList: readonly unknown[];
}

function fail(reason: string): LateFetchResult {
  return { ok: false, reason, added: 0, dataList: [] };
}

/**
 * 自己取一次「我的课表」并把自定义课程合并进去。
 *
 * 失败一律**不抛错**、返回 `ok:false` + 原因：补偿只是兜底路径，
 * 它失败时自绘那份还在，不能把页面搞崩。
 */
export async function fetchMergedTimetable(p: LateFetchParams): Promise<LateFetchResult> {
  if (p.items.length === 0) return fail('没有启用中的自定义课程，不需要补偿');
  if (p.studentCode === '') return fail('读不到学号（sessionStorage.studentInfo 形状变了？）');

  const origin = p.origin ?? currentOrigin();
  if (origin === '') return fail('拿不到站点 origin（不在页面上？）');

  const send = p.send ?? bkxkSend;
  const url = appendTimestamp(endpointUrl(EP.TEACHING_TIME, origin));

  let res: SendResult;
  try {
    res = await send({
      url,
      action: '课表（晚到补偿）',
      method: 'POST',
      body: buildTeachingTimeBody(p.studentCode),
      token: p.token,
      // 站点自己的 URL 上带 `?timestamp=`，漏了会被判重放（见旧仓库实测）
      timestamp: true,
    });
  } catch (err) {
    log.warn('晚到补偿请求抛错', err);
    return fail('请求抛错（详见【日志】页上一行）');
  }

  if (res.status !== 200) return fail(`站点返回 HTTP ${String(res.status)}`);

  let root: unknown;
  try {
    root = JSON.parse(res.text);
  } catch {
    return fail('响应不是 JSON');
  }
  if (root === null || typeof root !== 'object' || Array.isArray(root)) return fail('响应不是对象');

  const obj = root as Record<string, unknown>;
  const code = obj['code'];
  if (String(code) !== '1') {
    return fail(String(code) === '302' ? '站点判未登录（code=302）—— 去重新登录再试' : `站点返回 code=${String(code)}`);
  }
  if (!Array.isArray(obj['dataList'])) return fail('响应里没有 dataList 数组');

  const { json, changed } = augmentTimetable(obj, p.items);
  if (changed === 0) return fail('一段都合并不进去（自定义课程都在关着，或都解析不出星期几）');

  const merged = (json as Record<string, unknown>)['dataList'];
  if (!Array.isArray(merged)) return fail('合并后拿不到 dataList');

  log.info(`晚到补偿：自己取了一次 teachingTime.do，合并进 ${String(changed)} 段（共 ${String(merged.length)} 行）`);
  return { ok: true, reason: '', added: changed, dataList: merged };
}

/**
 * UOOC 只读嗅探：被动截获站点自己发的 `getCatalogList` / `getUnitLearn`。
 *
 * 为什么值得做（用户 m00493 第 1 点原话：「我们可不可以拦截页面的这个请求直接读取，
 * 这样就省下一次拉取」）：这两个接口的响应我们正好要用（目录树 + 资源清单），
 * 而站点在课程页本来就会自己发。截获下来 = **零额外请求**。
 *
 * 三条硬约束：
 *
 * 1. **必须装在页面自己的 realm 上**。`src/sites/bkxk/page-realm.ts:4-8` 记录了一个真 bug：
 *    把包装后的 XHR 写在沙箱的 `globalThis` 上，页面自己那份一个字节没动，
 *    站点发的请求永远不会被改写，而且**没有任何报错**。所以这里一律走 `pageOrSelf()`。
 *
 * 2. **只读旁路，绝不改写响应**。与 `src/sites/bkxk/hijack.ts`（改写）不同，这里只是
 *    `addEventListener('load')` 之后读一份，原样放行。所以不需要包构造函数，
 *    直接改 `XMLHttpRequest.prototype` 的 `open` / `send` 就够，风险面更小。
 *
 * 3. **不能咬到自己**。`src/common/core/http.ts` 发的请求带 `__szuSkip: true`，
 *    这里看到该标记就跳过 —— 那条链路的响应体我们自己拿得到，走 `prime*` 直接喂进来。
 *
 * ⚠️ 截获**不可靠**（站点可能换接口、可能用缓存、可能在我们装钩子之前就发过）。
 * 所以调用方一律「等一会儿，等不到就自己补发一次同源 GET」——见 `autoplay.ts` 的
 * `waitCatalog` / `catalogWhenSiteGivesUp`（`FALLBACK_AFTER_LOAD_MS` + `CATALOG_HARD_TIMEOUT_MS`）
 * 与 `sourcesOf` 的 `UNIT_INTERCEPT_TIMEOUT_MS`。
 *
 * ⚠️ 别再退回「固定短超时」：站点那发 `getCatalogList` 是在 Angular 起来之后（约 5 秒）才出去的，
 * 任何几秒级的固定超时都必然抢先补发（实测白打一发 35KB）。
 */

import { scoped } from '../../common/core/log.ts';
import { pageOrSelf } from '../../common/utils/page.ts';

const log = scoped('uooc/intercept');

/** 站点侧要截的两个接口 */
type LearnApi =
  | { kind: 'catalog'; cid: string }
  | { kind: 'unit'; catalogId: string };

/**
 * 判断一个 URL 是不是我们要截的接口。
 *
 * 入参可能是相对地址（`/home/learn/getCatalogList?cid=...`）也可能是绝对地址。
 * 这里不去 `new URL()`（页面里 page realm 的 URL 未必同源），直接做子串 + 正则。
 */
export function matchLearnApi(rawUrl: string): LearnApi | null {
  const path = rawUrl.split('#')[0] ?? '';

  if (path.includes('/home/learn/getCatalogList')) {
    const m = /[?&]cid=(\d+)/.exec(path);
    if (m !== null && m[1] !== undefined) return { kind: 'catalog', cid: m[1] };
    return null;
  }

  if (path.includes('/home/learn/getUnitLearn')) {
    const m = /[?&]catalog_id=(\d+)/.exec(path);
    if (m !== null && m[1] !== undefined) return { kind: 'unit', catalogId: m[1] };
    return null;
  }

  return null;
}

// ------------------------------------------------------------- 交卷响应

/**
 * 一次交卷（`POST /exam/commit`）的判读结果。
 *
 * 判据出自用户 m04880 给的真实响应：
 * - `code == 1` → 通过；
 * - `code == 110` → **没通过**，`msg` 里带「您的得分是8,测验分数至少要达到50分」，
 *   `data.score_list` 是 `{ <qid>: <得分> }`、另有 `data.score` / `data.pass_score`；
 * - 其它 code / 解析不出 → 一律 `unknown`，**不擅自判定**（不重答、不重复提交）。
 */
export type CommitVerdict = 'pass' | 'fail' | 'unknown';

export interface CommitResult {
  readonly verdict: CommitVerdict;
  /** `data.score`（原样字符串，可能是 ''） */
  readonly score: string;
  /** `data.pass_score`（原样字符串，可能是 ''） */
  readonly passScore: string;
  /** `data.score_list`：`{ qid: 该题得分 }`，拿不到就是空对象 */
  readonly scoreList: Readonly<Record<string, string>>;
  /** 站点给的话（`msg`），失败时用来给用户看 */
  readonly message: string;
  /** 原始响应体，排查用 */
  readonly raw: unknown;
}

/** 一个 URL 是不是交卷接口 */
export function matchCommitApi(rawUrl: string): boolean {
  return (rawUrl.split('#')[0] ?? '').includes('/exam/commit');
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function pickString(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

/** 把站点给的响应体翻成 `CommitResult`（纯函数，便于单测与排查） */
export function readCommit(body: unknown): CommitResult {
  const top = asRecord(body);
  const data = asRecord(top['data']);
  const rawList = asRecord(data['score_list']);
  const scoreList: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawList)) scoreList[k] = typeof v === 'string' ? v : String(v);
  const code = typeof top['code'] === 'number' ? top['code'] : Number(pickString(top, 'code'));
  return {
    verdict: code === 1 ? 'pass' : code === 110 ? 'fail' : 'unknown',
    score: pickString(data, 'score'),
    passScore: pickString(data, 'pass_score'),
    scoreList,
    message: pickString(top, 'msg'),
    raw: body,
  };
}

// ------------------------------------------------------------- 落地仓库

let lastCatalog: { cid: string; body: unknown } | null = null;
const unitBodies = new Map<string, unknown>();

let lastCommit: CommitResult | null = null;
let commitWaiters: Array<(v: CommitResult | null) => void> = [];

type Waiter<T> = (value: T | null) => void;

let catalogWaiters: Array<{ cid: string; fn: Waiter<unknown> }> = [];
const unitWaiters = new Map<string, Array<Waiter<unknown>>>();

/** 把一份 `getCatalogList` 响应喂进仓库（截获到，或我们自己拉的） */
export function primeCatalog(cid: string, body: unknown): void {
  lastCatalog = { cid, body };
  const pending = catalogWaiters;
  catalogWaiters = [];
  for (const w of pending) {
    if (w.cid === cid) w.fn(body);
    else catalogWaiters.push(w);
  }
}

/** 把一份 `getUnitLearn` 响应喂进仓库 */
export function primeUnitLearn(catalogId: string, body: unknown): void {
  unitBodies.set(catalogId, body);
  const pending = unitWaiters.get(catalogId);
  if (pending === undefined) return;
  unitWaiters.delete(catalogId);
  for (const fn of pending) fn(body);
}

/** 已经拿到的 `getCatalogList`（没有则 null） */
export function peekCatalog(cid: string): unknown | null {
  return lastCatalog !== null && lastCatalog.cid === cid ? lastCatalog.body : null;
}

/** 已经拿到的某个节点的 `getUnitLearn` 资源（没有则 null） */
export function peekUnitLearn(catalogId: string): unknown | null {
  return unitBodies.get(catalogId) ?? null;
}

/** 等站点自己发 `getCatalogList`；超时返回 null */
export function waitCatalog(cid: string, timeoutMs: number): Promise<unknown | null> {
  const cached = peekCatalog(cid);
  if (cached !== null) return Promise.resolve(cached);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: unknown | null): void => {
      if (done) return;
      done = true;
      resolve(v);
    };
    catalogWaiters.push({ cid, fn: finish });
    setTimeout(() => finish(null), timeoutMs);
  });
}

/** 等站点自己发某个节点的 `getUnitLearn`；超时返回 null */
export function waitUnitLearn(catalogId: string, timeoutMs: number): Promise<unknown | null> {
  const cached = peekUnitLearn(catalogId);
  if (cached !== null) return Promise.resolve(cached);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: unknown | null): void => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const list = unitWaiters.get(catalogId) ?? [];
    list.push(finish);
    unitWaiters.set(catalogId, list);
    setTimeout(() => finish(null), timeoutMs);
  });
}

/** 测试用：清空仓库 */
export function resetInterceptStore(): void {
  lastCatalog = null;
  unitBodies.clear();
  catalogWaiters = [];
  unitWaiters.clear();
  lastCommit = null;
  commitWaiters = [];
}

// ------------------------------------------------------------- 交卷仓库

/** 把一份交卷响应喂进仓库（截获到） */
export function primeCommit(body: unknown): CommitResult {
  const result = readCommit(body);
  lastCommit = result;
  const pending = commitWaiters;
  commitWaiters = [];
  for (const fn of pending) fn(result);
  return result;
}

/**
 * 丢掉上一次交卷结果。
 *
 * ⚠️ 点【提交】**之前**必须调一次：否则用户答完第一份没通过、我们再提交时，
 * `waitCommit` 会立刻返回**上一次**那份响应（仓库里还存着），
 * 结果就是「刚点下去就报告说没通过」——而且分数还是旧的。
 */
export function clearCommit(): void {
  lastCommit = null;
}

/**
 * 等站点自己发的那一发 `POST /exam/commit` 的响应。
 *
 * ⚠️ 只等**站点自己发的**：我们自己的 `http.ts` 请求带 `__szuSkip`，
 * 在 `installFetch` / `installXhr` 里就被挡掉了（提交是用户点按钮触发的，
 * 站点用 Angular 自己的 `$http` 发出去，正好会被截获）。
 */
export function waitCommit(timeoutMs: number): Promise<CommitResult | null> {
  if (lastCommit !== null) return Promise.resolve(lastCommit);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: CommitResult | null): void => {
      if (done) return;
      done = true;
      resolve(v);
    };
    commitWaiters.push(finish);
    setTimeout(() => finish(null), timeoutMs);
  });
}

// ------------------------------------------------------------- 装钩子

function dispatch(rawUrl: string, text: string): void {
  const isCommit = matchCommitApi(rawUrl);
  const api = isCommit ? null : matchLearnApi(rawUrl);
  if (!isCommit && api === null) return;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    log.warn('截获到的响应不是 JSON，已忽略', rawUrl);
    return;
  }
  if (isCommit) {
    const result = primeCommit(body);
    log.debug('截获交卷响应', `${result.verdict} / 得分 ${result.score}`);
  } else if (api !== null && api.kind === 'catalog') {
    log.debug('截获 getCatalogList', api.cid);
    primeCatalog(api.cid, body);
  } else if (api !== null) {
    log.debug('截获 getUnitLearn', api.catalogId);
    primeUnitLearn(api.catalogId, body);
  }
}

/** 这个 URL 值得挂监听吗（学习页两接口 + 交卷） */
function shouldSniff(rawUrl: string): boolean {
  return matchLearnApi(rawUrl) !== null || matchCommitApi(rawUrl);
}

const XHR_URL_KEY = '__szuUoocUrl';
const XHR_MARK = '__szuUoocInstalled';

function installXhr(realm: Record<string, unknown>): boolean {
  const XHR = realm['XMLHttpRequest'];
  if (typeof XHR !== 'function') return false;
  const proto = (XHR as { prototype: Record<string, unknown> }).prototype;
  if (proto[XHR_MARK] === true) return false;

  const origOpen = proto['open'];
  const origSend = proto['send'];
  if (typeof origOpen !== 'function' || typeof origSend !== 'function') return false;

  proto['open'] = function (this: Record<string, unknown>, method: unknown, url: unknown, ...rest: unknown[]) {
    this[XHR_URL_KEY] = typeof url === 'string' ? url : String(url ?? '');
    return (origOpen as (...a: unknown[]) => unknown).call(this, method, url, ...rest);
  };

  proto['send'] = function (this: Record<string, unknown>, ...args: unknown[]) {
    const url = this[XHR_URL_KEY];
    if (typeof url === 'string' && shouldSniff(url)) {
      const self = this;
      (self['addEventListener'] as (t: string, fn: () => void) => void).call(self, 'load', () => {
        try {
          const text = self['responseText'];
          if (typeof text === 'string') dispatch(url, text);
        } catch {
          /* responseType 不是 text 时读 responseText 会抛，忽略即可 */
        }
      });
    }
    return (origSend as (...a: unknown[]) => unknown).apply(this, args);
  };

  Object.defineProperty(proto, XHR_MARK, { value: true, enumerable: false, configurable: true });
  log.debug('XMLHttpRequest 只读嗅探已装');
  return true;
}

const FETCH_MARK = '__szuUoocFetchInstalled';

function installFetch(realm: Record<string, unknown>): boolean {
  const origFetch = realm['fetch'];
  if (typeof origFetch !== 'function') return false;
  if (realm[FETCH_MARK] === true) return false;

  const patched = function (this: unknown, input: unknown, init?: Record<string, unknown>) {
    const p = (origFetch as (i: unknown, n?: unknown) => Promise<Response>).call(this, input, init);

    // 我们自己发的（http.ts 带 __szuSkip）不进仓库，调用方自己处理响应
    if (init !== undefined && init['__szuSkip'] === true) return p;

    let url = '';
    try {
      if (typeof input === 'string') url = input;
      else if (input !== null && typeof input === 'object') url = String((input as { url?: unknown }).url ?? '');
    } catch {
      /* 忽略 */
    }
    if (url === '' || !shouldSniff(url)) return p;

    p.then((res) => {
      try {
        res
          .clone()
          .text()
          .then((text) => dispatch(url, text))
          .catch(() => undefined);
      } catch {
        /* 忽略 */
      }
    }).catch(() => undefined);

    return p;
  };

  realm['fetch'] = patched;
  Object.defineProperty(realm, FETCH_MARK, { value: true, enumerable: false, configurable: true });
  log.debug('fetch 只读嗅探已装');
  return true;
}

/**
 * 装钩子（幂等）。**必须在 `document-start` 时机调用**（`SiteAdapter.earlyInit`），
 * 否则站点 Angular 启动后自己发的第一波请求就漏掉了。
 *
 * @param realm 默认页面 realm（`unsafeWindow ?? globalThis`）
 * @returns 是否真的装上了（测试/诊断用）
 */
export function installUoocIntercept(realm: Record<string, unknown> = pageOrSelf()): boolean {
  const a = installXhr(realm);
  const b = installFetch(realm);
  return a || b;
}

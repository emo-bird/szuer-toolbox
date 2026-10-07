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

// ------------------------------------------------------------- 落地仓库

let lastCatalog: { cid: string; body: unknown } | null = null;
const unitBodies = new Map<string, unknown>();

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
}

// ------------------------------------------------------------- 装钩子

function dispatch(rawUrl: string, text: string): void {
  const api = matchLearnApi(rawUrl);
  if (api === null) return;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    log.warn('截获到的响应不是 JSON，已忽略', rawUrl);
    return;
  }
  if (api.kind === 'catalog') {
    log.debug('截获 getCatalogList', api.cid);
    primeCatalog(api.cid, body);
  } else {
    log.debug('截获 getUnitLearn', api.catalogId);
    primeUnitLearn(api.catalogId, body);
  }
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
    if (typeof url === 'string' && matchLearnApi(url) !== null) {
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
    if (url === '' || matchLearnApi(url) === null) return p;

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

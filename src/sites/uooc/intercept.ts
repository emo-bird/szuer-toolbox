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
 *    这里看到该标记就跳过 —— 我们自己发的请求不进嗅探，响应由调用方（fetch-catalog）自己处理。
 *
 * ⚠️ 截获**不可靠**（站点可能换接口、可能用缓存、可能在我们装钩子之前就发过）。
 * 取数主路径是 `fetch-catalog.ts` 的重试闭环（`CATALOG_ATTEMPTS` 次 / 固定间隔 / 单次超时），
 * **不依赖**这里的嗅探。
 *
 * 现状（docs/清理核验报告.md §2.1）：只有「交卷响应」（`waitCommit`）有真正的消费者；
 * `getCatalogList` / `getUnitLearn` 的 learn 分支保留拦截、**只留痕不缓存**（原 wait/peek
 * 缓存整层已删）。待实测确认接管不再依赖这条旁路后，把 `dispatch` 的 learn 分支、
 * `matchLearnApi`、`shouldSniff` 里的 learn 匹配一并删掉。
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
function matchLearnApi(rawUrl: string): LearnApi | null {
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
  /**
   * 这一发请求的 HTTP 状态码。`0` = 没拿到（嗅探不到，或旧调用没传）。
   *
   * ⚠️ 判「交卷到底成没成」时**先看它**：站点业务码只在 HTTP 200 下才有意义，
   * 500 / 502 那种响应体里同样没有 `code`，会被 `readCommit` 判成 `unknown`。
   */
  readonly httpStatus: number;
  /** 原始响应体，排查用 */
  readonly raw: unknown;
}

/** HTTP 200（交卷成功与否都必须是它，否则这一发根本没走通） */
export function isCommitHttpOk(result: CommitResult): boolean {
  return result.httpStatus === 0 || result.httpStatus === 200;
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
export function readCommit(body: unknown, httpStatus = 0): CommitResult {
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
    httpStatus,
    raw: body,
  };
}

// ------------------------------------------------------------- 交卷仓库

let lastCommit: CommitResult | null = null;
let commitWaiters: Array<(v: CommitResult | null) => void> = [];

/** 把一份交卷响应喂进仓库（截获到） */
function primeCommit(body: unknown, httpStatus = 0): CommitResult {
  const result = readCommit(body, httpStatus);
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
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (v: CommitResult | null): void => {
      if (done) return;
      done = true;
      // 无论先被 primeCommit 满足还是先超时，都把定时器收掉，不留孤儿句柄
      if (timer !== null) clearTimeout(timer);
      resolve(v);
    };
    timer = setTimeout(() => finish(null), timeoutMs);
    commitWaiters.push(finish);
  });
}

// ------------------------------------------------------------- 装钩子

function dispatch(rawUrl: string, text: string, httpStatus = 0): void {
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
    const result = primeCommit(body, httpStatus);
    log.debug('截获交卷响应', `${result.verdict} / HTTP ${httpStatus} / 得分 ${result.score}`);
  } else if (api !== null && api.kind === 'catalog') {
    log.debug('截获 getCatalogList（只留痕，缓存层已删）', api.cid);
  } else if (api !== null) {
    log.debug('截获 getUnitLearn（只留痕，缓存层已删）', api.catalogId);
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
          if (typeof text === 'string') {
            const st = Number(self['status']);
            dispatch(url, text, Number.isFinite(st) ? st : 0);
          }
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
        const st = Number(res.status);
        res
          .clone()
          .text()
          .then((text) => dispatch(url, text, Number.isFinite(st) ? st : 0))
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

/**
 * 把嗅探补装进页面里**已经存在**的同源 iframe。
 *
 * ⚠️ 为什么要单独有这一发（2026-10-09 实测，手测问题 3 的根因）：
 * 试卷是 `div.showViewer > iframe[src="/exam/{tid}"]`，而 **iframe 有自己的 realm**：
 *
 * ```
 * iframe.contentWindow.XMLHttpRequest === window.XMLHttpRequest   →  false
 * iframe.contentWindow.fetch            === window.fetch          →  false
 * ```
 *
 * 顶层装的那一套对 iframe 里发出的请求**完全不可见** —— 站点自己发的那发
 * `POST /exam/commit` 于是永远进不了仓库，`waitCommit` 必然等到超时（实测整整 5 分钟）。
 * 交卷是用户在 iframe 里点完验证码才触发的，所以在点之前补装就来得及。
 *
 * 跨域 iframe 访问 `contentWindow` 会抛，逐个 try/catch 跳过。幂等：装过的不重复装。
 *
 * @param doc 要扫描的文档（默认顶层文档）
 * @returns 这次真正补装成功的 iframe 个数
 */
export function installUoocInterceptInFrames(doc: Document = document): number {
  let n = 0;
  let frames: Element[];
  try {
    frames = Array.from(doc.querySelectorAll('iframe'));
  } catch {
    return 0;
  }
  for (const f of frames) {
    try {
      const w = (f as HTMLIFrameElement).contentWindow as unknown as Record<string, unknown> | null;
      if (w === null) continue;
      // 两个都要试着装：`installXhr` 返回 true 不该短路掉 `installFetch`
      const a = installXhr(w);
      const b = installFetch(w);
      if (a || b) n += 1;
    } catch {
      /* 跨域 / 还没挂上 document，跳过 */
    }
  }
  if (n > 0) log.debug(`已给 ${n} 个 iframe 补装嗅探`);
  return n;
}

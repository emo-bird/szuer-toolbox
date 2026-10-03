/**
 * 纯函数冒烟（档1）：请求出口。
 *
 * 重点验证红线 R2 —— 串行 + 限流不可绕过。
 * 这里把 `globalThis.fetch` 换成假实现，所以不会产生真实网络流量。
 */

import { describe, it, beforeAll, afterAll, assert, assertEqual } from '../harness.ts';
import {
  request,
  safePath,
  qs,
  setIntervalMs,
  getIntervalMs,
  queueDepth,
  resetQueueForTest,
  MIN_INTERVAL_MS,
  DEFAULT_INTERVAL_MS,
  HttpError,
} from '../../src/common/core/http.ts';
import { clear as clearLog, setLevel, entries } from '../../src/common/core/log.ts';

interface Call {
  url: string;
  method: string;
  at: number;
}

const calls: Call[] = [];
const originalFetch = globalThis.fetch;

function installFakeFetch(handler?: (url: string) => { status?: number; body?: string }): void {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET', at: Date.now() });
    const r = handler?.(url) ?? {};
    const status = r.status ?? 200;
    const body = r.body ?? '{"ok":true}';
    return {
      status,
      statusText: status === 200 ? 'OK' : 'ERR',
      url,
      text: async () => body,
    } as unknown as Response;
  }) as typeof fetch;
}

describe('common/core/http —— 纯函数', () => {
  beforeAll(() => {
    clearLog();
    setLevel('error');
    resetQueueForTest();
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
    resetQueueForTest();
  });

  it('safePath 剥掉 query（query 里可能有 token）', () => {
    assertEqual(safePath('https://a.cn/x/y?token=secret#frag'), '/x/y#frag');
  });

  it('safePath 对非法 URL 不抛错', () => {
    assertEqual(typeof safePath('::::not a url'), 'string');
  });

  it('qs 跳过 undefined / null，其余转字符串', () => {
    assertEqual(qs({ a: 1, b: 'x', c: undefined, d: null, e: false }), 'a=1&b=x&e=false');
  });

  it('请求间隔低于硬下限会被钳制', () => {
    resetQueueForTest();
    setIntervalMs(10);
    assertEqual(getIntervalMs(), MIN_INTERVAL_MS, '必须钳到 200ms 硬下限');
    setIntervalMs(3000);
    assertEqual(getIntervalMs(), 3000);
    resetQueueForTest();
    assertEqual(getIntervalMs(), DEFAULT_INTERVAL_MS);
  });
});

describe('common/core/http —— 串行队列', () => {
  beforeAll(() => {
    clearLog();
    setLevel('error');
    resetQueueForTest();
    installFakeFetch();
  });
  afterAll(() => {
    globalThis.fetch = originalFetch;
    resetQueueForTest();
  });

  it('并发发出的请求被串行化，且顺序与发起顺序一致', async () => {
    resetQueueForTest();
    setIntervalMs(MIN_INTERVAL_MS);
    installFakeFetch();

    const results = await Promise.all([
      request({ url: 'https://a.cn/1' }),
      request({ url: 'https://a.cn/2' }),
      request({ url: 'https://a.cn/3' }),
    ]);

    assertEqual(calls.map((c) => c.url).join(','), 'https://a.cn/1,https://a.cn/2,https://a.cn/3');
    assertEqual(results.length, 3);
    assertEqual(results[0]?.status, 200);
  });

  it('相邻两个请求的启动间隔不低于硬下限', async () => {
    resetQueueForTest();
    setIntervalMs(MIN_INTERVAL_MS);
    installFakeFetch();

    await Promise.all([request({ url: 'https://a.cn/1' }), request({ url: 'https://a.cn/2' })]);

    assert(calls.length === 2, `应有 2 次调用，实际 ${calls.length}`);
    const gap = (calls[1]?.at ?? 0) - (calls[0]?.at ?? 0);
    assert(gap >= MIN_INTERVAL_MS - 20, `间隔应 ≥ ${MIN_INTERVAL_MS}ms（含调度误差），实际 ${gap}ms`);
  });

  it('队列计数在请求结束后归零', async () => {
    resetQueueForTest();
    setIntervalMs(MIN_INTERVAL_MS);
    installFakeFetch();
    await request({ url: 'https://a.cn/1' });
    assertEqual(queueDepth(), 0);
  });

  it('前一个请求失败不会把后面的请求带塌', async () => {
    resetQueueForTest();
    setIntervalMs(MIN_INTERVAL_MS);
    installFakeFetch((url) => {
      if (url.endsWith('/boom')) throw new Error('模拟网络错误');
      return { status: 200, body: '{"ok":1}' };
    });

    const first = request({ url: 'https://a.cn/boom' });
    const second = request({ url: 'https://a.cn/fine' });

    let firstFailed = false;
    try {
      await first;
    } catch {
      firstFailed = true;
    }
    const secondRes = await second;

    assert(firstFailed, '第一个请求应当失败');
    assertEqual(secondRes.status, 200, '第二个请求应照常成功');
    assertEqual(queueDepth(), 0);
  });

  it('responseType=json 时解析失败抛 HttpError 且带上原始文本', async () => {
    resetQueueForTest();
    setIntervalMs(MIN_INTERVAL_MS);
    installFakeFetch(() => ({ status: 200, body: '<html>不是 JSON</html>' }));

    let caught: unknown = null;
    try {
      await request({ url: 'https://a.cn/x', responseType: 'json' });
    } catch (err) {
      caught = err;
    }
    assert(caught instanceof HttpError, `应抛 HttpError，实际 ${String(caught)}`);
    assert((caught as HttpError).responseText.includes('不是 JSON'), '应保留原始响应文本（红线 R4 全量落档）');
  });

  it('responseType=json 时正常解析', async () => {
    resetQueueForTest();
    setIntervalMs(MIN_INTERVAL_MS);
    installFakeFetch(() => ({ status: 200, body: '{"code":0,"data":{"n":3}}' }));
    const res = await request({ url: 'https://a.cn/x', responseType: 'json' });
    assertEqual((res.json as { code: number }).code, 0);
  });

  it('日志里不出现 query 参数（凭证不落盘）', async () => {
    resetQueueForTest();
    setIntervalMs(MIN_INTERVAL_MS);
    installFakeFetch();
    clearLog();
    setLevel('debug');
    await request({ url: 'https://a.cn/api?token=SUPERSECRET' });
    const text = JSON.stringify(entries());
    assert(!text.includes('SUPERSECRET'), `日志里不应出现 token：${text}`);
    setLevel('error');
  });
});

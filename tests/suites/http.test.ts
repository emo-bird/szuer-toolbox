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
  RECOMMENDED_MIN_INTERVAL_MS,
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

  it('safePath 剥掉凭证、query 和 hash', () => {
    assertEqual(safePath('https://user:secret@a.cn/x/y?token=secret#frag'), '/x/y');
    assertEqual(safePath('/x/y#token=secret'), '/x/y');
  });

  it('safePath 对非法 URL 不抛错', () => {
    assertEqual(typeof safePath('::::not a url'), 'string');
  });

  it('qs 跳过 undefined / null，其余转字符串', () => {
    assertEqual(qs({ a: 1, b: 'x', c: undefined, d: null, e: false }), 'a=1&b=x&e=false');
  });

  it('请求间隔低于建议下限不会被钳制，只记一条警告', () => {
    resetQueueForTest();
    clearLog();
    setLevel('debug');

    setIntervalMs(10);
    assertEqual(getIntervalMs(), 10, '已取消 200ms 硬下限，不再钳制（用户 Q-AF 拍板）');
    const warned = entries().some((e) => e.message.includes('低于建议下限'));
    assert(warned, `应有一条「低于建议下限」的警告，实际日志：${JSON.stringify(entries())}`);

    setIntervalMs(3000);
    assertEqual(getIntervalMs(), 3000, '正常值原样保留');
    resetQueueForTest();
    assertEqual(getIntervalMs(), DEFAULT_INTERVAL_MS, 'resetQueueForTest 回到默认值');

    setLevel('error');
  });

  it('请求间隔超出合法区间才被钳制（防非法值，不是防高频）', () => {
    resetQueueForTest();
    setIntervalMs(-5);
    assertEqual(getIntervalMs(), 0, '负数钳到下限 0');
    setIntervalMs(999999);
    assertEqual(getIntervalMs(), 60000, '超大值钳到上限 60000');
    resetQueueForTest();
  });
});

describe('common/core/http —— 取消与独立模型队列', () => {
  it('响应正文超时后中止页面请求，后续队列继续发送', async () => {
    resetQueueForTest();
    setIntervalMs(0);
    const previous = globalThis.fetch;
    const captured: { signal?: AbortSignal | null } = {};
    try {
      globalThis.fetch = async (url, init) => {
        if (url !== 'https://a.cn/hang') return new Response('ok');
        captured.signal = init?.signal;
        return { status: 200, text: () => new Promise(() => {}) } as Response;
      };
      const [first, next] = await Promise.allSettled([
        request({ url: 'https://a.cn/hang', timeoutMs: 15 }),
        request({ url: 'https://a.cn/next' }),
      ]);
      assert(first.status === 'rejected', '超时请求必须结束');
      assertEqual(first.reason?.name, 'TimeoutError');
      assertEqual(captured.signal?.aborted, true);
      assert(next.status === 'fulfilled', '后续请求不应堵在队列中');
      assertEqual(next.value.text, 'ok');
    } finally {
      globalThis.fetch = previous;
    }
  });

  it('排队期间取消不会发送请求并立即释放队列名额', async () => {
    resetQueueForTest();
    setIntervalMs(0);
    const previous = globalThis.fetch;
    installFakeFetch();
    const controller = new AbortController();
    try {
      const queued = request({ url: 'https://a.cn/cancel', signal: controller.signal });
      assertEqual(queueDepth(), 1);
      controller.abort();
      assertEqual(queueDepth(), 0);
      const [result] = await Promise.allSettled([queued]);
      assert(result?.status === 'rejected', '取消的请求应拒绝');
      assertEqual(result.reason, controller.signal.reason);
      await request({ url: 'https://a.cn/keep' });
      assertEqual(calls.map(({ url }) => url).join(','), 'https://a.cn/keep');
    } finally {
      globalThis.fetch = previous;
    }
  });

  it('模型请求匿名、并发数封顶且不阻塞页面请求', async () => {
    resetQueueForTest();
    const globals = globalThis as Record<string, unknown>;
    const previous = globals['GM_xmlhttpRequest'];
    const previousFetch = globalThis.fetch;
    const controller = new AbortController();
    let started = 0;
    let anonymous = true;
    try {
      globals['GM_xmlhttpRequest'] = (opts: { anonymous: boolean }) => {
        anonymous &&= opts.anonymous === true;
        started += 1;
        return { abort() {} };
      };
      installFakeFetch();
      const results = Promise.allSettled(
        Array.from({ length: 9 }, () => request({
          url: 'https://model.invalid/answer',
          channel: 'gm',
          timeoutMs: 200,
          signal: controller.signal,
        })),
      );
      const page = await request({ url: 'https://a.cn/page', timeoutMs: 200 });
      controller.abort();
      assertEqual(page.status, 200);
      assertEqual(started, 8);
      assertEqual(anonymous, true);
      for (const result of await results) {
        assert(result.status === 'rejected', '取消应同时终止运行中和排队中的请求');
        assertEqual(result.reason, controller.signal.reason);
      }
      assertEqual(queueDepth(), 0);
    } finally {
      controller.abort();
      globals['GM_xmlhttpRequest'] = previous;
      globalThis.fetch = previousFetch;
    }
  });

  it('GM 超时不依赖管理器回调，仍尝试中止传输', async () => {
    resetQueueForTest();
    const globals = globalThis as Record<string, unknown>;
    const previous = globals['GM_xmlhttpRequest'];
    let aborted = 0;
    try {
      globals['GM_xmlhttpRequest'] = () => ({ abort() { aborted += 1; } });
      const [result] = await Promise.allSettled([
        request({ url: 'https://model.invalid/hang', channel: 'gm', timeoutMs: 15 }),
      ]);
      assert(result?.status === 'rejected', 'GM 没回调也应超时');
      assertEqual(result.reason?.name, 'TimeoutError');
      assertEqual(aborted, 1);
    } finally {
      globals['GM_xmlhttpRequest'] = previous;
    }
  });

  it('GM 日志省略接口路径与正文，并显示二进制响应长度', async () => {
    resetQueueForTest();
    clearLog();
    setLevel('debug');
    const globals = globalThis as Record<string, unknown>;
    const previous = globals['GM_xmlhttpRequest'];
    const url = 'https://model.invalid/private-path-key?token=private-query-key';
    try {
      globals['GM_xmlhttpRequest'] = ({ onload }: { onload: (response: unknown) => void }) =>
        onload({ status: 200, response: new ArrayBuffer(4), responseText: 'private-response' });
      const response = await request({ url, channel: 'gm', responseType: 'arraybuffer' });
      assertEqual(response.bytes?.byteLength, 4);
      assert(entries().some((entry) => entry.message.includes('200') && entry.message.includes('4B')),
        '日志应按实际二进制长度记录');

      const [invalid] = await Promise.allSettled([request({ url, channel: 'gm', responseType: 'json' })]);
      assert(invalid?.status === 'rejected' && invalid.reason instanceof HttpError, '仍应保留 JSON 解析错误');
      const logText = JSON.stringify(entries());
      assert(!logText.includes('private-'), '成功与失败日志都应省略端点和响应正文');
    } finally {
      globals['GM_xmlhttpRequest'] = previous;
      setLevel('error');
    }
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
    setIntervalMs(RECOMMENDED_MIN_INTERVAL_MS);
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
    setIntervalMs(RECOMMENDED_MIN_INTERVAL_MS);
    installFakeFetch();

    await Promise.all([request({ url: 'https://a.cn/1' }), request({ url: 'https://a.cn/2' })]);

    assert(calls.length === 2, `应有 2 次调用，实际 ${calls.length}`);
    const gap = (calls[1]?.at ?? 0) - (calls[0]?.at ?? 0);
    assert(gap >= RECOMMENDED_MIN_INTERVAL_MS - 20, `间隔应 ≥ ${RECOMMENDED_MIN_INTERVAL_MS}ms（含调度误差），实际 ${gap}ms`);
  });

  it('队列计数在请求结束后归零', async () => {
    resetQueueForTest();
    setIntervalMs(RECOMMENDED_MIN_INTERVAL_MS);
    installFakeFetch();
    await request({ url: 'https://a.cn/1' });
    assertEqual(queueDepth(), 0);
  });

  it('前一个请求失败不会把后面的请求带塌', async () => {
    resetQueueForTest();
    setIntervalMs(RECOMMENDED_MIN_INTERVAL_MS);
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
    setIntervalMs(RECOMMENDED_MIN_INTERVAL_MS);
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
    setIntervalMs(RECOMMENDED_MIN_INTERVAL_MS);
    installFakeFetch(() => ({ status: 200, body: '{"code":0,"data":{"n":3}}' }));
    const res = await request({ url: 'https://a.cn/x', responseType: 'json' });
    assertEqual((res.json as { code: number }).code, 0);
  });

  it('日志里不出现 query 参数（凭证不落盘）', async () => {
    resetQueueForTest();
    setIntervalMs(RECOMMENDED_MIN_INTERVAL_MS);
    installFakeFetch();
    clearLog();
    setLevel('debug');
    await request({ url: 'https://a.cn/api?token=SUPERSECRET' });
    const text = JSON.stringify(entries());
    assert(!text.includes('SUPERSECRET'), `日志里不应出现 token：${text}`);
    setLevel('error');
  });
});

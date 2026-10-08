/**
 * 纯函数冒烟（档1）：UOOC 课程目录树的**取数封装**（重试策略 + 响应判定）。
 *
 * 锁住的是 §E.6 / §F.1-4 拍板的取数不变量：
 *   1. 只对 GET 重试 —— 本封装只发 GET，**共 3 次**、固定间隔 **2 秒**、单次超时 **30 秒**；
 *   2. `code == 1` **且** `data` 是数组才算成功，其余一律算失败并计入重试；
 *   3. 网络层抛错 / 非 2xx / 业务码异常 / 结构异常，**分类要分得开**（弹窗文案不同）；
 *   4. 用户在两次请求之间按了停止 ⇒ `aborted`，**不算失败**，主循环不该为它弹窗；
 *   5. 资源列表（`getUnitLearn`）走**同一套**重试与判定（`fetchWithRetry` 泛型），
 *      URL 的三个 id 从 `TaskPoint` 上取，**不在调用处自己推**。
 *
 * 网络与计时都注入假实现，所以这里**不发真请求、不真等 2 秒**。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import { flattenTaskPoints, type TaskPoint } from '../../src/sites/uooc/catalog.ts';
import {
  CATALOG_ATTEMPTS,
  CATALOG_PATH,
  CATALOG_RETRY_DELAY_MS,
  CATALOG_TIMEOUT_MS,
  UNIT_PATH,
  catalogListUrl,
  describeFailure,
  errorText,
  fetchCatalogPoints,
  fetchUnitSources,
  parseCatalogResponse,
  parseUnitResponse,
  truncateDetail,
  unitLearnUrl,
  type CatalogSender,
  type RawCatalogResponse,
} from '../../src/sites/uooc/fetch-catalog.ts';

const CID = '2005836044';
const ORIGIN = 'https://www.uooc.net.cn';

/** 一棵极小的树：一个 L2 节（自己是任务点）+ 一个 L3 点 */
function tree(): unknown[] {
  return [
    {
      id: '1177669809',
      name: '第一章',
      _level: 1,
      finished: 1,
      icon_list: [],
      children: [
        {
          id: '465358461',
          name: '第2节',
          _level: 2,
          finished: 0,
          icon_list: [{ id: '1192572135', type: '10', type_name: '视频' }],
          children: [],
        },
      ],
    },
  ];
}

function okResponse(json: unknown, status = 200): RawCatalogResponse {
  return { status, text: JSON.stringify(json), json };
}

/** 一个按脚本行事的假出口 */
function scripted(responses: readonly (RawCatalogResponse | Error)[]): {
  send: CatalogSender;
  calls: { url: string; timeoutMs: number }[];
} {
  const calls: { url: string; timeoutMs: number }[] = [];
  let index = 0;
  const send: CatalogSender = (url, timeoutMs) => {
    calls.push({ url, timeoutMs });
    const next = responses[index] ?? responses[responses.length - 1];
    index += 1;
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next!);
  };
  return { send, calls };
}

/** 记录 sleep 时长，不真等 */
function fakeSleep(): { sleep: (ms: number) => Promise<void>; slept: number[] } {
  const slept: number[] = [];
  return {
    slept,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
  };
}

describe('uooc/fetch-catalog · URL 拼接', () => {
  it('带上 cid 与 hidemsg_=true，且用给定的 origin', () => {
    const url = catalogListUrl(CID, ORIGIN);
    assertEqual(url, `${ORIGIN}${CATALOG_PATH}?cid=${CID}&hidemsg_=true`);
  });

  it('cid 走 URL 编码（不给自己留注入空间）', () => {
    const url = catalogListUrl('a&b=c', ORIGIN);
    assert(url.includes('cid=a%26b%3Dc'), 'cid 应被编码');
  });
});

describe('uooc/fetch-catalog · 响应判定', () => {
  it('code=1 且 data 是数组 ⇒ 成功，并已展平成任务点', () => {
    const res = parseCatalogResponse({ code: 1, msg: '', data: tree() }, CID);
    assert(res.ok, '应判定为成功');
    if (!res.ok) return;
    assertEqual(res.points.length, 1, '只有 1 个任务点（挂着 10 视频 的 L2）');
    assertEqual(res.points[0]!.nodeId, '465358461');
    assertEqual(res.points[0]!.primaryHash, `#/${CID}/1177669809/465358461/1192572135/section`);
    assertEqual(res.points[0]!.taskCount, 1, '没给 learn_task_cnt 就数一数 10/80 的 icon');
  });

  it('code 是字符串 "1" 也算成功（站点两种形态都发过）', () => {
    const res = parseCatalogResponse({ code: '1', data: tree() }, CID);
    assert(res.ok, '字符串 1 应被认作成功');
  });

  it('code=0 ⇒ business 失败，且 code 原样保留', () => {
    const res = parseCatalogResponse({ code: 0, msg: '未登录', data: [] }, CID);
    assert(!res.ok, '应判定为失败');
    if (res.ok) return;
    assertEqual(res.failure.kind, 'business');
    if (res.failure.kind !== 'business') return;
    assertEqual(res.failure.code, 0);
    assert(res.failure.detail.includes('未登录'), 'detail 要带上 msg');
  });

  it('code=110（交卷未通过那类业务码）也算失败', () => {
    const res = parseCatalogResponse({ code: 110, msg: 'x', data: [] }, CID);
    assert(!res.ok, '非 1 的业务码一律失败');
    if (res.ok) return;
    assertEqual(res.failure.kind, 'business');
  });

  it('code=1 但 data 不是数组 ⇒ shape 失败（不是 business）', () => {
    const res = parseCatalogResponse({ code: 1, data: null }, CID);
    assert(!res.ok, '应判定为失败');
    if (res.ok) return;
    assertEqual(res.failure.kind, 'shape');
  });

  it('响应不是对象 ⇒ shape 失败', () => {
    for (const bad of [null, 'html', 42]) {
      const res = parseCatalogResponse(bad, CID);
      assert(!res.ok, `${String(bad)} 应判定为失败`);
      if (res.ok) continue;
      assertEqual(res.failure.kind, 'shape');
    }
  });

  it('data 是空数组 ⇒ 成功但 0 个任务点（由调用方决定这算不算异常）', () => {
    const res = parseCatalogResponse({ code: 1, data: [] }, CID);
    assert(res.ok, '空树在响应层是合法的');
    if (!res.ok) return;
    assertEqual(res.points.length, 0);
  });
});

describe('uooc/fetch-catalog · 重试循环', () => {
  it('首次就成功 ⇒ 只发 1 次、不 sleep', async () => {
    const { send, calls } = scripted([okResponse({ code: 1, data: tree() })]);
    const { sleep, slept } = fakeSleep();
    const res = await fetchCatalogPoints({ cid: CID, origin: ORIGIN, send, sleep });
    assert(res.ok, '应成功');
    if (!res.ok) return;
    assertEqual(res.attempts, 1);
    assertEqual(calls.length, 1);
    assertEqual(slept.length, 0, '成功路径不该 sleep');
    assertEqual(calls[0]!.url, `${ORIGIN}${CATALOG_PATH}?cid=${CID}&hidemsg_=true`);
  });

  it('单次超时固定用 30 秒常量', async () => {
    const { send, calls } = scripted([okResponse({ code: 1, data: tree() })]);
    await fetchCatalogPoints({ cid: CID, origin: ORIGIN, send, sleep: fakeSleep().sleep });
    assertEqual(calls[0]!.timeoutMs, CATALOG_TIMEOUT_MS);
  });

  it('前两次 HTTP 500、第三次成功 ⇒ 共 3 次、间隔两次 2 秒', async () => {
    const { send, calls } = scripted([
      okResponse(null, 500),
      okResponse(null, 500),
      okResponse({ code: 1, data: tree() }),
    ]);
    const { sleep, slept } = fakeSleep();
    const res = await fetchCatalogPoints({ cid: CID, origin: ORIGIN, send, sleep });
    assert(res.ok, '第三次应成功');
    if (!res.ok) return;
    assertEqual(res.attempts, 3);
    assertEqual(calls.length, 3);
    assertDeepEqual(slept, [CATALOG_RETRY_DELAY_MS, CATALOG_RETRY_DELAY_MS]);
  });

  it('三次全失败 ⇒ ok=false、attempts=3、只 sleep 两次', async () => {
    const { send, calls } = scripted([okResponse(null, 503)]);
    const { sleep, slept } = fakeSleep();
    const res = await fetchCatalogPoints({ cid: CID, origin: ORIGIN, send, sleep });
    assert(!res.ok, '应失败');
    if (res.ok) return;
    assertEqual(res.attempts, CATALOG_ATTEMPTS);
    assertEqual(calls.length, CATALOG_ATTEMPTS, '共发的请求数 = 3');
    assertEqual(slept.length, CATALOG_ATTEMPTS - 1, '最后一次失败后不该再等');
    assertEqual(res.failure.kind, 'http');
    if (res.failure.kind !== 'http') return;
    assertEqual(res.failure.status, 503);
  });

  it('业务码异常也计入重试（不是一次就放弃）', async () => {
    const { send, calls } = scripted([okResponse({ code: 0, msg: '未登录' })]);
    const { sleep } = fakeSleep();
    const res = await fetchCatalogPoints({ cid: CID, origin: ORIGIN, send, sleep });
    assert(!res.ok, '应失败');
    if (res.ok) return;
    assertEqual(calls.length, 3);
    assertEqual(res.failure.kind, 'business');
  });

  it('网络层抛错归到 network，且带上错误原文', async () => {
    const { send } = scripted([new Error('Failed to fetch')]);
    const { sleep } = fakeSleep();
    const res = await fetchCatalogPoints({ cid: CID, origin: ORIGIN, send, sleep });
    assert(!res.ok, '应失败');
    if (res.ok) return;
    assertEqual(res.failure.kind, 'network');
    if (res.failure.kind !== 'network') return;
    assertEqual(res.failure.detail, 'Failed to fetch');
  });

  it('shouldAbort 为真时立刻收敛为 aborted，且不再发请求', async () => {
    const { send, calls } = scripted([okResponse(null, 500)]);
    const { sleep } = fakeSleep();
    const res = await fetchCatalogPoints({
      cid: CID,
      origin: ORIGIN,
      send,
      sleep,
      shouldAbort: () => true,
    });
    assert(!res.ok, '应失败');
    if (res.ok) return;
    assertEqual(res.failure.kind, 'aborted', '用户主动停止不该报成失败');
    assertEqual(calls.length, 1, '第一次发完才发现已停止，就不要再发');
  });

  it('aborted 与真失败能分辨（弹窗只在真失败时弹）', async () => {
    const { send } = scripted([okResponse(null, 500)]);
    const { sleep } = fakeSleep();
    const stopped = await fetchCatalogPoints({
      cid: CID,
      origin: ORIGIN,
      send,
      sleep,
      shouldAbort: () => true,
    });
    assert(!stopped.ok, '应失败');
    if (stopped.ok) return;
    assert(stopped.failure.kind === 'aborted', '应判为 aborted');
  });

  it('成功时把原始响应一起带出来（给「未识别返回全量落档」留口子）', async () => {
    const payload = { code: 1, data: tree(), extra: 'keep-me' };
    const { send } = scripted([okResponse(payload)]);
    const res = await fetchCatalogPoints({
      cid: CID,
      origin: ORIGIN,
      send,
      sleep: fakeSleep().sleep,
    });
    assert(res.ok, '应成功');
    if (!res.ok) return;
    assertDeepEqual(res.raw, payload);
  });
});

describe('uooc/fetch-catalog · 文案与截断', () => {
  it('describeFailure 每个分支都有话可说', () => {
    assert(describeFailure({ kind: 'network', detail: 'x' }).includes('网络'), 'network 文案');
    assert(describeFailure({ kind: 'http', status: 500, detail: 'x' }).includes('500'), 'http 文案');
    assert(describeFailure({ kind: 'business', code: 0, detail: 'x' }).includes('业务码'), 'business 文案');
    assert(describeFailure({ kind: 'shape', detail: 'x' }).includes('结构'), 'shape 文案');
    assert(describeFailure({ kind: 'aborted', detail: 'x' }).includes('中止'), 'aborted 文案');
  });

  it('truncateDetail 压掉换行并截断长正文', () => {
    assertEqual(truncateDetail('a\n b'), 'a b');
    const long = 'x'.repeat(500);
    const out = truncateDetail(long);
    assert(out.length < long.length, '长正文应被截断');
    assert(out.endsWith('…'), '截断要有省略号');
  });

  it('errorText 认 Error 也认非 Error', () => {
    assertEqual(errorText(new Error('boom')), 'boom');
    assertEqual(errorText('boom'), 'boom');
  });
});

// ------------------------------------------------------------------ §B.5 资源列表

/** 四级形态：章 → 节（自己不挂资源）→ 点（挂 10 视频） */
function subTree(): unknown[] {
  return [
    {
      id: '1177669809',
      name: '第一章',
      _level: 1,
      finished: 1,
      icon_list: [],
      children: [
        {
          id: '465358461',
          name: '第2节',
          _level: 2,
          finished: 0,
          learn_task_cnt: 0,
          icon_list: [],
          children: [
            {
              id: '394899706',
              name: '点',
              _level: 3,
              finished: 0,
              learn_task_cnt: 1,
              icon_list: [{ id: '190951828', type: '10', type_name: '视频' }],
            },
          ],
        },
      ],
    },
  ];
}

/** 实测原样：视频已完成、测验未完成（task_id 白给）、一条 id=0 的附件占位 */
function unitPayload(): unknown {
  return {
    code: 1,
    msg: '',
    data: [
      {
        id: 1859489987,
        type: '10',
        type_name: '视频',
        title: '1.3 绪论（上）',
        is_task: '1',
        finished: 1,
        video_pos: '505.820',
      },
      { id: 518085319, type: '80', type_name: '测验', is_task: '1', finished: 0, task_id: '764270' },
      { id: 0, type: 50, document: { name: '讲义.pdf' } },
    ],
  };
}

describe('uooc/fetch-catalog · 资源列表 URL', () => {
  it('三个 id 全部取自 TaskPoint，且 URL 编码', () => {
    const [point] = flattenTaskPoints(tree(), CID);
    assert(point !== undefined, '树里该有一个任务点');
    const url = unitLearnUrl(CID, point!, ORIGIN);
    assert(url.startsWith(`${ORIGIN}${UNIT_PATH}?`), `路径前缀不对：${url}`);
    assert(url.includes('catalog_id=465358461'), 'catalog_id 必须是节点自己（实测真正起作用的键）');
    assert(url.includes('chapter_id=1177669809'), 'chapter_id 取祖先章');
    assert(url.includes('section_id=465358461'), 'section 形态下 section_id = 节点自己');
    assert(url.includes(`cid=${CID}`), '要带 cid');
    assert(url.includes('hidemsg_=true'), '要带 hidemsg_=true');
  });

  it('subsection 形态：section_id 取父节点，不是节点自己（实测真正起作用的键仍是 catalog_id）', () => {
    const [point] = flattenTaskPoints(subTree(), CID);
    assert(point !== undefined, '四级树里该有一个任务点');
    assertEqual(point!.form, 'subsection');
    const url = unitLearnUrl(CID, point!, ORIGIN);
    assert(url.includes('catalog_id=394899706'), 'catalog_id 仍是节点自己');
    assert(url.includes('section_id=465358461'), 'section_id 要取父「节」，不能取节点自己');
    assert(url.includes('chapter_id=1177669809'), 'chapter_id 仍是祖先章');
  });

  it('cid 走 URL 编码（不给自己留注入空间）', () => {
    const [point] = flattenTaskPoints(tree(), CID);
    const url = unitLearnUrl('a&b=c', point!, ORIGIN);
    assert(url.includes('cid=a%26b%3Dc'), 'cid 应被编码');
  });
});

describe('uooc/fetch-catalog · 资源列表响应判定', () => {
  it('code=1 且 data 是数组 ⇒ 成功，并已解析出资源（含丢掉 id=0 的占位）', () => {
    const res = parseUnitResponse(unitPayload());
    assert(res.ok, '应判定为成功');
    if (!res.ok) return;
    assertDeepEqual(res.sources.map((s) => s.sourceId), ['1859489987', '518085319']);
    assertDeepEqual(res.sources.map((s) => s.kind), ['video', 'quiz']);
  });

  it('code 是字符串 "1" 也算成功', () => {
    const res = parseUnitResponse({ code: '1', data: [] });
    assert(res.ok, '字符串 code 也该认');
    if (!res.ok) return;
    assertDeepEqual(res.sources, []);
  });

  it('code≠1 ⇒ business（保留 code 与 msg），data 非数组 / 非对象 ⇒ shape', () => {
    const biz = parseUnitResponse({ code: 110, msg: '您的得分是8' });
    assert(!biz.ok, '应失败');
    if (biz.ok) return;
    assertEqual(biz.failure.kind, 'business');
    if (biz.failure.kind !== 'business') return;
    assertEqual(biz.failure.code, 110);
    assert(biz.failure.detail.includes('您的得分是8'), 'msg 要带出来，便于取证');

    const shape = parseUnitResponse({ code: 1, data: 'nope' });
    assert(!shape.ok && shape.failure.kind === 'shape', 'data 非数组应判 shape');

    const notObj = parseUnitResponse(null);
    assert(!notObj.ok && notObj.failure.kind === 'shape', '非对象应判 shape');
  });

  it('成功时把原始响应一起带出来', () => {
    const payload = unitPayload();
    const res = parseUnitResponse(payload);
    assert(res.ok, '应成功');
    if (!res.ok) return;
    assertDeepEqual(res.raw, payload);
  });
});

describe('uooc/fetch-catalog · 资源列表取数', () => {
  function point(): TaskPoint {
    const [p] = flattenTaskPoints(tree(), CID);
    assert(p !== undefined, '树里该有一个任务点');
    return p!;
  }

  it('首次就成功 ⇒ 只发 1 次、URL 是资源接口、超时用同一个 30 秒常量', async () => {
    const { send, calls } = scripted([okResponse(unitPayload())]);
    const { sleep, slept } = fakeSleep();
    const res = await fetchUnitSources({ cid: CID, point: point(), origin: ORIGIN, send, sleep });
    assert(res.ok, '应成功');
    if (!res.ok) return;
    assertEqual(res.attempts, 1, '成功了就别再发');
    assertDeepEqual(slept, [], '成功了不该 sleep');
    assertEqual(res.sources.length, 2);
    assertEqual(calls.length, 1);
    assert(calls[0]!.url.includes(UNIT_PATH), 'URL 要打资源接口');
    assertEqual(calls[0]!.timeoutMs, CATALOG_TIMEOUT_MS, '单次超时与取树共用 30 秒');
  });

  it('前两次失败、第三次成功 ⇒ 共 3 次、间隔两次 2 秒', async () => {
    const { send, calls } = scripted([
      okResponse(null, 500),
      new Error('boom'),
      okResponse(unitPayload()),
    ]);
    const { sleep, slept } = fakeSleep();
    const res = await fetchUnitSources({ cid: CID, point: point(), origin: ORIGIN, send, sleep });
    assert(res.ok, '第三次该成功');
    if (!res.ok) return;
    assertEqual(res.attempts, 3);
    assertEqual(calls.length, 3);
    assertDeepEqual(slept, [CATALOG_RETRY_DELAY_MS, CATALOG_RETRY_DELAY_MS]);
  });

  it('三次全失败 ⇒ ok=false、attempts=3，失败分类原样带出', async () => {
    const { send } = scripted([okResponse({ code: 0, msg: 'no' }), okResponse({ code: 0 }), okResponse({ code: 0 })]);
    const { sleep, slept } = fakeSleep();
    const res = await fetchUnitSources({ cid: CID, point: point(), origin: ORIGIN, send, sleep });
    assert(!res.ok, '应失败');
    if (res.ok) return;
    assertEqual(res.attempts, 3);
    assertEqual(res.failure.kind, 'business');
    assertDeepEqual(slept, [CATALOG_RETRY_DELAY_MS, CATALOG_RETRY_DELAY_MS], '只 sleep 两次');
  });

  it('用户按停止 ⇒ aborted，不算失败（主循环不为它弹窗）', async () => {
    // 口径：`shouldAbort` 只在**重试之间**被问（第一次发完就成功时不会再问，
    // 因为那时已经没有「要不要再等 2 秒发一次」这个问题了）。
    const { send, calls } = scripted([okResponse(null, 500)]);
    const res = await fetchUnitSources({
      cid: CID,
      point: point(),
      origin: ORIGIN,
      send,
      sleep: fakeSleep().sleep,
      shouldAbort: () => true,
    });
    assert(!res.ok, '应失败');
    if (res.ok) return;
    assertEqual(res.failure.kind, 'aborted', '用户主动停止不该报成失败');
    assertEqual(calls.length, 1, '第一次失败后才发现已停止，就不要再发第二次');
  });

  it('第一次就成功 ⇒ 不会因为 shouldAbort 把好数据丢掉', async () => {
    const { send } = scripted([okResponse(unitPayload())]);
    const res = await fetchUnitSources({
      cid: CID,
      point: point(),
      origin: ORIGIN,
      send,
      sleep: fakeSleep().sleep,
      shouldAbort: () => true,
    });
    assert(res.ok, '已经拿到手的成功响应不该被 shouldAbort 撤销');
  });

  it('重试的构造参数与取树那条路是同一套（attempts 上限就是 CATALOG_ATTEMPTS）', async () => {
    assertEqual(CATALOG_ATTEMPTS, 3, '拍板就是共 3 次');
    const { send, calls } = scripted([new Error('x')]);
    await fetchUnitSources({
      cid: CID,
      point: point(),
      origin: ORIGIN,
      send,
      sleep: fakeSleep().sleep,
    });
    assertEqual(calls.length, CATALOG_ATTEMPTS);
  });
});

/**
 * `bkxk/timetable-late.ts` 的档 1 冒烟：谁快谁慢的判读 + 自己补一次课表请求。
 *
 * 这一层全是纯逻辑 + 可注入的发送出口（`send`），所以测得了；
 * 真正调站点渲染器那一步在 `timetable.ts`（碰 `document` 与 `jQuery`），留给手测。
 */

import { readFileSync } from 'node:fs';
import { describe, it, assert, assertEqual } from '../harness.ts';
import type { CustomCourse } from '../../src/common/custom/courses.ts';
import { withSegments } from '../../src/sites/bkxk/custom.ts';
import type { BkxkCustomCourse } from '../../src/sites/bkxk/custom.ts';
import type { SendOptions, SendResult } from '../../src/sites/bkxk/api.ts';
import {
  fetchMergedTimetable,
  judgeLate,
  teachingTimeStarts,
} from '../../src/sites/bkxk/timetable-late.ts';

// ------------------------------------------------------------ 素材

const REAL = JSON.parse(
  readFileSync(new URL('../fixtures/bkxk-teachingTime.json', import.meta.url), 'utf8'),
) as { dataList: unknown[] };

function course(id: string, name: string, place: string, enabled = true): CustomCourse {
  return { id, name, teacher: '', place, color: '#e8f2fd', enabled };
}

function custom(id: string, name: string, place: string, enabled = true): BkxkCustomCourse {
  const list = withSegments([course(id, name, place, enabled)]);
  const first = list[0];
  assert(first !== undefined, 'fixture 课程必须能解析出一个对象');
  return first;
}

/** 记录的假发送出口 */
interface Sent {
  readonly opts: SendOptions;
}

function fakeSend(status: number, text: string, sent: Sent[]): (o: SendOptions) => Promise<SendResult> {
  return (o) => {
    sent.push({ opts: o });
    return Promise.resolve({ status, text, cls: { kind: 'ok', code: '1', msg: '', data: null, json: null }, raw: {} } as unknown as SendResult);
  };
}

const OK_URL = 'https://bkxk.szu.edu.cn';
const STUDENT = '2023xxxxxxxx';
const TOKEN = 'tok-只活在内存里';

// ------------------------------------------------------------ 资源计时

describe('bkxk/timetable-late —— 谁快谁慢', () => {
  it('teachingTimeStarts：只挑 teachingTime.do，并按时间排序', () => {
    const starts = teachingTimeStarts([
      { name: 'https://x/curriculum.min.js', startTime: 39 },
      { name: 'https://x/elective/teachingTime.do?timestamp=1', startTime: 285 },
      { name: 'https://x/elective/teachingTime.do?timestamp=2', startTime: 75 },
    ]);
    assertEqual(starts.length, 2, '三个里只有两条是我们的端点');
    assertEqual(starts[0], 75, '升序：最早的在前');
    assertEqual(starts[1], 285, '第二条');
  });

  it('teachingTimeStarts：非法 startTime 丢掉（NaN / Infinity）', () => {
    const starts = teachingTimeStarts([
      { name: 'elective/teachingTime.do', startTime: Number.NaN },
      { name: 'elective/teachingTime.do', startTime: Number.POSITIVE_INFINITY },
      { name: 'elective/teachingTime.do', startTime: 30 },
    ]);
    assertEqual(starts.length, 1, '只留有限数');
    assertEqual(starts[0], 30, '留下的那条');
  });

  it('站点请求早于我们装上接管 → 判「晚了」，并给出差多少毫秒', () => {
    const v = judgeLate(218, [75]);
    assertEqual(v.late, true, '75ms < 218ms');
    assertEqual(v.requestAtMs, 75, '站点那一刻');
    assertEqual(v.gapMs, 143, '晚了 143ms');
    assert(v.text.includes('143ms'), '差异要写进日志文本里');
  });

  it('我们比站点那条请求更早装上 → 不算晚（病因不是速度）', () => {
    const v = judgeLate(39, [285]);
    assertEqual(v.late, false, '我们赶上了');
    assert(v.text.includes('赶上了'), '判词要说得清楚：别再往「速度」上想');
  });

  it('查不到资源计时 → 不判晚（只是没证据）', () => {
    const v = judgeLate(218, []);
    assertEqual(v.late, false, '没有证据就不下判断');
    assertEqual(v.requestAtMs, null, '没有时刻');
    assertEqual(v.gapMs, null, '没有差值');
    assert(v.text.includes('查不到'), '判词说明「查不到」而不是「没晚」');
  });

  it('多条请求时按最早那条算', () => {
    const v = judgeLate(100, [200, 50, 300]);
    assertEqual(v.requestAtMs, 50, '最早那条决定我们赶没赶上');
    assertEqual(v.late, true, '50 < 100');
  });
});

// ------------------------------------------------------------ 补一次请求

describe('bkxk/timetable-late —— 自己取一次并合并', () => {
  it('成功：走 bkxkSend 出口、带 token 与 timestamp，合并后的行数 = 站点 + 我们的段数', async () => {
    const sent: Sent[] = [];
    const one = custom('c1', '我的课', '5-18周星期一3-5节 自定义教室');
    const res = await fetchMergedTimetable({
      items: [one],
      studentCode: STUDENT,
      token: TOKEN,
      origin: OK_URL,
      send: fakeSend(200, JSON.stringify(REAL), sent),
    });

    assertEqual(res.ok, true, '应当成功');
    assertEqual(res.reason, '', '成功时没有失败原因');
    assertEqual(res.added, 1, '一段课');
    assertEqual(res.dataList.length, REAL.dataList.length + 1, '站点那 14 行 + 我们这一行');

    assertEqual(sent.length, 1, '只发一次');
    const opts = sent[0]?.opts;
    assert(opts !== undefined, '拿到入参');
    assert(opts.url.includes('elective/teachingTime.do'), `URL 要对：${String(opts.url)}`);
    assertEqual(opts.method, 'POST', '站点自己的请求就是 POST');
    assertEqual(opts.token, TOKEN, '带会话令牌');
    assertEqual(opts.timestamp, true, '站点 URL 上带 timestamp，漏了会被判重放');
    assert(opts.action.includes('晚到补偿'), '出口的 action 要能一眼认出来');
    assert(opts.body?.includes(`studentCode=${STUDENT}`), `请求体带学号：${String(opts.body)}`);
  });

  it('合并后的行里确实有我们的课（交给站点渲染器的是同一份数据）', async () => {
    const sent: Sent[] = [];
    const one = custom('c1', '我的课', '5-18周星期一3-5节 自定义教室');
    const res = await fetchMergedTimetable({
      items: [one],
      studentCode: STUDENT,
      token: TOKEN,
      origin: OK_URL,
      send: fakeSend(200, JSON.stringify(REAL), sent),
    });
    const ours = res.dataList.filter((row) => {
      const r = row as Record<string, unknown>;
      return r['courseName'] === '我的课';
    });
    assertEqual(ours.length, 1, '恰好一行');
    const row = ours[0] as Record<string, unknown>;
    assertEqual(row['szuCustom'], true, '带着我们的标记');
    assertEqual(row['dayOfWeek'], '1', '星期一');
  });

  it('没有启用中的课程 → 不发请求（连出口都不碰）', async () => {
    const sent: Sent[] = [];
    const res = await fetchMergedTimetable({
      items: [],
      studentCode: STUDENT,
      token: TOKEN,
      origin: OK_URL,
      send: fakeSend(200, JSON.stringify(REAL), sent),
    });
    assertEqual(res.ok, false, '没什么可补的');
    assertEqual(sent.length, 0, '不许白发请求');
    assert(res.reason.includes('没有启用中的自定义课程'), `原因要能看懂：${res.reason}`);
  });

  it('读不到学号 / 拿不到 origin → 各给一句人话', async () => {
    const sent: Sent[] = [];
    const one = custom('c1', '我的课', '5-18周星期一3-5节 A');
    const noStudent = await fetchMergedTimetable({
      items: [one],
      studentCode: '',
      token: TOKEN,
      origin: OK_URL,
      send: fakeSend(200, JSON.stringify(REAL), sent),
    });
    assertEqual(noStudent.ok, false, '没学号发不出去');
    assert(noStudent.reason.includes('学号'), noStudent.reason);

    const noOrigin = await fetchMergedTimetable({
      items: [one],
      studentCode: STUDENT,
      token: TOKEN,
      origin: '',
      send: fakeSend(200, JSON.stringify(REAL), sent),
    });
    assertEqual(noOrigin.ok, false, '没 origin 拼不出 URL');
    assert(noOrigin.reason.includes('origin'), noOrigin.reason);
    assertEqual(sent.length, 0, '这两种情况一次请求都不许发');
  });

  it('站点返回非 200 / 非 JSON / code=302 / 没有 dataList → 各自给一句人话，不抛错', async () => {
    const one = custom('c1', '我的课', '5-18周星期一3-5节 A');
    const base = { items: [one], studentCode: STUDENT, token: TOKEN, origin: OK_URL };

    const http500 = await fetchMergedTimetable({ ...base, send: fakeSend(500, 'boom', []) });
    assertEqual(http500.ok, false, 'HTTP 错就不算成功');
    assert(http500.reason.includes('500'), http500.reason);

    const notJson = await fetchMergedTimetable({ ...base, send: fakeSend(200, '<html>', []) });
    assert(notJson.reason.includes('JSON'), notJson.reason);

    const code302 = await fetchMergedTimetable({ ...base, send: fakeSend(200, '{"code":"302"}', []) });
    assertEqual(code302.ok, false, '未登录');
    assert(code302.reason.includes('未登录'), code302.reason);

    const noList = await fetchMergedTimetable({ ...base, send: fakeSend(200, '{"code":"1"}', []) });
    assert(noList.reason.includes('dataList'), noList.reason);
  });

  it('一段都合并不进去（没有星期几）→ 算失败：不能拿站点原样的表去重画', async () => {
    const one = custom('c1', '我的课', '1-18周 3-4节 某个地方');
    const res = await fetchMergedTimetable({
      items: [one],
      studentCode: STUDENT,
      token: TOKEN,
      origin: OK_URL,
      send: fakeSend(200, JSON.stringify(REAL), []),
    });
    assertEqual(res.ok, false, '没有可注入的段时重画整张表毫无意义');
    assertEqual(res.added, 0, '一段都没加');
    assert(res.reason.includes('一段都合并不进去'), `原因：${res.reason}`);
  });

  it('关掉的课程不合并进去', async () => {
    const off = custom('c1', '我的课', '5-18周星期一3-5节 A', false);
    const res = await fetchMergedTimetable({
      items: [off],
      studentCode: STUDENT,
      token: TOKEN,
      origin: OK_URL,
      send: fakeSend(200, JSON.stringify(REAL), []),
    });
    assertEqual(res.ok, false, '停用的课等于没有');
    assertEqual(res.dataList.length, 0, '失败时不给数据');
  });
});

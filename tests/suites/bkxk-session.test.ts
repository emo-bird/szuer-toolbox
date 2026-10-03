/**
 * 纯函数冒烟（档1）：bkxk 会话读取。
 *
 * 重点钉死两件事：
 *   1. 批次码的真实落点是 `studentInfo.electiveBatch.code`，**不是** `currentBatch`
 *      （旧仓库取错来源，功能静默失败）
 *   2. `sessionSummary()` 是给人看/给日志用的，**绝不能吐 token**，学号也要打码
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import {
  DEFAULT_CAMPUS,
  buildSession,
  parseCampusCode,
  parseCodeObject,
  parseStudentInfo,
  sessionSummary,
} from '../../src/sites/bkxk/session.ts';

describe('bkxk/session —— parseStudentInfo', () => {
  it('从 electiveBatch.code 取批次码（真实落点）', () => {
    const r = parseStudentInfo(JSON.stringify({ code: '20210001', electiveBatch: { code: 'B999' } }));
    assert(r !== null, '应解析成功');
    assertEqual(r!.studentCode, '20210001');
    assertEqual(r!.batchCode, 'B999');
  });

  it('顶层 electiveBatchCode 只作兜底', () => {
    const r = parseStudentInfo(JSON.stringify({ code: '20210001', electiveBatchCode: 'BFALL' }));
    assertEqual(r!.batchCode, 'BFALL');
  });

  it('两处都有时以 electiveBatch.code 为准', () => {
    const r = parseStudentInfo(
      JSON.stringify({ code: '1', electiveBatch: { code: 'INNER' }, electiveBatchCode: 'OUTER' }),
    );
    assertEqual(r!.batchCode, 'INNER');
  });

  it('两处都没有时 batchCode 为 null（调用方再从列表响应里补）', () => {
    const r = parseStudentInfo(JSON.stringify({ code: '1' }));
    assertEqual(r!.batchCode, null);
  });

  it('批次对象里 code 为空串等于没有', () => {
    assertEqual(parseStudentInfo(JSON.stringify({ code: '1', electiveBatch: { code: '' } }))!.batchCode, null);
  });

  it('学号是数字时也取得到（服务端偶尔会变类型）', () => {
    assertEqual(parseStudentInfo(JSON.stringify({ code: 20210001 }))!.studentCode, '20210001');
  });

  it('非法输入一律返回 null，不抛错', () => {
    assertEqual(parseStudentInfo(null), null);
    assertEqual(parseStudentInfo(''), null);
    assertEqual(parseStudentInfo('不是 JSON'), null);
    assertEqual(parseStudentInfo('[1,2]'), null);
    assertEqual(parseStudentInfo('"x"'), null);
    assertEqual(parseStudentInfo('null'), null);
  });

  it('保留原始 data 供调用方取别的字段', () => {
    const r = parseStudentInfo(JSON.stringify({ code: '1', name: '张三' }));
    assertEqual((r!.data as { name: string }).name, '张三');
  });
});

describe('bkxk/session —— parseCampusCode', () => {
  it('取 code 字段', () => {
    assertEqual(parseCampusCode(JSON.stringify({ code: '02' })), '02');
  });

  it('读不到时回落默认校区 01', () => {
    assertEqual(parseCampusCode(null), DEFAULT_CAMPUS);
    assertEqual(parseCampusCode(''), DEFAULT_CAMPUS);
    assertEqual(parseCampusCode('坏 JSON'), DEFAULT_CAMPUS);
    assertEqual(parseCampusCode(JSON.stringify({})), DEFAULT_CAMPUS);
    assertEqual(parseCampusCode(JSON.stringify({ code: '' })), DEFAULT_CAMPUS);
  });

  it('默认校区就是 01（HAR 里所有请求都是 01）', () => {
    assertEqual(DEFAULT_CAMPUS, '01');
  });
});

describe('bkxk/session —— buildSession', () => {
  it('学号与 token 都在才算已登录', () => {
    const s = buildSession({
      studentInfo: JSON.stringify({ code: '20210001', electiveBatch: { code: 'B1' } }),
      campus: JSON.stringify({ code: '01' }),
      token: 'TK',
    });
    assertEqual(s.loggedIn, true);
    assertEqual(s.studentCode, '20210001');
    assertEqual(s.batchCode, 'B1');
    assertEqual(s.campus, '01');
    assertEqual(s.token, 'TK');
  });

  it('缺 token 判为未登录', () => {
    assertEqual(buildSession({ studentInfo: JSON.stringify({ code: '1' }), campus: null, token: null }).loggedIn, false);
  });

  it('缺学号判为未登录', () => {
    assertEqual(buildSession({ studentInfo: null, campus: null, token: 'TK' }).loggedIn, false);
  });

  it('sessionStorage 全空时得到空会话（不抛错）', () => {
    const s = buildSession({ studentInfo: null, campus: null, token: null });
    assertEqual(s.loggedIn, false);
    assertEqual(s.studentCode, '');
    assertEqual(s.batchCode, null);
    assertEqual(s.campus, DEFAULT_CAMPUS, '校区应回落默认值而不是空串');
  });
});

describe('bkxk/session —— sessionSummary（红线 R3：不泄凭证）', () => {
  it('已登录时打码学号、显示批次与校区', () => {
    const s = buildSession({
      studentInfo: JSON.stringify({ code: '20210001', electiveBatch: { code: 'B1' } }),
      campus: JSON.stringify({ code: '01' }),
      token: 'SUPER_SECRET_TOKEN',
    });
    const text = sessionSummary(s);
    assert(!text.includes('SUPER_SECRET_TOKEN'), `摘要里绝不能出现 token：${text}`);
    assert(!text.includes('20210001'), `学号应打码，不应出现全量：${text}`);
    assert(text.includes('0001'), `应保留末 4 位便于辨认：${text}`);
    assert(text.includes('B1'), `应显示批次码：${text}`);
  });

  it('未登录时给出明确提示', () => {
    const text = sessionSummary(buildSession({ studentInfo: null, campus: null, token: null }));
    assert(text.includes('未登录'), text);
  });

  it('学号短于 4 位时不越界', () => {
    const s = buildSession({ studentInfo: JSON.stringify({ code: '12' }), campus: null, token: 'T' });
    assert(typeof sessionSummary(s) === 'string', '短学号不应让摘要函数抛错');
  });
});

describe('bkxk/session —— parseCodeObject（currentBatch / currentCampus 共用）', () => {
  it('取 code 字段', () => {
    assertEqual(parseCodeObject(JSON.stringify({ code: 'B9' })), 'B9');
    assertEqual(parseCodeObject(JSON.stringify({ code: 99 })), '99', '数字 code 转字符串');
  });

  it('读不到时返回 null（**不是**默认值，默认由调用方决定）', () => {
    assertEqual(parseCodeObject(null), null);
    assertEqual(parseCodeObject(''), null);
    assertEqual(parseCodeObject('坏 JSON'), null);
    assertEqual(parseCodeObject(JSON.stringify({})), null);
    assertEqual(parseCodeObject(JSON.stringify({ code: '' })), null);
    assertEqual(parseCodeObject(JSON.stringify([{ code: 'B9' }])), null, '数组不是对象');
  });
});

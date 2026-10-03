/**
 * 纯函数冒烟（档1）：bkxk 报文构造与响应分类。
 *
 * 这一套是**移植的核心正确性测试**（用户 m01664 拍板：只移植「核心正确性」类）。
 * 重点不是覆盖率，而是把旧仓库踩过的坑钉死：
 *   - 抢课报文漏 `{"data":…}` 外层 ⇒ 必失败
 *   - 字段顺序错 ⇒ 服务端可能不认
 *   - 抢课与退课的参数名/字段集不同（`addParam` vs `deleteParam`）
 *   - 余量字段缺失时返回 null 而不是 0（0 会被当成「满课」）
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  BASE_PATH,
  EP,
  CATEGORIES,
  CATEGORY_EP,
  RESP_KIND,
  AUTH_MSG,
  appendTimestamp,
  buildCapacityBody,
  buildDeleteVolunteerBody,
  buildQueryBody,
  buildTeachingTimeBody,
  buildVolunteerBody,
  capacityRemain,
  classify,
  endpointUrl,
  extractBatchCode,
  formBody,
  headers,
} from '../../src/sites/bkxk/api.ts';

/** 取 `key=<urlencode(JSON)>` 里的 JSON 并解开，用于逐字节比对字段顺序 */
function unwrap(name: string, body: string): string {
  const prefix = `${name}=`;
  assert(body.startsWith(prefix), `请求体应以 ${prefix} 开头，实际：${body.slice(0, 40)}`);
  return decodeURIComponent(body.slice(prefix.length));
}

describe('bkxk/api —— 端点与基础工具', () => {
  it('基路径与端点表与实测一致', () => {
    assertEqual(BASE_PATH, '/xsxkapp/sys/xsxkapp/');
    assertEqual(EP.CAPACITY, 'elective/teachingclass/capacity.do');
    assertEqual(EP.TEACHING_TIME, 'elective/teachingTime.do');
    assertEqual(EP.VOLUNTEER, 'elective/volunteer.do');
    assertEqual(EP.DELETE_VOLUNTEER, 'elective/deleteVolunteer.do');
  });

  it('endpointUrl 拼出完整地址', () => {
    assertEqual(
      endpointUrl(EP.TEACHING_TIME, 'https://bkxk.szu.edu.cn'),
      'https://bkxk.szu.edu.cn/xsxkapp/sys/xsxkapp/elective/teachingTime.do',
    );
  });

  it('timestamp 默认**不**追加（appendTimestamp 是显式工具）', () => {
    const url = endpointUrl(EP.VOLUNTEER, 'https://bkxk.szu.edu.cn');
    assert(!url.includes('timestamp'), '抢课 URL 不应带 timestamp');
    assertEqual(appendTimestamp(url, 1700000000000), `${url}?timestamp=1700000000000`);
  });

  it('appendTimestamp 在已有 query 时用 & 连接', () => {
    assertEqual(appendTimestamp('https://a/x?a=1', 1), 'https://a/x?a=1&timestamp=1');
  });

  it('formBody 逐字段编码，null / undefined 变空串', () => {
    assertEqual(formBody({ a: '1', b: 'x y', c: null, d: undefined }), 'a=1&b=x%20y&c=&d=');
  });

  it('headers 带 token 与 X-Requested-With，且不写 cookie', () => {
    const h = headers('TK');
    assertEqual(h['token'], 'TK');
    assertEqual(h['X-Requested-With'], 'XMLHttpRequest');
    assert(h['Cookie'] === undefined, 'cookie 由页面 fetch 自动携带，不该手写');
  });
});

describe('bkxk/api —— 抢课报文（🔴 不可撤销）', () => {
  const params = {
    studentCode: '20210001',
    electiveBatchCode: 'B999',
    teachingClassId: 'TC123',
    teachingClassType: 'FANKC',
  };

  it('参数名是 addParam', () => {
    assert(buildVolunteerBody(params).startsWith('addParam='), '参数名必须是 addParam');
  });

  it('必须包一层 {"data":…}，字段顺序逐字节固定', () => {
    const json = unwrap('addParam', buildVolunteerBody(params));
    assertEqual(
      json,
      '{"data":{"operationType":"1","studentCode":"20210001","electiveBatchCode":"B999",' +
        '"teachingClassId":"TC123","isMajor":"1","campus":"01","teachingClassType":"FANKC"}}',
    );
  });

  it('内层确实是 data 包裹，不是裸对象（旧仓库的坑）', () => {
    const parsed = JSON.parse(unwrap('addParam', buildVolunteerBody(params))) as Record<string, unknown>;
    assert('data' in parsed, '顶层必须有 data 键');
    const inner = parsed['data'] as Record<string, unknown>;
    assertEqual(inner['operationType'], '1');
    assert(!('operationType' in parsed), 'operationType 不该出现在顶层');
  });

  it('campus / isMajor 可覆盖', () => {
    const json = unwrap('addParam', buildVolunteerBody({ ...params, campus: '02', isMajor: '0' }));
    assert(json.includes('"isMajor":"0"'), json);
    assert(json.includes('"campus":"02"'), json);
  });

  it('teachingClassType 原样透传 —— 必须由调用方给出该教学班所属列表的类别', () => {
    const json = unwrap('addParam', buildVolunteerBody({ ...params, teachingClassType: 'XGXK' }));
    assert(json.endsWith('"teachingClassType":"XGXK"}}'), json);
  });
});

describe('bkxk/api —— 退课报文（🔴 不可撤销，尚未真机验证）', () => {
  it('参数名是 deleteParam，不是 addParam', () => {
    const body = buildDeleteVolunteerBody({
      studentCode: '20210001',
      electiveBatchCode: 'B999',
      teachingClassId: 'TC123',
    });
    assert(body.startsWith('deleteParam='), body.slice(0, 30));
  });

  it('operationType=2，且**不带** campus / teachingClassType', () => {
    const json = JSON.parse(
      unwrap(
        'deleteParam',
        buildDeleteVolunteerBody({
          studentCode: '20210001',
          electiveBatchCode: 'B999',
          teachingClassId: 'TC123',
        }),
      ),
    ) as { data: Record<string, unknown> };
    assertEqual(
      Object.keys(json.data).join(','),
      'operationType,studentCode,electiveBatchCode,teachingClassId',
    );
    assertEqual(json.data['operationType'], '2');
  });
});

describe('bkxk/api —— 只读报文', () => {
  it('查容量报文只有两个字段', () => {
    assertEqual(buildCapacityBody('TC1', 'B1'), 'teachingClassId=TC1&batchCode=B1');
  });

  it('规则课表报文只有 studentCode', () => {
    assertEqual(buildTeachingTimeBody('20210001'), 'studentCode=20210001');
  });

  it('列表查询报文：querySetting 包裹，字段顺序固定', () => {
    const json = unwrap(
      'querySetting',
      buildQueryBody({
        studentCode: '20210001',
        electiveBatchCode: 'B999',
        teachingClassType: 'FANKC',
      }),
    );
    assertEqual(
      json,
      '{"data":{"studentCode":"20210001","campus":"01","electiveBatchCode":"B999",' +
        '"isMajor":"1","teachingClassType":"FANKC","checkConflict":"2","checkCapacity":"2",' +
        '"queryContent":"YCJX:2,MOOC:2,"},"pageSize":"10","pageNumber":"0","order":"",' +
        '"orderBy":"courseNumber"}',
    );
  });

  it('分页参数可覆盖', () => {
    const json = unwrap(
      'querySetting',
      buildQueryBody({
        studentCode: '1',
        electiveBatchCode: 'B',
        teachingClassType: 'TJKC',
        pageSize: 50,
        pageNumber: 3,
        order: 'asc',
      }),
    );
    assert(json.includes('"pageSize":"50"'), json);
    assert(json.includes('"pageNumber":"3"'), json);
    assert(json.includes('"order":"asc"'), json);
  });
});

describe('bkxk/api —— 响应分类', () => {
  it('code=1 → ok', () => {
    const c = classify({ status: 200, text: '{"code":1,"data":{"a":1},"msg":""}' });
    assertEqual(c.kind, RESP_KIND.OK);
    assertEqual(c.code, '1');
    assertDeepEqual(c.data, { a: 1 });
  });

  it('code=2 → 业务拒绝，msg 即原因', () => {
    const c = classify({ status: 200, text: '{"code":2,"msg":"该课程已经存在选课结果中"}' });
    assertEqual(c.kind, RESP_KIND.BUSINESS);
    assertEqual(c.msg, '该课程已经存在选课结果中');
  });

  it('code=302 → 登录失效', () => {
    const c = classify({ status: 200, text: '{"code":302,"msg":"请求数据与登录者身份不一致，非法请求。"}' });
    assertEqual(c.kind, RESP_KIND.UNAUTHENTICATED);
  });

  it('HTTP 401 / 403 → 登录失效（不看 body）', () => {
    assertEqual(classify({ status: 401, text: '' }).kind, RESP_KIND.UNAUTHENTICATED);
    assertEqual(classify({ status: 403, text: '<html>Forbidden</html>' }).kind, RESP_KIND.UNAUTHENTICATED);
  });

  it('code 不在映射表里、但 msg 含「登录」→ 仍判登录失效（被限流时的真实文案）', () => {
    const c = classify({ status: 200, text: '{"code":0,"msg":"请求过快，请登录后再试"}' });
    assertEqual(c.kind, RESP_KIND.UNAUTHENTICATED);
    assertEqual(c.code, '0');
  });

  it('code 不在映射表里、msg 也不含特征词 → 未识别（红线 R4 要落档）', () => {
    const c = classify({ status: 200, text: '{"code":7,"msg":"系统维护中"}' });
    assertEqual(c.kind, RESP_KIND.UNKNOWN);
    assertEqual(c.msg, '系统维护中');
  });

  it('非 JSON → 未识别', () => {
    const c = classify({ status: 200, text: '<html>500</html>' });
    assertEqual(c.kind, RESP_KIND.UNKNOWN);
    assertEqual(c.msg, '响应不是 JSON');
  });

  it('JSON 顶层是数组或标量 → 未识别', () => {
    assertEqual(classify({ status: 200, text: '[1,2]' }).kind, RESP_KIND.UNKNOWN);
    assertEqual(classify({ status: 200, text: '"x"' }).kind, RESP_KIND.UNKNOWN);
    assertEqual(classify({ status: 200, text: 'null' }).kind, RESP_KIND.UNKNOWN);
  });

  it('code 缺失时 code 为 null，不是字符串 undefined', () => {
    const c = classify({ status: 200, text: '{"msg":"x"}' });
    assertEqual(c.code, null);
  });

  it('data 缺失时 data 为 null', () => {
    assertEqual(classify({ status: 200, text: '{"code":1}' }).data, null);
  });

  it('AUTH_MSG 只认「登录」「认证」两个字样', () => {
    assert(AUTH_MSG.test('请登录'), '「请登录」应命中');
    assert(AUTH_MSG.test('身份认证失败'), '「认证」应命中');
    assert(!AUTH_MSG.test('课程已满'), '「课程已满」不应命中');
  });
});

describe('bkxk/api —— 余量计算', () => {
  it('余量 = mainClassCapacity - mainElectiveNumber', () => {
    assertEqual(capacityRemain({ mainClassCapacity: 60, mainElectiveNumber: 45 }), 15);
  });

  it('其它容量字段全为 null 时依然能算（实测形状）', () => {
    assertEqual(
      capacityRemain({
        classCapacity: null,
        numberOfFirstVolunteer: null,
        isFull: null,
        mainClassCapacity: 40,
        mainElectiveNumber: 40,
      }),
      0,
    );
  });

  it('字段缺失返回 null（**不是** 0 —— 0 会被误判成满课）', () => {
    assertEqual(capacityRemain(null), null);
    assertEqual(capacityRemain({}), null);
    assertEqual(capacityRemain({ mainClassCapacity: 10 }), null);
    assertEqual(capacityRemain({ mainElectiveNumber: 3 }), null);
    assertEqual(capacityRemain({ mainClassCapacity: null, mainElectiveNumber: 1 }), null);
  });

  it('非数字返回 null', () => {
    assertEqual(capacityRemain({ mainClassCapacity: 'abc', mainElectiveNumber: 1 }), null);
  });

  it('数字字符串可以算', () => {
    assertEqual(capacityRemain({ mainClassCapacity: '60', mainElectiveNumber: '10' }), 50);
  });
});

describe('bkxk/api —— 批次码提取', () => {
  it('从嵌套响应里挖出 electiveBatchCode', () => {
    const r = extractBatchCode({ code: 1, data: { list: [{ electiveBatchCode: 'B1' }] } });
    assertEqual(r.batchCode, 'B1');
    assertEqual(r.counts['B1'], 1);
  });

  it('取第一个出现的批次码', () => {
    const r = extractBatchCode({ data: [{ electiveBatchCode: 'B2' }, { electiveBatchCode: 'B1' }] });
    assertEqual(r.batchCode, 'B2');
  });

  it('同一批次码多次出现会被计数', () => {
    const r = extractBatchCode([
      { electiveBatchCode: 'B1' },
      { n: { electiveBatchCode: 'B1' } },
      { n: { electiveBatchCode: 'B2' } },
    ]);
    assertEqual(r.counts['B1'], 2);
    assertEqual(r.counts['B2'], 1);
  });

  it('没有时就返回 null 且 counts 为空对象', () => {
    const r = extractBatchCode({ data: { list: [] } });
    assertEqual(r.batchCode, null);
    assertDeepEqual(r.counts, {});
  });

  it('空串 / 非字符串不算数', () => {
    assertEqual(extractBatchCode({ electiveBatchCode: '' }).batchCode, null);
    assertEqual(extractBatchCode({ electiveBatchCode: 123 }).batchCode, null);
  });
});

describe('bkxk/api —— 类别表', () => {
  it('8 个类别都在，且 CXKC（重修）没漏（旧文档漏列过）', () => {
    assertEqual(CATEGORIES.length, 8);
    assert(CATEGORIES.includes('CXKC'), '重修类别 CXKC 必须有');
    assert(CATEGORIES.includes('MOOC'), '慕课类别 MOOC 必须有');
  });

  it('每个类别都有端点映射', () => {
    for (const c of CATEGORIES) {
      assert(typeof CATEGORY_EP[c] === 'string', `${c} 缺少端点映射`);
    }
  });

  it('已实测的三条映射不能被改动', () => {
    assertEqual(CATEGORY_EP.FANKC, EP.PROGRAM_COURSE);
    assertEqual(CATEGORY_EP.TJKC, EP.RECOMMENDED_COURSE);
    assertEqual(CATEGORY_EP.XGXK, EP.PUBLIC_COURSE);
  });
});

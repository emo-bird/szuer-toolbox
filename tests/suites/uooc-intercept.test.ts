/**
 * `uooc/intercept` 的**纯函数**部分：交卷响应的判读与「这一发到底走通了没」。
 *
 * 为什么单独锁这两件事：用户 m01815 的手测里，脚本在 iframe 里点了【提交】、
 * 站点回了 `code:110`（未通过），但**嗅探装在顶层 realm、碰不到 iframe 的 XHR**，
 * 于是 `waitCommit` 空转 5 分钟、最后报「答了 3 轮仍未记完成」——
 * 一句话把「没截获」和「真没通过」混成了一个结局。
 * 所以判读口径（`code` → verdict）与 HTTP 门（`httpStatus`）都要有测试钉住。
 *
 * 样本照抄用户 m01815 给的真实响应。
 */

import { assert, assertEqual, describe, it } from '../harness.ts';
import { isCommitHttpOk, matchCommitApi, readCommit } from '../../src/sites/uooc/intercept.ts';

describe('uooc/intercept · URL 认领', () => {
  it('认 /exam/commit，也认带域名与 query 的形态', () => {
    assert(matchCommitApi('https://www.uooc.net.cn/exam/commit'), '绝对 URL 要认');
    assert(matchCommitApi('/exam/commit'), '相对路径要认');
    assert(matchCommitApi('/exam/commit?x=1'), '带 query 要认');
  });

  it('不认别的 exam 接口，也不认 hash 里的同名片段', () => {
    assert(!matchCommitApi('/exam/getTaskPaper?tid=1'), '不能把拉试卷当成交卷');
    assert(!matchCommitApi('/home/learn#/exam/commit'), 'hash 里的不算（那是前端路由）');
  });
});

describe('uooc/intercept · 交卷判读', () => {
  const PASS = { code: 1, msg: '' };
  const FAIL = {
    code: 110,
    msg: '您的得分是8,测验分数至少要达到50分，请重新提交测验！',
    data: {
      score_list: { 1: '0', 2: '8', 3: '0' },
      score: 8,
      pass_score: '50',
    },
  };

  it('code=1 → pass', () => {
    const r = readCommit(PASS, 200);
    assertEqual(r.verdict, 'pass', 'code 1 必须判通过');
    assertEqual(r.httpStatus, 200, 'httpStatus 要原样带出来');
  });

  it('code=110 → fail，并把分数与逐题得分都留下来', () => {
    const r = readCommit(FAIL, 200);
    assertEqual(r.verdict, 'fail', 'code 110 必须判未通过');
    assertEqual(r.score, '8', 'data.score 要读出来（数字要转字符串）');
    assertEqual(r.passScore, '50', 'data.pass_score 要读出来');
    assertEqual(r.scoreList['2'], '8', 'score_list 逐题得分要读出来');
    assertEqual(r.scoreList['1'], '0', '0 分也要在（不能因为假值丢掉）');
    assert(r.message.includes('至少要达到50分'), 'msg 要原样留着给用户看');
  });

  it('其它 code / 解析不出 → unknown，绝不擅自判定', () => {
    assertEqual(readCommit({ code: 0, msg: '' }, 200).verdict, 'unknown', 'code 0 不猜');
    assertEqual(readCommit({ code: 500 }, 200).verdict, 'unknown', '未知 code 不猜');
    assertEqual(readCommit(null, 200).verdict, 'unknown', '空响应不猜');
    assertEqual(readCommit('<html>502</html>', 502).verdict, 'unknown', 'HTML 错误页不猜');
  });

  it('code 是字符串形态也认（站点混用数字与字符串）', () => {
    assertEqual(readCommit({ code: '1' }, 200).verdict, 'pass', '字符串 "1" 要判通过');
    assertEqual(readCommit({ code: '110' }, 200).verdict, 'fail', '字符串 "110" 要判未通过');
  });

  it('没传 httpStatus 时默认 0（= 没拿到），不会误判成失败', () => {
    assertEqual(readCommit(PASS).httpStatus, 0, '默认必须是 0');
  });
});

describe('uooc/intercept · HTTP 门', () => {
  it('200 与「没拿到」都算这一发走通了', () => {
    assert(isCommitHttpOk(readCommit({ code: 1 }, 200)), 'HTTP 200 要放行');
    assert(isCommitHttpOk(readCommit({ code: 1 })), 'httpStatus 0（旧调用）要放行');
  });

  it('非 200 一律不放行 —— 哪怕响应体看着像交卷结果', () => {
    const r = readCommit({ code: 1 }, 502);
    assertEqual(r.verdict, 'pass', '判读本身还是按 code 走');
    assert(!isCommitHttpOk(r), '但 HTTP 502 这一发不算走通，调用方必须弹窗');
  });
});

/**
 * bkxk 抢课任务的纯函数冒烟（档1）。
 *
 * 只覆盖**不需要网络**的部分：文案分类、重试策略、优先级钳位、写接口门禁、
 * 以及 token 来源（`setTokenProvider` / `resolveToken`）与 `pageOrigin`。
 * 真正的请求链路属于「风险接口」，按约定不做自动化测试，由用户手测（档 3）。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import {
  AUTH_MSG,
  KIND_AUTH,
  MODE,
  MODE_NAME,
  STATUS,
  add,
  classifyMsg,
  clearStale,
  list,
  resetForTest,
  setPriority,
  setRetryMode,
  shouldRetry,
  start,
  stop,
  toggle,
} from '../../src/sites/bkxk/tasks.ts';
import { resolveToken, setTokenProvider } from '../../src/sites/bkxk/api.ts';
import { pageOrigin } from '../../src/common/utils/page.ts';

describe('bkxk/tasks —— classifyMsg', () => {
  it('满员 / 容量类算可重试', () => {
    assertEqual(classifyMsg('该教学班已满'), 'retryable');
    assertEqual(classifyMsg('容量不足'), 'retryable');
    assertEqual(classifyMsg('已选人数超过课容量'), 'retryable');
  });

  it('「已选人数超过课容量」必须判成可重试，不能判成终结（顺序陷阱）', () => {
    // 这句话同时含「已选」（终结性正则）与「容量」（可重试正则），
    // 它表达的是「满员」，所以 RETRYABLE_RE 必须先判 —— 这条钉死这个顺序。
    assertEqual(classifyMsg('已选人数超过课容量'), 'retryable');
  });

  it('重复 / 冲突 / 门数 类算终结', () => {
    assertEqual(classifyMsg('该课程已经存在选课结果中'), 'terminal');
    assertEqual(classifyMsg('上课时间冲突'), 'terminal');
    assertEqual(classifyMsg('选课门数已达上限'), 'terminal');
  });

  it('「学分已满」被判成可重试 —— 旧仓库的既有行为，刻意原样搬过来', () => {
    // TERMINAL_RE 里有「学分」，但 RETRYABLE_RE 的「已满」先命中。
    // 旧版 `tasks.js:33-34` 就是这个顺序，所以「学分已满」会被 smart 策略无限重试。
    // 移植时**没有**擅自改判 —— 要不要收紧属于行为变更，等用户拍板。
    assertEqual(classifyMsg('学分已满'), 'retryable');
  });

  it('认不出来的一律 unknown', () => {
    assertEqual(classifyMsg('系统繁忙'), 'unknown');
    assertEqual(classifyMsg('value sent to redis cannot be null'), 'unknown');
    assertEqual(classifyMsg(''), 'unknown');
    assertEqual(classifyMsg(null), 'unknown');
    assertEqual(classifyMsg(undefined), 'unknown');
  });
});

describe('bkxk/tasks —— shouldRetry', () => {
  it('always 一律继续', () => {
    assertEqual(shouldRetry(MODE.ALWAYS, 'terminal'), true);
    assertEqual(shouldRetry(MODE.ALWAYS, 'unknown'), true);
  });

  it('never 一律停', () => {
    assertEqual(shouldRetry(MODE.NEVER, 'retryable'), false);
    assertEqual(shouldRetry(MODE.NEVER, 'unknown'), false);
  });

  it('smart 只对 retryable / unknown 继续', () => {
    assertEqual(shouldRetry(MODE.SMART, 'retryable'), true);
    assertEqual(shouldRetry(MODE.SMART, 'unknown'), true);
    assertEqual(shouldRetry(MODE.SMART, 'terminal'), false);
  });

  it('三种模式都有中文名（设置页下拉要用）', () => {
    assertEqual(MODE_NAME[MODE.SMART], '智能');
    assertEqual(MODE_NAME[MODE.NEVER], '失败即停');
    assertEqual(MODE_NAME[MODE.ALWAYS], '持续重试');
  });
});

describe('bkxk/tasks —— 任务模型（不联网）', () => {
  it('加入 / 勾选 / 优先级 / 清洗失败残留', () => {
    resetForTest();
    assertEqual(list().length, 0);

    const t = add({ teachingClassID: 'tc-1', courseName: '高等数学', category: 'FANKC' });
    assert(t !== null, '加入任务应当返回任务对象');
    assertEqual(list().length, 1);
    assertEqual(t.status, STATUS.PENDING);
    assertEqual(t.enabled, true);

    // 同一个教学班再加一次：返回既有任务，不重复入列
    const again = add({ teachingClassID: 'tc-1' });
    assertEqual(list().length, 1);
    assertEqual(again?.id, t.id);

    // 优先级：越界钳到 1，非数字回落 0
    assertEqual(setPriority(t.id, 5), true);
    assertEqual(t.priority, 1);
    assertEqual(setPriority(t.id, 'abc'), true);
    assertEqual(t.priority, 0);

    // 重试策略：非法值被拒
    assertEqual(setRetryMode(t.id, 'always'), true);
    assertEqual(t.retryMode, MODE.ALWAYS);
    assertEqual(setRetryMode(t.id, '乱写'), false);
    assertEqual(t.retryMode, MODE.ALWAYS);

    // 取消勾选后 clearStale 不该动它
    assertEqual(toggle(t.id), false);
    t.status = STATUS.FAILED;
    assertEqual(clearStale(), 0);

    // 重新勾选会把上次的失败态翻回待抢
    assertEqual(toggle(t.id), true);
    assertEqual(t.status, STATUS.PENDING);
  });

  it('clearStale 只清「勾选着的失败任务」，成功的不动', () => {
    resetForTest();
    const a = add({ teachingClassID: 'tc-a', category: 'FANKC' });
    const b = add({ teachingClassID: 'tc-b', category: 'FANKC' });
    assert(a !== null && b !== null, '两个任务都应加入成功');
    a.status = STATUS.FAILED;
    a.attempts = 3;
    a.lastMsg = '该教学班已满';
    b.status = STATUS.SUCCESS;

    assertEqual(clearStale(), 1);
    assertEqual(a.status, STATUS.PENDING);
    assertEqual(a.attempts, 0);
    assertEqual(a.lastMsg, '');
    assertEqual(b.status, STATUS.SUCCESS, '成功过的任务不得被重置，否则会对已抢上的课重复提交');
  });

  it('写接口未开启时拒绝开始（红线 R1）', () => {
    resetForTest();
    add({ teachingClassID: 'tc-x', category: 'FANKC' });
    // 测试环境里没有注册过 write-api 开关 ⇒ isEnabled 恒 false
    assertEqual(start().ok, false);
    assertEqual(start().reason, 'write-disabled');
    assertEqual(stop(), false, '从未启动过，stop 应返回 false');
  });

  it('登录态失效的常量与文案一致（load() 靠它清洗残留）', () => {
    assertEqual(KIND_AUTH, 'auth');
    assert(AUTH_MSG.includes('登录态失效'), 'AUTH_MSG 必须是给用户看的中文');
  });
});

describe('bkxk/api —— token 来源', () => {
  it('显式传值优先', () => {
    setTokenProvider(() => 'from-provider');
    assertEqual(resolveToken('explicit'), 'explicit');
    assertEqual(resolveToken(), 'from-provider');
    // 空串等于没传（旧版 `o.token || sessionToken()` 的语义）
    assertEqual(resolveToken(''), 'from-provider');
  });

  it('没注册 provider 时返回空串', () => {
    setTokenProvider(null);
    assertEqual(resolveToken(), '');
    assertEqual(resolveToken(undefined), '');
  });

  it('provider 抛错时返回空串而不是把异常冒出去', () => {
    setTokenProvider(() => {
      throw new Error('sessionStorage 不可用');
    });
    assertEqual(resolveToken(), '');
    setTokenProvider(null);
  });

  it('provider 返回非字符串时返回空串', () => {
    setTokenProvider(() => null as unknown as string);
    assertEqual(resolveToken(), '');
    setTokenProvider(null);
  });
});

describe('common/utils/page —— pageOrigin', () => {
  it('显式值优先', () => {
    assertEqual(pageOrigin('https://bkxk.szu.edu.cn'), 'https://bkxk.szu.edu.cn');
    assertEqual(pageOrigin(''), pageOrigin(), '空串等于没传');
  });

  it('Node 环境（没有 location）返回空串', () => {
    assertEqual(pageOrigin(), '');
  });
});

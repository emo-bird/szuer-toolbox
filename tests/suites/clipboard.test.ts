/**
 * 纯函数冒烟（档1）：剪贴板写入方式的优先级。
 *
 * 背景：bkxk 是 `http://` 页面（非安全上下文），Chromium 在那里**不暴露**
 * `navigator.clipboard`，原先只用剪贴板 API 的实现必然失败（第五轮手测报的
 * `Error: 当前环境没有 navigator.clipboard`）。用户拍板「换成 copy 函数」
 * ⇒ 落到 `src/common/utils/clipboard.ts` 的三条路依次退。
 *
 * 这里锁的是**顺序**，因为顺序错了会有两个具体后果：
 *   1. `gm` 不在最前 —— Tampermonkey 里明明有同步、免权限的 `GM_setClipboard` 却不用；
 *   2. `modern` 跑到 `exec` 前面 —— 它是异步的，`await` 之后就出了点击手势，
 *      失败再回头叫 `exec` 往往已不被认作「用户触发」，等于只剩一条路。
 *
 * 真机探测（`detectCopyEnv`）与写盘动作碰 `navigator` / `document`，不在档1 范围内。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import { pickCopyMethod, copyMethodOrder } from '../../src/common/utils/clipboard.ts';
import type { CopyEnv } from '../../src/common/utils/clipboard.ts';

function env(hasGm: boolean, hasExec: boolean, hasClipboard: boolean): CopyEnv {
  return { hasGm, hasExec, hasClipboard };
}

const ALL = env(true, true, true);
/** 真机 bkxk 的实际情况：有 GM（Tampermonkey），有 execCommand，没有 navigator.clipboard */
const BKXK_HTTP = env(true, true, false);
/** 没有任何 GM 时的 http 页面 */
const PLAIN_HTTP = env(false, true, false);

describe('剪贴板：写入方式优先级', () => {
  it('首选是 GM_setClipboard', () => {
    assertEqual(pickCopyMethod(ALL), 'gm');
    assertEqual(pickCopyMethod(BKXK_HTTP), 'gm');
  });

  it('没有 GM 时退到 execCommand', () => {
    assertEqual(pickCopyMethod(PLAIN_HTTP), 'exec');
  });

  it('execCommand 也排在现代剪贴板 API 之前（同步、不挑安全上下文）', () => {
    assertDeepEqual(copyMethodOrder(env(false, true, true)), ['exec', 'modern']);
  });

  it('http 页面上 navigator.clipboard 不存在，顺序里就没有 modern', () => {
    assertDeepEqual(copyMethodOrder(BKXK_HTTP), ['gm', 'exec']);
    assertDeepEqual(copyMethodOrder(PLAIN_HTTP), ['exec']);
  });

  it('什么都不可用时是 none，且顺序为空', () => {
    assertEqual(pickCopyMethod(env(false, false, false)), 'none');
    assertDeepEqual(copyMethodOrder(env(false, false, false)), []);
  });

  it('只有现代 API 时也能用它', () => {
    assertEqual(pickCopyMethod(env(false, false, true)), 'modern');
    assertDeepEqual(copyMethodOrder(env(false, false, true)), ['modern']);
  });

  it('顺序永远不含重复项，且是 gm → exec → modern 的子序列', () => {
    for (const e of [ALL, BKXK_HTTP, PLAIN_HTTP, env(false, false, false), env(true, false, true)]) {
      const order = copyMethodOrder(e);
      assert(new Set(order).size === order.length, '出现重复方式');
      const ranks = order.map((m) => ['gm', 'exec', 'modern'].indexOf(m));
      assertDeepEqual(ranks, [...ranks].sort((a, b) => a - b));
    }
  });
});

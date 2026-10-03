/**
 * 纯函数冒烟（档1）：存储层。
 *
 * 在 node 里既没有 GM_* 也没有 localStorage，所以走内存降级分支 ——
 * 正好覆盖「降级路径必须可用」这条底线。
 */

import { describe, it, assert, assertEqual, assertDeepEqual } from '../harness.ts';
import {
  read,
  write,
  remove,
  listKeys,
  clearAll,
  backendName,
  hasGmStorage,
  NS_PREFIX,
} from '../../src/common/core/storage.ts';

describe('common/core/storage', () => {
  it('无 GM、无 localStorage 时降级到内存后端', () => {
    assertEqual(hasGmStorage(), false);
    assertEqual(backendName(), 'memory');
  });

  it('read / write 往返一致', () => {
    clearAll();
    write('unit:a', { n: 1, s: 'x' });
    assertDeepEqual(read('unit:a', null), { n: 1, s: 'x' });
  });

  it('键不存在时返回 fallback', () => {
    clearAll();
    assertEqual(read('unit:missing', 'fb'), 'fb');
    assertEqual(read('unit:missing', null), null);
    assertEqual(read('unit:missing', 0), 0);
  });

  it('类型与 fallback 不符时返回 fallback（防止脏数据污染调用方）', () => {
    clearAll();
    write('unit:num', 42);
    assertEqual(read('unit:num', 'expected-string'), 'expected-string');
    assertEqual(read('unit:num', 0), 42, '类型一致时应正常读回');
  });

  it('remove / listKeys / clearAll', () => {
    clearAll();
    write('unit:a', 1);
    write('unit:b', 2);
    write('other:c', 3);
    assertDeepEqual(listKeys(), ['other:c', 'unit:a', 'unit:b'], 'listKeys 应排序且不带命名空间前缀');
    remove('unit:a');
    assertDeepEqual(listKeys(), ['other:c', 'unit:b']);
    clearAll();
    assertDeepEqual(listKeys(), []);
  });

  it('写 undefined 不抛错', () => {
    clearAll();
    write('unit:u', undefined);
    assert(true, '不应抛错');
  });

  it('命名空间前缀存在且 listKeys 会剥掉它', () => {
    clearAll();
    write('unit:r', { a: 1 });
    assertEqual(NS_PREFIX, 'sztb:');
    assertDeepEqual(listKeys(), ['unit:r']);
  });
});

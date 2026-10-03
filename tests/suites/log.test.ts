/**
 * 纯函数冒烟（档1）：日志环形缓冲。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import {
  scoped,
  entries,
  clear,
  subscribe,
  setLevel,
  getLevel,
  formatEntry,
  safeStringify,
  dump,
} from '../../src/common/core/log.ts';

describe('common/core/log —— 缓冲与过滤', () => {
  it('scoped 写入的条目带 scope 与 level', () => {
    clear();
    setLevel('debug');
    const log = scoped('unit/test');
    log.info('hello', { a: 1 });
    const list = entries();
    assertEqual(list.length, 1);
    assertEqual(list[0]?.scope, 'unit/test');
    assertEqual(list[0]?.level, 'info');
    assertEqual(list[0]?.message, 'hello');
    assertEqual(list[0]?.seq, 1, 'seq 应从 1 开始自增');
  });

  it('等级过滤：低于当前等级的条目直接丢弃', () => {
    clear();
    setLevel('warn');
    const log = scoped('t');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    const levels = entries().map((e) => e.level);
    assertEqual(levels.join(','), 'warn,error');
    setLevel('debug');
  });

  it('setLevel / getLevel 往返', () => {
    setLevel('error');
    assertEqual(getLevel(), 'error');
    setLevel('debug');
    assertEqual(getLevel(), 'debug');
  });

  it('环形缓冲：超过容量后丢最老的，seq 仍单调递增', () => {
    clear();
    setLevel('debug');
    const log = scoped('t');
    for (let i = 0; i < 620; i += 1) log.info(`m${i}`);
    const list = entries();
    assert(list.length <= 500, `缓冲应受限，实际 ${list.length}`);
    assertEqual(list[list.length - 1]?.message, 'm619', '最新一条必须是最后写入的');
    const seqs = list.map((e) => e.seq);
    for (let i = 1; i < seqs.length; i += 1) {
      assert((seqs[i] ?? 0) > (seqs[i - 1] ?? 0), 'seq 必须严格递增');
    }
  });

  it('subscribe 能收到增量，退订后不再收到', () => {
    clear();
    setLevel('debug');
    const log = scoped('t');
    const got: string[] = [];
    const off = subscribe((e) => got.push(e.message));
    log.info('one');
    log.info('two');
    off();
    log.info('three');
    assertEqual(got.join(','), 'one,two');
  });

  it('订阅者抛错不影响其它订阅者与日志本身', () => {
    clear();
    setLevel('debug');
    const log = scoped('t');
    const seen: string[] = [];
    subscribe(() => {
      throw new Error('boom');
    });
    subscribe((e) => seen.push(e.message));
    log.info('survives');
    assertEqual(seen.join(','), 'survives');
    assertEqual(entries().length, 1);
  });
});

describe('common/core/log —— 序列化安全', () => {
  it('formatEntry 含等级、范围与消息', () => {
    clear();
    setLevel('debug');
    scoped('scope-x').warn('msg-y');
    const line = formatEntry(entries()[0]!);
    assert(line.includes('WARN') || line.includes('warn'), `应含等级：${line}`);
    assert(line.includes('scope-x'), `应含 scope：${line}`);
    assert(line.includes('msg-y'), `应含消息：${line}`);
  });

  it('safeStringify 能处理循环引用而不抛错', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a['self'] = a;
    const out = safeStringify(a);
    assert(out.includes('a'), `应含 name：${out}`);
    assert(out.includes('[Circular]') || out.length > 0, `不应抛错：${out}`);
  });

  it('safeStringify 处理 Error / undefined / 函数', () => {
    assert(safeStringify(new Error('x')).includes('x'), 'Error 应能序列化');
    assertEqual(typeof safeStringify(undefined), 'string');
    assertEqual(typeof safeStringify(() => 1), 'string');
  });

  it('写日志时 detail 里塞了循环引用也不会把日志模块搞崩', () => {
    clear();
    const cyc: Record<string, unknown> = {};
    cyc['me'] = cyc;
    scoped('t').info('cyclic', cyc);
    assertEqual(entries().length, 1);
  });

  it('dump() 返回可粘贴的多行文本', () => {
    clear();
    setLevel('debug');
    scoped('t').info('a');
    scoped('t').info('b');
    const text = dump();
    assertEqual(text.split('\n').length, 2);
  });
});

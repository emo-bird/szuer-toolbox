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
  rawCount,
  passesLevel,
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

  it('等级过滤：低于当前等级的条目不出现在 entries()，但**留在缓冲里**（v0.9）', () => {
    clear();
    setLevel('warn');
    const log = scoped('t');
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    // entries() 按等级过滤
    const levels = entries().map((e) => e.level);
    assertEqual(levels.join(','), 'warn,error');
    // 但四条全在缓冲里 —— 这是 v0.9 的核心语义变更
    assertEqual(rawCount(), 4, '低等级条目也必须入缓冲');
    // 把等级调低后能看到**过去的**日志（旧实现下这里只会剩 2 条）
    setLevel('debug');
    assertEqual(
      entries().map((e) => e.level).join(','),
      'debug,info,warn,error',
      '调低等级必须能回看历史日志',
    );
  });

  it('passesLevel 与 entries() 过滤口径一致', () => {
    clear();
    setLevel('info');
    const log = scoped('t');
    log.debug('d');
    log.warn('w');
    assertEqual(passesLevel('debug'), false);
    assertEqual(passesLevel('info'), true);
    assertEqual(passesLevel('warn'), true);
    assertEqual(passesLevel('error'), true);
    assertEqual(entries().length, 1);
    setLevel('debug');
  });

  it('dump() 与 entries() 口径一致（复制出来的和屏幕上看到的一样）', () => {
    clear();
    setLevel('debug');
    const log = scoped('t');
    log.error('err-line');
    log.info('info-line');
    // debug 门槛下两条都可见，dump 也都要有
    assertEqual(entries().length, 2);
    assertEqual(dump().includes('err-line'), true);
    assertEqual(dump().includes('info-line'), true);
    // 抬到 error 门槛：entries 与 dump 必须同步收缩到只剩 error 那条
    setLevel('error');
    assertEqual(entries().length, 1, 'entries 应只留 error');
    assertEqual(dump().includes('info-line'), false, 'dump 必须跟着过滤掉 info');
    assertEqual(dump().includes('err-line'), true);
    // 降回 debug 门槛：两条都回来 —— 证明过滤是读取期的，不是写入期的
    setLevel('debug');
    assertEqual(entries().length, 2, '降级后必须能回看被过滤的日志');
    assertEqual(dump().includes('info-line'), true);
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

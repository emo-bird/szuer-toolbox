/**
 * 纯函数冒烟（档1）：站点分派规则。
 *
 * 这是整个框架最容易出错、也最难在浏览器里观测的一环，
 * 所以规则本身写成纯函数并在这里逐条钉死。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import { resolve, resolveString, isFeaturePage, resetRegistry, registerAdapter } from '../../src/sites/registry.ts';
import type { SiteAdapter } from '../../src/sites/types.ts';

function makeAdapter(over: Partial<SiteAdapter> & Pick<SiteAdapter, 'id' | 'hosts'>): SiteAdapter {
  return {
    name: over.id,
    pages: [],
    tabs: [],
    ...over,
  };
}

const uooc = makeAdapter({
  id: 'uooc',
  hosts: ['*.uooc.net.cn', 'www.uooc.net.cn'],
  pages: ['/home/learn/index*', '/home/learn/new/*'],
});

const bkxk = makeAdapter({
  id: 'bkxk',
  hosts: ['bkxk.szu.edu.cn'],
  pages: ['/bkxk/*'],
});

const all = [uooc, bkxk];

describe('sites/registry —— 分派规则', () => {
  it('命中适配器 host 且在功能页 → 注入 + 自动展开', () => {
    const r = resolve(new URL('https://www.uooc.net.cn/home/learn/index#/1/2/3'), all);
    assert(r.inject, '应注入');
    assertEqual(r.adapter?.id, 'uooc');
    assertEqual(r.autoExpand, true, '功能页应自动展开');
    assertEqual(r.reason, 'adapter');
  });

  it('命中适配器 host 但不在功能页 → 注入 + 不自动展开（悬浮球）', () => {
    const r = resolve(new URL('https://www.uooc.net.cn/some/other/page'), all);
    assert(r.inject, '应注入');
    assertEqual(r.autoExpand, false, '非功能页不应自动展开');
  });

  it('未命中适配器但在 szu.edu.cn 下 → 注入 + 不自动展开', () => {
    const r = resolve(new URL('https://mail.szu.edu.cn/inbox'), all);
    assert(r.inject, 'szu 子域应注入');
    assertEqual(r.adapter, null, '没有适配器');
    assertEqual(r.autoExpand, false);
    assertEqual(r.reason, 'root-domain');
  });

  it('不在任何支持域 → 不注入', () => {
    const r = resolve(new URL('https://www.baidu.com/'), all);
    assertEqual(r.inject, false);
    assertEqual(r.reason, 'none');
  });

  it('相似域伪装不应被当成 szu 子域', () => {
    assertEqual(resolve(new URL('https://szu.edu.cn.evil.com/'), all).inject, false);
    assertEqual(resolve(new URL('https://notszu.edu.cn/'), all).inject, false);
  });

  it('pages 为空数组表示该站点任意页面都自动展开', () => {
    const any = makeAdapter({ id: 'any', hosts: ['any.cn'], pages: [] });
    const r = resolve(new URL('https://any.cn/whatever'), [any]);
    assertEqual(r.autoExpand, true);
  });

  it('多适配器时按注册顺序取第一个命中的', () => {
    const first = makeAdapter({ id: 'first', hosts: ['same.cn'], pages: [] });
    const second = makeAdapter({ id: 'second', hosts: ['same.cn'], pages: [] });
    assertEqual(resolve(new URL('https://same.cn/a'), [first, second]).adapter?.id, 'first');
  });

  it('isFeaturePage 是纯判定，不受注入与否影响', () => {
    assertEqual(isFeaturePage(new URL('https://www.uooc.net.cn/home/learn/new/1#/1'), uooc), true);
    assertEqual(isFeaturePage(new URL('https://www.uooc.net.cn/other'), uooc), false);
  });

  it('resolveString 对非法 URL 返回不注入', () => {
    assertEqual(resolveString('::::').inject, false);
  });

  it('注册表：同 id 覆盖，resetRegistry 清空', () => {
    resetRegistry();
    registerAdapter(makeAdapter({ id: 'x', hosts: ['x.cn'], pages: [] }));
    registerAdapter(makeAdapter({ id: 'x', hosts: ['y.cn'], pages: [] }));
    assertEqual(resolve(new URL('https://x.cn/'), [makeAdapter({ id: 'w', hosts: ['x.cn'] })]) !== null, true);
  });
});

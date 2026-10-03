/**
 * 纯函数冒烟（档1）：URL 匹配。
 * 参考油猴 `@match` 的语义，重点覆盖边界（子域不含根域本身、`*` 贪婪、大小写）。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import { matchHost, matchPage, matchAnyHost, matchAnyPage, isUnderDomain, parseUrl } from '../../src/common/utils/url.ts';

describe('common/utils/url', () => {
  it('matchHost：精确域命中', () => {
    assert(matchHost('bkxk.szu.edu.cn', 'bkxk.szu.edu.cn'), '精确域应命中');
    assert(!matchHost('bkxk.szu.edu.cn', 'other.szu.edu.cn'), '不同域不应命中');
  });

  it('matchHost：通配子域，且不含根域本身（对齐 @match）', () => {
    assert(matchHost('bkxk.szu.edu.cn', '*.szu.edu.cn'), '子域应命中');
    assert(matchHost('a.b.szu.edu.cn', '*.szu.edu.cn'), '多级子域应命中');
    assert(!matchHost('szu.edu.cn', '*.szu.edu.cn'), '根域本身不应命中 *.szu.edu.cn');
  });

  it('matchHost：大小写不敏感', () => {
    assert(matchHost('BKXK.SZU.EDU.CN', 'bkxk.szu.edu.cn'), '应大小写不敏感');
  });

  it('matchHost：`.` 是字面量不是正则通配', () => {
    assert(!matchHost('bkxkXszuYeduZcn', 'bkxk.szu.edu.cn'), '点号不应匹配任意字符');
  });

  it('matchPage：pathname + search + hash 一起比', () => {
    const url = new URL('https://www.uooc.net.cn/home/learn/index#/2042342697/57920722/2074700718');
    assert(matchPage(url, '/home/learn/index*'), '应命中旧版学习页');
    assert(!matchPage(url, '/home/learn/new/*'), '旧版页面不应命中新版模式');
  });

  it('matchPage：新版页面路径', () => {
    const url = new URL('https://www.uooc.net.cn/home/learn/new/2042342697#/2042342697/57920722/2074700718');
    assert(matchPage(url, '/home/learn/new/*'), '应命中新版学习页');
    assert(!matchPage(url, '/home/learn/index*'), '不应命中旧版模式');
  });

  it('matchPage：`*` 单独出现表示任意页', () => {
    assert(matchPage(new URL('https://a.b/c/d?e=1'), '*'), '应命中任意页');
  });

  it('matchAnyHost / matchAnyPage：空列表返回 false', () => {
    assert(!matchAnyHost('a.szu.edu.cn', []), '空 host 列表应为 false');
    assert(!matchAnyPage(new URL('https://a.b/c'), []), '空 page 列表应为 false');
  });

  it('isUnderDomain：含根域本身，且不误伤相似域', () => {
    assertEqual(isUnderDomain('szu.edu.cn', 'szu.edu.cn'), true);
    assertEqual(isUnderDomain('bkxk.szu.edu.cn', 'szu.edu.cn'), true);
    assertEqual(isUnderDomain('notszu.edu.cn', 'szu.edu.cn'), false, 'notszu.edu.cn 不应算作子域');
    assertEqual(isUnderDomain('szu.edu.cn.evil.com', 'szu.edu.cn'), false, '后缀伪装不应命中');
  });

  it('parseUrl：非法输入返回 null', () => {
    assertEqual(parseUrl('::::'), null);
    assert(parseUrl('/a/b', 'https://x.cn') !== null, '给了 base 的相对路径应解析成功');
  });
});

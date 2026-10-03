/**
 * 纯函数冒烟（档1）：**真实适配器注册表**的回归钉子。
 *
 * 为什么单独建一个套件：
 *   `registry.test.ts` 用的是**本地 mock 适配器**，它验证的是「分派规则本身」，
 *   而不是「实际注册进 registry 的适配器有哪些」。于是出现过这样的 bug：
 *   header 里 `@match *://*.uooc.net.cn/*` 让 Tampermonkey 匹配成功，
 *   但 `main.ts` 的 `registerSites()` 里**根本没注册 uooc 适配器**、
 *   `SUPPORTED_ROOT_DOMAINS` 也只有 `szu.edu.cn` ⇒ `resolve()` 返回
 *   `inject=false`，UOOC 上什么都不显示，而 registry 套件全绿。
 *
 *   ⚠️ 关键在于**必须跑真正的注册函数**，不能在本套件里自己
 *   `registerAdapter(uoocAdapter)` —— 那样就等于测试自己搭的舞台，
 *   `main.ts` 忘了注册照样全绿（本套件初版就犯过这个错，
 *   用「把 main.ts 那行注释掉」的反向对照实验抓出来的）。
 *
 *   因此 `main.ts` 把注册动作导成了 `registerSites()`，本套件直接调用它。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import { resolve, resetRegistry, SUPPORTED_ROOT_DOMAINS, allAdapters } from '../../src/sites/registry.ts';
import { registerSites } from '../../src/sites/index.ts';

/** 每个用例都从干净注册表 + 真实注册函数开始 */
function bootReal(): void {
  resetRegistry();
  registerSites();
}

describe('sites 真实注册表 —— 与 userscript header 的 @match 对齐', () => {
  it('registerSites() 至少注册了 demo 与 uooc', () => {
    bootReal();
    const ids = allAdapters().map((a) => a.id);
    assert(ids.includes('uooc'), `registerSites() 必须注册 uooc，实际=${ids.join(',')}`);
    assert(ids.includes('demo'), `registerSites() 必须注册 demo，实际=${ids.join(',')}`);
  });

  it('UOOC 学习页（旧版 hash 路由）必须注入', () => {
    bootReal();
    const r = resolve(new URL('https://www.uooc.net.cn/home/learn/index#/2042342697/57920722/2074700718'));
    assert(r.inject, 'UOOC 学习页应当注入（曾因未注册适配器而 inject=false）');
    assertEqual(r.adapter?.id, 'uooc');
    assertEqual(r.reason, 'adapter');
  });

  it('UOOC 学习页（新版路径）必须注入', () => {
    bootReal();
    const r = resolve(new URL('https://www.uooc.net.cn/home/learn/new/2042342697#/a/b/c'));
    assert(r.inject, 'UOOC 新版学习页应当注入');
    assertEqual(r.adapter?.id, 'uooc');
  });

  it('UOOC 非学习页（社团页）也必须注入 —— 对应 Q-AB 的悬浮球范围', () => {
    bootReal();
    const r = resolve(new URL('https://www.uooc.net.cn/league/union'));
    assert(r.inject, 'uooc.net.cn 全站在悬浮球显示范围内（用户 Q-AB 定稿）');
    assertEqual(r.adapter?.id, 'uooc');
  });

  it('UOOC 裸域也要注入', () => {
    bootReal();
    const r = resolve(new URL('https://uooc.net.cn/'));
    assert(r.inject, '裸域 uooc.net.cn 应当注入');
    assertEqual(r.adapter?.id, 'uooc');
  });

  it('不得把 uooc.net.cn 后缀匹配到别的域名上', () => {
    bootReal();
    for (const href of ['https://www.uooc.net.cn.evil.com/', 'https://uooc.net.cn.evil.com/']) {
      const r = resolve(new URL(href));
      assertEqual(r.inject, false, `${href} 不应注入`);
      assertEqual(r.reason, 'none');
    }
  });

  it('szu.edu.cn 根域兜底：未注册适配器也注入', () => {
    bootReal();
    const r = resolve(new URL('https://bkxk.szu.edu.cn/'));
    assert(r.inject, '深大根域下应注入悬浮球');
    assertEqual(r.reason, 'root-domain');
    assertEqual(r.adapter, null, '未命中具体适配器时 adapter 为 null');
  });

  it('根域白名单当前只含 szu.edu.cn（UOOC 靠适配器而非白名单）', () => {
    assertEqual(SUPPORTED_ROOT_DOMAINS.length, 1);
    assertEqual(SUPPORTED_ROOT_DOMAINS[0], 'szu.edu.cn');
  });

  it('不属于任何支持范围的站点一律不注入', () => {
    bootReal();
    for (const href of ['https://www.google.com/', 'https://example.com/', 'https://uooc.net.cn.evil.com/']) {
      const r = resolve(new URL(href));
      assertEqual(r.inject, false, `${href} 不应注入`);
      assertEqual(r.reason, 'none');
    }
  });

  it('UOOC 适配器暂不声明功能页 ⇒ 任意页面都算功能页（阶段 3 需收紧）', () => {
    bootReal();
    const uooc = allAdapters().find((a) => a.id === 'uooc');
    assert(uooc !== undefined, 'uooc 适配器应已注册');
    assertEqual(uooc!.pages.length, 0, '阶段 3 接入功能后应改为精确路径通配');
    const r = resolve(new URL('https://www.uooc.net.cn/league/union'));
    assertEqual(r.autoExpand, true);
  });
});

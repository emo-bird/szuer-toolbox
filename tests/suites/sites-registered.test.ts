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
import {
  resolve,
  resetRegistry,
  SUPPORTED_ROOT_DOMAINS,
  allAdapters,
  settingsTabId,
  hasOwnSettingsTab,
} from '../../src/sites/registry.ts';
import { registerSites } from '../../src/sites/index.ts';

/** 每个用例都从干净注册表 + 真实注册函数开始 */
function bootReal(): void {
  resetRegistry();
  registerSites();
}

describe('sites 真实注册表 —— 与 userscript header 的 @match 对齐', () => {
  it('registerSites() 至少注册了 demo、uooc 与 bkxk', () => {
    bootReal();
    const ids = allAdapters().map((a) => a.id);
    assert(ids.includes('uooc'), `registerSites() 必须注册 uooc，实际=${ids.join(',')}`);
    assert(ids.includes('bkxk'), `registerSites() 必须注册 bkxk，实际=${ids.join(',')}`);
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

  it('szu.edu.cn 根域兜底：未注册适配器的子域也注入', () => {
    bootReal();
    const r = resolve(new URL('https://ehall.szu.edu.cn/'));
    assert(r.inject, '深大根域下应注入悬浮球');
    assertEqual(r.reason, 'root-domain');
    assertEqual(r.adapter, null, '未命中具体适配器时 adapter 为 null');
  });

  it('bkxk 选课页命中适配器并自动展开', () => {
    bootReal();
    const r = resolve(new URL('https://bkxk.szu.edu.cn/xsxkapp/sys/xsxkapp/*default/grablessons.do'));
    assert(r.inject, '选课页应注入');
    assertEqual(r.adapter?.id, 'bkxk');
    assertEqual(r.reason, 'adapter');
    assertEqual(r.autoExpand, true, '功能页应自动展开');
  });

  it('bkxk 课表页命中适配器并自动展开', () => {
    bootReal();
    const r = resolve(new URL('https://bkxk.szu.edu.cn/xsxkapp/sys/xsxkapp/*default/curriculum.do'));
    assertEqual(r.adapter?.id, 'bkxk');
    assertEqual(r.autoExpand, true);
  });

  it('bkxk 非功能页只注入不展开（有功能页声明的站点不该到处弹面板）', () => {
    bootReal();
    const r = resolve(new URL('https://bkxk.szu.edu.cn/'));
    assert(r.inject, '站点首页仍应注入悬浮球');
    assertEqual(r.adapter?.id, 'bkxk');
    assertEqual(r.autoExpand, false);
  });

  it('bkxk 适配器声明了 6 个开关，且 🔴/🟠 不能被默认打开', () => {
    bootReal();
    const bkxk = allAdapters().find((a) => a.id === 'bkxk');
    assert(bkxk !== undefined, 'bkxk 适配器应已注册');
    assertEqual(bkxk!.toggles?.length, 6, '批 1 应注册 6 个开关');
    for (const t of bkxk!.toggles ?? []) {
      if (t.risk !== 'safe') {
        assert(!t.default, `危险开关 ${t.id}（${t.risk}）的 default 必须是 false`);
      }
    }
    assertEqual(bkxk!.hosts.length, 1);
    assertEqual(bkxk!.hosts[0], 'bkxk.szu.edu.cn');
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

/**
 * 设置标签页归属（用户反馈驱动：「本科选课的设置都放在单独标签页更好」）。
 *
 * 公共【设置】页靠 `hasOwnSettingsTab` 跳过「自己管设置」的站点 —— 不一致的话
 * 同一个开关会在面板里出现两遍，还能从两个入口改，风险门禁就形同虚设。
 * 这里把「标签 id 必须等于约定式」钉死。
 */
describe('sites 真实注册表 —— 站点设置标签页归属', () => {
  it('settingsTabId 的约定形如 <siteId>:settings', () => {
    assertEqual(settingsTabId('bkxk'), 'bkxk:settings');
    assertEqual(settingsTabId('uooc'), 'uooc:settings');
  });

  it('bkxk 已注册自己的设置标签页，且 id 与约定式一致', () => {
    bootReal();
    const bkxk = allAdapters().find((a) => a.id === 'bkxk');
    assert(bkxk !== undefined, 'bkxk 适配器应已注册');
    const tab = bkxk!.tabs.find((t) => t.id === settingsTabId('bkxk'));
    assert(tab !== undefined, 'bkxk 应注册 id 为 bkxk:settings 的标签页');
    assertEqual(tab!.title, '设置');
    assertEqual(hasOwnSettingsTab('bkxk'), true, '公共设置页据此跳过 bkxk');
  });

  it('UOOC 目前没有自己的设置标签页 ⇒ 设置仍由公共页渲染', () => {
    bootReal();
    assertEqual(hasOwnSettingsTab('uooc'), false);
  });

  it('未注册的站点一律报 false（不能因为查不到适配器就抛错）', () => {
    bootReal();
    assertEqual(hasOwnSettingsTab('ghost'), false);
  });

  it('bkxk 的站点标签页 id 都带站点前缀，不会与公共标签页撞号', () => {
    bootReal();
    const bkxk = allAdapters().find((a) => a.id === 'bkxk');
    for (const tab of bkxk!.tabs) {
      assert(tab.id.startsWith('bkxk:'), `站点标签页 id 应带前缀，实际=${tab.id}`);
    }
  });
});

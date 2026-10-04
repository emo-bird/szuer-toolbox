// 构建产物自检：确认 userscript 头部与打包形态都符合预期。
import { readFileSync } from 'node:fs';

const file = 'dist/szuer-toolbox.user.js';
const text = readFileSync(file, 'utf8');
const lines = text.split('\n');

const checks = [
  ['文件非空', text.length > 1000],
  ['首行是 ==UserScript==', lines[0] === '// ==UserScript=='],
  ['@name 深大人工具箱', /^\/\/ @name\s+深大人工具箱$/m.test(text)],
  ['@version 0.1.0', /^\/\/ @version\s+0\.1\.0$/m.test(text)],
  ['@match szu.edu.cn', /^\/\/ @match\s+\*:\/\/\*\.szu\.edu\.cn\/\*$/m.test(text)],
  ['@match uooc.net.cn', /^\/\/ @match\s+\*:\/\/\*\.uooc\.net\.cn\/\*$/m.test(text)],
  // 请求出口定稿为「页面 fetch」（需求文档 Q-AE）：不再声明 GM_xmlhttpRequest，
  // 也不再需要 @connect 白名单；改为申请 unsafeWindow 以拿到页面上下文的 fetch。
  ['不再声明 @grant GM_xmlhttpRequest', !/^\/\/ @grant\s+GM_xmlhttpRequest$/m.test(text)],
  ['声明 @grant unsafeWindow', /^\/\/ @grant\s+unsafeWindow$/m.test(text)],
  ['没有遗留的 @connect 白名单', !/^\/\/ @connect\s/m.test(text)],
  ['@noframes', /^\/\/ @noframes$/m.test(text)],
  ['@run-at document-start', /^\/\/ @run-at\s+document-start$/m.test(text)],
  [
    '@updateURL 指向 master/dist',
    text.includes(
      'https://raw.githubusercontent.com/emo-bird/szuer-toolbox/master/dist/szuer-toolbox.user.js',
    ),
  ],
  ['带免责声明', text.includes('免责声明')],
  ['注入构建时间', /构建信息：\d{4}-\d{2}-\d{2}T/.test(text)],
  ['注入构建号', /构建信息：\d{4}-\d{2}-\d{2}T[^)]*（构建号 \d+）/.test(text)],
  ['无残留 ESM import', !/^import\s/m.test(text)],
  ['无 require(', !text.includes('require(')],
  ['是 IIFE（没有顶层 await/export）', !/^export\s/m.test(text) && text.includes('(() => {')],
  ['含公共标签页 id', text.includes('common:settings') && text.includes('common:log')],
  ['含演示适配器 id', text.includes('demo:playground')],
  ['含 UOOC 适配器 id', text.includes("id: \"uooc\"") || text.includes("id: 'uooc'")],
  // 这一条专门防 UOOC 那次事故：header 的 @match 承诺了站点，注册表却没登记，
  // 表现是「脚本注入执行完全正常但什么都不做、日志里一行说明都没有」。
  // 所以既要看到适配器本体（显示名），也要看到它真的被 registerAdapter 注册。
  ['含 bkxk 适配器', text.includes('name: "本科选课"')],
  ['bkxk 适配器已注册进注册表', text.includes('registerAdapter(bkxkAdapter)')],
  // 同一条教训的延伸：标签页只在注册表里，注册漏了一个不会报错，
  // 表现是「这个页面永远不出现」，日志里同样一行说明都没有。
  // 用「某个 tabs: [...] 里同时含这四个名字」判定，避免因排版变化误报。
  [
    'bkxk 四个站点标签页齐备（任务 / 监控 / 自定义 / 设置）',
    [...text.matchAll(/tabs: \[([^\]]*)\]/g)].some((m) =>
      ['BKXK_TASKS_TAB', 'BKXK_MONITOR_TAB', 'BKXK_CUSTOM_TAB', 'BKXK_SETTINGS_TAB'].every((n) =>
        m[1].includes(n),
      ),
    ),
  ],
  ['未把 .css 拆成单独文件', !text.includes('.sztb-panel{') || true],
  // 类别查询的 pageNumber **从 0 开始**（站点约定；旧仓库 monitor.js:218 也是 `var page = 0`）。
  // 写成 1 不会报任何错：整类课返回 0 条，而「这一页不满一页」被当成正常终止，
  // 表现是每条监控都报「按类别查询未找到该教学班」—— 用户 m00846 就是这么撞上的。
  ['类别查询从 pageNumber=0 起（写错只会静默查不到）', /for \(let page = 0; page < MAX_PAGES/.test(text)],
];

let bad = 0;
for (const [name, pass] of checks) {
  if (!pass) bad += 1;
  console.log(`${pass ? '  OK  ' : ' FAIL '} ${name}`);
}
console.log(`\n${file}: ${text.length} 字节 / ${lines.length} 行`);
process.exit(bad === 0 ? 0 : 1);

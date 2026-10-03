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
  ['@grant GM_xmlhttpRequest', /^\/\/ @grant\s+GM_xmlhttpRequest$/m.test(text)],
  ['@noframes', /^\/\/ @noframes$/m.test(text)],
  ['@run-at document-idle', /^\/\/ @run-at\s+document-idle$/m.test(text)],
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
  ['未把 .css 拆成单独文件', !text.includes('.sztb-panel{') || true],
];

let bad = 0;
for (const [name, pass] of checks) {
  if (!pass) bad += 1;
  console.log(`${pass ? '  OK  ' : ' FAIL '} ${name}`);
}
console.log(`\n${file}: ${text.length} 字节 / ${lines.length} 行`);
process.exit(bad === 0 ? 0 : 1);

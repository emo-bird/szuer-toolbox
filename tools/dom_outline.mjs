#!/usr/bin/env node
/**
 * 把 DOM 采样文本（浏览器 Console 里跑 tools/dom-probe-bkxk*.js 的产物）压成结构摘要。
 *
 * 存在意义：采样原文动辄几百 KB，直接读进对话会吃掉大量上下文。本脚本只做**确定性**压缩
 * （不调用任何模型），把「缩进树」聚合成「路径签名 + 出现次数」，通常能从几百 KB 压到几 KB。
 *
 * 用法：
 *   node tools/dom_outline.mjs local/capture/dom-列表类-公选课.txt
 *   node tools/dom_outline.mjs <文件> --max-paths 200 --max-line 300
 *
 * 输出（纯文本，直接看或整段喂本地模型都行）：
 *   0) 元信息：字节 / 行数 / 是否被采样片段自身截断
 *   1) 段落标题清单
 *   2) 路径签名聚合：`div.cv-row > div.cv-class > span.cv-xxx ×7  样例文本=…`
 *   3) 类名 → 出现次数
 *   4) 属性名 → 出现次数
 *   5) 含 tcId 的行（原样，最多 30 行）
 *   6) 每个类名一个文本样例（看懂了列语义就能定插入点）
 *
 * 只读输入，只写 stdout。不做任何网络或模型调用。
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'max-paths': { type: 'string', default: '160' },
    'max-line': { type: 'string', default: '300' },
    'max-class-samples': { type: 'string', default: '60' },
  },
});

const file = positionals[0];
if (!file) {
  console.error('用法：node tools/dom_outline.mjs <采样文本文件> [--max-paths 160] [--max-line 300]');
  process.exit(1);
}

const MAX_PATHS = Number(values['max-paths']);
const MAX_LINE = Number(values['max-line']);
const MAX_CLASS_SAMPLES = Number(values['max-class-samples']);

const raw = readFileSync(file, 'utf8');
const lines = raw.split(/\r?\n/);
const bytes = Buffer.byteLength(raw, 'utf8');

const out = [];
const say = (...a) => out.push(a.join(' '));
const short = (s, n = 60) => (s.length > n ? s.slice(0, n) + '…' : s);

const SECTIONS = [];
const pathCount = new Map(); // 路径签名 → { n, sample }
const classCount = new Map();
const attrCount = new Map();
const classSample = new Map(); // 类名 → 文本样例
const tcIdLines = [];
let truncated = false;
let treeLines = 0;

/** 从一行里抽出 { depth, tag, classes, text }，不是树/层行则返回 null */
function parseLine(line) {
  if (!line.trim()) return null;
  const m = line.match(/^( *)(?:\[(\d+)\] )?([a-z][a-z0-9-]*)(.*)$/i);
  if (!m) return null;
  const indent = m[1].length;
  if (indent < 2) return null; // 段落标题、板块说明等
  const rest = m[4] || '';
  // 只认「 [属性…]」或「 text=…」或空尾巴的行；`tcList[0] 键=[…]`、`tcList=数组…` 这类说明行不是节点
  if (!/^( \[.*|\s+text=".*|)$/.test(rest)) return null;
  const classMatch = rest.match(/class="([^"]*)"/);
  const textMatch = rest.match(/\btext="([^"]*)"/);
  const depth = Math.floor(indent / 4); // 树行 4 空格一级；层行 2 空格也会落到 0
  return {
    depth,
    tag: m[3].toLowerCase(),
    classes: classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [],
    text: textMatch ? textMatch[1].replace(/…$/, '') : '',
    raw: line,
    isLayer: indent === 2,
  };
}

const stack = [];
let inTree = false;

for (const line of lines) {
  const sec = line.match(/^=== (.+?) ===$/);
  if (sec) {
    SECTIONS.push(sec[1]);
    stack.length = 0;
    inTree = false;
    continue;
  }
  if (/命中输出预算/.test(line)) truncated = true;
  if (/\[tcId|tcId="/i.test(line)) tcIdLines.push(line);

  const p = parseLine(line);
  if (!p) continue;
  treeLines++;

  for (const c of p.classes) classCount.set(c, (classCount.get(c) || 0) + 1);
  // 属性名统计：先抹掉引号内的内容，免得把 JSON 键名当成属性名
  const clean = p.raw.replace(/"[^"]*"/g, '""');
  for (const a of clean.matchAll(/\[([^\]]*)\]/g)) {
    for (const kv of (a[1] || '').split(/\s+(?=[A-Za-z_-]+=)/)) {
      const name = kv.split('=')[0];
      if (/^[A-Za-z_][A-Za-z0-9_:-]*$/.test(name)) attrCount.set(name, (attrCount.get(name) || 0) + 1);
    }
  }

  // 层行（`  [i] tag …`）彼此是兄弟，不参与路径栈；树行按缩进维护祖先栈
  const depth = p.isLayer ? 1 : p.depth;
  if (p.isLayer) stack.length = 0;
  else if (depth < stack.length) stack.length = depth;
  const node = p.tag + (p.classes.length ? '.' + p.classes[0] : '');
  stack.push(node);
  const sig = stack.join(' > ');
  const prev = pathCount.get(sig);
  if (prev) {
    prev.n++;
    if (!prev.sample && p.text) prev.sample = p.text;
  } else {
    pathCount.set(sig, { n: 1, sample: p.text });
  }

  const key = p.classes[0];
  if (key && p.text && !classSample.has(key)) classSample.set(key, p.text);
  inTree = true;
}

say('# DOM 采样结构摘要');
say('');
say('## 0. 元信息');
say('文件:', file);
say('字节:', bytes, ' 行数:', lines.length, ' 可解析的树/层行:', treeLines);
say('采样片段自身是否截断:', truncated ? '是（原文命中输出预算，末尾内容缺失）' : '否');
say('提示: 段落标题数量', SECTIONS.length);
say('');
say('## 1. 段落清单');
SECTIONS.forEach((s, i) => say(`  ${i + 1}. ${s}`));
say('');
say('## 2. 路径签名聚合（按出现次数降序，最多 ' + MAX_PATHS + ' 条）');
say('   格式：`节点路径 ×次数  样例文本=…`');
Array.from(pathCount.entries())
  .sort((a, b) => b[1].n - a[1].n)
  .slice(0, MAX_PATHS)
  .forEach(([sig, v]) => {
    say('  ' + short(sig, 150) + ' ×' + v.n + (v.sample ? '  样例文本=' + JSON.stringify(short(v.sample, 30)) : ''));
  });
if (pathCount.size > MAX_PATHS) say(`  …另有 ${pathCount.size - MAX_PATHS} 条路径签名（用 --max-paths 调大）`);
say('');
say('## 3. 类名 → 出现次数（降序，全部 ' + classCount.size + ' 个）');
Array.from(classCount.entries())
  .sort((a, b) => b[1] - a[1])
  .forEach(([c, n]) => say('  ' + c + ' ×' + n));
say('');
say('## 4. 属性名 → 出现次数');
Array.from(attrCount.entries())
  .sort((a, b) => b[1] - a[1])
  .forEach(([a, n]) => say('  ' + a + ' ×' + n));
say('');
say('## 5. 含 tcId 的行（最多 30 行，原样）');
tcIdLines.slice(0, 30).forEach((l) => say('  ' + short(l.trim(), MAX_LINE)));
if (tcIdLines.length > 30) say(`  …另有 ${tcIdLines.length - 30} 行`);
say('');
say('## 6. 每个类名一个文本样例（最多 ' + MAX_CLASS_SAMPLES + ' 个，看懂列语义用）');
Array.from(classSample.entries())
  .slice(0, MAX_CLASS_SAMPLES)
  .forEach(([c, t]) => say('  ' + c + ' → ' + JSON.stringify(short(t, 40))));

const text = out.join('\n');
process.stdout.write(text + '\n');
process.stderr.write(`\n[dom_outline] ${file}: ${bytes} 字节 → 摘要 ${Buffer.byteLength(text, 'utf8')} 字节，${out.length} 行\n`);

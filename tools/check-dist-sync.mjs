#!/usr/bin/env node
/**
 * 产物同步自检：确认**已提交的** dist/szuer-toolbox.user.js 与当前源码重建结果一致。
 *
 * 为什么需要它：
 *   dist/ 是入库的（自动更新要 raw 链接），于是「改了源码忘了跑 build」不会被任何人发现 ——
 *   测试跑的是源码，全绿；用户装的是产物，还是旧的。症状极隐蔽：功能「没生效」但日志不报错。
 *   这个脚本把两边逐行比一遍，不同就失败。
 *
 * 两个模式（中间必须夹一次重建，所以只能拆成两步）：
 *   1. `--save`   把当前 dist 存一份到系统临时目录（重建会覆盖 dist，所以先存）
 *   2. `--verify` 重建完成后，把 dist 与刚才存的那份逐行比
 *
 * 为什么不由脚本自己 `git show` 取旧版：
 *   本机 DSH 沙箱禁止 node 用管道 spawn 子进程（`spawnSync git EPERM`），
 *   取旧版这一步只能靠「先复制一份」绕开。CI 里也一并走同一条路径，保证本地与 CI 行为一致。
 *
 * 忽略哪些行（每次构建都变，不构成「源码与产物不一致」）：
 *   1. 头部的「构建信息：<时间>（构建号 <n>）」注释
 *   2. main.ts 里被 define 内联的 BUILD_TIME
 *   3. main.ts 里被 define 内联的 BUILD_NO
 *
 * 用法：
 *   node tools/check-dist-sync.mjs --save && npm run build && node tools/check-dist-sync.mjs --verify
 */

import { copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FILE = 'dist/szuer-toolbox.user.js';
const SNAPSHOT = join(tmpdir(), 'szuer-toolbox-dist-head.js');

const VOLATILE = /构建信息：\d{4}-\d{2}-\d{2}T|^\s*var BUILD_TIME = true \? "|^\s*var BUILD_NO = true \? /;

function lines(text) {
  return text.split('\n').filter((line) => !VOLATILE.test(line));
}

const mode = process.argv[2];

if (mode === '--save') {
  copyFileSync(FILE, SNAPSHOT);
  console.log(`  OK   已存档当前产物：${FILE}`);
} else if (mode === '--verify') {
  const before = lines(readFileSync(SNAPSHOT, 'utf8'));
  const after = lines(readFileSync(FILE, 'utf8'));

  if (before.length !== after.length) {
    console.log(` FAIL  行数不同：已提交 ${String(before.length)} 行，重建后 ${String(after.length)} 行`);
    console.log('       已提交的产物与源码不同步 —— 请运行 npm run build 后把 dist/ 一并提交。');
    process.exit(1);
  }

  const diffs = [];
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) diffs.push(i);
  }

  if (diffs.length > 0) {
    console.log(` FAIL  已提交的产物与重建结果有 ${String(diffs.length)} 行不同（已忽略构建信息行）：`);
    for (const i of diffs.slice(0, 10)) {
      console.log(`       第 ${String(i + 1)} 行`);
      console.log(`         已提交：${JSON.stringify(before[i])}`);
      console.log(`         重建后：${JSON.stringify(after[i])}`);
    }
    if (diffs.length > 10) console.log(`       ……其余 ${String(diffs.length - 10)} 行省略`);
    console.log('       请运行 npm run build 后把 dist/ 一并提交。');
    process.exit(1);
  }

  console.log(`  OK   ${FILE} 与源码重建结果一致（已忽略构建信息行）`);
} else {
  console.error('用法：node tools/check-dist-sync.mjs --save | --verify');
  process.exit(2);
}

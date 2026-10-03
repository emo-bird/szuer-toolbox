#!/usr/bin/env node
/**
 * 构建脚本。
 *
 * ⚠️ 为什么不用 esbuild 的 JS API：
 *    本机 DSH 沙箱禁止「node 用管道 spawn 子进程」（`spawn EPERM`），
 *    而 esbuild 的 JS API 设计上必须把编译器当常驻服务进程、经 stdio 跑二进制协议，
 *    没有绕法。原生 esbuild.exe 单进程运行完全不受限制，
 *    所以这里用 spawnSync 直接调它，并把 stdio 重定向到文件描述符（实测可行；
 *    用管道捕获输出会 EPERM）。
 *
 * 流程：
 *   main.ts + 全部依赖 ──esbuild.exe──> dist/.bundle.js
 *   userscript-header.txt（替换 {{VERSION}} / {{BUILD_TIME}}） + bundle
 *                                        ──> dist/szuer-toolbox.user.js
 *
 * 用法：
 *   node build.mjs            正式构建
 *   node build.mjs --check    只报告产物体积，不做别的（保留给 CI）
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ROOT, 'dist');
const TMP_DIR = join(OUT_DIR, '.tmp');
const OUT_FILE = join(OUT_DIR, 'szuer-toolbox.user.js');
const BUNDLE_FILE = join(TMP_DIR, 'bundle.js');
const STDOUT_LOG = join(TMP_DIR, 'esbuild.out.log');
const STDERR_LOG = join(TMP_DIR, 'esbuild.err.log');

// ------------------------------------------------------------------ 工具

const RESET = '\u001b[0m';
const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';

function info(msg) {
  process.stdout.write(`${msg}\n`);
}
function ok(msg) {
  process.stdout.write(`${GREEN}✓${RESET} ${msg}\n`);
}
function fail(msg) {
  process.stderr.write(`${RED}✗ ${msg}${RESET}\n`);
}
function dim(msg) {
  process.stdout.write(`${DIM}${msg}${RESET}\n`);
}

function fmtSize(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** 定位原生 esbuild 可执行文件（optionalDependencies 里的平台包） */
function resolveEsbuildExe() {
  const platformPkg = `@esbuild/${process.platform}-${process.arch}`;
  const exeName = process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild';
  const exe = join(ROOT, 'node_modules', platformPkg, exeName);
  if (!existsSync(exe)) {
    fail(`找不到 esbuild 可执行文件：${relative(ROOT, exe)}`);
    fail(`请先执行：npm install --ignore-scripts`);
    process.exit(1);
  }
  return exe;
}

/** 用 spawnSync + 文件描述符重定向执行子进程（管道会触发 EPERM） */
function runExe(exe, args) {
  mkdirSync(TMP_DIR, { recursive: true });
  const outFd = openSync(STDOUT_LOG, 'w');
  const errFd = openSync(STDERR_LOG, 'w');
  let result;
  try {
    result = spawnSync(exe, args, {
      cwd: ROOT,
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
    });
  } finally {
    closeSync(outFd);
    closeSync(errFd);
  }
  const stdout = readFileSync(STDOUT_LOG, 'utf8');
  const stderr = readFileSync(STDERR_LOG, 'utf8');
  return { status: result.status, error: result.error, stdout, stderr };
}

// ------------------------------------------------------------------ 主流程

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const version = process.env.SZB_VERSION ?? pkg.version;
  const buildTime = new Date().toISOString();

  if (checkOnly && existsSync(OUT_FILE)) {
    info(`产物：${relative(ROOT, OUT_FILE)}（${fmtSize(statSync(OUT_FILE).size)}）`);
    return;
  }

  mkdirSync(TMP_DIR, { recursive: true });

  const exe = resolveEsbuildExe();
  info(`esbuild：${relative(ROOT, exe)}`);

  const esbuildArgs = [
    'src/main.ts',
    '--bundle',
    '--format=iife',
    '--target=es2022',
    '--platform=browser',
    '--charset=utf8',
    '--legal-comments=none',
    '--log-level=warning',
    '--loader:.css=text',
    `--outfile=${BUNDLE_FILE}`,
    `--define:__SZB_VERSION__=${JSON.stringify(version)}`,
    `--define:__SZB_BUILD_TIME__=${JSON.stringify(buildTime)}`,
  ];

  const res = runExe(exe, esbuildArgs);
  if (res.stdout.trim() !== '') dim(res.stdout.trim());
  if (res.stderr.trim() !== '') process.stderr.write(`${res.stderr.trim()}\n`);
  if (res.error) {
    fail(`启动 esbuild 失败：${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    fail(`esbuild 退出码 ${res.status}`);
    process.exit(res.status ?? 1);
  }

  const bundle = readFileSync(BUNDLE_FILE, 'utf8');
  const header = readFileSync(join(ROOT, 'src', 'userscript-header.txt'), 'utf8')
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{BUILD_TIME}}', buildTime);

  const output = `${header}\n${bundle}\n`;
  writeFileSync(OUT_FILE, output, 'utf8');

  // 清理中间产物
  rmSync(TMP_DIR, { recursive: true, force: true });

  ok(`构建完成：${relative(ROOT, OUT_FILE)}`);
  info(`  版本：${version}`);
  info(`  时间：${buildTime}`);
  info(`  体积：${fmtSize(Buffer.byteLength(output, 'utf8'))}`);
  info(`  行数：${output.split('\n').length}`);
}

main();

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
 *   main.ts + 全部依赖 ──esbuild.exe──> dist/.tmp/bundle.js
 *   userscript-header.txt（替换 {{VERSION}} / {{BUILD_TIME}} / {{BUILD_NO}}） + bundle
 *                                        ──> dist/szuer-toolbox.user.js
 *   再跑一次 esbuild（`--minify`）得到去格式化的 bundle，
 *   与**同一份**头模板拼起来 ──> dist/szuer-toolbox.min.user.js
 *   （头模板是元数据注释，不参与压缩；两份产物的构建号 / 时间完全一致）
 *
 * 构建号（BUILD_NO）：
 *   版本号固定的阶段里，靠单调递增的构建号区分「装的是哪一次构建」。
 *   计数持久化在 `dist/.build-no`（已 gitignore），每次正式构建读出来 +1 写回。
 *   可用环境变量 `SZB_BUILD_NO=<n>` 显式指定（CI / 重放旧构建时用）。
 *   注意：**只有真正要写产物的构建才自增**；`--check` 不动计数。
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
const OUT_MIN_FILE = join(OUT_DIR, 'szuer-toolbox.min.user.js');
const BUNDLE_FILE = join(TMP_DIR, 'bundle.js');
const BUNDLE_MIN_FILE = join(TMP_DIR, 'bundle.min.js');
const STDOUT_LOG = join(TMP_DIR, 'esbuild.out.log');
const STDERR_LOG = join(TMP_DIR, 'esbuild.err.log');
const BUILD_NO_FILE = join(OUT_DIR, '.build-no');
const CSS_FILE = join(ROOT, 'src', 'common', 'ui', 'style.css');
const CSS_MIN_FILE = join(TMP_DIR, 'style.min.css');

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

/**
 * 读出并递增构建号。
 * 计数文件放在 `dist/`（已 gitignore），首次运行不存在则从 1 开始。
 * `SZB_BUILD_NO` 环境变量可显式覆盖，且**不写回**计数文件（便于重放旧构建）。
 */
function nextBuildNo() {
  const forced = process.env.SZB_BUILD_NO;
  if (forced !== undefined && forced !== '') {
    const n = Number.parseInt(forced, 10);
    if (Number.isFinite(n) && n >= 0) return n;
    fail(`SZB_BUILD_NO 不是合法数字：${forced}`);
    process.exit(1);
  }

  let current = 0;
  if (existsSync(BUILD_NO_FILE)) {
    const raw = readFileSync(BUILD_NO_FILE, 'utf8').trim();
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) current = parsed;
  }
  const next = current + 1;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(BUILD_NO_FILE, `${next}\n`, 'utf8');
  return next;
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
    if (existsSync(OUT_MIN_FILE)) {
      info(`产物：${relative(ROOT, OUT_MIN_FILE)}（${fmtSize(statSync(OUT_MIN_FILE).size)}）`);
    }
    return;
  }

  // 只有真正要写产物时才递增构建号（--check 不动计数）
  const buildNo = nextBuildNo();

  mkdirSync(TMP_DIR, { recursive: true });

  const exe = resolveEsbuildExe();
  info(`esbuild：${relative(ROOT, exe)}`);

  /**
   * 先把 CSS 压一遍，再通过 `--define` 注入。
   *
   * 为什么不直接 `--loader:.css=text`：那样 CSS 只是一个普通字符串字面量，
   * `--minify` 只做 JS 侧的去空白 / 改标识符，**字符串内容是原样照搬的** ——
   * 于是压缩版里躺着一整份带注释和缩进的 CSS。这里让 esbuild 用 CSS 解析器
   * 真正压一遍（去注释、去冗余空白、缩短颜色值…），再把结果当常量塞进去。
   */
  function minifyCss() {
    const res = runExe(exe, [
      relative(ROOT, CSS_FILE),
      '--minify',
      '--charset=utf8',
      '--log-level=warning',
      `--outfile=${CSS_MIN_FILE}`,
    ]);
    if (res.stdout.trim() !== '') dim(res.stdout.trim());
    if (res.stderr.trim() !== '') process.stderr.write(`${res.stderr.trim()}\n`);
    if (res.error) {
      fail(`启动 esbuild 压缩 CSS 失败：${res.error.message}`);
      process.exit(1);
    }
    if (res.status !== 0) {
      fail(`esbuild 压缩 CSS 退出码 ${res.status}`);
      process.exit(res.status ?? 1);
    }
    return readFileSync(CSS_MIN_FILE, 'utf8').replace(/\r\n?/g, '\n').trim();
  }

  const css = minifyCss();
  const cssRawBytes = statSync(CSS_FILE).size;
  const cssMinBytes = Buffer.byteLength(css, 'utf8');
  dim(`CSS：${fmtSize(cssRawBytes)} → ${fmtSize(cssMinBytes)}`);

  // CSS 是通过 `--define` 内联进命令行的，而 Windows 一条命令行上限 32767 字符
  // （spawnSync 会把参数拼成一条）。样式一长就会顶到上限，届时 esbuild 只会回一句
  // 看不懂的失败 —— 提前拦住，并给出替代做法的方向。
  const cssArgChars = JSON.stringify(css).length;
  if (cssArgChars > 20000) {
    fail(`CSS 内联后 ${cssArgChars} 字符，太接近 Windows 命令行上限（32767）`);
    fail('请拆分 src/common/ui/style.css，或改成构建期写出临时 .ts 再 import');
    process.exit(1);
  }

  const esbuildBaseArgs = [
    'src/main.ts',
    '--bundle',
    '--format=iife',
    '--target=es2022',
    '--platform=browser',
    '--charset=utf8',
    '--legal-comments=none',
    '--log-level=warning',
    `--define:__SZB_CSS__=${JSON.stringify(css)}`,
    `--define:__SZB_VERSION__=${JSON.stringify(version)}`,
    `--define:__SZB_BUILD_TIME__=${JSON.stringify(buildTime)}`,
    `--define:__SZB_BUILD_NO__=${JSON.stringify(buildNo)}`,
  ];

  /** 跑一次 esbuild，返回产物文本；失败直接退出 */
  function bundleTo(outfile, extraArgs) {
    const res = runExe(exe, [...esbuildBaseArgs, `--outfile=${outfile}`, ...extraArgs]);
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
    return readFileSync(outfile, 'utf8');
  }

  const bundle = bundleTo(BUNDLE_FILE, []);
  // 第二份：去掉全部格式化（`--minify` 同时做去空白 + 改标识符 + 去注释）
  const bundleMin = bundleTo(BUNDLE_MIN_FILE, ['--minify']);

  // 换行符防御：本机 core.autocrlf=true 会把头模板 checkout 成 CRLF，
  // 产物首行于是变成 "// ==UserScript==\r"，把 verify-build 的自检骗到。
  // .gitattributes 已强制 LF，但构建不该依赖别人的 git 配置 —— 这里再兜一层。
  const header = readFileSync(join(ROOT, 'src', 'userscript-header.txt'), 'utf8')
    .replace(/\r\n?/g, '\n')
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{BUILD_TIME}}', buildTime)
    .replaceAll('{{BUILD_NO}}', String(buildNo));

  const output = `${header}\n${bundle.replace(/\r\n?/g, '\n')}\n`;
  writeFileSync(OUT_FILE, output, 'utf8');

  // 头模板**不压缩**（它是元数据注释），只压 bundle
  const outputMin = `${header}\n${bundleMin.replace(/\r\n?/g, '\n')}\n`;
  writeFileSync(OUT_MIN_FILE, outputMin, 'utf8');

  // 清理中间产物
  rmSync(TMP_DIR, { recursive: true, force: true });

  ok(`构建完成：${relative(ROOT, OUT_FILE)}`);
  info(`  版本：${version}（构建号 ${buildNo}）`);
  info(`  时间：${buildTime}`);
  info(`  体积：${fmtSize(Buffer.byteLength(output, 'utf8'))}`);
  info(`  行数：${output.split('\n').length}`);
  ok(`构建完成（压缩版）：${relative(ROOT, OUT_MIN_FILE)}`);
  info(`  体积：${fmtSize(Buffer.byteLength(outputMin, 'utf8'))}`);
  info(`  行数：${outputMin.split('\n').length}`);
}

main();

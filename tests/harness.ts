/**
 * 零依赖测试脚手架。
 *
 * 风格沿用 szu_bkxk 的 `tests/run.mjs`（不引入 node:test / vitest）：
 * 纯函数冒烟、秒级、每次改完必跑。跑法：`npm test`
 *
 * 因为 Node 24 原生支持类型擦除，测试可以直接 import src 下的 .ts 源码，
 * 不需要先构建 —— 这是「改完即刻能跑」的关键。
 */

export interface TestResult {
  suite: string;
  name: string;
  ok: boolean;
  error?: unknown;
  ms: number;
}

type Fn = () => void | Promise<void>;

interface Case {
  suite: string;
  name: string;
  fn: Fn;
}

const cases: Case[] = [];
const beforeAlls: Array<{ suite: string; fn: Fn }> = [];
const afterAlls: Array<{ suite: string; fn: Fn }> = [];

let currentSuite = '(root)';

/** 定义一个测试组 */
export function describe(name: string, define: () => void): void {
  const prev = currentSuite;
  currentSuite = name;
  try {
    define();
  } finally {
    currentSuite = prev;
  }
}

/** 单个用例 */
export function it(name: string, fn: Fn): void {
  cases.push({ suite: currentSuite, name, fn });
}

/** 组级前置 / 后置 */
export function beforeAll(fn: Fn): void {
  beforeAlls.push({ suite: currentSuite, fn });
}
export function afterAll(fn: Fn): void {
  afterAlls.push({ suite: currentSuite, fn });
}

// ------------------------------------------------------------- 断言

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AssertionError(message);
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(
      `${message ?? '值不相等'}\n    实际: ${format(actual)}\n    期望: ${format(expected)}`,
    );
  }
}

export function assertDeepEqual(actual: unknown, expected: unknown, message?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new AssertionError(`${message ?? '结构不相等'}\n    实际: ${a}\n    期望: ${b}`);
  }
}

export function assertThrows(fn: Fn, message?: string): void {
  let threw = false;
  try {
    const r = fn();
    if (r instanceof Promise) {
      throw new AssertionError(`${message ?? '期望抛错'}：拿到的是 Promise，请改用 assertRejects`);
    }
  } catch {
    threw = true;
  }
  if (!threw) throw new AssertionError(message ?? '期望抛错，但没有抛');
}

function format(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

// ------------------------------------------------------------- 执行

const RESET = '\u001b[0m';
const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';
const YELLOW = '\u001b[33m';

export async function run(): Promise<void> {
  const results: TestResult[] = [];
  let lastSuite = '';

  for (const fn of beforeAlls) await fn.fn();

  for (const c of cases) {
    if (c.suite !== lastSuite) {
      process.stdout.write(`\n${c.suite}\n`);
      lastSuite = c.suite;
    }
    const started = Date.now();
    try {
      await c.fn();
      results.push({ suite: c.suite, name: c.name, ok: true, ms: Date.now() - started });
      process.stdout.write(`  ${GREEN}✓${RESET} ${c.name}\n`);
    } catch (err) {
      results.push({ suite: c.suite, name: c.name, ok: false, error: err, ms: Date.now() - started });
      process.stdout.write(`  ${RED}✗ ${c.name}${RESET}\n`);
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      process.stdout.write(`      ${RED}${detail.split('\n').join(`\n      `)}${RESET}\n`);
      if (err instanceof Error && err.stack !== undefined && !(err instanceof AssertionError)) {
        process.stdout.write(`${DIM}${err.stack.split('\n').slice(1, 4).join('\n')}${RESET}\n`);
      }
    }
  }

  for (const fn of afterAlls) {
    try {
      await fn.fn();
    } catch {
      /* 清理失败不影响结果 */
    }
  }

  const failed = results.filter((r) => !r.ok);
  const total = results.length;
  const elapsed = results.reduce((s, r) => s + r.ms, 0);

  process.stdout.write('\n' + '─'.repeat(56) + '\n');
  if (failed.length === 0) {
    process.stdout.write(`${GREEN}全部通过${RESET}  ${total} 项，耗时 ${elapsed}ms\n`);
  } else {
    process.stdout.write(
      `${RED}${failed.length} 项失败${RESET} / 共 ${total} 项，耗时 ${elapsed}ms\n`,
    );
    for (const f of failed) {
      process.stdout.write(`  ${RED}✗${RESET} ${f.suite} › ${f.name}\n`);
    }
    process.stdout.write(`\n${YELLOW}提示：上面的断言细节里「实际 / 期望」就是排查入口。${RESET}\n`);
  }

  process.exitCode = failed.length === 0 ? 0 : 1;
}

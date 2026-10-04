/**
 * 从旧仓库的三份真实响应样本生成档 1 fixture（**脱敏 + 裁剪**）。
 *
 * 跑法：`node tools/make-bkxk-fixtures.mjs [源目录]`
 *   源目录缺省 `C:\Project\szu_bkxk\docs`。
 * 输出：`tests/fixtures/bkxk-*.json` 与 `tests/fixtures/README.md`。
 *
 * 为什么要有这个脚本，而不是手工拷几个文件进来：
 *   1. 样本里有**真实学号 / 姓名 / IP**（红线 R3：凭证与个人数据不落盘）——
 *      必须脱敏，而「哪些键算敏感」这件事本身要能被审查，就是下面的 `SENSITIVE`。
 *   2. `programCourse.do.json` 有 130 KB，只留 3 门课；裁剪规则同样要能被审查，
 *      就是下面的 `LIMITS`。
 *   3. 记下**溯源**：将来站点改版，样本从哪来、改过什么，一眼能看回来。
 *
 * 本脚本只读源目录、只写 `tests/fixtures/`；**不发任何网络请求**。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE = 'C:\\Project\\szu_bkxk\\docs';
const OUT_DIR = fileURLToPath(new URL('../tests/fixtures/', import.meta.url));

/**
 * 敏感键 → 替换成什么。
 * ⚠️ 新增样本时**先看这行**再决定能不能进仓库。
 *
 * `electiveBatchCode` 是**抢课批次码**（每学期每人一份，能配合学号用于提交选课），
 * 虽然不等于 token，也按凭证处理 —— 用户 2026-10 拍板脱敏。
 * 反向记住：**故意不脱敏**的是 `teachingClassID`（课程目录标识，是样本的结构键，
 * 脱敏会毁掉真实性）与 `teachingPlace`（公开课表信息）。
 */
const SENSITIVE = {
  studentCode: '2026000000',
  studentName: '测试同学',
  deleteOperatePersonName: '测试同学',
  deleteOperateTime: '2026-01-01 00:00:00',
  operateIP: '127.0.0.1',
  comment: '',
  electiveBatchCode: 'abcdef0123456789abcdef0123456789',
};

/** 裁剪上限：键 = 源文件名，值 = `dataList` 保留多少条。 */
const LIMITS = {
  'programCourse.do.json': 3,
  'noArranged.do.json': 2,
  'teachingTime.do.json': Infinity,
};

/** 递归脱敏。返回新对象，不改原对象。 */
function sanitize(node) {
  if (Array.isArray(node)) return node.map(sanitize);
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (Object.hasOwn(SENSITIVE, k)) out[k] = SENSITIVE[k];
    else out[k] = sanitize(v);
  }
  return out;
}

function load(source, name) {
  const path = join(source, name);
  if (!existsSync(path)) {
    throw new Error(`源样本不存在：${path}`);
  }
  return { path, json: JSON.parse(readFileSync(path, 'utf8')) };
}

function write(file, value) {
  // 紧凑 JSON：这些文件是给测试读的，不是给人看的；带缩进会让 130 KB 变 300 KB。
  writeFileSync(join(OUT_DIR, file), `${JSON.stringify(value)}\n`, 'utf8');
  const size = Buffer.byteLength(JSON.stringify(value));
  return `${file}  ${(size / 1024).toFixed(1)} KB`;
}

function main() {
  const source = process.argv[2] ?? DEFAULT_SOURCE;
  mkdirSync(OUT_DIR, { recursive: true });
  const lines = [];

  // ---- 1. 三个响应样本：脱敏 + 裁剪 ----
  const names = {
    'bkxk-programCourse.json': 'programCourse.do.json',
    'bkxk-noArranged.json': 'noArranged.do.json',
    'bkxk-teachingTime.json': 'teachingTime.do.json',
  };
  const counts = {};
  for (const [out, src] of Object.entries(names)) {
    const { json } = load(source, src);
    const clean = sanitize(json);
    const limit = LIMITS[src] ?? Infinity;
    if (Array.isArray(clean.dataList) && clean.dataList.length > limit) {
      clean.dataList = clean.dataList.slice(0, limit);
      // 裁了条数就得改 totalCount，否则 fixture 自己前后矛盾
      clean.totalCount = clean.dataList.length;
    }
    counts[out] = Array.isArray(clean.dataList) ? clean.dataList.length : 0;
    lines.push(write(out, clean));
  }

  // ---- 2. teachingPlace 语料：课程样本里**全部去重后**的地点串 ----
  // 这些是公开课表信息（楼名 + 节次），不含个人数据，故整表保留。
  const program = load(source, 'programCourse.do.json').json;
  const places = [];
  for (const item of program.dataList ?? []) {
    for (const tc of item.tcList ?? []) {
      if (typeof tc.teachingPlace === 'string' && tc.teachingPlace !== '') places.push(tc.teachingPlace);
    }
  }
  const distinct = [...new Set(places)];
  lines.push(
    write('bkxk-teaching-place.json', {
      note: '来自 programCourse.do.json 的全部去重 teachingPlace；公开课表信息，未脱敏',
      rawCount: places.length,
      distinctCount: distinct.length,
      places: distinct,
    }),
  );

  // ---- 3. README：把溯源与脱敏规则写下来 ----
  const readme = [
    '# tests/fixtures —— 由脚本生成的样本',
    '',
    '**不要手工编辑这些文件。**它们由 `node tools/make-bkxk-fixtures.mjs` 生成：',
    '',
    '```',
    'node tools/make-bkxk-fixtures.mjs            # 源目录缺省 C:\\Project\\szu_bkxk\\docs',
    'node tools/make-bkxk-fixtures.mjs <源目录>',
    '```',
    '',
    '## 来源',
    '',
    '旧仓库 `C:\\Project\\szu_bkxk\\docs\\` 下的**真实接口响应**（2026-09-24 由 HAR `bkxk.szu.edu.cn-1.har` 提取）：',
    '',
    '| fixture | 源文件 | 条数 | 结构与看点 |',
    '|---|---|---|---|',
    `| \`bkxk-programCourse.json\` | \`programCourse.do.json\` | ${counts['bkxk-programCourse.json']} 门课 | **嵌套**：每门课一个 \`tcList\`。⚠️ tc 行上**根本没有 \`courseName\` 键**（源样本 49 个 tc 命中 0），\`credit\` / \`typeName\` 同理 ⇒ 必须回退课程级；tc 上 \`departmentName\` / \`courseNatureName\` **存在但全为 \`null\`**，课程级才有值；\`isFavorite\` 在 tc 上 **33/33 全 \`null\`**（收藏只能看页面星标） |`,
    `| \`bkxk-noArranged.json\` | \`noArranged.do.json\` | ${counts['bkxk-noArranged.json']} 个教学班 | **扁平**：没有 \`tcList\`，一行即一个教学班（行内自带 \`courseName\` / \`credit\`）；\`teachingPlace\` 是 \`null\`（不是空串）；顶层 \`totalCount\` 源为 \`null\`，裁剪后会被改成实际条数；**两行 \`credit\` 实测是 \`"1"\` 与 \`"2"\`（不一样！）** |`,
    `| \`bkxk-teachingTime.json\` | \`teachingTime.do.json\` | ${counts['bkxk-teachingTime.json']} 个时段 | 规则课表。\`week\` 是**周次位图**，下标 0 = 第 1 周，长度实测有 11 / 18 / 20 三种 |`,
    `| \`bkxk-teaching-place.json\` | 同上 programCourse | ${distinct.length} 条去重地名（共 ${places.length} 条） | 只放 \`teachingPlace\` 文本，供解析器语料用 |`,
    '',
    '⚠️ **列表类端点的响应是顶层 `dataList`，没有 `data` 包裹**（HAR 实测：',
    '`"text":"{\\"totalCount\\":7,\\"dataList\\":[{\\"selected\\":true,\\"tcList\\":[…`）；',
    '单对象端点（如 `capacity.do`）才是 `{"data":{…}}`。两处形态不同，取数时别搞混。',
    '',
    '## 脱敏',
    '',
    '脚本按**键名**递归替换（`tools/make-bkxk-fixtures.mjs` 的 `SENSITIVE`）：',
    '',
    ...Object.entries(SENSITIVE).map(([k, v]) => `- \`${k}\` → \`${v}\``),
    '',
    `\`totalCount\` 在裁剪后会被改成裁剪后的条数，避免 fixture 自相矛盾。`,
    '',
    '**故意不脱敏**（并写在这里以免日后被当成漏网）：',
    '',
    '- `teachingClassID`（33 + 2 + 8 个）—— 课程目录标识，是样本的结构键；换成假号就没法校验',
    '  教学班级与课程级的字段落点，样本的真实性会毁掉。',
    '- `teachingPlace` / `teacherName` / `courseName` —— 公开课表与课程目录信息。',
    '',
  ].join('\n');
  writeFileSync(join(OUT_DIR, 'README.md'), readme, 'utf8');

  console.log(`源目录：${source}`);
  for (const l of lines) console.log(`  ${l}`);
  console.log('  README.md');
}

main();

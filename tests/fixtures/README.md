# tests/fixtures —— 由脚本生成的样本

**不要手工编辑这些文件。**它们由 `node tools/make-bkxk-fixtures.mjs` 生成：

```
node tools/make-bkxk-fixtures.mjs            # 源目录缺省 C:\Project\szu_bkxk\docs
node tools/make-bkxk-fixtures.mjs <源目录>
```

## 来源

旧仓库 `C:\Project\szu_bkxk\docs\` 下的**真实接口响应**（2026-09-24 由 HAR `bkxk.szu.edu.cn-1.har` 提取）：

| fixture | 源文件 | 条数 | 结构与看点 |
|---|---|---|---|
| `bkxk-programCourse.json` | `programCourse.do.json` | 3 门课 | **嵌套**：每门课一个 `tcList`。⚠️ tc 行上**根本没有 `courseName` 键**（源样本 49 个 tc 命中 0），`credit` / `typeName` 同理 ⇒ 必须回退课程级；tc 上 `departmentName` / `courseNatureName` **存在但全为 `null`**，课程级才有值；`isFavorite` 在 tc 上 **33/33 全 `null`**（收藏只能看页面星标） |
| `bkxk-noArranged.json` | `noArranged.do.json` | 2 个教学班 | **扁平**：没有 `tcList`，一行即一个教学班（行内自带 `courseName` / `credit`）；`teachingPlace` 是 `null`（不是空串）；顶层 `totalCount` 源为 `null`，裁剪后会被改成实际条数；**两行 `credit` 实测是 `"1"` 与 `"2"`（不一样！）** |
| `bkxk-teachingTime.json` | `teachingTime.do.json` | 14 个时段 | 规则课表。`week` 是**周次位图**，下标 0 = 第 1 周，长度实测有 11 / 18 / 20 三种 |
| `bkxk-teaching-place.json` | 同上 programCourse | 49 条去重地名（共 49 条） | 只放 `teachingPlace` 文本，供解析器语料用 |

⚠️ **列表类端点的响应是顶层 `dataList`，没有 `data` 包裹**（HAR 实测：
`"text":"{\"totalCount\":7,\"dataList\":[{\"selected\":true,\"tcList\":[…`）；
单对象端点（如 `capacity.do`）才是 `{"data":{…}}`。两处形态不同，取数时别搞混。

## 脱敏

脚本按**键名**递归替换（`tools/make-bkxk-fixtures.mjs` 的 `SENSITIVE`）：

- `studentCode` → `2026000000`
- `studentName` → `测试同学`
- `deleteOperatePersonName` → `测试同学`
- `deleteOperateTime` → `2026-01-01 00:00:00`
- `operateIP` → `127.0.0.1`
- `comment` → ``
- `electiveBatchCode` → `abcdef0123456789abcdef0123456789`

`totalCount` 在裁剪后会被改成裁剪后的条数，避免 fixture 自相矛盾。

**故意不脱敏**（并写在这里以免日后被当成漏网）：

- `teachingClassID`（33 + 2 + 8 个）—— 课程目录标识，是样本的结构键；换成假号就没法校验
  教学班级与课程级的字段落点，样本的真实性会毁掉。
- `teachingPlace` / `teacherName` / `courseName` —— 公开课表与课程目录信息。

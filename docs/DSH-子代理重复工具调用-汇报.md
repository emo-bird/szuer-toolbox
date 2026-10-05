# 子智能体「重复执行 Parse catalog JSON structure with PowerShell」——给 preset 开发者的汇报

汇报人：主 agent（preset `scrape`）
日期：2026-10-05
结论一句话：**子代理 125 步里 104 步在重复同一条必然失败的 PowerShell 命令，其失败错误正文每次 10,810 字符、字节完全相同，累计 1.12 MB —— 远超子代理 64K 上下文窗口，导致「看到错误 → 错误被挤出窗口 → 忘记已失败 → 再调一次」的自抹除死循环。repeat guard 连发 7 次警告，模型全部无视。**

本报告所有数字都来自子代理的**原始会话记录**，不是主 agent 的推断。

---

## 1. 证据来源与复现方法

DSH 会话记录位置（**建议写入 preset 环境手册**，对排查子代理行为极其有用）：

```
C:\Users\一门鸽鸽\.dsh\sessions\--C-Project-szuer-toolbox--\<session-uuid>\session.v4.jsonl.zstd
```

- 一行一条记录，zstd 压缩的 JSONL；首行是 `{"type":"session", ..., "agentPreset":"scrape", "delegationDepth":1, "origin":"subagent", "parentSession":...}`。
- 其余行：`{"type":"tool/call"|"tool/result"|"assistant/message"|"step/start"|"step/end"|"user/message"|"agent/inbox/spliced"|...}`。
- **取工具入参**：`data.name` + `data.arguments`（不是 `toolName`/`input`）。
- **取工具结果**：`data.message.content`（注意不是 `data.result` / `data.output` —— 这两个键不存在，误用会静默拿到 `{}`）。
- **取运行参数**：`request/context` 行 → `{"provider":"local-llm","model":"ornith-1.5-9b-dsh-agentic-gpt-5.6-sol-distill","contextWindow":64000}`。

解压（Python 3.14 自带 zstd，无需装包）：

```python
from compression import zstd          # 回退：import zstandard as zstd
open(dst, "wb").write(zstd.decompress(open(src, "rb").read()))
```

> 坑：不要用 `python x.py > out.txt`（pwsh 5.1 重定向不写 UTF-8，后续 `read` 会报 binary file）；让 Python 自己 `open(..., "w", encoding="utf-8")` 写。

本次涉事会话：

| 会话目录 | depth | 大小 | 步数 | 工具调用 | 结局 |
|---|---|---|---|---|---|
| `d96a8a46-a5f3-44ef-8804-a948841362e1` | 1 (subagent) | 2,060,824 B / 660 行 | 125 | 125 | `turn/end` = `{"kind":"aborted","reason":{"kind":"parent"}}`，**零有效产出** |
| `0e67ee7e-a8ef-44dd-b3cf-6a4822ce6375` | 1 (subagent) | 534,011 B / 407 行 | 79 | 78 | 成功，但 76 次同构 pwsh |

---

## 2. 事件回顾：这次委派的任务是什么

主 agent 发给子代理的 prompt（原文，1,127 字符，节选）：

> 读这两个文件：`local\slices\uooc-learn-unit.json`、`local\slices\uooc-catalog.json`
> （都是 UTF-8 JSON 数组，含 UOOC 抓包切片。`resp_body` 是接口响应正文，可能被截断…）
> 请回答：1. getCourseLearn 顶层字段… 2. getUnitLearn 资源条目字段路径、测验资源的 id 字段名… 3. getCatalogList 章节清单路径… 4. 枚举全部测验 tid 的最少接口链路与伪代码… 5. getCatalogLearnState 用途… 6. 有没有姓名/学号（只回有/没有）
> 输出要求：**不超过 500 字**，分「结论/字段路径/疑点」三段。

两个切片文件各约 8.6 KB / 14.8 KB（含大量 `resp_body` 长字符串）。

**任务形状本身就是陷阱**：输入工作集 ≈ 1.2 MB 的 JSON（展开后），输出被限制在 500 字。模型必须先「把 1.2 MB 压成 500 字」，而它的上下文窗口只有 64K tokens（≈256 KB 字符）。

---

## 3. 硬数据（全部来自 trace，可复核）

### 3.1 工具调用构成

| 工具 | 次数 |
|---|---|
| `pwsh` | **105** |
| `read` | 17 |
| `grep` | 3 |
| `python` | **0** |

### 3.2 去重后的调用签名：125 次调用只用了 **5 种骨架**

把命令里的字符串字面量、路径、数字统一替换后归类：

| 次数 | 调用序号 | 骨架 |
|---|---|---|
| **104** | 19…125 | `pwsh`：`Get-Content "…\uooc-catalog.json" -Raw` → `$start = $body.IndexOf('"resp_body"')` → `$end = $body.IndexOf('"resp_body_truncated"')` → `$body.Substring(...)` → `ConvertFrom-Json` → `Write-Output "TOPKEYS: …"` / `"--- child keys ---"` / `$j.data[0].data[0].children[0]` |
| 17 | 3–17, 100, 104 | `read`：`uooc-learn-unit.json`，反复换 `offset`/`limit` |
| 2 | 1, 2 | `grep`：在被单行 JSON 顶爆的文件上搜字段名 |
| 1 | 18 | 同 104 那条的首次形态 |
| 1 | 97 | `grep` |

### 3.3 连续「参数逐字节相同」的调用串

`exact-identical runs: [(4,2), (19,78), (98,2), (101,3), (105,21)]`

即：**call 19 起连续 78 次完全相同的调用**，之后又出现 21 次、3 次、2 次、2 次的相同串。

### 3.4 工具输出体量

- 125 条工具结果合计 **1,237,277 字符**（≈310K tokens）。
- 其中 call 19–125 的 pwsh 结果：**104 条逐字节完全相同，每条 10,810 字符**，合计 **1,124,240 字符 = 全会话工具输出的 90.8%**。
- 上下文窗口 `contextWindow: 64000` tokens ⇒ **工具输出总量超窗口约 5 倍**。

### 3.5 repeat guard 的表现

`agent/inbox/spliced` 里 harness 共注入 **7 次**重复调用告警：

| seq | 告警文本 |
|---|---|
| 113, 532, 555 | `You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again…` |
| 126, 568 | `Repeated tool call detected: - tool: pwsh - consecutive_calls: 5 …` |
| 144, 586 | `Repeated tool call detected: - tool: pwsh - consecutive_calls: 8 …` |

**7 次全部被无视**，模型在每次告警后继续发同一条命令。告警文案里已经完整打印了那条命令。

---

## 4. 直接触发因素：那条命令到底为什么错

104 次调用的结果正文（逐字节相同）开头：

```
TOPKEYS:
--- child keys ---

[stderr]
ConvertFrom-Json : 传入的对象无效，应为“:”或“}”。 (2): {\"code\":1,\"msg\":\"\",\"data\":[{\"id\":57920722,\"name\":\"\u603b\u8bba\",...
...
在位置 行:1 字符: 500
+ ... put "--- child keys ---"; $c = $j.data[0].data[0].children[0]; Write- ...
+                               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : InvalidOperation: (:) []，RuntimeException
    + FullyQualifiedErrorId : NullArray
```

两个错误串联，**且都是自找的**：

1. **`ConvertFrom-Json` 拿到的是非法 JSON。**
   切片文件里 `resp_body` 的值是**一个被转义过的 JSON 字符串**。模型用 `IndexOf('"resp_body"')` + `Substring` 做**字符串手术**把它抠出来，抠出来的文本里引号仍是 `\"` 形态（外层 JSON 字符串的转义没被反转义）⇒ `{\"code\":1,...` 在第 2 个字符处就非法。
   正确做法是一行 Python：`json.loads(json.load(open(f))[0]["resp_body"])` —— 让 `json` 做反转义，而不是 `IndexOf`。
2. **`$j` 为 null 后继续索引 ⇒ `FullyQualifiedErrorId : NullArray`。**
   这是第二个错误，掩盖了第一个错误的信息量。

**最关键的一点：PowerShell 把出错的整个输入串回显进了错误消息**，于是这条错误正文长 10,810 字符。等于每次失败都往上下文里灌 10.8 KB 的无用文本。

`TOPKEYS:` 后面是空的、`--- child keys ---` 后面也是空的 —— 104 次里**没有一次拿到过任何数据**。

---

## 5. 放大机制：自抹除反馈环

```
模型手搓 PowerShell 解析 JSON
   → 报错，错误正文 10.8 KB（含回显的全部输入）
   → 但这次调用没解决问题，模型决定「再试一次 / 换个索引看看」
   → 新的一次 pwsh 是新进程，必须重新 Get-Content + ConvertFrom-Json
   → 再产生 10.8 KB 相同的错误
   → 104 × 10.8 KB = 1.12 MB ≫ 64K 窗口
   → 早先那条错误消息被挤出上下文
   → 模型失去「我已经失败过」的记忆 ⇒ 回到第一步
```

这解释了为什么 repeat guard 无效：**告警拦的是「重复的动作」，拦不住「被窗口挤掉的记忆」。** 模型每次决策时看到的上下文里，那个错误确实「不在」，它并不是明知故犯。

旁证：两个信号同时成立——
- `compac` / `[stored` 在子代理会话里 **命中 0 次** ⇒ 窗口不是被显式压缩掉的，而是**没有任何压缩机制介入**（这也印证了 preset 里 `contextTools: false` 的现状：子代理根本没有 `compress` 可用）。1.24 MB 工具输出灌进 64K 窗口，中间没有任何节流阀。
- call 19 起 78 次完全相同调用的**结果也逐字节相同** ⇒ 说明模型连「这次输出和上次一模一样」都察觉不到。

### 5.1 同类病理的第二个实例（同一会话的 read 阶段）

call 3–17 共 **15 次 `read` 全打在同一个文件 `local\slices\uooc-learn-unit.json` 上**：

```
3  offset=1   limit=82      → 3,874 字符
4  offset=83  limit=160     → 10,072
5  offset=83  limit=160     → 10,072   ← 与上一条参数完全相同
6  offset=83  limit=170     → 10,418
7  offset=83  limit=120     → 6,260
8  offset=83  limit=100     → 5,809
9  offset=83  limit=70      → 2,162
10 offset=153 limit=90      → 8,119
11 offset=153 limit=80      → 7,607
12 offset=153 limit=60      → 4,532
13 offset=213 limit=98      → 5,720
14 offset=213 limit=80      → 5,044
15 offset=213 limit=60      → 4,590
16 offset=273 limit=40      → 1,339
17 uooc-catalog.json offset=1 limit=80 → 4,796
```

特征：**同一个窗口起点反复试不同 limit**（83 试了 5 次、153 试了 3 次、213 试了 3 次）。总读取量约 78 KB。这不是「分页读」，这是**读不完就换个小一点的 limit 再读一遍同一段**——同一个根因：每 10 KB 就吃掉窗口的一大块，读完前一段，前一段就被挤掉，于是它永远「没读完」这个文件。

### 5.2 上一轮同构案例（会话 `0e67ee7e`，最终成功但同样低效）

- `glob` → `read` → **76 次近乎逐字重复的 pwsh**（同一段 `Get-Content … | ConvertFrom-Json`，只换尾部探针），79 步里有效信息只用了最后一步。
- 那次之所以没死循环：**它运气好，那条命令是对的**，所以每步有真实产出，模型能推进。

⇒ 「命令写错」是随机事件，但「每步重新解析整个文件 + 结果体量超窗口」是结构性缺陷。**同一个缺陷遇到一条错命令就必然死循环。**

---

## 6. 根因归类

| 层 | 问题 | 归属 |
|---|---|---|
| **A. 无结果体量节流** | 单条工具结果可达 10.8 KB；125 条累计 1.24 MB 灌进 64K 窗口，无压缩、无截断、无计数提示 | **preset / harness 缺陷（首要）** |
| **B. 无状态被反复重建** | 每次 `pwsh` 是新进程，模型无法「先解析好放着，后面几步复用」；于是每一步都要重付解析成本 | 能力/工具设计问题（次要） |
| **C. 错误正文不设上限** | PowerShell 把整个出错输入回显进 stderr；harness 原样透传 | **工具层应截断（低成本高收益）** |
| **D. 环境手册未禁用字符串手术** | 手册已写「切片可能含 protobuf，用 python 而非 PowerShell」，但没有明确禁止 `IndexOf`/`Substring` 拆 JSON；模型 0 次调用 python | 手册改进 |
| **E. repeat guard 只查形状** | 拦「相同参数」，拦不住「同类失败 + 记忆被挤出」 | guard 设计（可加「相同失败结果」检测） |
| **F. 任务派发形状** | 1.2 MB 输入 → 500 字输出，单次委派切得太大（违反 preset 自己的「一次最多 2~3 个文件」） | **主 agent 侧，我的责任** |

---

## 7. 给 preset 开发者的建议（按性价比排序）

### 必做

1. **工具结果体量硬上限 + 显式截断标记。**
   单条工具结果超过 N（建议 4~8 KB）时，保留头尾、中间替换为 `… [TRUNCATED n chars, total m; re-read with offset/limit] …`。本次若有此机制，104 × 10.8 KB 会变成 104 × 4 KB，且模型能看见 `TRUNCATED` 标记。
2. **stderr 单独设更小的上限（建议 1~2 KB）。**
   报错本身只需要前几行 + `FullyQualifiedErrorId`。回显 10 KB 输入是纯污染。这一条单独就能把本次事故的体量砍掉 90%。
3. **单会话累计工具输出计数 + 阈值告警。**
   累计超过窗口的 50% 时，向模型注入一条系统提示：`工具输出已占用 X% 上下文（约 Y tokens），请只提炼结论，不要重复读取同一文件`。目前模型对自己还剩多少窗口**完全无知**。
4. **repeat guard 增加「相同失败结果」维度。**
   现有告警基于「参数相同」。应再加：连续 K 次工具调用返回**错误**（`exit code != 0` 或 stderr 非空），立即改判并强制注入「你已连续 K 次失败，停止重试，改用别的方法或回报阻塞」。本次 7 次告警全部无效，说明「形状相同」这个判据不够。

### 建议

5. **给子代理放行 `compress`（或至少放行一次性的窗口自检）。**
   目前 `contextTools: false` 的理由（9B 会把步数耗在 `acp_status` 上）成立，但代价是**没有任何兜底**：1.24 MB 输出、0 次压缩。折中方案：只放行 `compress`，并在 prompt 里写死触发条件（「工具输出累计超过 10 条时先 compress」）。
6. **环境手册补一条硬规则：禁止用 `IndexOf`/`Substring` 拆 JSON。**
   原文照抄：
   > 从 JSON 文件里取字段，**永远**用 `python -c "import json; ..."`，**禁止**用 PowerShell 的 `Get-Content -Raw` + `IndexOf` + `Substring` + `ConvertFrom-Json`。PowerShell 的字符串手术不会反转义 JSON 字符串，且失败时会把整个输入回显进 stderr（单条错误 10 KB 起）。
7. **提供（或指定）一个 `json-peek` 辅助脚本，并在手册里点名。**
   例如 `python tools/json_peek.py <file> --path resp_body --depth 2 --max-chars 2000`，输出「键名清单 + 每键类型 + 样例值（截断）」。让子代理**永远不直接读原始切片**，只读 digest。这类「schema 摘要」正是子代理最常需要、也最容易自己手搓失败的东西。
   本次模型的真实需求就是「catalog 的顶层键有哪些」——这正是一个 20 行脚本能一次性回答的问题。
8. **子代理硬性禁止 `read` 原始切片文件。**
   0.5~15 KB 单行的 JSON 文件，对 64K 窗口的子代理是不可用的输入形态（见 §5.1）。手册应直接写：**切片文件只能通过脚本 digest 访问，不得 `read`、不得 `grep`。**

### 主 agent 侧（我自己的问题，一并记录）

9. **单次委派必须继续切小。** 本次我把「6 个问题 × 2 个文件 × 1.2 MB 输入」塞进一次委派，同时要求「500 字输出」——输入输出比 2400:1。preset 里已有「一次最多读 2~3 个文件」的纪律，但**没有配套的「输入体量」上限**（「2~3 个文件」对 15 KB 的小文件合适，对 1 MB 的抓包切片完全失效）。建议把纪律改写为按**字节 / token** 计而非按文件个数计。
10. **发现子代理进入重复模式后应立刻 kill，而不是等它自己停。** 本次它在 125 步后由用户取消。主 agent 目前没有被通知「子代理正在重复调用」的通道——这也值得作为一个 harness 特性提出来。

---

## 8. 附：证据文件清单

| 文件 | 内容 |
|---|---|
| `local/tmp/s-d96a8a46-a5f.jsonl` | 涉事子代理会话解压后的完整 JSONL（660 行） |
| `local/tmp/catalog-trace.txt` | 该会话 125 次 tool call 的紧凑 trace（51,837 B） |
| `local/tmp/catalog-analysis.txt` | 调用签名归并结果（125 次调用 → 5 种骨架）（18,986 B） |
| `local/tmp/catalog-prompt.txt` | 子代理系统提示 + 任务 prompt + 7 次 repeat guard 注入原文（19,777 B） |
| `local/tmp/catalog-results.txt` | 代表性工具结果抽样（21,335 B） |
| `local/tmp/catalog-context.txt` | 工具输出体量统计 / marker 命中 / 相同调用串长度（1,041 tok） |

复现命令见 §1。

---

## 9. 一句话给 preset 开发者

> 这次的病不是「9B 模型笨」，而是**没有节流阀**：一条必然失败的 PowerShell 命令，因为 PowerShell 会把 10.8 KB 的输入回显进错误消息，104 次重复就往 64K 窗口里灌了 1.24 MB 逐字节相同的文本；模型每轮都被自己的错误输出挤出记忆，于是永远在「第一次」失败。
> 三行改动就能挡住：**stderr 截到 2 KB、工具结果截到 8 KB、单会话累计输出超过窗口一半时告警模型。**

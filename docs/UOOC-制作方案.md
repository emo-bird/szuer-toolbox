# UOOC 优课联盟适配 —— 制作方案（阶段 3）

> 状态：**方案待用户拍板**。本文件只描述怎么做，未写任何代码。
> 依据：4 份抓包（`local/capture/*.flow`，2026-10-05，合计 235 条请求、94 个归并端点）、
> 端点总表 `local/uooc-flow-index.txt`、切片 `local/slices/*.json`、
> 参考项目 `local/reference/`（`UOOC assistant.js` + `fuckuooc` + 小脚本）。

---

## 1. 逆向结论

### 1.1 鉴权（交接文档 V1 —— 已解答）

请求头里只有 `cookie`（约 1 KB）与 `xsrf`（**值为空**），加 `user-agent` / `referer` / `sec-fetch-*`。
**没有 token query 参数，没有 `Authorization` 头** ⇒ 纯 cookie/session。

结论：走 `unsafeWindow.fetch`（需求文档 Q-AE 已拍板）天然携带全套凭证与 `Sec-Fetch-*`，
服务端不可能认不出。**V1 无障碍，不需要额外通道。**

### 1.2 课程与目录

| 用途 | 方法 | 路径 | 关键参数 |
|---|---|---|---|
| 我学的课列表 | GET | `/home/course/list` | `keyword=&page=1&type=learn` |
| 课程信息 | GET | `/home/course/info` | `cid=` |
| 课程进度 | GET | `/home/course/progress` | `cid=` |
| 课程详情 | GET | `/home/course/{cid}`、`/course/{cid}`、`/course/new/{cid}` | — |
| **目录树** | GET | `/home/learn/getCatalogList` | `cid=`、`hidemsg_=true`、`show=` |
| **节内资源** | GET | `/home/learn/getUnitLearn` | `catalog_id=&chapter_id=&cid=&section_id=&subsection_id=0` |
| 课程概要 | GET | `/home/learn/getCourseLearn` | `cid=` |
| 学习页 HTML | GET | `/home/learn/index`（旧版）/ `/home/learn/new/{cid}`（新版） | — |

`getCatalogList` 返回**两级树**：`data[]` 是章（`_level=1`），`children[]` 是节（`_level=2`），
节点含 `id / name / number / status / finished / learning / task_id / learn_mode / children`。
实测 `cid=2042342697` 有 15 章 67 节；`cid=466490612` 有 7 章 46 节。**均无 `_level=3`。**

`getUnitLearn` 返回 `data[]` 资源条目，每个含 `id / title / type / is_task / task_id / quiz / video_url / finished`。

> ⚠️ **两套互不相干的 `type` 枚举**（最容易踩的坑）：
> - **`getUnitLearn` 的 `type`**：`10`=视频、`80`=测验、`50`=附件（实测）
> - **`/exam/view` 的 `questions[].type`**：`10`=单选、`11`=多选、`30`=填空（待补全，见 §4）
>
> 两者数字会撞车，**不要合并成一张常量表**。

### 1.3 学习进度（**修正交接文档 V2**）

实测存在进度上报：

```
POST /home/learn/markVideoLearn
body: chapter_id=57920722&cid=2042342697&hidemsg_=true&network=2&resource_id=708518541
      &section_id=1629578551&source=1&subsection_id=0&video_length=614.29&video_pos=30.01
resp: 67 B
```

交接文档 V2 记的是「站点无任何心跳上报」，**与实际不符** —— 站点按 `video_pos` 主动上报观看位置，
抓包里共 9 次。这会直接影响 U1（倍速）的取舍，见 §6 决策点 G。

### 1.4 测验（U6–U9 的核心）—— **V10 / V11 已解开**

| 用途 | 方法 | 路径 | 说明 |
|---|---|---|---|
| 任务信息 | GET | `/exam/taskInfo?tid=` | 需先有 tid |
| 试卷题目 | GET | `/exam/getTaskPaper?tid=` | 需先有 tid |
| **含正确答案** | GET | `/exam/view?cid=&tid=` | **整卷一次拿回，含 `answer`** |
| 保存作答 | POST | `/exam/save` | 留痕 |
| 交卷 | POST | `/exam/commit` | **不可逆** |
| **移出窗口记录** | POST | `/exam/out` | **反作弊埋点**（JS 注释原文「记录移出窗口」），见 §1.5 |
| 看答案页 | GET | `/exam/{tid}` → 302 → `GET /exam/paper?cid=&tid=`（HTML iframe 页） | 它是 `/exam/view` 的外壳 |

**测验 tid 的枚举链路 —— Q1 已实证结案（2026-10-05 实测）**

```
GET /home/learn/getCatalogList?cid=          → data[] 两级树（_level=1 章 / _level=2 节）
  └ 对每个「节」：
     GET /home/learn/getUnitLearn?cid=&chapter_id=章id&section_id=节id
         &catalog_id=节id&subsection_id=0&show=
       → data[] 资源条目，取 type==80（测验）的 task_id   ← 这就是 tid
  └ 每个 tid：
     GET /exam/view?cid=&tid=                 → 整卷 + 正确答案
```

**实证原文**：`getUnitLearn(cid=2042342697, chapter_id=57920722, section_id=1629578551)`
返回 `type=10` 视频 `1.1 导论 v1.mp4`（`task_id=0`）+ **`type=80` 测验 `导论`（`task_id=736720049`）**；
而同一门课的 `/exam/view?cid=2042342697&tid=736720049` 确实存在（referer `/home/learn/index`）。
⇒ **`getUnitLearn` 里 `type=80` 条目的 `task_id` 就是合法 tid，两步法成立。**

**一步法（A2）已证否**：`getCatalogList` 节节点上的 `task_id`（该课 15 个非零值，如 `1530150581`）
与真实 tid `736720049` **不相等**，两门课交叉验证均如此 ⇒ 节节点的 `task_id` 是另一种 id（疑为学习任务 id），
**不能**直接当 tid 用。

`/exam/view` 响应结构（**Q2 已实证**，两门课四条样本）：

```
{ code: 1, msg: "",
  data: {
    questions: [{
      id, course_id, section, chapter, parent, from, dir,
      question:   string          // 题干
      type:       int             // ★ 题型枚举，见下表
      type_text:  string          // ★ 题型中文（站点自带，可直接用，不必硬编码）
      is_subjective: 0|1
      level:      10|20           // 难度
      level_text: "易" | "中"
      score:      "50.00"
      tips, memo, corrector_id, grade_score,
      options_app: ...            // 移动端选项，网页端不用
      options:    {A,B,C,D} | string   // ⚠️ 形态不定！见下
      answer:     [...]           // ★ 正确答案
      student_answer: [...]
    }],
    task: {
      name, _type: "10", type: "测验",   // ⚠️ type 是中文串，不是 int
      course_title, student,             // student = 学生姓名（PII，见决策点 B）
      score: "100.00", dotime: "2026-10-05 12:28:13",
      answer_hint: "1",                  // 全是字符串 "1"，不是布尔
      answer_review: "1", allow_view_score: 1, allow_view_paper: 1
    }
} }
```

**题型枚举（实测，仅此三种见到）**

| `type` | `type_text` | `answer` 形态 | `options` 形态 |
|---|---|---|---|
| 10 | 单选题 | `["B"]` 字母 | `{A,B,C,D}` → HTML 串 |
| 11 | 多选题 | `["A","B","C","D"]` 字母数组 | `{A,B,C,D}` → HTML 串 |
| 30 | 填空题 | `['<p><span style=";font-family:宋体;font-size:19px">钢少气多</span></p>']` | **字符串 `"第1空"`**（不是 dict！） |

> ⚠️ **两个必须处理的坑**：
> 1. **填空/主观题的 `answer` 是 HTML**，落答案库前必须剥标签（实测 `student_answer` 里是干净的 `"钢少气多"`，可作对照）。
> 2. **`options` 的形态随题型变**（选择=dict，填空=字符串），代码里必须先判 `typeof`，否则 `Object.keys` 会炸。
> 3. 判断题/问答题**未在样本中出现**，编码仍未知 —— 但可用 `type_text` 兜底分支（见 Q2'）。

**看答案的开关**：`data.task` 上带 `answer_review` / `allow_view_score` / `allow_view_paper` 三个门。
本次两条样本**全部为 `"1"`（开放）**。若某门课把它们置 0，`/exam/view` 很可能**不返回 `answer`** ——
这是 U6 的**真实失败模式**，new Q6，见 §4。

**V11 解答**：一次拿**整卷**，不是一题一次。
**V10 解答**：接口路径/方法/参数/响应结构全部确认，且**响应自带正确答案** ——
这意味着 U6 不需要任何猜测（对比 `fuckuooc` 靠截图问多模态大模型 + 暴力枚举，见 §3）。

### 1.5 风控与留痕

- `GET /home/cheatrecord/getAlert?course_id=&task_type=3&relation_id={tid}` —— **作弊记录告警接口**，
  站点自己有这个埋点。抓包里 1 次，返回 29 B，referer 是 `/exam/{tid}`（**一进测验页就调**）。
- ⚠️ **`POST /exam/out` —— 「记录移出窗口」**（发现自站点自己的前端接口表，注释原文）。
  这是**反作弊埋点**：测验页检测到用户离开窗口时会往服务端记一笔。
  **与 U4 直接冲突** —— U4「允许失焦继续播放」的设计初衷就是让用户切走，
  但若该埋点在测验页生效，U4 会把用户送进作弊记录。见 **决策点 H**。
- 站点有**阿里云智能验证**（交接文档 V13）。补充抓包已解出细节：
  - 场景号 `SceneId=137o3jmc`（全场唯一），`Mode=embed`，`CaptchaType=CHECK_BOX`。
  - 流程：设备指纹（`cloudauth-device-dualstack.cn-shanghai.aliyuncs.com`，`Action=Log1|Log2`）
    → `InitCaptchaV3`（拿 `CertifyId`）→ 前端交互 → `VerifyCaptchaV3`（`CertifyId` + `CaptchaVerifyParam`）
    → `UploadLog`（行为轨迹）。
  - **仍未知**：它是「提交前拦截」还是「提交后风控二次触发」—— 补充抓包里没有 `/exam/commit`，
    且该次抓包**根本没有 `www.uooc.net.cn` 的 API 主机**。需按 Q4 补抓。
- `/exam/save`（保存）与 `/exam/commit`（交卷）都留痕；`/exam/view` 与 `/exam/taskInfo` 是纯读。

---

## 2. 关键发现汇总

| # | 发现 | 对既有文档的影响 |
|---|---|---|
| 1 | 鉴权纯 cookie，`xsrf` 头为空 | V1 关闭；Q-AE 的 `unsafeWindow.fetch` 决策**正确且足够** |
| 2 | 进度确有 `POST /home/learn/markVideoLearn` 上报 | **修正 V2** |
| 3 | `/exam/view` 直接返回 `answer` 正确答案数组 | **V10/V11 关闭**；U6 从「猜测」变成「直读」 |
| 4 | **新版与旧版共用同一套 `/home/learn/*` 接口** | 逆向层可完全共享，只有 DOM 层要分两套（见 §5.1） |
| 5 | `getUnitLearn.type` 与 `questions[].type` 是两套枚举 | 新增坑，必须分开建常量表 |
| 6 | `header` 已有 `@match *://*.uooc.net.cn/*` 且**带 `@noframes`** | 试卷在 iframe 内（`/exam/paper`），同源可 `contentDocument`，但 `@noframes` 意味着**脚本不在 iframe 内运行**，U7/U8 必须从顶层页操作 iframe |
| 7 | 存在 `/home/cheatrecord/getAlert` 作弊告警接口 | 风控确凿，U8 必须严守「手动启动 + 二次确认」 |
| 8 | **Q1 结案**：两步法**实证**（`getUnitLearn` 的 `type=80.task_id` = 真 tid `736720049`）；catalog 节 `task_id` **证否** | **决策点 A 敲定为 A1**，Q1 从待办移除 |
| 9 | **Q2 结案**：题型仅见 `10` 单选 / `11` 多选 / `30` 填空，且**站点自带 `type_text` 中文** | 不必硬编码编码表，用 `type` + `type_text` 兜底 |
| 10 | 填空/主观题的 `answer` 是 **HTML**；`options` 形态**随题型变**（选择=dict / 填空=字符串） | 答案库必须做题型归一化，代码先判 `typeof` |
| 11 | **`POST /exam/out`「记录移出窗口」反作弊埋点**（站点自己前端里的注释原文） | ⚠️ **与 U4 直接冲突** —— 新增**决策点 H** |
| 12 | 从站点前端 JS 抽得 **437 条全站接口表**（含方法名/路径/方法/中文注释） | 落盘 `local/uooc-js-endpoint-table.txt`，以后不用再猜接口 |
| 13 | 看答案受 `task.answer_review` / `allow_view_score` / `allow_view_paper` 三个门控制 | U6 的真实失败模式，new **Q6** |

---

## 3. 参考项目对标结论

### 3.1 `UOOC assistant.js`（油猴脚本 v1.0.8，52 KB）

| 需求 | 它怎么做的 | 可复用度 |
|---|---|---|
| U1 二倍速 | `video.playbackRate = 2.0`，选择器 `#player_html5_api` | 直接可用 |
| U3 连播 | `video.onended = findNextVideo`，从 `.basic.active` 出发用状态机在目录树里找下一节点（`span.icon-video`） | **手法可抄** |
| U4 失焦 | **没有监听 focus/visibility**；用 `video.onpause = () => this.play()` 抢播 | 手法可抄但有副作用 |
| U5 多窗口 | **未实现** | — |
| U6 记录答案 | **未实现**。只在 iframe 里 `frames[0].document.querySelectorAll('.queItems')` 抄**已判分文本**到剪贴板，不是正确答案 | 不可用 |
| U7 回填 | `quizOptions.children[ans.charCodeAt()-65].click()`，答案来自 `div[uooc-video]` 的 `source` 属性里 `source.quiz`（**视频内嵌弹窗测验**） | 部分可用 |
| U8 提交 | 弹窗测验 `quizLayer.querySelector('button').click()` | 部分可用 |
| U9 LLM | `POST {baseUrl}/chat/completions`，题面**从 DOM 爬**（`.queContainer`/`.ti-q-c`/`.ti-a`），正则 `^(\d+)\.\s*([A-Z,]+)$` 解析 | 交互可抄，题面源要换 |

它做对的、值得抄的：面板插入前先把 `.learn-head` 原有子元素搬到 `#head-content-wrapper`（不破坏原页面）；
`GM_getValue` 外面套 `try/catch` 回退 `localStorage`。

### 3.2 `fuckuooc`（Node + Playwright 工程）

**核心事实：它一个 `/home/learn/*` 或 `/exam/*` 接口都没调过。** 全程 DOM 操作 + 截图。
唯一 HTTP 请求是火山方舟多模态大模型。

| 需求 | 它怎么做的 |
|---|---|
| U1/U2 | `page.evaluate` 设 `playbackRate=2.0` / `muted=true`；每 2.5 s 轮询 `currentTime/duration > 0.985` 判定看完 |
| U3 | `.catalogItem` / `.basic.uncomplete` 找下一个未完成节点并点击 |
| U4 | 未实现（只有 `if (v.paused) v.play()`） |
| U5 | `context.newPage()` + `Promise.race()` 并发池 |
| U6 | **未实现**。答案靠 `recognizeWithRetry` 每题截图 → 多模态大模型**猜**；模型返回空就**随机选一个**；多次不通过就走 `bruteForceWrongQuestions` **暴力枚举选项组合**（多选按 `2^n-1` 个子集从小到大）逐个提交直到通过 |
| U7/U8 | `applyAnswers` 点选项、`submitAndCheck` 提交、`confirmQuizSubmission` 检测 `.layui-layer-content:has-text("测验通过")` |
| U9 | 就是它的唯一答题方式（多模态识图） |

**必须避开的坑**：答案无权威来源、空答案随机填、暴力枚举每次都要完整交卷（大量留痕、
6+ 选项多选题组合爆炸）；`原理.md` 记录它要移除 `navigator.webdriver`、伪装 `navigator.plugins`、
模拟鼠标轨迹 + 100~300 ms 随机延迟来对付**阿里云智能验证**；`原理.md` **没有任何封号风险提示**
（因为它只做 DOM，不打接口 —— 这一点对我们**没有参考价值**，我们的方案要打接口）。

### 3.3 小脚本 `uooc防止失去焦点，自动二倍数播放.js`
就是 U1 + U4 的极简版。

---

## 4. 待证实事项与需要补的数据

| # | 待证实 | 影响 | 需要什么数据 |
|---|---|---|---|
| ~~Q1~~ | ~~节节点 `task_id` 是否就是测验 tid~~ | — | **✅ 已实证结案（否定）**：两步法成立、一步法证否，见 §1.4 |
| ~~Q2~~ | ~~`questions[].type` 全集~~ | — | **✅ 已实证结案**：10 单选 / 11 多选 / 30 填空，`type_text` 可用，见 §1.4 |
| Q3 | `catalog_id` 参数到底该传什么：站点自己发过 `catalog_id=节id` 也发过 `catalog_id=0`，两种都返回 200 | 传错可能静默返回空数组 | 无需补数据，实现时按 `节id` 传并做空响应告警 |
| Q4 | 页面内脚本调 `/exam/commit` 会不会触发阿里云智能验证（`SceneId=137o3jmc`） | U8 可行性 | **不做自动化测试**（N6），留用户手测 |
| Q5 | `questions[].answer` 在**未作答**的测验上是否也返回（即「只能拉已完成测验」是否成立） | 决定 U6 能否预取未做的卷 | 抓包里那两条都是已完成的。需要一次**未作答测验**的 `/exam/view` |
| **Q6**（新） | 当 `task.answer_review='0'` / `allow_view_paper=0` 时，`/exam/view` 是否**照样返回 `answer`** | U6 的**真实失败模式** —— 若被门挡，则只能拉「站点允许看答案」的测验 | 一门**关闭了答案回顾**的课的 `/exam/view` |
| **Q7**（新） | catalog 节节点的 `task_id`（如 `1530150581`）**到底是什么 id** | 若它其实是「章节学习任务 id」，也许能反过来一步问出 tid | 低优先，A1 已可用，不值得专门补抓 |

> **Q1 / Q2 已由现有抓包实测结案，不再需要补数据。**
> 仍需补抓的只有 **Q5 / Q6**：一次**未作答测验**（或**关闭了答案回顾的测验**）的 `/exam/view`。
> 补抓最小操作：开着 mitmweb 打开那门课的某个测验页面看一眼（**不点提交**），存 .flow。
>
> **另外一份比 Q5/Q6 更值钱的补抓**（见 §6 决策点 A 的补充说明）：
> **一次「在测验页切走窗口再切回」的抓包** —— 用来确认 `POST /exam/out` 到底什么时候被触发，
> 这直接决定 U4 能不能在测验页生效（决策点 H）。

---

## 5. 架构方案

### 5.1 目录结构（提案）

```
src/sites/uooc/
  index.ts            # 适配器：hosts / pages / tabs / toggles（改造现有空壳）
  api.ts              # 接口层：全部走 common/core/http 的 request()，只负责拼参数 + 类型
  answers-model.ts    # 答案库的数据模型（纯函数，可单测）
  answers.ts          # U6 采集编排（枚举 tid → 拉 /exam/view → 入库 → 导出）
  legacy/             # 旧版 DOM 层（学习页 /home/learn/index）
    dom.ts            #   选择器常量
    player.ts         #   U1 倍速 / U2 禁音 / U4 失焦
    autoplay.ts       #   U3 连播状态机
    quiz-fill.ts      #   U7 回填 / U8 提交（操作 iframe）
  modern/             # 新版 DOM 层（/home/learn/new/{cid}），同结构，选择器另一套
    ...
  tabs/               # 标签页
    answers.ts        #   测验答案（U6 导出 / U7 加载）
    player.ts         #   播放控制（U1–U5）
```

**为什么 `api.ts` 提到公共层**（发现 #4）：新旧版共用同一套 `/home/learn/*` 与 `/exam/*` 接口，
所以逆向层不该复制两份。DOM 层才分 `legacy/` `modern/`。

**`pages` 必须从空数组改成精确通配**（现为空 = 任意页面都自动展开）：
提议 `['/home/learn/*', '/exam/*', '/home/exam/*', '/home/course/exam/*', '/home/course/*']`。

### 5.2 数据流

```
U6 采集（🟢 只读）
  getCatalogList(cid)
    → [候选 tid]                      ← 路径取决于 Q1 的结论
    → getUnitLearn(每节) → type==80 → task_id
  for tid: GET /exam/view?cid=&tid=
    → 抽 questions[]：{type, type_text, question, options, answer}
    → 归一化答案：answer 数组 → 排序后的字母串（"ABD"）
    → 写入答案库（按 cid 分桶，按 tid 存）
    → 可导出 JSON（默认剔除 PII，见决策点 B）
  ※ 全程走 common/core/http 串行队列，默认 500 ms 间隔

U7 加载 / U8 提交（🔴 不可逆）
  当前试卷 → 取 tid → 查答案库
    → 命中：按题型回填（选择/多选点选项；填空填 input；判断点选项）
    → 未命中：toast 提示「无答案记录」，不猜
    → U8：二次确认 → POST /exam/commit
```

### 5.3 答案库存储格式（✅ 已按决策 C 定稿）

命名空间 `uooc`（`scoped()` 已有）。**内部存储**：每门课一条记录 ——
`answers:{cid}` = `{ [tid]: { name, updatedAt, questions: [...] } }`。
（一次读写一门课、`GM_listValues` 干净；15 份卷 ≈ 100 KB 级，对 GM 存储无压力。）

**导出形式（用户拍板）：每门课导出成一个独立的 `.json` 文件**，文件名建议
`uooc-answers-{cid}.json`（`{cid}` 前可加课程名 slug，如 `uooc-answers-2042342697-国家安全教育.json`）。

**导出 JSON 形态（定稿）**：

```json
{
  "cid": "2042342697", "exportedAt": "2026-10-05T...",
  "courseTitle": "...",
  "papers": [
    { "tid": "736720049", "name": "导论", "score": "100.00", "dotime": "2026-10-05 12:28:13",
      "questions": [ { "type": 10, "typeText": "单选题", "question": "…",
                       "options": {"A":"…"}, "answer": ["B"] } ] }
  ]
}
```

> `task.student`（学生姓名）与 `uid` **不出现在导出里**（决策 B）。
> ⚠️ **填空题的 `answer` 是 HTML**，导出前必须归一化（剥标签）；选择题是字母数组。
> ⚠️ `type=80` 是资源条目的题型，`questions[].type` 是另一套枚举 —— **两套常量表必须分开**（发现 #5）。

### 5.4 风险分级与门禁

| 需求 | 分级 | 门禁 |
|---|---|---|
| U1 U2 U4 | 🟢 safe | 默认开 |
| U3 连播 | 🟠 trace | 默认关 + 复选框 |
| U5 多窗口 | 🟠 trace | 默认关 + 复选框 |
| U6 采集答案 | 🟠 trace（**只读但连续请求**） | 默认关 + 复选框 |
| U7 加载答案 | 🟢 safe（只回填不提交） | 默认关 + 复选框 |
| U8 自动提交 | 🔴 irreversible | 默认关 + 复选框 + **二次确认** |
| U9 LLM 作答 | 🔴 irreversible（会写答案） | 默认关 + 复选框 + 二次确认 |

**N5 落实**：U6 采集不做定时器常驻，只能手动点「开始采集」；U8 绝不自动触发。
**N2 落实**：走 `common/core/http` 队列，默认 500 ms；用户可在设置里下调到 200 ms（软提示）。
**N4 落实**：`/exam/view` 响应结构若与预期不符 → 全量落档 + 日志告警，不静默跳过。

---

## 6. 决策点（**✅ 已于 2026-10-05 拍板**）

### 6.0 拍板结果汇总

| # | 决策 | **用户选定** | 备注 |
|---|---|---|---|
| A | 枚举手法 | **A1 + 节预筛** | 两步法，只对 `task_id≠0` 的节问 `getUnitLearn` |
| B | 导出 PII | **剔除 `task.student`（姓名）与 `uid`，保留 `cid`/`tid`** | |
| C | 答案库粒度 | **导出为「每门课一份 JSON 文件」** | 用户自定表述；内部存储同样按课组织 |
| D | U4 实现 | **抄参考脚本：无条件抢播** | ⚠️ 用户明确否决 D2 推荐，见下「后果」 |
| E | 目录结构 | **`api.ts` 共享 + `legacy/` / `modern/` 各自 DOM 层** | |
| F | U1 与进度上报 | **只改播放速率，不介入上报；UI 写明「进度上报由站点负责」** | |
| G | 提交方式 | **开新分支 `feat/uooc-phase3` 提交** | 已执行 |
| H | U4 在测验页 | **H1：U4 只在学习页（`/home/learn/*`）生效，测验页（`/exam/*`）禁用** | 避开 `POST /exam/out` 留痕 |

> **决策 D 的后果（用户已知悉并选择接受）**：D1「无条件抢播」意味着
> **用户自己主动按暂停也会被脚本立刻恢复播放**。可用的逃生口是 **关掉 U4 开关本身**
> （U4 是 `SiteToggleDef`，默认关、显式勾选才启用）—— 所以 UI 上必须把 U4 的
> `label`/`desc` 写清楚「开启后无法手动暂停，要暂停请先关闭本开关」。
> 与决策 H 合并后的最终语义：**U4 只在 `/home/learn/*` 下无条件抢播；`/exam/*` 下一律不生效。**



### A. 测验 tid 的枚举手法 —— **✅ 已由实测结案，A1**
- **A1 两步法（结论：采用）**：`getCatalogList` → 每节 `getUnitLearn` → 取 `type==80` 的 `task_id`。
  **已实证**（§1.4）：`getUnitLearn` 返回的 `type=80.task_id = 736720049` 就是该课真实 tid。
  代价是一门 67 节的课要 67 次请求（约 34 s @500 ms）。
- ~~**A2 一步法**~~：**已证否**。该课 catalog 的 15 个 `task_id` 与真实 tid `736720049` 无一相等，
  两门课交叉验证一致 ⇒ 节节点的 `task_id` 不是测验 tid。
- ~~**A3 混合**~~：**不需要**。A3 的存在前提是 A2 可能成立；A2 既已证否，A3 只会白多 15 次留痕请求。

> **优化空间（非决策点，实现时注意）**：67 次请求是为了**发现 tid**。但用户实际只需要
> 「**这门课有哪些测验**」这个列表 —— 可以对 `getUnitLearn` 加**本地缓存**（按 `cid + 章id + 节id`
> 存 GM，带 TTL），第二次打开同一门课就零请求。这既省时间又降低风控暴露面。
> 另外 `getCatalogList` 已经给了整棵目录树，**只有带 `task_id` 非零的节**才需要问
> `getUnitLearn`（该课 15 个节 ⇒ 实际只要 15 次，不是 67 次）。**这一优化直接砍掉 78% 的请求**，
> 且不依赖任何未证实假设（仅仅是个过滤器）。→ 实际方案 = **A1 + 节预筛**：

```
getCatalogList(cid)
  → 收集「章节点」与「节节点」的 id（含 number 编号）
  → 只对「_level=2 且 task_id 非 0」的节发起 getUnitLearn   ← 15 次而非 67 次
  → type==80 的 task_id = tid
```

（注意：这个过滤器**只是省请求**，不代表节 `task_id` = 测验 tid —— 那是 A2，已证否。
它的作用是「该节含任务资源」这一必要条件。）

### B. 导出 JSON 里的个人信息
- **B1（推荐）**：导出时剔除 `task.student`（姓名）、`uid`；`cid`/`tid` 保留（否则答案库没法复用）。
- **B2**：原样保留，导出文件由用户自己保管。
- **B3**：保留但打码成 `张*`。
- 推荐 B1 的理由：这些字段对「复用答案」零价值，而导出文件很可能被贴进聊天/进 git。

### C. 答案库存储格式
- **C1（推荐）**：每课一条记录（见 §5.3 D1）。
- **C2**：每卷一条 key。
- 推荐 C1 的理由：导出一门课只需一次读；15 份卷的体量对 GM 存储毫无压力。

### D. U4「失焦继续播放」的实现方式
- **D1**：抄参考脚本 —— `video.onpause = () => play()` 无条件抢播。
  简单，但**用户自己按暂停也会被立刻恢复**，很烦。
- **D2（推荐）**：只在 `document.hidden` / `window.blur` 期间挂抢播，回到前台自动摘掉；
  再加 `video.playbackRate` 在失焦回来后被站点重置的守护。
- **D3**：优先用 videojs 播放器实例 API，拿不到再退 D2。
- 推荐 D2 的理由：直接满足 U4 的意图（失焦别停），且不破坏正常暂停；D3 要先确认新版页用的是哪种播放器。

### E. 目录结构（§5.1）
- **E1（推荐）**：`api.ts` 共享 + `legacy/` `modern/` 只放 DOM 层。
- **E2**：新旧版各自完整一套（含 api）。
- 推荐 E1 的理由：发现 #4 已证明两版接口同源，E2 会让接口定义漂移。

### F. U1 倍速与站点进度上报的关系（发现 #2 引出）
站点自己按 `video_pos` 上报进度。2 倍速下的语义要用户定：
- **F1**：不干预，站点以自己的节奏上报（最省事，但 2 倍速下「看到 50% 就上报了 100% 的语义」由站点自己决定）。
- **F2**：倍速时按倍率补偿 —— 需要我们**自己发** `markVideoLearn`（等于替站点上报，风险等级上升）。
- **F3**：倍速只改播放速率，其余一概不管，并在设置里写明「进度上报由站点负责，本脚本不介入」。
- **我的推荐：F3**。理由：F2 等于替用户刷课，越界且留痕；F1 与 F3 实现上等价，F3 只是把这个边界**写在 UI 上**让用户知情，避免日后误以为是脚本在记账。

### G. 方案文档的提交方式
- **G1（推荐）**：开新分支 `feat/uooc-phase3` 提交本方案（当前分支是 `feat/bkxk-tasks-monitor`，主题不符）。
- **G2**：先留在工作树不提交，等方案拍板后连同第一批实现一起提交。

### H. ⚠️ U4「失焦继续播放」与 `/exam/out` 反作弊埋点的冲突（**新增，必须拍板**）
- **背景**：站点前端自己的接口表里有 `"examOut": "/exam/out,POST", // 记录移出窗口`。
  即**测验页检测到用户离开窗口会往服务端记一笔**。而 U4 的设计初衷正是让用户切走窗口。
- **H1**：**U4 只在学习页（`/home/learn/*`）生效，测验页（`/exam/*`）一律不生效**。
  代价：测验页失焦会暂停无法抢播；但测验页本来也没有视频可播，实际无损失。
- **H2**：U4 全站生效，不管 `/exam/out`。代价：**可能把用户送进作弊记录**。
- **H3**：U4 全站生效，但检测到 `/exam/out` 被站点发出时**弹窗警告用户**并从该页起自动停用 U4。
- **我的推荐：H1**。理由：`/exam/out` 这个埋点的存在本身就说明站点会记录，
  而 U4 在测验页**没有任何收益**（测验页没有视频）；H2 是拿真实风险换零收益，不划算。
  H3 更聪明但需要「何时被触发」的抓包来确认，可作为后续增强。
- **待补数据**：一次「在测验页切走窗口再切回」的抓包，用来确认 `/exam/out` 的实际触发条件
  （是 `blur` 即触发，还是切走超过 N 秒才触发）。这一条决定 H1 的边界画在哪里。

---

## 7. 分阶段实施计划（拍板后执行）

| 阶段 | 内容 | 交付 |
|---|---|---|
| P0 | ~~补 Q1/Q2 抓包~~（已实测结案）、~~拍板决策点 A–H~~（**已完成**）、补 Q5/Q6 与 `/exam/out` 触发条件抓包 | — |
| P1 | `api.ts` + 目录/资源/测验接口的类型与封装；`pages` 改精确通配 | 单测：响应解析纯函数 |
| P2 | **U1 U2 U4**（🟢，旧版优先）+ 面板标签页骨架 | 手测清单 #156 起 |
| P3 | **U3** 连播状态机（抄参考脚本思路） | 手测 |
| P4 | **U5** 多窗口 | 手测 |
| P5 | **U6** 答案采集 + 导出（🟠） | 档2 契约冒烟（只读接口可测）|
| P6 | **U7** 回填（🟢）+ **U8** 提交（🔴 二次确认，**不自动化测试**） | 手测 |
| P7 | **U9** LLM 作答（🔴，需另开跨域出口，见下） | 手测 |
| P8 | 新版 `modern/` DOM 层对齐 | 手测 |

> **U9 的已知障碍**：`common/core/http.ts` 顶部注释已写明 —— 统一走页面 fetch 意味着**调外部 LLM 会撞 CORS**，
> 届时需要「另开出口」（GM 通道），且**不要在调用方偷偷绕**。这是 P7 才需要解决的独立决策点，
> 届时单独提方案给用户。

---

## 8. 测试计划

- **档1 纯函数冒烟**（`npm test`）：`answers-model.ts` 的答案归一化（`["A","B"]` → `"AB"`）、
  题型分发、catalog→候选 tid 的推导、导出 JSON 的 PII 剔除 —— 全部用**脱敏 fixture**，不碰网络。
- **档2 接口契约冒烟**：**只对只读接口**（`getCatalogList` / `getUnitLearn` / `/exam/view`）
  验状态码、关键字段存在性、缺参报错。**`/exam/save`、`/exam/commit` 与任何风险接口一律不测**（N6）。
- **档3 UI 手测**：由用户执行，我提供固定格式清单（动作 / 预期 / 失败贴回什么）。从 **#156** 起编号。

---

## 9. 未决 / 风险登记

| # | 项 | 状态 |
|---|---|---|
| 1 | ~~Q1（catalog `task_id` 是否 = 测验 tid）~~ | **✅ 已实证结案（否定）**，见 §1.4 |
| 2 | ~~Q2（题型全集）~~ | **✅ 已实证结案**：10/11/30，见 §1.4 |
| 3 | Q5（未作答测验的 `/exam/view` 有没有 answer） | 等用户补抓包 |
| 4 | **Q6（`answer_review=0` 时是否还返回 `answer`）** | 等用户补抓包 —— U6 的真实失败模式 |
| 5 | **`/exam/out` 的触发条件，以及 U4 在测验页的取舍** | 等用户补抓包 + 拍板**决策点 H** |
| 6 | 阿里云智能验证（`SceneId=137o3jmc`）对 `/exam/commit` 的影响 | 未知，用户手测 |
| 7 | `@noframes` 下操作试卷 iframe 的可行性 | 同源，理论可行，待实测 |
| 8 | U9 的跨域 LLM 出口 | P7 时单独决策 |
| 9 | 新版页 DOM 是否与旧版共用 `/home/learn/*` 之外的新接口 | 抓包显示共用，待新版实测复核 |
| 10 | 填空/主观题 `answer` 的 HTML 归一化规则 | 需覆盖多种 HTML 形态（`<p><span style>` 仅是样本之一） |

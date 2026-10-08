# UOOC 自动连播（U3）与 AI 答题 — 需求细则

> **2026-10-08 整份重写**（分支 `feat/uooc-old-version`）。
>
> 上一版以「**调目录接口预知下一课** + 起点补正 / learning 链续接 / 超时对齐」为核心，
> 那一整套**已全部作废**，旧内容见 git 历史（`feat/uooc-autoplay` 分支）。
>
> 本版只做一件事：**只适配旧版课程页**（`/home/learn/index#/...`）。
> 新版课程页一律不接管，只弹一个「要不要切到旧版」的全屏提示。
>
> **来源**：用户 m04485 的转向要求 + 四轮问答打磨（第一轮 m04610 / 第二轮 m04620 /
> 第三轮 m04630 / 第四轮 m04647）。文档里每条口径都能对上其中一轮。
>
> 状态：**待用户复核后开工**。复核通过前不动产品代码。

---

# A. 版本判定与切换

## A.1 两版 URL 形状（实测）

| | pathname | 实测例子 |
|---|---|---|
| **旧版**学习页 | `/home/learn/index` | `/home/learn/index#/2005836044/60253051/1243934256/1329393450/section` |
| **新版**学习页 | `/home/learn/new/{cid}` | `/home/learn/new/2042342697#/...` |
| 答题页 | `/exam/paper` | `/exam/paper?cid=2005836044&tid=153728628` |

**判定只看 `location.pathname` 前缀**，hash 不参与：

- 旧版 → `startsWith('/home/learn/index')`
- 新版 → `startsWith('/home/learn/new/')`
- 答题页 → `startsWith('/exam/')`

旧版 hash 的形状（实测，四段 + 一段常量）：
`#/{cid}/{chapterId}/{sectionId}/{sourceId}/section`，四级叶子（point）走 `.../subsection`。

## A.2 新版学习页：全屏提示「要不要切到旧版」

- **每次**打开新版课程页都弹（**不记忆、不写存储**，「否」只对本次生效）。
- 形态：全屏遮罩 + 居中框 + 标题 + 正文 + 底部两按钮
  （复用 `src/common/ui/widgets/confirm.ts` 的 `showConfirm`；它已支持 Esc / 点遮罩取消）。
- 文案：

  | | 内容 |
  |---|---|
  | 标题 | `检测到新版课程页` |
  | 正文 | `本插件只适配旧版课程页，是否切换到旧版？` |
  | 主按钮 | `切换到旧版` |
  | 次按钮 | `不用，我自己看` |

- **点主按钮** → 拼旧版 URL 并**整页跳转**（`location.href = …`）：

  ```
  /home/learn/new/2042342697#/1/2/3
        ↓ 只换 pathname 前缀，丢掉 {cid}，hash 原样保留
  /home/learn/index#/1/2/3
  ```

  规则：`pathname` 从 `/home/learn/new/...` 换成 `/home/learn/index`；**hash 一个字符都不动**。
  - ⚠️ hash 为空（`/home/learn/new/2042342697` 后面什么都没有）→ 跳 `/home/learn/index`（旧版首页会自己选课）。
  - ⚠️ **不依赖站点自己的那个「旧版」入口**（用户第二轮拍板：自己拼 URL，更有把握）。

- **点次按钮** → 关掉提示，**挂面板但完全不启动任何 UOOC 功能**：
  - 不起连播、不起视频助手、**不装接口嗅探**。
  - 面板里**什么都不留**（不给「切到旧版」按钮，不留任何提示）。
- ⇒ 新版页上的插件 = **一个空面板**。

## A.3 旧版学习页：全部功能正常

命中 `/home/learn/index` → 照常启动：

| 功能 | 来源 | 本次是否改 |
|---|---|---|
| 二倍速 / 静音 / 防失焦暂停 | `src/sites/uooc/video.ts` | ❌ 不动 |
| 自动连播 | §B（**整段重写**） | ✅ 重写 |
| AI 答题 | §C（**保留**） | 仅补 §D 填空题 |
| 接口嗅探 `intercept.ts` | `src/sites/uooc/intercept.ts` | ⚠️ **不再整份删**：监视页要拦目录树算进度、§C.5 要拦 `/exam/commit` 响应。**留用 + 扩写**，详见 §E.3 |

## A.4 测验：页内 iframe，**不跳转**

用户原话：「**点击 dom 后页面上就会出现答题页的 iframe，直接操作 iframe 就可以，不用跳转**」。

- 旧版点测验资源 ⇒ **主区域换成答题 iframe**，
  **目录还在左边、仍然可点**（用户已确认：「替换主区域，目录仍可点」）。
- ⇒ **不整页跳转、不拼 URL、不需要「交接条」**。`ai/handoff.ts` 那套是给
  「整页跳转、跨页面接力」设计的，旧版从头到尾同一个页面，没有这回事。见 §E.1。
- 于是 `/exam/*` 作为**顶级页面**只属于新版流程；本站适配范围（旧版）不涉及。
  （适配器的 `pages` 因此**不再列 `/exam/*`**，见 `src/sites/uooc/index.ts`。）
- ⚠️ iframe 是**同源**的（`ai/fill.ts` 的 `collectRoots()` 能扫到它），所以 DOM 操作没问题。

### A.4.1 `tid` 从哪来 —— **从 iframe 的 `src` 里读**（m05858 修正）

> 原文这里写的是「**不需要 `tid`**」，**写过头了**，已按用户 m05858 的实测修正。

用户 m05858 给出的真实 iframe 地址：

```
https://www.uooc.net.cn/exam/1208164042      ← 没有查询参数，数字在路径里
```

抓包侧对上（`local/uooc-flow-index.txt:24 / :140 / :48 / :49`，同一个测验连着四发）：

```
GET /exam/736720049                          200 / 302
GET /exam/taskInfo?tid=736720049             200  application/json
GET /exam/getTaskPaper?tid=736720049         200  application/json
```

⇒ 路径末段那个数字**就是 `tid`**，站点自己紧接着就拿它去 `getTaskPaper` 了。

- 所以：`tid` **白写在答题 iframe 的地址里**，连播不需要预先知道、也不需要跨页面传递
  —— §A.4 那句「不需要交接」的真意在此。
- `tidFromLocation()` **两种形状都认**（`ai/index.ts`）：
  `/exam/{tid}`（页内 iframe 走这条）与 `/exam/paper?cid=&tid=`（整页形态）。
- `quizTidOnPage()`：**先扫 `iframe[src*="/exam/"]`**，扫不到再退回当前地址。
- ⚠️ **仍然走 `fetchPaper(tid)` 接口拉题**，不是「从 iframe 的 DOM 里读题」。
  理由：接口给得出**每题满分 `score`** 与 `student_answer`，而 §C.5「按 `score_list`
  挑低分题重答」必须要前者；纯 DOM 读题拿不到满分，只能退化成「按分数升序」。

---

# B. 自动连播（**纯 DOM 点击**）

## B.0 总原则（用户原话精神）

> 「**忘掉前面的各种检测方案，各种接续方案，全程模拟用户点击，一个一个点开这样最符合我的预期，
> 点开后（进入网页后）再检测当前页是什么，根据是什么来决定接下来的操作。**」

三条硬约束：

1. **不调任何目录接口。** `getCatalogList` / `getUnitLearn` / `learning` 链 —— 一律不碰。
   因此连播导航本身不再用接口；但 `src/sites/uooc/intercept.ts` **不整份删**
   （§C.5 要拦 `/exam/commit` 响应、监视页要拦目录树算进度），见 §E.3。
   `catalog.ts` 的接口模型（解析 / 展平 / 拼 URL）整份作废，只留类型字典。
2. **下一项从当前 DOM 里现取**，不预知、不缓存。
3. **判定发生在「点开之后」**：先点 → 等页面变 → 再看当前页是什么 → 决定动作。

## B.1 目录 DOM 结构（旧版，实测）

容器：`div.panel > div.panel-catalog > ul.rank-1`（`.catalogItem × 10`、`.basic × 16`、`li × 27`）。

```
ul.rank-1
  li.catalogItem#<chapterId>              ng-repeat="chapterItem in chapterList"
    div.basic.chapter(.complete|.uncomplete)   ← 章。ng-click="toggleChapter(chapterItem)"
                                               href="#/{cid}/{chapterId}"
      div.cstatus
      span.oneline > span(章号) + 章名
      i.iconfont.icon-xiangshang/.icon-xiangxia
    ul.rank-2
        
ng-if="!chapterItem.hide && stateParams.chapterId == chapterItem.id"   ← ⚠️ 只有「当前章」才渲染
      li#<sectionId>                        ng-repeat="sectionItem in chapterItem.children"
        div.basic(.uncomplete)              ← 节。ng-click="toggleChapter(sectionItem)"
                                               href="#/{cid}/{chapterId}/{sectionId}"
          div.oneline(.active)
          i.iconfont…
        div.resourcelist                    ⚠️ 只有「当前节」才渲染
          
ng-if="!sectionItem.hide && stateParams.sectionId == sectionItem.id && showSourceList(sectionItem)"
          div.basic(.active)(.complete)     ← 资源。ng-click="goSource(source, 'section')"
                                               ng-class="{ complete: source.finished == 1 && source.is_task == 1,
                                                           active: stateParams.sourceId == … }"
          (里面有 span.icon-video 之类的类型图标)
        ul.rank-3                           ← 四级叶子（point），点击是 goSource(source, 'subsection')
          
ng-if="!sectionItem.hide && stateParams.sectionId == sectionItem.id"
```

**三条直接后果**（后面所有设计都建立在这上面）：

1. **目录按当前路由懒渲染**：DOM 里永远只有「全部章 + 当前章的节 + 当前节的资源」。
   ⇒「点下一章」**不可能一步到位**：必须先把那一章点开，等它渲染出 `ul.rank-2`，再去点第一个节。
2. **「当前项」有现成信号**：章 / 节 / 资源三级的当前项都在自己的 `div.basic` 上挂 `.active`。
3. ⚠️ **资源的「已完成」标记只在 `is_task == 1` 时才挂**（`complete: source.finished == 1 && source.is_task == 1`）
   ⇒ 普通视频、附件这类**可能根本没有 `.complete` 标记**。见 §B.4 的处理口径。

## B.2 导航算法

### B.2.1 起点

- DOM 上有 `.active` 的**资源行** → **就从它开始**（用户第一轮拍板：「从站点标出的当前项开始」）。
- ⚠️ **DOM 上找不到任何 `.active` → 停下等你**（用户第四轮拍板）：
  状态行显示「目录里没有「当前项」标记 —— 请你先点开一节，脚本会跟着你走」。
  **不自己猜第一个未完成的**。
- 实现上是一次「光标」`cursor = { chapterId, sectionId, resourceIdx }`：章 / 节的 id 从 DOM 上
  的 `li.id` 取，`resourceIdx` 是本节第几个资源行。-1 表示「这一节刚展开、还没点过任何行」。
  每轮从渲染结果现推，**不缓存下标**。

### B.2.2 「当前项」怎么认 —— **`active_pick`**（m06126 拍板）

`.active` 有**三个不同来源**，直接 `document.querySelector('.active')` 会被播放器抢走
（视频播放中会多出 `span.vjs-source-cdn-item.active` 与 `span.vjs-menu-content.active`）。
所以**只在目录区 `div.panel-catalog ul.rank-1` 内找**，优先级：

1. 资源行 `div.resourcelist > div.basic.active` —— 视频 / 文本 / 测验打开时都有；
2. 节级 `div.oneline.active` —— 打开**附件**时只有这个（四级 point 级），资源行**不挂** `.active`；
3. 都没有 → 用光标记住的那一行兜底。

⚠️ 另一条硬事实：**`.basic` 是章标题 / 节标题 / 资源行三者共用的类**，
`classList.contains('basic')` 分不出「目录」和「任务点」。区分只能靠
「父元素是不是 `div.resourcelist`」或「有没有 `.chapter`」。

### B.2.3 「下一项」的取法（三级回退）

每次往前走时**重新读一遍 DOM**，按顺序试：

1. **同节的下一个资源行**：当前 `div.resourcelist` 内、当前行后面的下一个 `div.basic` → 点它。
2. 本节到底了 → **同章的下一个节**：点那个**节标题**
   `div.basic[ng-click="toggleChapter(sectionItem)"]` —— 点了它 `div.resourcelist` 才会渲染出来
   （懒渲染），下一轮再从它的第一行开始。
3. 本章到底了 → **下一章**：点 `div.basic.chapter`，等 `ul.rank-2` 渲染出来，
   下一轮再从它的第一节开始。
4. 都没有了 → 状态行「已经是最后一章最后一节，连播结束」，连播停止。

一路走过的行里，**认得出 `complete` 的（含整章 / 整节）直接掠过**；
本节内已处理过的行记在 `handled` 集合里，不会再被选中。

⚠️ 全流程**没有范围上限**（旧的 `nextScope`「止于本章 / 跨章继续」已废，用户 m00971 拍板）——
一路播到目录末尾。

### B.2.4 「点开 + 展开」的通用动作

```
activate(el):
  1. el.click()                     ← 触发站点自己的 ng-click，不伪造任何请求
  2. 若要展开（章 / 节）：
       最多等 NAV_WAIT_MS(6000) 看子层是否出现（ul.rank-2 / div.resourcelist）
       仍没出现 → 打 SKIP_ATTR 标掉，之后一律绕过它
  3. 若是资源（无 href）：等 hash 变化
```

- **先用 `click()`，点不动才用 `href` 兜底**（用户第三轮拍板）。
- `href` 只对**章 / 节**可用（它们自带到 `#/{cid}/{chapterId}[/{sectionId}]` 的链接）；
  **资源项没有 `href`**（只能点，靠 `goSource(source, 'section')`）。
- ⚠️ 设 `location.hash` 与 `click()` 的**副作用不同**：前者只换路由，后者会同时更新站点的选中态与
  展开状态。所以 `href` 只当兜底，不要当主路径。
- ⚠️ **`div.resourcelist` 是 `li` 的孩子，不是 `div.basic` 的孩子，而且身上没有 `ng-click`**
  —— 点它没反应。**要展开一律点节标题**。

### B.2.5 点不动就跳过

- 一个目标点完还没动静 → **直接跳过，继续找下一个**（不重试、不暂停）。
- 防死循环三道闸：
  ① 点不动 / 点了却没展开出来 → 打 `data-sztb-skip`，之后一律绕过它；
  ② 处理过的行进 `handled` 集合，`nextFrom` 会跳过；
  ③ 当前章 / 当前节本身被标了 SKIP，`nextStep` 直接换下一个（否则会每轮回来重点一次）。
- 每次跳过都在日志里留一行 `log.warn`（含节点名），供事后复盘。

## B.3 点开之后：按「当前页是什么」分派

点完一项、页面稳定后，**先判类型**，再决定动作。判定**全部基于 DOM**：

| 判据（按顺序短路） | 判定 | 动作 |
|---|---|---|
| 资源行类型号 == 10，或页面出现 `video` 元素 | **视频** | 见 §B.4 |
| 资源行类型号 == 80，或页面出现 `iframe[src*="/exam/"]` | **测验** | 见 §B.5 |
| 资源行类型号 == 50 | **附件** | **直接下一项**（点开过就算了，不打开文件）—— 用户 m06126 拍板 |
| 资源行类型号 == 60 | **文本** | 等 `hold-after-ms`（=「播完后停留」设置项）→ 下一项 |
| 资源行类型号 == 70 | **讨论** | **toast 提醒 + 停掉连播**，你处理完再点【开始连播】 |
| 类型号是 0 / 认不出来 | **未知** | 等 `hold-after-ms` → 下一项；`log.warn` 记下当时的 hash |

⚠️ **资源类型判据已经实测过了**（2026-10-08 那批 11 份采样，见 §G.4）：
优先读资源行里 `span.tag-source-ico` 的 `ng-if="source.type == NN"`（站点自己的类型号），
取不到才退回图标类名。**图标类名是站点自己的拼音名，猜不出来**，实测值是
`icon-video` / `icon-huixingzhen`(附件) / `icon-wendang1`(文本) / `icon-discuss` / `icon-dingdanguanli`(测验)。

## B.4 视频的「完成」判定

用户第三轮拍板：

- **看得到 `.complete` 标记 → 当它已完成，立刻点下一个**（不播）。
- **看不到 `.complete` → 当它没完成，播到底**。

播到底的判定：**听 `<video>` 的 `ended` 事件**（用户第二轮拍板，不轮询 `currentTime`）。

```
点开视频项
  ├─ 该行有 .complete  → 等 HOLD_AFTER_MS → 下一项
  └─ 没有 .complete    → 等 video 的 ended 事件 → 等 HOLD_AFTER_MS → 下一项
```

⚠️ 如实说明一个缺口：因为「`.complete` 只在 `is_task == 1` 时才挂」（§B.1 第 3 条），
**大部分普通视频都看不到这个标记 ⇒ 每次都会被完整播一遍**（哪怕站点认为它已完成）。
这是用户明确选的口径（「看不到就当没完成，都播到底」），不是 bug。
代价是重复播放，收益是绝不会有「明明没看完却被跳过」的情况。

补充：「二倍速」「静音」「防失焦暂停」三个开关照旧作用于这个 video（`video.ts` 不动）。

## B.5 测验（页内 iframe，不跳转）

- **「AI 答题」关着** → toast 提醒你自己答，**停掉连播**（用户 m06126 拍板：
  「等待用户处理」= 直接停，你处理完再点【开始连播】）。
- **「AI 答题」开着** → **全自动 + 弹框确认后交卷**（用户第二轮拍板）：

  1. 脚本点开测验资源 → **主区域出现答题 iframe**（判据：`iframe[src*="/exam/"]`）→
     等它渲染出选项控件（`waitForOptionInputs()` 已经支持传 iframe 的 document）。
  2. **在 iframe 内**拉题 → 问模型 → 回填
     （`ai/fill.ts` 的 `collectRoots()` 已经会扫同源 iframe，不用改）。
  3. 弹「答案已填好，确认提交？」→ 你点确认 → 合成点击 iframe 里的提交按钮 → 你点验证码。
  4. **交卷判据 = 拦截站点自己发的 `POST /exam/commit` 的响应**（素材已给，见 §C.5）：
     `code==1`（通过）→ 这一项完事，直接在旁边点下一个资源；
     `code==110`（未通过）→ 走 §C.5.1 自动重答低分题后再提交。
     页面从头到尾没换过，**不需要回跳**。
  5. 答完 → 等 `hold-after-ms` → 下一项。

- ⚠️ 旧的「跳过测验」开关**已删**（用户拍板），所以**开不开 AI 答题就是唯一的分岔**。
- ⚠️ 读不出 `tid` 时 → 停掉连播并报告（不猜）。

## B.6 设置项（旧版口径）

| 设置项 | 键 | 形态 | 默认 | 本次改动 |
|---|---|---|---|---|
| 二倍速 | `rate-2x` | 开关 | 开 | 不动 |
| 静音 | `mute` | 开关 | 开 | 不动 |
| 防暂停 | `keep-playing` | 开关 | 开 | 不动 |
| **自动连播** | `auto-next` | 开关 | 关 | 🔴 **已删除** —— 由【连播】页的【开始连播】【停止连播】两个按钮取代 |
| ~~跳过附件~~ | `skip-attachment` | — | — | 🔴 **已删除**（用户 m06126 拍板：只按新流程走，附件直接下一项） |
| ~~跳过文本~~ | `skip-text` | — | — | 🔴 **已删除**（文本固定等「播完后停留」） |
| ~~跳过讨论~~ | `skip-discussion` | — | — | 🔴 **已删除**（讨论固定停掉连播等你） |
| ~~跳过测验~~ | `skip-quiz` | — | — | 🔴 **已删除**（开不开「AI 答题」就是唯一的分岔） |
| AI 答题 | `ai-answer` | 开关 | 关 | 🟠 **`risk` 从 `'trace'` 升为 🔴 `'irreversible'`**（它现在真的会交卷）。后果：默认强制关闭 + 开关本身要二次确认 + 红色样式 |
| 跳转后等待 | `wait-before-ms` | 数值 ms | `5000` | 保留 |
| 播完后停留 | `hold-after-ms` | 数值 ms | `3000` | 保留 |

（`rate-2x` / `mute` / `keep-playing` 是「视频」页的，其余在「连播」页 / 「AI 作答」页。）

## B.7 【连播】标签页 UI

放在悬浮窗已有的【连播】标签页（`src/sites/uooc/tabs/autoplay.ts`，`id: 'uooc:autoplay'`，order 210）。

**顺序：按钮在最上面**（用户明确要求「把自动连播按钮放到连播页最上方」），设置项在下。

```
┌─ 连播 ────────────────────────────┐
│ [开始连播]  [停止连播]             │   ← 最上方
│ 状态：连播中：第3章 第2节「第一章测验」 │   ← 实时状态行，跟 DOM 变
├───────────────────────────────────┤
│ （连播组设置项：跳转后等待 / 播完后停留）│
└───────────────────────────────────┘
```

- **开始连播**：从 §B.2.1 的起点开始跑循环；已在跑时按钮置灰。
- **停止连播**：**立刻停**（用户第三轮拍板）—— 清定时器、摘 `ended` 监听、状态行立刻变「已停止」。
- **实时状态行**（用户第四轮拍板，形如）：
  - 空闲 → `已停止`
  - 找不到起点 → `已停止 —— 目录里没有「当前项」标记，请你先点开一节`
  - 跑着 → `连播中：正在展开 第3章` / `连播中：正在进入「第一章测验」` /
    `连播中：正在处理「xxx」（视频）`（章名 / 节名 / 资源名从 DOM 取，随导航实时刷新）
  - 被停下 → `已停止 —— 走到讨论「xxx」，连播停下，你处理完再点【开始连播】`
  - 结束 → `已停止 —— 已经是最后一章最后一节，连播结束`
- 状态行**每次循环重读 DOM 时刷新**，不需要额外的 `MutationObserver`。

---

# C. AI 答题（与新版无关，**保留**）

> 本节 = 上一版 §B 的原文，按已落地情况更新口径（去掉已经解决的 ❓）。
> 已经**全部实现并提交**（commit `0af9fcc`，构建号 77），代码在 `src/sites/uooc/ai/`。

## C.1 五套提示词（已定稿并落地）

- 一共 **5 套请求模板**：`直答` / `先推理` / `学科专家` / `排除法` / `自检复核`
  （`id` 依次 `direct` / `reason` / `expert` / `eliminate` / `double-check`）。
- 五者的**输出格式要求相同**（共用指令：只输出「题号. 答案」），**只有提示词正文不同**。
- **每次请求随机抽一套，抽过的不放回** —— 同一道题的连续多次请求各用不同模板。
- ✅ 正文已落地在 `src/sites/uooc/ai/prompts.ts`（草稿留档 `docs/UOOC-AI提示词-草稿.md`）。
- **(m04879) 五套模板共用一句联网要求**：「如需要请联网搜索获取最新、准确的信息；若你的运行环境不支持联网搜索，请忽略此条，按已有知识作答。」

## C.2 每道题的作答流程（**最多请求 4 次**）

```
请求 #1（随机模板）
请求 #2（随机模板）
  │
  ├─ #1 == #2  ────────────────────► 采用该答案，结束
  │
  └─ #1 != #2
       请求 #3（随机模板）
         │
         ├─ #3 == #1 或 #3 == #2 ──► 采用「出现 2 次的那一个」，结束
         │
         └─ 三个互不相同
              请求 #4（随机模板）
                │
                ├─ #4 与前面任一个相同 ► 采用多者，结束
                │
                └─ 4 个互不相同        ► 采用 #4（最后一次），结束
```

**一句话**：**少数服从多数；平局就再要一次；最终仍平局就取最后一次。**
（`src/sites/uooc/ai/parse.ts` 的 `majority()`；`MAX_SAMPLES = 4`。）

- **(m04879) 逐题回填**：每道题**得出最终答案后立即回填**到 iframe（并刷新监视页），
  **不再等全部答完再统一填**。
- **(m04879) 已填答案不请求**：`student_answer` 非空的题**不调用 LLM**，直接算已答；
  用清除按钮（§C.4.1）清掉后才重新请求。

## C.3 输出格式与调用参数

| 项 | 值 |
|---|---|
| 返回格式 | `1. A` / `2. B` / `3. A,B`（多选逗号分隔、升序；判断题 `A`=正确 `B`=错误） |
| 解析 | 逐行 `^\s*(\d+)\s*[.、．:：)）]\s*(.+?)$`；同题号留第一次；**一行挤多题**（`1.A 2.B 3.C`）走 `INLINE_RE` 兜底 |
| 调用 | `POST {baseUrl}/chat/completions`，body `{ model, messages:[{role:'user',content:prompt}] }` |
| `temperature` | ✅ **不传**（用户口径）。多样性由「5 套提示词 + 不放回抽取」提供，比调 `temperature` 更可控 |

## C.4 回填与提交

| 动作 | 做法 | 出处 |
|---|---|---|
| 填一个选项 | `input[name="<题id>"][value="<字母>"].click()`（走站点自己的 `vm.addAnswer`） | 逆向笔记 §69 |
| 提交 | 点 `button.btn.btn-danger` → `vm.commitTask()`（旧版） | 逆向笔记 §79-85 |

⇒ **不伪造 `/exam/commit` 请求**：点站点自己的按钮，由站点自己发那一发，契约 / CSRF / 时间戳全都不用管。

⚠️ **硬约束（不能颠倒的顺序）**：`sztb-modal-mask` 的 `z-index: 2147483002` 几乎顶到 `2147483647`，
而阿里云验证码的弹窗挂在这个遮罩**底下** ⇒「一边弹全屏框、一边放验证码」会让验证码被自己的遮罩盖住。
所以必须：**先弹框 → 你点主按钮 → 框立刻消失 → 再合成点击站点提交按钮 → 验证码才出来**。
（`showConfirm` 的 `finish()` 正是先 `mask.remove()` 再 resolve，天然满足。）

- 弹框文案：主按钮 `开始提交（会弹验证码）`，次按钮 `再等等`。
- **永远不碰 `button.btn.btn-success`（保存）** —— 用户 m03875 选 B：只填不保存。

### C.4.1 已答跳过 + 清除答案（m04879）

- **已填答案的题不请求**：`getTaskPaper` 每题的 `student_answer` 非空 → 跳过 LLM（算已答）。
- **注入清除按钮（纯前端，不走网络）**：
  - 每个**已有答案的题号前**注入【清除答案】小按钮；
  - **试卷标题后**注入【清除全部答案】按钮。
- **清除机制（已拍板）**：统一走 Angular `ngModel` —— 取输入元素
  `angular.element(input).controller('ngModel')`，
  多选 `$setViewValue([])`、单选/判断 `$setViewValue(undefined)`、填空 `$setViewValue('')`，
  各题型一套代码。（单选 radio 无法靠点击取消，故不走点击。）

## C.5 交卷判据 = **拦截站点的 `/exam/commit` 响应**（素材已给，旧版通用）

旧版点测验是**页内 iframe（§A.4）**，交卷由站点自己的提交按钮发
`POST https://www.uooc.net.cn/exam/commit`。脚本**拦截这个自己发出的 POST 的响应**来判断
通过与否（只读看响应、不改请求、不伪造提交）：

| 返回 | 含义 | 下一步 |
|---|---|---|
| `{"code":1,"msg":""}` | **通过** | 这一项完事，**直接在旁边点下一个资源**（页面没换过，不回跳） |
| `{"code":110,"msg":"您的得分是8,测验分数至少要达到50分，请重新提交测验！","data":{"score_list":{<qid>:<score>…},"score":8,"pass_score":"50"}}` | **未通过** | 走 §C.5.1 自动重答 |

⇒ 这一条**解决了 §F 缺口 1**：不再需要等「过/没过」弹窗 DOM，
也不用退化「等固定秒数 + 弹框问你」。

### C.5.1 未通过（code==110）→ 自动重答低分题

1. 从 `data.score_list`（qid → 得分）逐题对比满分（`getTaskPaper` 的 `questions[].score`），
   取「得分 < 满分」的题。
2. **记录这些题上一轮的答案**，重新问模型（**重答只发 1 次请求**——不再跑 4 次多数投票，
   排除约束已经很强），并在提示词里**明确排除**上一轮答案：
   - 单选 / 判断：排除上一轮那个字母；
   - **多选：排除「上一轮的答案组合」，而不是单个选项**（用户原话；组合里可能混着对的，
     禁单个会误伤正确项）—— 把上一个组合（如 `A,B,C`）作为「已知错误组合」写进该题提示词，
     要求模型给出**不同**的组合/子集；
   - 填空 / 主观题：排除上一轮填的整句。
3. **排除没生效就补一次**：若这一次返回的答案仍与被排除的上一轮答案相同（模型没听排除），
   再补发 1 次；否则 1 次就采用（用户原话「除非与当前答案相同，否则只请求一次」）。
   补发也**只允许再补 1 次**，防死循环。
4. 重答完 → 再次合成点击提交（会再弹验证码 → 你点）。整轮「重答 + 提交」最多走 **1 轮**；
   若仍 110，停下，在监视页亮出「得分 X / 门槛 Y / 错题：题号列表」，等你处理。

（`ai/handoff.ts` 与 `ai/index.ts` 里整段跨页交接 `autoAnswerExamPage` /
`waitForSubmitted` / `ExamAutoResult` / `tidFromLocation` 仍拟随删 —— 旧版不跳转，见 §E.1 / §E.3。）

## C.6 配置入口与「AI 作答」标签页布局

已落地在**本站面板的「AI 作答」标签页**。**布局（m04879，从上到下）**：

1. **[开始作答] 按钮置顶**（自动答题没开也要一眼找到；触发「当前试卷」作答）
2. **[自动答题开启] 复选框**（= `TOGGLE.AI_ANSWER`）
3. 剩下 5 项配置：`接口地址` / `API Key` / `模型名` / `超时(ms)=60000` / `并发数=1(1~8)`，
   其下再有【测试连接】按钮。

> 渲染顺序 = 按钮块在最上，之后 `renderSiteSettings` 的「开关（AI_ANSWER）+ 5 项配置」
> （组内开关在前、数值在后 —— 把按钮块插到渲染结果前面即可）。

- **地址与模型名任一为空 → 视为未配置**，功能不可用（Key 允许为空，本地 ollama 不需要）。

## C.7 监视页（m04879 新增，面板新标签页【监视】）

> 承载位置已拍板：悬浮窗加新标签页【监视】（order 紧跟【连播】）。
> **只读展示**、不挂操作按钮、不启动任何 UOOC 功能。
> 需要**拦截目录树接口**算课程进度 ⇒ **`intercept.ts` 保留**（见 §E 修订）。

**① 当前课程学习进度**（课程页活跃）：
- 数据源：拦截 `getCatalogList` 拿整棵目录树。
- 口径（已拍板）：**当前位置的 index / 总数** —— 总数=目录节点总数，
  当前位置=当前路由 / `.active` 解析出的那个；不核对前面实际学没学（用户「不管实际到底前面有没有学」）。
- 展示：`当前进度：资源 40 / 75` + 一条进度条。

**② AI 答题进度**（答题 iframe 活跃）：
- 当前试卷所有题：**题号 + 题名/题型**。
- 每个题号下：**若干条请求进度**，条数 = **该题实际发的 LLM 请求数**（最多 4）；每条 = 进度条 + 该请求返回的答案。
- 题号**旁边**：**最终采纳的答案**（多数投票结果；多选给字母组合）。
- 整体：**已答 / 未答** 进度条（已答=已得最终答案的题数），逐题回填（§C.2）后实时刷新。

---

# D. 填空题适配（**新增**）

> 用户 m04485 问：「看看参考仓库有没有填空题适配」。**有。**
> 出处：`local/reference/fuckuooc/utils/quiz.js`。

## D.1 参考仓库的做法

| 步骤 | 做法 | 行号 |
|---|---|---|
| 题型归类 | 把「填空题 / 名词解释 / 问答题 / 论述题」**归为一类主观题** | `quiz.js:174` |
| 题型识别 | 优先 `typeText.includes('填空')`；识别不出时**兜底判「页面上有没有 `textarea.ue-container1`」** | `quiz.js:274` / `:278` |
| 定位控件 | `textarea.ue-container1`（**UEditor 容器**），按 `blankCount` 逐个填 | `quiz.js:178` |
| 真正写值 | 取容器的**隐藏兄弟 textarea**（`xpath=following-sibling::textarea[contains(@class,"hide")][1]`），写 `value` | `quiz.js:215` |
| 触发站点感知 | 写完 `dispatchEvent(new Event('input', {bubbles:true}))` + `new Event('change', {bubbles:true})` | `quiz.js:215` |

## D.2 本项目怎么接

- 现状：`src/sites/uooc/ai/paper.ts` 的 `isAnswerable(kind)` **只认 single / multi / judge**，
  `blank` 被排除（用户 m04071「填空暂时搁置」）。
- 要接的话，改动面很小：
  1. `isAnswerable` 放行 `blank`；
  2. `normalizeAnswer(raw, 'blank')` 已经支持（去 `|` 分空、按序填）；
  3. `fill.ts` 里新增一个「填空题回填」分支：按 `input[name="<题id>"]` 找出该题的
     `textarea.ue-container1`（或隐藏兄弟 textarea），写值 + 派发 `input`/`change`。
- ⚠️ 两处**必须先取证**（见 §F 待确认第 4 条）：
  - 旧版试卷里填空题控件的真实 DOM 是什么样（我们手上的
    `local/capture/dom-uooc-exam-旧-已完成-单选-填空.txt` 是**已完成**态，控件可能已被替换）；
  - 一个题有多个空时，是**一个 textarea 装所有空**（参考仓库按 `blankCount` 逐个找），还是**每空一个控件**。
- 提问见 §F 第 4 条：**这次要不要把填空题一起做掉**。

---

# E. 删除清单（**待用户复核**）

> 用户第一轮拍板：「直接删掉，需要时从 git 历史找」。

## E.1 整份删除

| 文件 | 理由 |
|---|---|
| `src/sites/uooc/ai/handoff.ts` | 「学习页 ↔ 答题页」跨页面接力条。旧版测验是**页内 iframe、不跳转**（§A.4）⇒ 整条没用 |

（`intercept.ts` **不再整份删**：监视页（§C.7）要拦目录树算进度、交卷判据（§C.5）要拦 `/exam/commit` 响应 —— 见 §E.3 改写）

## E.2 几乎整份重写

| 文件 | 现有大小 | 处理 |
|---|---|---|
| `src/sites/uooc/catalog.ts` | 12482 B | 接口模型（`catalogListUrl` / `unitLearnUrl` / `fetchCatalog` / `normalizeNode` / `flattenLeaves` / `resolveCursor` / learning 链）全删；改成「**读旧版目录 DOM → 节点列表 → 定位当前项 → 找下一个**」。`examUrl()` 若还要用则保留 |
| `src/sites/uooc/autoplay.ts` | 30911 B | 整份重写为 §B 的循环：起 / 停 / 点下一项 / 等 ended / 跳过 |

## E.3 局部改

| 文件 | 改动 |
|---|---|
| `src/sites/uooc/index.ts` | 版本分派三分支：**新版 → 提示 + 挂面板但不启动（也不装嗅探）**；旧版 → 正常。`installUoocIntercept()` **保留**（改写见下）；删 `EXAM_PATH_PREFIX` 分支（旧版不跳答题页） |
| `src/sites/uooc/tabs/monitor.ts` | **新增**：面板【监视】标签页（§C.7），order 紧跟【连播】 |

> `intercept.ts` 改写：目录树嗅探（`getCatalogList`）保留供监视页算进度；**新增嗅探 `POST /exam/commit` 的响应**供 §C.5 交卷判据；连播导航本身不依赖它。
| `src/sites/uooc/settings.ts` | 删 `TOGGLE.AUTO_NEXT` 这个复选框（连播总开关改由按钮控制）；`TOGGLE.AI_ANSWER.risk` → `'irreversible'`；其余跳过开关全保留 |
| `src/sites/uooc/tabs/autoplay.ts` | 加【开始连播】【停止连播】两个按钮 + 实时状态行（见 §B.7） |
| `src/sites/uooc/ai/fill.ts` | 删新版分支（新版 radio 不可见那套三级降级、新版提交按钮选择器 `div.btn.btn-warning[ng-click*="commitTask"]`）；补填空题回填（若 §D 开做）；`collectRoots()` 扫同源 iframe 的能力**保留并变成主路径** |
| `src/sites/uooc/ai/index.ts` | 删新版路径分支 `/exam/{tid}`，以及整段「答题页入口」（`autoAnswerExamPage` / `waitForSubmitted` / `ExamAutoResult` / `tidFromLocation`）—— 旧版不跳转，这套全废；新增「主区域出现答题 iframe → 在 iframe 内作答 → 等结果弹窗 → 继续」这一段 |

## E.4 不动

`src/sites/uooc/video.ts`、`src/sites/uooc/ai/` 的 `parse.ts` / `prompts.ts` / `llm.ts` / `paper.ts` /
`runner.ts` / `handoff.ts`。

## E.5 ⚠️ 测试的连带影响（**需要你拍板**）

| 测试 | 现状 | 拟处理 |
|---|---|---|
| `tests/suites/uooc-ai.test.ts` | 40 项，绝大多数测**保留**的纯函数 | 🟡 留着，但里面那个 **`handoff` 的 describe（6 项）随 `handoff.ts` 一起删** ⇒ 40 → 34 项 |
| `tests/suites/uooc-catalog.test.ts` | 测 `catalog.ts` 的**接口节点模型**，整份重写后必然全红 | ✅ **随删**（用户已拍板：删掉） |
| `tools/verify-build.mjs` | 29 项产物断言 | 若头部/产物体积断言受影响再调 |

删掉 `uooc-catalog.test.ts` 后，套件数 **27 → 26**；`uooc-ai.test.ts` 少 6 项后总用例 **645 → 639**。

---

# F. 待确认 / 还缺的素材

**已拍板（不再问）**：

- ✅ 测验的 `tid` 怎么来 —— **从答题 iframe 的 `src` 里读**（m05858 修正，详见 §A.4.1）。
  旧版点测验 = 页内 iframe，`tid` 就在它的地址末段（`/exam/1208164042`），
  不用连播预知、不用跨页面交接。**题目仍走 `fetchPaper(tid)` 接口**（要每题满分 `score`）。
- ✅ 填空题（§D）—— **这次不做**，连播优先；需求留在文档里，下一轮再开。
- ✅ `tests/suites/uooc-catalog.test.ts` —— **随删**。
- ✅ commit 返回判据（m04879 素材）—— `code==1` 通过 / `code==110` 未通过（含 `score_list`/`pass_score`），§B.5/§C.5 采用。
- ✅ 监视页承载 —— 面板新标签页【监视】（§C.7）。
- ✅ 清除答案机制 —— 统一走 Angular `ngModel`（§C.4.1）。
- ✅ 未通过（code==110）—— 自动重答低分题并禁上次答案（多选禁组合，§C.5.1）。
- ✅ 课程进度口径 —— 当前位置 index / 总数，不核对实际已学（§C.7①）。

**还缺的素材（拿到就能动手，不影响现在开工）**：

1. ✅ （已解决）交卷「过/没过」判据 —— 由 §C.5 拦截 `/exam/commit` 响应取代，不再需要弹窗 DOM。
2. ✅ （已解决）**四类资源的 DOM 判据** —— `local/capture/20261008/` 那 11 份采样里，
   站点自己渲染的 `ng-if="source.type == NN"` + 图标 + `span.tag-source-name` 完全一致，
   字典实测吻合（详见 §G.4）。`autoplay.ts` 的 `kindOf()` 图标类名兜底本来猜错了，已按实测值修好。
3. 🟡 **未作答状态的填空题试卷 DOM**（§D 开做时才需要；手上的采样是「已完成」态）。

**还想问你**：

4. 🟡 **新版页提示的文案**（§A.2 表里那四句）—— 已按拟定文案落地（`index.ts` 的
   `promptSwitchToOld`）。你没意见就这么定；要改文案说一声，改一处常量的事。
5. 🟠 **未通过（code==110）自动重答的次数上限**：文档与代码现为**每题最多重答 1 次**，
   且重答**只发 1 次请求**（m04950 拍板「除非与当前答案相同，否则只请求一次」），
   若仍 110 就停下等你（§C.5.1 第 4 步）—— 要改成 2 次或直到通过，需要你说一声。

---

# G. 视频随机小测（**新增**，m05960 / m06055）

> 这是与课程测验（§A.4 / §B.5）**完全不同**的东西：它挂在视频进度条上，
> **纯前端、一个网络请求都没有** —— 所以不能走 `ai/` 那套「拉题 → 问模型 → 回填」。

## G.0 它长什么样

- 进度条上有若干个 `<span class="vjs-seekbar-point" style="left: 77.6%">`，每个是一个弹题点。
- 视频播到那个时刻，站点自己弹一个 layui 层（`#quizLayer`，标题「小测」）。
- 弹层出现时**视频不暂停**（播放器类名里仍是 `vjs-playing`）—— 站点自己的行为，我们不改。

## G.1 答案**就写在 DOM 里**（决定性发现）

视频容器的 `source="{...}"` 属性是一段 JSON（`getAttribute` 返回**已反转义**的文本）：

```json
{"quiz":[{"id":1277026166,"qid":1714608496,"set_time":"469","resource_id":"24358",
  "question":"<p>1982年《中华人民共和国宪法》…</p>",
  "options":"{\"A\":\"对\",\"B\":\"错\"}",
  "answer":"[\"A\"]",              ← 正确答案（字符串化的 JSON 数组）
  "type":"20","level":"易","_type":"判断题",
  "voptions":{"A":"对","B":"错"},
  "eanswer":"A",                   ← 正确答案（已解析好的）
  "eoptions":[{"key":"A","value":"对"},{"key":"B","value":"错"}],
  "equestion":"<p>…</p>"}]}
```

- `set_time`（秒）与进度条那个 `left: 77.6%` 对得上；`quiz` 是**数组**（一个视频可以有多题）。
- ⇒ **不需要试错、不需要读 `wrongTip`**。用户 m05960 原本设想的
  「选第一项 → 提交 → 错了读 `wrongTip` 拿正确答案 → 再填 → 读不到就接着枚举」
  **整条不需要了**（用户 m06055 拍板方案 A：直接读 `answer` 填 → 点确定）。

## G.2 怎么把弹层里的题对回 `quiz[]`

弹层 DOM（`local/derived/20261008/pp-小测.txt` 第 464–527 行）：

```
div.layui-layer.layui-layer-page[type=page]              ← 标题「小测」
  div#quizLayer.quizLayer.mpopup[ng-if="curQsource"]
    div[question-common][question-object][qsource="curQsource"][pattern="30"]
      div[question-common][question-truefalse][qsource="qsource"][ondel][onsure]
        div.smallTest[ng-if="!qsource.hidesource"]
          div.smallTest-tool                             ← 编辑/删除图标
          div.smallTest-view[ng-if="pattern == 30"]      ← 另有 pattern==10 / 20 两个分支
            .ti > .ti-q > .ti-q-c[ng-bind-html="qsource.question | to_trusted"]     ← 题干
            .ti > .ti-alist > label.ti-a[ng-repeat="(key, value) in qsource.voptions"]
              span.ti-a-i > input[type=radio][name="answer_1277026166"]
                                          [ng-model="qsource.canswer"][value="A"]
              div.ti-a-c[ng-bind-html="value | to_trusted"]                          ← 选项文本
  div.mpopup-bottom.mpopup-bottom-r                      ← 与 #quizLayer 同级
    button.btn.btn-success.fl_right[ng-click="sureAnswer(curQsource)"]               ←「确定」
```

- ⭐ **join key**：`input[name="answer_<id>"]` 里的 `<id>` 就是 `quiz[].id`。
  题干是 `ng-bind-html` 渲染的富文本，拿去比对又脆又费劲 —— 不用它。
- 选项是 `input[type=radio]` + `ng-model="qsource.canswer"`（判断/单选）。多选可能是
  checkbox，**本次采样没碰到**，代码里按 `input` 的 `type` 通用处理。

## G.3 落地口径（用户 m06055 拍板）

1. **策略 = 直接读 DOM 里的答案填 → 点【确定】**（不枚举、不读 `wrongTip`）。
2. **两个开关都不做** —— 用户原话：「已经可以直接读取答案了，不需要此功能了，从需求中移除」。
   于是：
   - ❌ 【AI 作答】页的「小测自动答题」（走 LLM）—— **不做**；
   - ❌ 【视频】页的「关闭视频小测答案枚举」总闸 —— **不做**。
   ⇒ 视频小测**无条件**自动作答。
3. **不猜**：某一题在页面的 `quiz` 数据里找不到、或答案字母在选项里没有对应项
   —— 一律**原样留着等用户**，绝不点第一项糊过去。
4. **不重试**：点了【确定】之后弹层还在（答案不对 / 按钮变灰）→ 只写日志告警，交给用户。

## G.4 资源类型字典实测（顺带钉死 §B.3 那张表）

| type | 图标类 | 目录显示名 | `SOURCE_TYPE` |
|---|---|---|---|
| 0 | （无） | 空章节 / 未解锁 / 网络问题 | → `unknown` |
| 10 | `icon-video` | 视频 | `VIDEO: '10'` ✅ |
| 50 | `icon-huixingzhen` | 附件 | `ATTACH: '50'` ✅ |
| 60 | `icon-wendang1` | 文本 | `TEXT: '60'` ✅ |
| 70 | `icon-discuss` | 讨论 | `DISCUSSION: '70'` ✅ |
| 80 | `icon-dingdanguanli` | 测验 | `QUIZ: '80'` ✅ |

站点 source-view 模板的 ngIf 分支全集 = `'pay'` / `0` / `10` / `50` / `60` / `70` / `80`。

---

# H. 暂不实现 / 实验性（**留档，本轮不碰代码**）

按用户 m06055 拍板，以下只记录，不开工：

1. **（实验性）拦截课程视频请求，全部替换成与课程同长度的空白视频**，以降低带宽占用。
   - 用户 m05960 原话，标注「暂不实现」。
   - 留待视频小测这轮收尾后单独评估（涉及到要不要伪造 `Range` / `Content-Length`、
     以及进度条与 `ended` 事件还能不能正常触发 —— 连播的「视频播完」判定依赖 `ended`）。

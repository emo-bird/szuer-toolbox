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
| 接口嗅探 `intercept.ts` | `src/sites/uooc/intercept.ts` | ✅ **整份删除**（新连播不再用接口） |

## A.4 测验：页内 iframe，**不跳转**

用户原话：「**点击 dom 后页面上就会出现答题页的 iframe，直接操作 iframe 就可以，不用跳转**」。

- 旧版点测验资源 ⇒ **主区域换成答题 iframe**（指向 `/exam/paper?cid=&tid=`），
  **目录还在左边、仍然可点**（用户已确认：「替换主区域，目录仍可点」）。
- ⇒ **不整页跳转、不拼 URL、不需要 `tid`**：脚本直接进 iframe 操作 DOM 就行。
- ⇒ **不需要「交接条」**：`ai/handoff.ts` 那套是给「整页跳转、跨页面接力」设计的，
  旧版从头到尾同一个页面，没有这回事。见 §E.1。
- 于是 `/exam/*` 作为**顶级页面**只属于新版流程；本站适配范围（旧版）不涉及。
- ⚠️ iframe 是**同源**的（`ai/fill.ts` 的 `collectRoots()` 能扫到它），所以 DOM 操作没问题。

---

# B. 自动连播（**纯 DOM 点击**）

## B.0 总原则（用户原话精神）

> 「**忘掉前面的各种检测方案，各种接续方案，全程模拟用户点击，一个一个点开这样最符合我的预期，
> 点开后（进入网页后）再检测当前页是什么，根据是什么来决定接下来的操作。**」

三条硬约束：

1. **不调任何目录接口。** `getCatalogList` / `getUnitLearn` / `learning` 链 —— 一律不碰。
   因此 `src/sites/uooc/intercept.ts` 整份删除，`catalog.ts` 的接口模型整份作废。
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

- DOM 上有 `.active` 的资源（或节）→ **就从它开始**（用户第一轮拍板：「从站点标出的当前项开始」）。
- ⚠️ **DOM 上找不到任何 `.active` → 停下等你**（用户第四轮拍板）：
  状态行改成「请点一下左边目录，告诉我从哪开始」，然后**监听 `hashchange`**，
  你点哪儿脚本就跟到哪儿，从那儿开始连播。**不自己猜第一个未完成的**。

### B.2.2 「下一个」的取法（四级回退）

每次要往前走时，**重新读一遍 DOM**，按顺序试：

1. **同节的下一个资源**：当前 `div.resourcelist` 里，当前资源后面的下一个 `div.basic` → 点它。
2. 本节没资源了／没有下一个资源 → **同章的下一个节**：
   当前 `ul.rank-2` 里，当前节 `li` 后面的下一个 `li > div.basic` → 点它。
3. 本章没下一个节 → **下一章**：当前 `li.catalogItem` 后面的下一个 `li > div.basic.chapter` → 点它，
   **等 `ul.rank-2` 渲染出来**，再点它**第一个** `li > div.basic`（见 B.2.3 的「展开」）。
4. 章也没下一个了 → **`finish('已到目录末尾')`**，连播停止。

⚠️ 全流程**没有范围上限**（旧的 `nextScope`「止于本章 / 跨章继续」已废，用户 m00971 拍板）——
一路播到目录末尾。

### B.2.3 「点开 + 展开」的通用动作

```
activate(el):
  1. el.click()                     ← 触发站点自己的 ng-click，不伪造任何请求
  2. 若要展开（章 / 节）：
       最多等 EXPAND_WAIT_MS(1500) 看子层是否出现（ul.rank-2 / div.resourcelist）
       仍没出现 → 兜底：location.hash = el.getAttribute('href')
  3. 若是资源（无 href）：等 hash / 页面内容变化，最多 CLICK_WAIT_MS(3000)
```

- **先用 `click()`，点不动才用 `href` 兜底**（用户第三轮拍板）。
- `href` 只对**章 / 节**可用（它们自带到 `#/{cid}/{chapterId}[/{sectionId}]` 的链接）；
  **资源项没有 `href`**（只能点，靠 `goSource(source, 'section')`）。
- ⚠️ 设 `location.hash` 与 `click()` 的**副作用不同**：前者只换路由，后者会同时更新站点的选中态与
  展开状态。所以 `href` 只当兜底，不要当主路径。

### B.2.4 点不动就跳过

- 一个目标点完 `CLICK_WAIT_MS` 还没动静 → **直接跳过，继续找下一个**（不重试、不暂停）。
- ⚠️ **必须防死循环**：维护一个「本轮已访问过的节点集合」（用节点 id 或 `层级/下标` 路径做键）。
  同一个节点第二次被选中 → 直接判「点不动」，跳过。整个"找不到下一个"→ `finish`。
- 每次跳过都在日志里留一行 `log.warn`（含节点定位路径），供事后复盘。

## B.3 点开之后：按「当前页是什么」分派

点完一项、页面稳定后，**先判类型**，再决定动作。判定**全部基于 DOM**：

| 判据（按顺序短路） | 判定 | 动作 |
|---|---|---|
| 页面出现 `video` 元素 | **视频** | 见 §B.4 |
| 页面出现 `iframe[src*="/exam/"]`（主区域被换成答题 iframe） | **测验** | 见 §B.5 |
| 出现附件容器 / 预览 | **附件** | 「跳过附件」开着 → 不打开、等 `HOLD_AFTER_MS` 走人；关着 → 按要点开（后台标签页）→ 等 `HOLD_AFTER_MS` → 下一项 |
| 出现 UEditor / 文本容器 | **文本** | 「跳过文本」开着 → 不等待直接下一项；关着 → 等 `WAIT_BEFORE_MS` → 下一项 |
| 出现讨论区 | **讨论** | 「跳过讨论」开着 → 不提醒、等一会儿继续；关着 → **toast 提醒你自己填 + 暂停连播** |
| 都认不出来 | **未知** | 等 `HOLD_AFTER_MS` → 下一项；`log.warn` 记下当时的 hash |

⚠️ **「判据」这一列现在只有视频是实测过的**（`#player_html5_api` / `.video-js` 已确认）。
其余四类的 DOM 判据**是待取证的**（见 §F 待确认第 3 条）——实现时先按上表写，等采样回来再校准。

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

- 「跳过测验」开着 → 连播走到测验**停下等你**（保持现口径；AI 作答是另一个开关）。
- 「跳过测验」关着 + **「AI 答题」开着** → **全自动 + 弹框确认后交卷**（用户第二轮拍板）：

  1. 脚本点开测验资源 → **主区域出现答题 iframe**（判据：`iframe[src*="/exam/"]`）→
     等它渲染出选项控件（`waitForOptionInputs()` 已经支持传 iframe 的 document）。
  2. **在 iframe 内**拉题 → 问模型 → 回填
     （`ai/fill.ts` 的 `collectRoots()` 已经会扫同源 iframe，不用改）。
  3. 弹「答案已填好，确认提交？」→ 你点确认 → 合成点击 iframe 里的提交按钮 → 你点验证码。
  4. 交卷后**页面出现「通过 / 未通过」的弹窗** ⇒ 脚本认到它就算这一项完事，
     **直接在旁边点下一个资源**（页面从头到尾没换过，**不需要回跳**）。

  ⚠️ **第 4 步的判据还没有样本**（用户原话：「页面会出现过和没过的弹窗提示，到时候给你 dom，
  现在没有样本」）。实现时把它做成**一个独立判据函数**（`ai/index.ts` 里一个
  `isQuizResultShown() : boolean`），等采样回来**只改那一处**；
  在那之前先退化成「等固定秒数 + 弹框问你『这题答完了吗？继续』」。

- 测验项本身是不是「已完成」，照 §B.4 的同一口径：看得到 `.complete` 就当已完成、直接跳下一个。
- 「跳过测验」关着 + 「AI 答题」关着 → toast 提醒你自己答，**暂停连播**。

## B.6 设置项（旧版口径）

| 设置项 | 键 | 形态 | 默认 | 本次改动 |
|---|---|---|---|---|
| 二倍速 | `rate-2x` | 开关 | 开 | 不动 |
| 静音 | `mute` | 开关 | 开 | 不动 |
| 防暂停 | `keep-playing` | 开关 | 开 | 不动 |
| **自动连播** | `auto-next` | 开关 | 关 | 🔴 **删除这个复选框** —— 由【连播】页的【开始连播】【停止连播】两个按钮取代 |
| 跳过附件 | `skip-attachment` | 开关 | **开** | 保留 |
| 跳过文本 | `skip-text` | 开关 | 开 | 保留 |
| 跳过讨论 | `skip-discussion` | 开关 | 开 | 保留 |
| 跳过测验 | `skip-quiz` | 开关 | 关 | 保留 |
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
│ （连播组设置项：跳过附件/文本/讨论/测验…）│
└───────────────────────────────────┘
```

- **开始连播**：从 §B.2.1 的起点开始跑循环；已在跑时按钮置灰。
- **停止连播**：**立刻停**（用户第三轮拍板）—— 清定时器、摘 `ended` 监听、状态行立刻变「已停止」。
- **实时状态行**（用户第四轮拍板，形如）：
  - 空闲 → `已停止`
  - 找不到起点 → `请点一下左边目录，告诉我从哪开始`
  - 跑着 → `连播中：第3章 第2节「第一章测验」`（章名 / 节名 / 资源名从 DOM 取，随导航实时刷新）
  - 结束 → `已到目录末尾`
- 状态行**随 DOM 变**：用 `MutationObserver` 盯 `ul.rank-1`（或节流后的定时刷新）更新文本。

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

## C.5 交卷后怎么办（旧版：**不用回跳**）

⚠️ **修订**：本节原写的「交接条」方案只服务于「整页跳转」那套。
旧版点测验是**页内 iframe**（§A.4），页面从头到尾**没换过** ⇒ **旧版不需要 `handoff.ts`**，
交卷后直接在旁边点下一个资源即可。

⇒ 拟随删：`src/sites/uooc/ai/handoff.ts` 整份，
以及 `ai/index.ts` 里的 `autoAnswerExamPage()` / `waitForSubmitted()` / `ExamAutoResult` / `tidFromLocation()`
（它们全是为「整页跳转 + URL 带 tid」写的）。见 §E.1 / §E.3。

## C.6 配置入口

已落地在**本站面板的「AI 作答」标签页**（不再指路全局设置页）：
`接口地址`（`ai-base-url`，默认空）/ `API Key`（`ai-api-key`，默认空）/
`模型名`（`ai-model`，默认空）/ `超时(ms)`（`ai-timeout-ms`，默认 `60000`）/
`并发数`（`ai-concurrency`，默认 `1`，夹 1~8）。

- **地址与模型名任一为空 → 视为未配置**，功能不可用（Key 允许为空，本地 ollama 不需要）。
- 该页另有【测试连接】与【现在开始作答（当前试卷）】两个按钮。

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
| `src/sites/uooc/intercept.ts` | XHR 嗅探 `getCatalogList` / `getUnitLearn`，新方案**不调接口**，留着只会白跑 |
| `src/sites/uooc/ai/handoff.ts` | 「学习页 ↔ 答题页」跨页面接力条。旧版测验是**页内 iframe、不跳转**（§A.4）⇒ 整条没用 |

## E.2 几乎整份重写

| 文件 | 现有大小 | 处理 |
|---|---|---|
| `src/sites/uooc/catalog.ts` | 12482 B | 接口模型（`catalogListUrl` / `unitLearnUrl` / `fetchCatalog` / `normalizeNode` / `flattenLeaves` / `resolveCursor` / learning 链）全删；改成「**读旧版目录 DOM → 节点列表 → 定位当前项 → 找下一个**」。`examUrl()` 若还要用则保留 |
| `src/sites/uooc/autoplay.ts` | 30911 B | 整份重写为 §B 的循环：起 / 停 / 点下一项 / 等 ended / 跳过 |

## E.3 局部改

| 文件 | 改动 |
|---|---|
| `src/sites/uooc/index.ts` | 版本分派改成三分支：**新版 → 提示 + 挂面板但不启动（也不装嗅探）**；旧版 → 正常；删掉 `installUoocIntercept()` 调用与整个 `EXAM_PATH_PREFIX` 分支（旧版不跳答题页） |
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

- ✅ 测验的 `tid` 怎么来 —— **不用来**。旧版点测验 = 页内 iframe，直接操作 iframe，不跳转、不拼 URL。
- ✅ 填空题（§D）—— **这次不做**，连播优先；需求留在文档里，下一轮再开。
- ✅ `tests/suites/uooc-catalog.test.ts` —— **随删**。

**还缺的素材（拿到就能动手，不影响现在开工）**：

1. 🔴 **旧版点开测验、交卷后「通过 / 未通过」弹窗的 DOM**
   （用户原话：「页面会出现过和没过的弹窗提示，到时候给你 dom，现在没有样本」）。
   缺它的时候 §B.5 第 4 步退化成「等固定秒数 + 弹框问你继续不继续」。
   ⚠️ 还要一起看清楚：**那个弹窗在顶层文档还是 iframe 里**（决定判据写在哪儿）。
2. 🟠 **四类资源的 DOM 判据**（§B.3 的表里只有「视频」和「测验」是确认过的）。
   需要一份**旧版学习页快照**：当前节下同时挂着 附件 / 文本 / 讨论 各一个，
   导出那一刻的目录 + 主区域 DOM。缺它的时候这三类会落到 §B.3 的「未知」兜底分支
   （等一个固定时间就走，不会卡死，但跳过开关会暂时失效）。
3. 🟡 **未作答状态的填空题试卷 DOM**（§D 开做时才需要；手上的采样是「已完成」态）。

**还想问你一句**：

4. **新版页提示的文案**（§A.2 表里那四句）用我拟的，还是你自己写？

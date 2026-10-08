# UOOC 旧版课程页 · API 驱动「接管」需求

> **状态**：设计中（分支 `feat/uooc-api-driven`，2026-10-08）
> **取代关系**：本文件**取代** `docs/UOOC-连播与答题-需求细则.md`，该文件已整份删除（用户拍板）。它的 §B（连播）作废；§A（版本切换）/ §C（AI 答题）/ §D（填空题）/ §G（视频随机小测）/ §H（留档）**内容仍然有效**，需要时去 git 历史里翻：
> `git show 4613310:docs/UOOC-连播与答题-需求细则.md`
> **范围**：只写「课程页怎么自动推进」。AI 答题本身的实现细节不在本文件，见 `docs/UOOC-AI方案-逆向笔记.md`。

---

## §0 为什么推倒重来

旧的「连播」是**靠点 DOM 推进**的：找目录里 `.active` 那一行，点下一行的 `div.basic`，靠 `ng-click` 触发站点自己的路由。实测下来这条路全是坑：

- 目录**懒渲染** —— 任何时刻 DOM 里只有「全部章 + 当前章节 + 当前节点资源」，点下一章得先把它展开。
- `.active` 有**三个来源**（节标题的 `div.oneline`、资源行的 `div.basic`、播放器自己的 `vjs-*`），播放器会抢。
- 完成标记 `complete` 只在 `is_task == 1` 时挂，普通视频可能永远没有。
- 点不动时标记写在一处、读在另一处，导致**纯微任务自旋把页面卡死**（已修，commit `e2cc7d3`）。

**新方案一句话**：改用**一次网络请求拿整棵课程树**（含完成状态），在脚本里算出「下一个未完成任务点」的 id，**自己拼 hash 跳过去**。DOM 只用来**读**（等视频 `ended`、等测验 iframe 出题），不再用来**点**。

---

## §A 三个已实测的前提

### A.1 数据源：一次请求拿到整棵树

```
GET https://www.uooc.net.cn/home/learn/getCatalogList?cid={cid}&hidemsg_=true
→ { code: 1, msg: "", data: [ 树 ] }
```

`data` 是 L1（章）数组，逐层 `children`。节点字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 节点 id（章 / 节 / 点）—— 拼 hash 用它 |
| `name` | 显示名 |
| `_level` | `1`=章、`2`=节、`3`=点 |
| `children` | 下一层 |
| `finished` | `1`=已完成、`0`=未完成 |
| `icon_list[]` | **非空 = 这个节点就是任务点**；`{ id, type, type_name, catalog_id }` |
| `task_id` | ⚠️ **在本接口里恒为 0**，不要拿它当测验 tid |

实测规模：10 个 L1、54 个 L2、40 个 L3。

**为什么 `task_id` 是 0 不影响本方案**：拼 hash 用的是 `sourceId = icon_list[0].id`，url 里根本不需要 tid；跳到测验之后，tid 白写在测验 iframe 的 `src` 里（`/exam/{tid}`），现成的 `quizTidOnPage()`（`src/sites/uooc/ai/index.ts:111`）已经在读它。**所以不必额外打 `getUnitLearn`。**

### A.2 路径模板

抄自站点自己的 ui-router 状态表（`local/capture/uirouter-states.json`，不是猜的）：

| 状态 | 模板 |
| --- | --- |
| `main` | `/:courseId` |
| `main.chapter` | `/{chapterId}` |
| `main.chapter.section` | `/{sectionId}` |
| `main.chapter.section.point` | `/{pointId}` |
| **`main.chapter.section.source`** | **`/{sourceId}/section`** |
| **`main.chapter.section.point.source`** | **`/{sourceId}/subsection`** |

于是两个常量模板：

```
任务点挂在「节」上（三级课程：章 → 节 → 资源）
    #/{cid}/{chapterId}/{sectionId}/{sourceId}/section

任务点挂在「点」上（四级课程：章 → 节 → 点 → 资源）
    #/{cid}/{chapterId}/{sectionId}/{pointId}/{sourceId}/subsection
```

**实例验证**：`dom-uooc-exam-旧-提交未通过-单选-多选-判断.txt` 里节点 `1482506601`（icon `124739605`）当时的页面 hash 正是 `#/2005836044/766102022/1482506601/124739605/section` ✓。

> ⚠️ `/subsection` 那条**只有模板、还没抓到实例**（实测数据里所有任务点都挂在 L2）。落地时必须真跑一次四级课程验证（见 §F-1）。

### A.3 类型字典

一门课全量实测（`icon_list[0].type`）：

| type | 含义 | 本课数量 | DOM 图标 |
| --- | --- | --- | --- |
| `10` | 视频 | 36 | `icon-video` |
| `50` | 附件 | 20 | `icon-wendang1`（3） |
| `70` | 讨论 | 1 | `icon-discuss`（1） |
| `80` | 测验 | 10 | `icon-pencil`（1） |

> 早期笔记里出现过 `60` 和 `0`，本次数据里没有，**语义未知**，按 §C.4 处理。

---

## §B 节点模型：什么是「下一个任务点」

### B.1 任务点集合

遍历整棵树，**收集所有 `icon_list` 非空的节点**。不区分三级 / 四级 —— 差别只在拼出来的 hash 长什么样，处理逻辑完全一样。

### B.2 顺序 = 先序遍历

顺序就是树本身的顺序（`data` 数组顺序 → 递归 `children`）。**实现上不要依赖 `parent` / `pid` 字段往回找祖先**：递归时自己把「章 id、节 id」一路带下去，得到的就是权威的祖先链，拼 hash 直接用。

### B.3 起点：第一个未完成任务点

按 B.2 的顺序，取第一个 `finished` 不是 1 的任务点。判定一律用 `Number(finished) === 1`（这个接口里数字和字符串两种形态都见过）。

**为什么固定从第一个未完成开始，而不是从「当前停留在哪」开始**：用户拍板。少一个状态来源，少一类 bug。用户手动跳着看是另一回事 —— 手动操作后目录 hash 变了，但【接管】下次启动仍从头扫。

### B.4 跳转：改 `location.hash`

**不点目录、不调路由 API**，直接：

```ts
location.hash = `#/${cid}/${chapterId}/${sectionId}/${sourceId}/section`;
```

让站点自己的 Angular ui-router 接手（用户拍板「方案 A」）。

跳完要**等页面真的换过去**：hash 变化后路由是异步的，必须等目标节点对应的内容出现（视频 → `video` 元素；测验 → 带 tid 的 iframe），不能只 `await sleep(固定值)`。

### B.5 「做完了没」以谁为准

**以重新请求 `getCatalogList` 拿到的 `finished` 为准**，不看 DOM 上的 `complete` 类名。

每个任务点做完之后**重拉一次整棵树**（用户拍板「方案 A」）—— 比增量猜测简单得多，一次请求几 KB。

---

## §C 一个任务点做完之后

按 `icon_list[0].type` 分派：

### C.1 `10` 视频

1. 跳过去，等 `video` 元素出现并可用。
2. **完全看到底**，等 `ended` 事件。
3. `ended` 之后**等 5 秒**（站点上报完成状态需要时间），再重拉 `getCatalogList`。
4. 看这个节点 `finished` 是否变成 1 → 见 §F-3。

> 二倍速 / 静音 / 防失焦这三个既有功能**保留**，行为不变。
> ⚠️ 跳过去之后是否要把 `currentTime` 归零（站点可能带 `video_pos` 从中途续播），见 §F-2。

### C.2 `80` 测验

1. 跳过去，等**测验 iframe 加载完并且题目真的渲染出来**（用户 m06445 第 3 条）。**超时 60 秒**。
2. 超时 → **全屏 `showModalAlert` 提醒 + 停止接管**；按钮只有一个【知道了】，点完就停在那儿，等用户手动重开（用户 m06522 Q5 + 本轮拍板）。
3. 正常 → `quizTidOnPage()` 取 tid（取不到 → 停），交给现有的 `runQuizAnswer(tid, host)`。
4. 答完重拉 `getCatalogList`。

> 交卷仍然要走二次确认门禁（N1），这条不变。

### C.3 `50` 附件 / `70` 讨论

**不打开，直接跳过**（用户拍板 E）—— 不跳转、不等待，直接算下一个。

### C.4 其它类型（`60` / `0` / 未来新增）

**默认跳过**，并在日志里 `warn` 一次「遇到未知类型 N，已跳过」——不能默默吞掉。

---

## §D 停止条件

| 触发 | 行为 |
| --- | --- |
| 没有未完成任务点了 | 停，状态行显示「全部完成」 |
| 点【停止接管】 | **立刻停**，不等收尾 |
| 测验等 60 秒没出题 | 全屏提醒 + 停 |
| 测验读不出 tid | 停 + 日志说明 |
| `getCatalogList` 重拉失败 | 见 §F-4 |

状态行要能随时看出「停在哪一项、为什么停」。

---

## §E UI

### E.1【接管】页（`src/sites/uooc/tabs/autoplay.ts`）

- 标签页标题 `连播` → **`接管`**。
- 按钮文案 `开始连播` / `停止连播` → **`开始接管` / `停止接管`**。
- **标签 id `uooc:autoplay` 不改**：`activateTab()` 的调用点和构建校验都按这个 id 找，改 id 是纯风险没收益。
- 布局维持现状：**两个按钮 + 实时状态行在最上方**，下面才是 `GROUP.AUTOPLAY` 那组设置。
- 状态行文案示例：
  - `已停止 —— 点【开始接管】从第一个未完成任务点接着走`
  - `接管中：正在播放第 2 章 第 3 节「1.3 绪论」（3/76 已完成）`
  - `已停止 —— 全部任务点都完成了`
  - `已停止 —— 测验「第一章 章节测试」等 60 秒还没出题`

### E.2【监视】页（`src/sites/uooc/tabs/monitor.ts`）

**内容区顶部新增一块「课程进度」**，下面是原有的 AI 答题监控列表（用户本轮拍板）：

- 进度条：`已完成 / 任务点总数`（分母 = 全树 `icon_list` 非空节点数，**不用等 DOM**，这是新方案白捡的）。
- 分层列表：章 → 节 → 任务点，每行显示 `类型图标 + 名称 + ✅/⬜`，**当前正在处理的那一项高亮**。
- 只显示**当前课程**（用户拍板 H）。

### E.3 设置项（`src/sites/uooc/settings.ts`）

| 设置项 | 处置 |
| --- | --- |
| `WAIT_BEFORE_MS` 跳转后等待 | 保留 |
| `HOLD_AFTER_MS` 播完后停留 | 保留。⚠️ 与 §C.1 的「`ended` 后等 5 秒」是不是同一件事，见 §F-5 |
| `AI_ANSWER` | 保留（🔴 irreversible），语义变成「接管走到测验就交给它」 |
| 四个 `skip-*` | **上一次改动已删**，不再复活 |

### E.4 公共能力：`showModalAlert`（**已落地**，commit `db0bbaa`）

新增 `src/common/ui/widgets/modal.ts`，把原来 `confirm.ts` 与 `auth-alert.ts` 各写一份的「灰遮罩 + 居中盒子 + N 个按钮」抽成一份：

```ts
showModalAlert(shadowRoot: ShadowRoot, options: ModalOptions): Promise<string | null>
```

关键选项：
- `cancelKey` —— **给了**才允许「点遮罩 / 按 Esc」关掉；**不给就是只能点按钮**（`auth-alert` 就靠这条保持「必须明确选一个按钮」）。
- `actions: ModalAction[]` —— 顺序即渲染顺序，**最后一个按钮自动获焦**。
- `dedupeClass` —— 判重类名，同时作为遮罩附加类名。
- `boxClass` —— 对话框本体附加类名。

`showConfirm` / `showAuthAlert` 已改成各十几行的薄包装，行为完全等价。§C.2 的测验超时提醒直接用 `showModalAlert`，不再抄第三份。

---

## §F 待定 / 待实测

| # | 事项 | 影响 |
| --- | --- | --- |
| 1 | **四级课程（`/subsection`）路径没实例验证过** | 拼错就跳不到。落地时必须拿一门四级课程真跑一次 |
| 2 | 视频跳过去后是否 `currentTime = 0` | 「完全看到底」是否包含「从头看」 |
| 3 | `ended` + 5 秒后 `finished` **仍是 0** 怎么办 | 重播一次？还是跳过继续？需要一个上限 |
| 4 | `getCatalogList` 重拉失败（网络 / 登录态失效） | 重试几次？还是直接停 |
| 5 | `HOLD_AFTER_MS`（默认 3000）与「`ended` 后 5 秒」是不是同一件事 | 是 → 改默认值为 5000；不是 → 两个常量并存 |
| 6 | 走到测验但 **`AI_ANSWER` 关着** 时怎么办 | 停下等你，还是跳过 |
| 7 | `type = 60` / `0` 的真实语义 | §C.4 的兜底够不够 |

---

## §G 落地后要清理的东西

**用户拍板：等新方案写完再清理**（现在一行都不删）。候选：

- `src/sites/uooc/autoplay.ts` —— 整份重写，所有 DOM 点击逻辑（`.active` 识别、`SKIP_ATTR` 三道闸、章节展开、看门狗）作废。
- `src/sites/uooc/intercept.ts`（14 KB）—— XHR 嗅探目录接口，新方案直接自己发请求，需评估是否还有别的用处。
- `src/sites/uooc/catalog.ts`（1.8 KB）。
- `src/sites/uooc/ai/fill.ts` 里的新版分支。
- 相关文档：`docs/UOOC-连播与答题-需求细则.md`（本文件取代它）、`docs/UOOC-双版目录结构底图.md` 里的旧版目录部分。

**不动的**：`video.ts`、`ai/`（parse / prompts / llm / paper / runner / monitor）、`settings.ts` 的其余部分。

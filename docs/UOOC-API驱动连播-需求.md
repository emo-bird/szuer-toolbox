# UOOC 旧版课程页 · API 驱动「接管」需求

> **状态**：**设计已定稿**（分支 `feat/uooc-api-driven`，2026-10-08）
> §F 的 7 项待定**已全部拍板**（见 §F.1），**代码尚未开始**。
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

> ⚠️ `/subsection` 那条**只有路由表、没有任何实际页面的实证**（2026-10-08 全量扫过
> `local/capture/` + `local/slices/` + `local/derived/`）。三条相关证据：
> - `local/capture/uirouter-states.json:66` — `"url": "/{sourceId:[0-9]+}/subsection"`（路由表）；
> - `local/capture/uirouter-states.json:68` — `"absUrl": "#/2005836044/1615083612/485998255///subsection"`
>   （**注意 `///` —— pointId 与 sourceId 都是空的**，不是五段数字）；
> - `local/slices/uooc-learn-unit.json:160` — `…&section_id=1629578551&show=&subsection_id=0`（**恒为 0**）；
> - 站点 JS 里确有 `if (lastLearn.subsection_id > 0) {` 的分支（在 `local/capture/uooc-完整流程.flow` 内嵌的 JS 里）。
>
> ⇒ **机制存在，但可能没有课程在用**。落地口径见 §F.1-1（本轮拍板）：**只支持三级路径**
> （`/section`，有实例），算出来是四级形态（`/subsection`）时**直接停止接管并提示**，
> **不做「按路由表猜着拼」的降级**。

### A.3 类型字典

一门课全量实测（`icon_list[0].type`）：

| type | 含义 | 本课数量 | DOM 图标 |
| --- | --- | --- | --- |
| `10` | 视频 | 36 | `icon-video` |
| `50` | 附件 | 20 | — |
| `60` | **文本** | **0（本课）** | `icon-wendang1`（站点模板实证） |
| `70` | 讨论 | 1 | `icon-discuss`（1） |
| `80` | 测验 | 10 | `icon-pencil`（1） |

> **`60` = 文本**（2026-10-08 补证，两条实证）：
> - 站点模板：`<span ng-if="source.type == 60" class="tag-source-ico iconfont icon-wendang1">`
>   （`local/derived/20261008/pp-小测.txt:697`）；
> - 接口响应：`"type":"60","catalog_id":637260621,"type_name":"文本"`
>   （`local/slices/uooc-catalog-full.json:76`，全文件出现 138 次；`local/slices/uooc-catalog.json:76` 3 次）。
>
> **本课（cid `2005836044`）没有 `60` 节点**（`local/capture/catalog-list.json` 只有 10/50/70/80），
> 但**别的课程有**。处理方式同 `50` / `70`：**不打开，直接跳过**（见 §C.4）。
>
> **`0` 仍然零实证** —— 整个 `local/` 里只搜到模板里一个空的 `<!-- ngIf: source.type == 0 -->`
> 分支（`local/derived/20261008/pp-小测.txt:158`）。按 §C.4 的未知类型兜底处理。
>
> ⚠️ 站点模板里 `icon-wendang1` 绑的是 `type == 60`，而旧版目录 DOM 里实测只有 3 个
> `icon-wendang1` 却有 20 个 `type 50` 附件 —— **图标与类型的对应关系存疑**，但不影响本方案
> （新方案不再靠图标判断类型，只用 `icon_list[0].type`）。

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
（`WAIT_BEFORE_MS` 只是「改完 hash 后、开始等元素出现之前」的固定 sleep，见 §E.3。）

⚠️ **四级路径（`/subsection`）不支持**（§F.1-1）：算出来是四级形态时**不跳**，停止接管并提示。

### B.5 「做完了没」以谁为准

**以重新请求 `getCatalogList` 拿到的 `finished` 为准**，不看 DOM 上的 `complete` 类名。

每个任务点做完之后**重拉一次整棵树**（用户拍板「方案 A」）—— 比增量猜测简单得多，一次请求几 KB。

---

## §C 一个任务点做完之后

按 `icon_list[0].type` 分派：

### C.1 `10` 视频

1. 跳过去，等 `video` 元素出现并可用（**超时 = 全局等待超时**，见 §E.3 / §E.5）。
2. **完全看到底**，等 `ended` 事件。
3. `ended` 之后**等 `HOLD_AFTER_MS`（默认 `5000`）**（站点上报完成状态需要时间），再重拉 `getCatalogList`。
4. 看这个节点 `finished` 是否变成 1：
   - 是 `1` → 按 §B.5 算下一个。
   - 仍是 `0` → **再等一个「全局等待超时」（默认 30 秒）**，**再重拉一次**。
   - 第二次仍然是 `0` → **全屏 `showModalAlert` 提醒 + 停止接管**。
   ⇒ **不重播**，最多多等一轮，上限明确。

> 二倍速 / 静音 / 防失焦这三个既有功能**保留**，行为不变。
> **不碰 `video.currentTime`**（§F.1-2 拍板）：站点带 `video_pos` 就从那儿续播，脚本不做任何
> 归零 / 恢复，「完全看到底」= 只管等 `ended`。

### C.2 `80` 测验

1. 跳过去，等**测验 iframe 加载完并且题目真的渲染出来**（用户 m06445 第 3 条）。
   **超时 = 全局等待超时（默认 30 秒）**。
   ⚠️ 这一条 **推翻了原先写死的 60 秒**（用户本轮拍板：**除 API 请求本身以外**的等待，
   一律统一到同一个设置项，见 §F.1-5）。
2. 超时 → **全屏 `showModalAlert` 提醒 + 停止接管**；按钮只有一个【知道了】，点完就停在那儿，等用户手动重开（用户 m06522 Q5 + 本轮拍板）。
3. 正常 → `quizTidOnPage()` 取 tid（取不到 → 停），交给现有的 `runQuizAnswer(tid, host)`。
4. 答完重拉 `getCatalogList`。

> **`AI_ANSWER` 关着的时候**（§F.1-6 拍板）：与第 2 步**完全同一套** —— 不尝试作答、
> 不跳过、不自动往下走，直接 `showModalAlert` + 停止接管，只有文案不同。
> 理由：静默跳过 = 在用户不知情的情况下漏掉整个测验；停下来让他选，是唯一不替他做决定的选项。

> 交卷仍然要走二次确认门禁（N1），这条不变。

### C.3 `50` 附件 / `70` 讨论

**不打开，直接跳过**（用户拍板 E）—— 不跳转、不等待，直接算下一个。

### C.4 `60` 文本 / `0` / 未来新增

- **`60` 文本**（已实证，见 §A.3）：与 `50` / `70` 同样处理 —— **不打开，直接跳过**。
- **其余任何 `type`**（含零实证的 `0`、以及未来新增）：**默认跳过**，并在日志里 `warn` 一次
  「遇到未知类型 N，已跳过」——不能默默吞掉。

> 代码里的「已知类型」集合 = `{10, 50, 60, 70, 80}`，只有集合外的才 `warn`。

---

## §D 停止条件

| 触发 | 行为 |
| --- | --- |
| 没有未完成任务点了 | 停，状态行显示「全部完成」 |
| 点【停止接管】 | **立刻停**，不等收尾 |
| 测验等满「全局等待超时」还没出题 | 全屏 `showModalAlert` + 停（§C.2） |
| 走到测验但 `AI_ANSWER` 关着 | 全屏 `showModalAlert` + 停（§C.2 / §F.1-6） |
| 测验读不出 tid | 停 + 日志说明 |
| 视频 `ended` + `HOLD_AFTER_MS` + 二次等待后 `finished` 仍是 0 | 全屏 `showModalAlert` + 停（§C.1 / §F.1-3） |
| `getCatalogList` 三次请求（含首次）全失败 | 全屏 `showModalAlert` + 停（§E.6 / §F.1-4） |
| 算出来的目标是四级路径（`/subsection`） | 停 + 提示，**不做降级猜测**（§F.1-1） |

状态行要能随时看出「停在哪一项、为什么停」。

---

## §E UI

### E.1【接管】页（`src/sites/uooc/tabs/autoplay.ts`）

- 标签页标题 `连播` → **`接管`**。
- 按钮文案 `开始连播` / `停止连播` → **`开始接管` / `停止接管`**。
- **标签 id `uooc:autoplay` 不改**：`activateTab()` 的调用点和构建校验都按这个 id 找，改 id 是纯风险没收益。
- 布局：**只有两个按钮 + 实时状态行**。原来放在这一页的 `GROUP.AUTOPLAY` 那组设置
  **整组搬到新的【等待】页**（§E.5，本轮拍板），这一页**不再渲染设置组**。
- 状态行文案示例：
  - `已停止 —— 点【开始接管】从第一个未完成任务点接着走`
  - `接管中：正在播放第 2 章 第 3 节「1.3 绪论」（3/76 已完成）`
  - `已停止 —— 全部任务点都完成了`
  - `已停止 —— 测验「第一章 章节测试」等满等待超时还没出题`
  - `已停止 —— 测验「第一章 章节测试」到了，但 AI 作答没开`
  - `已停止 —— 视频「1.3 绪论」播完两轮仍未记完成`
  - `已停止 —— 这门课有四级目录，本版不支持`

### E.2【监视】页（`src/sites/uooc/tabs/monitor.ts`）

**内容区顶部新增一块「课程进度」**，下面是原有的 AI 答题监控列表（用户本轮拍板）：

- 进度条：`已完成 / 任务点总数`（分母 = 全树 `icon_list` 非空节点数，**不用等 DOM**，这是新方案白捡的）。
- 分层列表：章 → 节 → 任务点，每行显示 `类型图标 + 名称 + ✅/⬜`，**当前正在处理的那一项高亮**。
- 只显示**当前课程**（用户拍板 H）。

### E.3 设置项（`src/sites/uooc/settings.ts`）

| 设置项 | 处置 |
| --- | --- |
| `WAIT_BEFORE_MS` 跳转后等待 | **保留**（默认 `5000` 不变）。语义定死为「改完 `location.hash` 之后、开始等元素出现之前的固定 sleep」（§F.1-5） |
| `HOLD_AFTER_MS` 播完后停留 | **保留，默认值 `3000` → `5000`**。它就是 §C.1 的「`ended` 后等 5 秒」，**不再有第二个常量**（§F.1-5 拍板：两件事是同一件） |
| **`WAIT_TIMEOUT_MS` 全局等待超时** | **新增**，存储 id `wait-timeout-ms`，默认 `30000`。**除 API 请求本身之外，所有「等某个条件出现」的超时都用它**（§E.5） |
| `AI_ANSWER` | 保留（🔴 irreversible），语义变成「接管走到测验就交给它」 |
| 四个 `skip-*` | **上一次改动已删**，不再复活 |

> 这三个等待设置项**整组搬到新的【等待】页**（§E.5），【接管】页只剩两个按钮和状态行（本轮拍板）。

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

### E.5 新增标签页【等待】（`src/sites/uooc/tabs/wait.ts`）

本轮拍板：**真的要开一个新页**，不是塞进【接管】页。

- 标签 id **`uooc:wait`**，标题 **`等待`**，`order: 240`
  （现有：`video` 200 / `autoplay` 210 / `ai` 220 / `monitor` 230）。
- 页面内容 = 三个等待设置项，**仍在 `GROUP.AUTOPLAY` 这一组里**（UOOC 专属，不新增分组）：
  | 设置项 | 存储 id | 默认值 |
  | --- | --- | --- |
  | 全局等待超时 | `wait-timeout-ms`（**新增**） | `30000` |
  | 跳转后等待 | `wait-before-ms`（不变） | `5000` |
  | 播完后停留 | `hold-after-ms`（不变；默认值 `3000` → `5000`） | `5000` |
- 【接管】页（§E.1）只剩【开始接管】/【停止接管】两个按钮 + 状态行，**不再渲染设置组**。
- ⚠️ 两个旧设置项的**存储 id 一个都不改**，只是渲染位置从【接管】页换到【等待】页
  ⇒ **不涉及旧值迁移**（红线 N1 相关的「危险开关旧值不搬」在这里不适用，因为这两个是纯数值项）。
- ⚠️ 新标签页要同步 `@match` / 注册表那两份清单，并让 `tools/verify-build.mjs` 与
  `tests/suites/sites-registered.test.ts` 覆盖到它（§7.4 第 14 条的坑）。

### E.6 非答题 API 的取数封装（`src/sites/uooc/fetch-catalog.ts`）

§F.1-4 拍板的落地形状：

| 项 | 值 |
| --- | --- |
| 适用范围 | **只做在 UOOC 自己的取数封装里**；**不改** `src/common/core/http.ts` 的 `request()` |
| 方法限制 | **只对 GET 重试**（幂等）；POST 一律不重试 |
| 次数 | **共 3 次请求**（首次 + 2 次重试） |
| 重试间隔 | **2 秒** |
| 单次超时 | **30 秒** |
| 全部失败 | 停止接管 + 全屏 `showModalAlert`（§D） |

> ⚠️ **刻意不做成全站 `core/http` 的全局重试**：bkxk 的抢课 / 选课走的是同一个 `request()`，
> 且都是**非幂等 POST**，在那儿加重试会带来重复提交。
> 这条理由写在这里，**以后别再「顺手统一」**。

---

## §F 待定项 —— **2026-10-08 全部结清**

### F.1 已结（本轮用户逐条拍板）

| # | 事项 | 拍板结果 |
| --- | --- | --- |
| 1 | 四级课程（`/subsection`）路径没有实际页面的实证 | **只支持三级路径**（`/section`，有实例）。算出来是四级形态（`/subsection`）时**直接停止接管并提示**，**不做**「按路由表猜着拼」的降级。⚠️ 这比原先文档里的建议（原样支持 + `warn` 跳过）**更保守**，是本轮改选的结果。判据与「不跳」的落点见 §B.4 |
| 2 | 视频跳过去后是否 `currentTime = 0` | **不处理**：让站点自己恢复进度（`video_pos`），脚本不碰 `currentTime`。见 §C.1 |
| 3 | `ended` + 5 秒后 `finished` **仍是 0** | **再等一个「全局等待超时」（默认 30 秒）→ 再重拉一次**；第二次仍是 `0` → `showModalAlert` + 停止接管。**不重播**，上限明确。见 §C.1 |
| 4 | `getCatalogList` 重拉失败（网络 / 登录态失效） | **共 3 次请求（含首次）**、**间隔 2 秒**、**单次超时 30 秒**、**只对 GET**、**只做在 UOOC 自己的取数封装里**。全失败 → 停止接管 + `showModalAlert`。见 §E.6 |
| 5 | `HOLD_AFTER_MS`（默认 3000）与「`ended` 后 5 秒」是不是同一件事 | **是同一件事** ⇒ `HOLD_AFTER_MS` 默认值改 **`5000`**，`ended` 后就用它，**不再有第二个常量**。`WAIT_BEFORE_MS` **保留**，语义定死为「改完 hash 后、开始等元素出现之前的固定 sleep」。另外**新增 `WAIT_TIMEOUT_MS`（默认 `30000`）** 作为「**除 API 请求本身以外**所有等待」的统一超时，并**新开一个标签页【等待】**承载这三个设置。见 §C.1 / §E.3 / §E.5 |
| 6 | 走到测验但 **`AI_ANSWER` 关着** 时怎么办 | **停下等你**：与测验超时**同一套** `showModalAlert` + 停止接管，只有文案不同。见 §C.2 |
| 7 | ~~`type = 60` / `0` 的真实语义~~ —— 2026-10-08 已查清：`60` = 文本（模板 + `type_name` 双实证，见 §A.3）；`0` = 零实证、不存在。**已并入 §C.4** | ✅ 已结 |

> ⚠️ **连带改动（本轮推翻了旧文档的写法）**：
> - §C.2 的「测验出题超时 60 秒」→ **改成全局等待超时（默认 30 秒）**。
> - §F-1 的「四级课程原样支持 + warn 跳过」→ **改成只支持三级、遇四级直接停**。

### F.2 仍然待实测的（**不阻塞开工**）

| # | 事项 | 说明 |
| --- | --- | --- |
| A | 四级课程真实页面长什么样 | 已拍板「不支持、直接停」，所以只差一个**真跑到四级课程时的现场样本**，用来确认「识别四级」的判据没写错 |
| B | 站点上报 `finished` 的真实延迟分布 | `HOLD_AFTER_MS` 定成 5000 只有 §C.1 那一轮的手测数据支撑；跑几门课后可能值得回头调 |

---

## §G 落地后要清理的东西

**用户拍板：等新方案写完再清理**（现在一行都不删）。本轮又补拍两条：

- **新循环落点 = 新建 `src/sites/uooc/takeover.ts`**（本轮拍板），旧的
  `src/sites/uooc/autoplay.ts` **一行不动** —— 随时可比对 / 回退。等新方案跑通手测后再按下面清理。
- **不复用 git 历史里的旧 `catalog.ts` 实现**（本轮拍板）：`b701b6b`
  （`feat(uooc): 自动连播 U3`）那版 273 行里确实有实测过的 `parseCatalogTree` /
  `sourceHash`（hash 模板与 §A.2 完全一致）/ `courseIdFromLocation`，但它的模型是
  「树里只有章节点、资源要靠 `getUnitLearn` 逐个查」，与新方案（`icon_list` 非空即任务点）
  不同。**只作参考，不移植**。取样命令：
  `git show b701b6b:src/sites/uooc/catalog.ts`

候选清理清单：

- `src/sites/uooc/autoplay.ts` —— 整份重写，所有 DOM 点击逻辑（`.active` 识别、`SKIP_ATTR` 三道闸、章节展开、看门狗）作废。
- `src/sites/uooc/intercept.ts`（14 KB）—— XHR 嗅探目录接口，新方案直接自己发请求，需评估是否还有别的用处。
- `src/sites/uooc/catalog.ts`（1.8 KB）。
- `src/sites/uooc/ai/fill.ts` 里的新版分支。
- 相关文档：`docs/UOOC-连播与答题-需求细则.md`（本文件取代它）、`docs/UOOC-双版目录结构底图.md` 里的旧版目录部分。

**不动的**：`video.ts`、`ai/`（parse / prompts / llm / paper / runner / monitor）、`settings.ts` 的其余部分。

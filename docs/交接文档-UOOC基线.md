# 交接文档 · UOOC 基线（szuer-toolbox）

> ⚠️ **历史快照（2026-10 清理后）**：本文描述 `087b476` 的旧基线，其中 `demo/` 适配器、
> `common/core/bus.ts`、`uooc/autoplay.ts` 等**现已删除**；现行状态见 `docs/README.md`。
>
> **基准点**：commit **`087b476`** —— `style(uooc): 简化设置项文案，去掉长说明与 markdown 星号`
> （分支 `docs/handoff-uooc-baseline`，就是本文所在的分支；工作树干净）。
>
> **本文只描述 `087b476` 这一点的状态。** 它是在这个提交上**从零写的精简版**，
> 不是把旧版 `docs/交接文档.md` 改出来的（那份写于 `df23206`，里面还写着
> 「UOOC 适配器是空壳、一行功能代码都没写」，与 `087b476` 已经对不上）。
>
> 读取顺序建议：**本文（§1–§4）→ `docs/环境文档.md` → `docs/开发文档.md` §3（UOOC 平台）**。
> 不要从 `docs/开发文档.md` 开头顺序读，它 2200+ 行，前面全是 bkxk 的历史。

---

## 1. 一句话现状

**这是一份「框架 + 站点适配层」结构的深大校园油猴脚本。阶段 1（框架）与阶段 2（bkxk 抢课 / 课表 / 列表注入 / 自定义课程）已经全部做完并通过真机手测；阶段 3（UOOC 优课联盟）只做了「视频助手」三件套（U1 二倍速 / U2 静音 / U4 防暂停）并把设置搬进了站点自己的标签页。UOOC 的答案采集与 AI 答题（U5–U9）一行都没写。**

| 指标 | 数值 |
|---|---|
| 产物 | `dist/szuer-toolbox.user.js`，**构建号 49**，252,649 字节（`verify` 读数：232,740 字符 / 7,029 行） |
| 测试 | `npm test` → **576 项，25 个套件，951 ms，全部通过** |
| 类型检查 | `npm run typecheck` 干净 |
| 产物自检 | `node tools/verify-build.mjs` → 26 项，**25 OK / 1 FAIL**（见 §8.1，是检查本身过时，不是产物坏了） |

---

## 2. 基线快照

```pwsh
git log -1 --format='%h %s'          # 应为 087b476 …
git status --short                    # 应为空
npm run typecheck ; npm test ; node tools/verify-build.mjs
```

⚠️ **只核对基线时别跑 `npm run check`** —— 它会递增 `dist/.build-no` 并重写产物，
把工作树弄脏。

**分支表（`087b476` 当时的状态）**

| 分支 | HEAD | 说明 |
|---|---|---|
| **`docs/handoff-uooc-baseline`** | `087b476` | 本文所在分支，从 `087b476` 新建 |
| **`feat/uooc-ai`** | `087b476` | UOOC 阶段 3 主线，本文描述的就是它的当前状态 |
| `feat/uooc-phase3` | `48567bf` | 另一条 UOOC 线：旧方案（测验答案采集与回填），逆向结论留在那边的 `docs/UOOC-制作方案.md`，**不在本分支** |
| `feat/bkxk-tasks-monitor` | `aacf9f3` | 阶段 2 全部工作所在分支 |
| `master` | `e525d7a` | 只有阶段 1 骨架，落后主线 60+ 个提交（`origin/master` 上） |
| `feat/framework-skeleton` | `e525d7a` | 阶段 1 |
| `feat/bkxk-migration` | `113c99f` | 阶段 2 早期 |
| `feat/bkxk-list` | `cc45f8f` | 批 3 列表注入 |
| `feat/bkxk-courses-time` | `4dca56c` | 批 2 数据层 |
| `feat/bkxk-tt-refetch` | `499ad14` | 课表页取数 |
| `backup/after-ca7265e` | `84ff6db` | 🚫 **死存，不得读取 / diff / 合并 / 推送** |
| `feat/bkxk-tt-late-render` | `f69288f` | 🚫 **死分支**：「自己去取数交给站点渲染器重画」的试验，用户已判定无效并拍板不再排查，永久不合并 |

**目录**：`src/`（`common/` 框架 + `sites/` 适配层）、`tests/`（25 个档 1 套件）、`tools/`、
`docs/`、`dist/`（**产物随 git 提交**）、`local/`（**不随 git**，参考脚本与抓包都在这里）。

---

## 3. 仓库结构

- **构建**：TypeScript → esbuild 打包 → 单产物 `dist/szuer-toolbox.user.js`。
  `build.mjs` 用 `spawnSync` **直调** `node_modules/@esbuild/win32-x64/esbuild.exe` +
  fd 重定向（原因见 §7.1），`--loader:.css=text` 把 CSS 打成字符串内联。
  头模板 `src/userscript-header.txt`（`{{VERSION}}` / `{{BUILD_TIME}}` / `{{BUILD_NO}}`），
  构建号计数在 `dist/.build-no`（**gitignored**）。
- **公共层 `src/common/`**：`core/http.ts`（串行请求队列 + 优先级 + 限流）、
  `core/settings.ts`（开关与配置项注册 + 风险门禁）、`core/storage.ts`（油猴下走 GM 存储）、
  `core/log.ts`（500 条环形缓冲 + 读取期过滤 + `scoped()`）、`core/limits.ts`、`core/bus.ts`。
- **公共 UI `src/common/ui/`**：自研悬浮窗 `panel.ts`（Shadow DOM）+ `panel-geometry.ts` +
  `tab-order.ts`（标签排序与分组）+ `tabs/{settings,log,login,status}.ts` +
  `widgets/{confirm,toast,checkbox,settings-form,auth-alert}.ts`。
- **适配层 `src/sites/`**：契约 `types.ts`（`SiteAdapter` / `SiteToggleDef` / `TabRegistration`），
  注册表 `registry.ts`，装配 `index.ts`；三个适配器 —— `bkxk/`（完整）、`uooc/`（见 §4.3）、
  `demo/`（`localhost` 演示适配器，保留到阶段 3 结束再删）。
- **油猴头**：`@match *://*.szu.edu.cn/*` + `@match *://*.uooc.net.cn/*`，
  `@grant unsafeWindow`，**不声明 `GM_xmlhttpRequest`、不声明 `@connect`**，
  `@run-at document-start`，`@noframes`。作者 emo-bird。

---

## 4. 已经做完的

### 4.1 框架（阶段 1）

工程骨架、公共层、悬浮窗与四个公共标签页、适配器契约与注册表、三个适配器骨架 —— 全部完成。
`tools/verify-build.mjs`（产物自检）与 `tests/suites/sites-registered.test.ts`（注册一致性）
是这一层的护栏。

### 4.2 bkxk（阶段 2，四批全完，已真机验收）

| 批 | 内容 | 关键文件 |
|---|---|---|
| 批 1 | 请求层 / 设置 / 风险门禁 / 旧数据迁移 | `bkxk/api.ts`、`bkxk/session.ts`、`bkxk/settings.ts` |
| 批 2 | 数据层：课程与时间解析 | `bkxk/courses.ts`、`bkxk/time.ts` |
| 批 3 | 列表注入 + 响应接管（课表 / 冲突） | `bkxk/list.ts`、`bkxk/hijack.ts`、`bkxk/timetable.ts` |
| 批 4 | 抢课队列 + 余量监控（引擎 + 两个标签页） | `bkxk/tasks*.ts`、`bkxk/monitor*.ts`、`bkxk/tabs/{tasks,monitor}.ts` |

**bkxk 的接口与 DOM 结论全在 `docs/开发文档.md` §4（约 1000 行），本文不复述。**

### 4.3 UOOC（阶段 3，只做了视频助手）

**三个功能：U1 二倍速、U2 静音、U4 防暂停。都是「锁」不是「一次性设置」** ——
用户明确要求：只要开关开着，站点播放器上的倍速菜单与音量控制在开启期间等于失效，
用户自己在播放器里改回去会被立刻扳回。

| 文件 | 行数 | 内容 |
|---|---|---|
| `src/sites/uooc/index.ts` | 81 | 适配器本体 |
| `src/sites/uooc/settings.ts` | 107 | 开关与配置项**声明**（不实现行为） |
| `src/sites/uooc/tabs/settings.ts` | 32 | UOOC 自己的【设置】标签页 |
| `src/sites/uooc/video.ts` | 325 | 视频助手实现 |

**`src/sites/uooc/index.ts`**
- `HOSTS = ['uooc.net.cn', '*.uooc.net.cn']`（两条都要写，通配不含裸域）。
- `PAGES = ['/home/learn/index*', '/home/learn/new/*', '/exam/*']` —— 命中才自动展开悬浮窗。
  旧版答题界面是**嵌在旧版学习页里的 iframe**（`/exam/paper?cid=&tid=`），由第一条覆盖。
- `earlyInit()` 只调 `registerUoocSettings()`（此刻 `document.body` 还不存在，**不碰 DOM**）。
- `init(ctx)` 先 `applyUoocSettings()`，然后**只在 `location.pathname` 以 `/home/learn/` 开头时**
  调 `startVideoAssist()`（测验页没有播放器，挂着只是白跑观察器）。

**`src/sites/uooc/video.ts`**
- 播放器查找三级：`#player_html5_api`（video.js 默认 id）→ 页面里任意 `<video>` →
  同源 iframe 内（带缓存 + 2 s 最小间隔）。**不依赖 `instanceof HTMLVideoElement`**
  （沙箱里可能不是同一个构造器）。
- 关键常量：`VIDEO_ID='player_html5_api'`、`TARGET_RATE=2`、
  `RESCAN_DEBOUNCE_MS=200`、`FRAME_FALLBACK_MIN_GAP_MS=2000`、
  `FIGHT_WINDOW_MS=5000` / `FIGHT_MAX=8` / `FIGHT_COOLDOWN_MS=5000`。
- 不用参考脚本的 `setInterval(..., 1000)`：站点是 SPA，换集时 video 元素会被 video.js
  重建。这里改成 **MutationObserver（200 ms 合并）+ document 捕获阶段的媒体事件**
  （`play` / `playing` / `pause` / `ratechange` / `volumechange`）+ `loadstart` /
  `loadedmetadata` + `hashchange` / `popstate`。
- `restorePlayback(v)`（U4 抢播）必须**同时**满足：开关开着、`hasStarted.has(v)`、
  `!v.ended`、`readyState >= 2`、`playGuard()` 放行。
- 两个必要护栏（不做会出真 bug）：
  1. **只抢「已经播过的」视频**（`hasStarted` WeakSet）—— 否则页面加载后停在 0:00
     等你看的 `<video>` 会被自动播放，等于给站点加了自动播放；
  2. **反复被站点改回时退让**（`makeGuard(label)` 滑动窗口计数，短时间内反复发生就停手
     5 秒并打 warn），避免双方对拉产生事件风暴。
- `apply(v)` 用 `WeakMap<HTMLVideoElement, Applied>` 记住「我们改过什么」，
  **关开关时只回退我们改过的那部分**，不碰用户或站点自己的设置。
- 导出 `startVideoAssist(): () => void`，返回卸载函数。

**`src/sites/uooc/settings.ts`**
- `SITE_ID = 'uooc'`（同时是 storage 命名空间前缀）。
- `TOGGLE`：`RATE_2X='rate-2x'`（🟢 二倍速，默认开）、`MUTE='mute'`（🟢 静音，默认开）、
  `KEEP_PLAYING='keep-playing'`（🟢 防暂停，默认开）、`AUTO_NEXT='auto-next'`（🟠 自动连播，默认关，**见 §8.2**）。
- `VALUE`：只剩 `NEXT_WAIT_MS='next-wait-ms'`（连播每项之间的等待时间，默认 `'5000'`）。
  ⚠️ 原来的 `NEXT_SCOPE='nextScope'`（连播范围）**已整体移除**（用户 m00971），
  连播不再设范围上限 —— 详见 `docs/UOOC-连播与答题-需求细则.md` C 节。
- 风险门禁由 `common/core/settings.ts` 的 `isEnabled` **统一兜底**：🟢 safe 与 🟠 trace
  都按声明的 `default` 走；🔴 irreversible **一律强制 false**，与 `default` 写什么无关 ——
  所以 🔴 的 `default` 也一律写 `false`。

**`src/sites/uooc/tabs/settings.ts`**
- 为什么单独开一个标签页：本站已有 4 个开关 + 1 个配置项，而且会跟着功能继续长；
  全塞进公共【全局设置】页会把那一页淹掉，用户也看不出是哪个站点的
  （用户反馈：设置项应该在单独的标签页）。
- **渲染一律走共享组件 `renderSiteSettings`**（公共【全局设置】页也调它），
  这样「风险门禁只有一处实现」不会被多入口破坏。
- `UOOC_SETTINGS_TAB_ID` **必须等于 `settingsTabId('uooc')`**，否则同一个开关会在面板里
  出现两遍、还能从两处改。`tests/suites/sites-registered.test.ts` 把这个等式钉住了。

---

## 5. 关键决策与理由（理由比结论重要）

1. **请求出口统一走页面 `fetch`，不实现 GM 通道。** 所以 header 里**没有**
   `GM_xmlhttpRequest` 与 `@connect`，`verify-build.mjs` 专门有两条检查钉住这件事。
   理由是 GM 通道的跨域能力会绕过站点自身的同源约束，出问题时难以与站点行为对齐。
2. **风险开关：🟠 / 🔴 的 `default` 一律写 `false`**；🔴 在用户没动过时**强制** false，
   显式存了 true 才生效。写 true 不生效只会误导后来人。
3. **旧数据迁移不搬危险开关的值**（批 1 拍板）。
4. **构建脚本不能用管道 stdio**：`spawnSync` 直调 `esbuild.exe` + fd 重定向，
   原因见 §7.1。
5. **只做档 1 测试**（纯函数、Node assert、秒级）。接口契约冒烟与 UI 手测由用户做。
6. **header 的 `@match` 与注册表是两份必须同步的清单**，不一致的表现是**完全静默**
   （UOOC 上「脚本一行日志都没有」就是它）。现已由 `verify-build.mjs` 的一条自检 +
   `tests/suites/sites-registered.test.ts` 钉住。
7. **站点设置放进站点自己的标签页**，标签 id 必须等于 `settingsTabId(站点 id)`。
8. **启动期诊断一律用 `console.info`**，不用 `console.debug` —— 后者在 Edge DevTools
   里默认被 Verbose 过滤，在默认隐藏的级别打诊断等于没有诊断。
9. **UOOC 的三个开关是「锁」**，用户明确否决了「只在加载时设一次、之后不干预」的写法。

---

## 6. 红线

- 确认框（`ui/widgets/confirm.ts`，`needsConfirm` 驱动）**严禁做成可跳过**。
- 写接口总开关（`write-api`）默认关；**门禁文案必须与实际行为一致** ——
  文案说谎比功能缺失更糟。
- 删开关之前先数命中数：`Select-String TOGGLE.<名字>` 命中数 = 1（只有注册行）就是死开关。
- `common/` 与 `sites/` 的依赖方向不能反（`common/` 不认识任何具体站点）。
- 不在未获用户确认时安装依赖，或改动项目目录之外的文件。

---

## 7. 已知的坑

### 7.1 沙箱与工具链
- DSH 沙箱下 **`child_process` 用管道 stdio 会 EPERM** —— 所以 `build.mjs` 绕开管道，
  直调原生 `esbuild.exe`。写新脚本时别踩同一个坑。
- 这台机器上 **`pwsh` 实际是 Windows PowerShell 5.1**：`&&` 不是语句分隔符，
  用 `;`；`$()` 与嵌套引号的转义规则也与 PowerShell 7 不同。

### 7.2 项目自身的坑
- **`dist/.build-no` 是 gitignored**：切分支时它**不会**跟着回到当时的值。
  在 `087b476` 上它是 `65`，而仓库里的产物是构建号 **49** —— 别用它判断产物新旧。
- `local/` 不随 git。参考脚本（`local/reference/uooc防止失去焦点，自动二倍数播放.js`、
  `local/reference/UOOC assistant.js` v1.0.8）与抓包都在那里，**换机器要重新投放**。
- `dist/` 里的 `szuer-toolbox.user.js` 是**提交进 git 的产物**，
  改完源码要重新构建并一起提交（见 §8.2 的一个反例）。

---

## 8. 我在基线上实测到的三处异常

> 这三处都是 `087b476` **既有的状态**，我没有改动它们，只是记录下来。
> 接手时别把 §8.1 当成自己刚弄坏的。

### 8.1 `verify-build.mjs` 有 1 项 FAIL（检查本身过时，不是产物坏了）

```
FAIL  含 UOOC 适配器 id
```

原因：这条检查写死了字面量 `id: "uooc"`，
而 UOOC 适配器写的是 **`id: SITE_ID`**（`src/sites/uooc/index.ts:49`，
`SITE_ID` 定义在 `src/sites/uooc/settings.ts:22`）。esbuild **不做跨模块常量内联**，
所以产物里是 `id: SITE_ID`：`dist/szuer-toolbox.user.js` 中出现 `SITE_ID` 48 次，
`id: "uooc"` 与 `id: "bkxk"` 各 0 次 —— **重新构建之后这条检查仍然会失败**。
（bkxk 那条检查写得松，所以它 OK。）

结论：**是检查过时**，不是产物缺适配器（产物里 UOOC 相关行有 28 行）。
修法上写着 `id: SITE_ID` 也好、把检查放宽成 `text.includes('uooc')` 也好，
**由接手的人自己决定，我没有动。**

### 8.2 产物比源码旧一个提交

`git log -1 -- dist/szuer-toolbox.user.js` → **`93a819d`**（构建号 49）。
之后的 `2d536ce`（只改文档）与 `087b476`（改了设置项文案）**都没有重新构建**，
所以产物里的设置项文案是 `93a819d` 那一版的。
顺带：`087b476` 的设置页里那个 🟠「自动连播」`TOGGLE.AUTO_NEXT='auto-next'` 开关
**已声明、会显示、但没有任何代码读它** —— 打开它什么也不会发生；
`VALUE.NEXT_SCOPE` 同理（`applyUoocSettings()` 只做了一次存在性检查，打印一句 warn）。
也就是说 `087b476` 上的这几个连播相关声明是**预留**，行为层是空的。

### 8.3 UOOC 侧还没有被测过

`tests/suites/` 下**没有 `uooc-*` 套件** —— UOOC 目前 0 项自动化测试覆盖，
全部依赖真机手测（`docs/手测清单-UOOC视频助手.md` 与 `…-第2轮.md`）。

---

## 9. 环境与工具链（实测）

| 工具 | 版本 | 备注 |
|---|---|---|
| Node.js | v24.19.0 | **类型擦除是 strip-only**，禁 TS 参数属性 |
| pnpm | 11.22.0 | 本项目实际用 **npm** |
| Python | 3.14.7 | 抓包分析脚本用 |
| git | 2.54.0.windows.1 | 持续 LF→CRLF 警告，无害 |
| mitmproxy (mitmweb) | 12.2.3 | OpenSSL 4.0.0 |
| Microsoft Edge | 154.0.4258.48 | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` |
| TypeScript | 7.0.2（原生版） | 真编译器在 `node_modules\@typescript\typescript-win32-x64\lib\tsc.exe` |
| esbuild | 0.28.2 | `node_modules\@esbuild\win32-x64\esbuild.exe` |

- **依赖安装必须带 `--ignore-scripts`。**
- 命令速查：`npm run build` / `typecheck` / `test` / `verify` / `check`。
  另外 `tools/dom_outline.mjs` 是 DOM 文本压缩器；
  `tools/flow_{probe,index,slice}.py` 是 mitmproxy `.flow` 处理三件套
  （`--host` 过滤 + query 脱敏）。
- 详细环境说明与沙箱边界见 `docs/环境文档.md`。

---

## 10. UOOC 还没做的（需求文档 §2.1 的 U1–U9）

| 编号 | 功能 | 状态 |
|---|---|---|
| U1 | 二倍速 | ✅ 已做（硬锁） |
| U2 | 静音 | ✅ 已做（硬锁） |
| U3 | 自动连播（自动下一节） | ❌ **未开工**（开关已声明但无实现，见 §8.2） |
| U4 | 允许失焦继续播放 | ✅ 已做（无条件抢播） |
| U5 | 多窗口进行 | ❌ 未开工（需求文档已确认语义：多标签各自挂机） |
| U6 | 连续请求「已完成的测验」接口、记录正确答案并导出 JSON | ❌ 未开工，🔴 |
| U7 | 加载测验答案（文件导入） | ❌ 未开工，🔴 |
| U8 | 自动做测验（依据已加载答案） | ❌ 未开工，🔴 |
| U9 | 自动做测验（LLM 作答，可选掺入 U7 答案） | ❌ 未开工，🔴 |

> U6–U9 **全部归 🔴 不可逆级**（默认关 + 复选框 + 二次确认 + **不进自动化测试**），
> 且属典型「刷课」行为，站点侧可能判定异常作答并处理账号 —— 需求文档 §8.3 有风险提示。
> **U6 的接口原理与旧脚本不同，开工前必须先抓包。**

其它未完成项：
- `demo/` 演示适配器**保留到阶段 3 结束再删**。
- `docs/UOOC-抓包作业单.md` 是一份可以直接交给用户照着做的抓包作业单；
  UOOC 侧抓包一律含真实姓名 / 学号 / 手机号，**绝不喂云端模型**。

---

## 11. 文档索引

| 文档 | 用途 |
|---|---|
| **`docs/交接文档-UOOC基线.md`** | 本文 |
| `docs/环境文档.md` | 工具链版本、沙箱边界、pwsh 坑、命令速查（长期有效） |
| `docs/需求文档.md` | §2.1 UOOC 的 U1–U9 逐条拍板；§8 风险分级 N1–N3 |
| `docs/开发文档.md` | §1 进度总览；**§3 UOOC 平台**（双版本页面、参考脚本拆解、待验证清单 V1–V12）；§4 bkxk 全量；§5 抓包工作流 |
| `docs/UOOC-AI方案-逆向笔记.md` | 新版答题页 DOM 实测（题目容器、选项、按钮、AngularJS scope 入口）、人脸识别关卡、数据缺口 |
| `docs/UOOC-抓包作业单.md` | 交给用户照着抓包的作业单 |
| `docs/手测清单-UOOC视频助手.md`、`…-第2轮.md` | 视频助手的真机验收记录 |
| `docs/交接文档.md` | ⚠️ **过时**（写于 `df23206`，UOOC 那部分已完全不成立） |

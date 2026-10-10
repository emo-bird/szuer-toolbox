# docs 索引与状态

> 本文件是 `docs/` 的**入口说明**：哪些文档描述**当前代码**、哪些只是**历史快照**。
> 目录里文档很多、且带版本日志性质，读之前先在这里对一下状态，别拿历史快照当现状。

## 一、当前代码的权威来源（先看这些）

| 文档 | 说明 |
|---|---|
| `README.md`（仓库根） | 项目一句话说明 |
| `docs/环境文档.md` | 本机构建 / 运行环境 |
| `docs/开发文档.md` | **活的开发文档**：结构、接口、进度、待办。⚠️ 正文含大量按版本记录的历史快照（构建号 / 用例数 / 文件树），与当前代码可能不一致，以源码为准 |
| `docs/需求文档.md` | 需求与决策记录（含 Q-XX 拍板） |
| `docs/UOOC-API驱动连播-需求.md` | UOOC「接管」的**唯一口径**（现行） |
| `docs/手测清单-UOOC-接管.md` | UOOC 接管的现行手测清单 |
| `docs/清理问题清单.md` / `docs/清理核验报告.md` | `cleanup/code-clarity` 的清理底稿与核验/执行记录（本轮） |
| 源码 | `src/`；测试 `tests/`；构建 `build.mjs` / `tools/verify-build.mjs` |

## 二、历史 / 快照类（可参考，勿当现状）

| 文档 | 状态 |
|---|---|
| `docs/交接文档.md`、`docs/交接文档-UOOC基线.md` | **历史交接快照**（写作时点的代码状态） |
| `docs/手测清单-阶段1.md`、`docs/手测清单-阶段2批1.md` | 历史手测清单 |
| `docs/手测清单-UOOC视频助手.md`、`...-第2轮.md`、`docs/手测清单-任务与监控.md`、`docs/手测清单-列表注入.md`、`docs/手测清单-晚到补偿.md`、`docs/手测清单-标签栏与悬浮球.md`、`docs/手测清单-记忆与悬浮球复测.md`、`docs/手测清单-自定义课程与注入.md`、`docs/手测清单-模板.md` | 各阶段历史手测清单 |
| `docs/UOOC-双版目录结构底图.md`、`docs/UOOC-抓包作业单.md`、`docs/UOOC-AI方案-逆向笔记.md`、`docs/UOOC-AI提示词-草稿.md`、`docs/逆向入门笔记.md` | 逆向 / 方案 / 教学笔记（取证材料，非现状） |
| `docs/DSH-子代理重复工具调用-汇报.md` | 一次性排查汇报 |

## 三、`cleanup/code-clarity` 已删除 / 改名的对象

历史文档里出现下面这些名字，都是**当时**的代码；现在已不存在或已改名：

| 已删 / 旧名 | 现状 |
|---|---|
| `src/sites/demo/`（演示适配器）、`sztb-demo` / `DEBUG_HASH_FLAG` | **已删除**（A6）：`registerSites()` 不再注册 demo；`registry.ts` 的分派只剩 adapter / root-domain / none |
| `src/sites/uooc/autoplay.ts`（旧 DOM 点击连播） | **已删除**（A2）：基线时即无调用方，由 API 驱动接管 `takeover.ts` 取代 |
| `src/common/core/bus.ts`（事件总线） | **已删除**（A1）：从未被 import |
| `uooc/intercept.ts` 的 `waitCatalog` / `waitUnitLearn` / `peekCatalog` / `peekUnitLearn` / `resetInterceptStore` + catalog/unit 缓存 | **已删除**（核验 §2.1）：无消费者；learn 拦截保留、只留痕不缓存 |
| `onRemoteChange`、`safeBase`、`findSaveButton`、`waitForOptionInputs`、`isAnswerBoxVisible`、`hasInputsFor`、`resetMonitor`、`findByTc` | **已删除**（核验 §2.2）：全仓 0 调用的死导出 |
| `GROUP.AUTOPLAY = '连播'` | **改名** `GROUP.WAIT = '等待参数'`（仅展示名，存储 id 不变） |
| `takeover.ts` 的 `sleep/waitFor/gotoPoint/waitVideoEnd/...` | **已移到** `takeover-utils.ts`（C2 批2，逐字搬移） |
| `ai/fill.ts` 的 DOM 工具 / 就绪判定 | **已移到** `ai/fill-dom.ts` / `ai/quiz-ready.ts`（C2 批3） |
| `uooc/catalog.ts` 的纯模型 | **已移到** `catalog-model.ts`，`catalog.ts` 变成视图层 + `export *` 门户（C2 批1） |
| `bkxk/list.ts` 的 DOM 读取工具 | **已移到** `list-dom.ts`（C2 批4） |

> 清理的完整证据、commit 与验证记录见 `docs/清理核验报告.md` §5 / §6 与
> `docs/清理问题清单.md` §E。

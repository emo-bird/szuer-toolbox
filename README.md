# 深大人工具箱 · szuer-toolbox

面向深圳大学校园站点的油猴脚本。在优课联盟和本科选课系统中，通过同一个悬浮窗使用各站点的工具。脚本打包成单个文件，无运行时依赖。

[![Stars](https://img.shields.io/github/stars/emo-bird/szuer-toolbox?style=flat-square)](https://github.com/emo-bird/szuer-toolbox/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/emo-bird/szuer-toolbox?style=flat-square)](https://github.com/emo-bird/szuer-toolbox/commits/master)
[![Issues](https://img.shields.io/github/issues/emo-bird/szuer-toolbox?style=flat-square)](https://github.com/emo-bird/szuer-toolbox/issues)

---

## 项目功能

### UOOC 优课联盟（`*.uooc.net.cn`，旧版课程页）

| 功能 | 说明 |
|---|---|
| 视频助手 | 支持二倍速、静音和防暂停。 |
| 视频随机小测 | 【AI 作答】中的「自动提交视频小题」默认关闭。开启后，脚本会处理能识别答案的视频弹题。 |
| 接管 | 按目录顺序处理视频和测验任务点。视频小测弹出时先等它关闭，再继续。 |
| AI 作答 | 保存模型方案、测试连接、生成并回填答案。可以设置多次采样、分歧复核、简短解题说明和答案缓存。 |
| 监视 | 查看接管进度和逐题作答结果，定位原题、重新生成、应用建议、保存或恢复草稿，以及撤销回填。 |
| 等待 | 可调整跳转后等待、播完后停留和全局等待超时。 |

### 本科选课 bkxk（`bkxk.szu.edu.cn`）

| 功能 | 说明 |
|---|---|
| 列表注入 | 选课列表每行注入「教学班 ID」+【添加抢课】【添加监控】按钮（只入队，不发请求） |
| 抢课任务 | 队列引擎按批次码 / 时间轮次自动抢课（**写接口默认关闭**） |
| 余量监控 | 轮询课程容量；支持「类别监控」与「单独监控」两种模式 |
| 自定义课程 | 手动录入课程，注入课表页展示 |
| 课表注入 | 把自定义课程塞进站点原生课表渲染 |
| 冲突追加 | 在站点算好的冲突结果上追加我们算出的冲突 |
| 旧数据迁移 | 旧版 `localStorage` 配置一次性搬进脚本存储 |

> ⚠️ 本项目仅供学习研究，请遵守学校与各站点用户协议；使用风险自负。详见脚本头部免责声明。

---

## 安装与更新

1. 在 Chrome、Edge 或 Firefox 中安装 Tampermonkey（篡改猴）或 Violentmonkey（暴力猴）。
2. 打开 v1.2.13 的安装链接，在管理器弹出的页面确认安装。 [安装深大人工具箱 v1.2.13](https://raw.githubusercontent.com/Starverse032/szuer-toolbox/release-v1.2.13/dist/szuer-toolbox.user.js)
3. 打开或刷新优课课程页、本科选课页，点击悬浮球展开工具箱。

安装后，脚本通过 `@updateURL` 从原仓库的 `master` 检查后续更新。

## 优课使用说明

**手动作答**。打开试卷，在【AI 作答】填写接口地址、模型 ID 和接口所需的 API Key，保存方案并测试连接。点【开始作答】生成并回填答案，再到【监视】核对结果。接口支持 JSON 模式时，可在「输出格式」选择 JSON。启用内嵌图片输入会把可读取的图片随题目发往所选接口。

**DeepSeek 官方接口（v1.2.8 起）**。在【AI 作答】点「填入 DeepSeek 官方配置」，填写 API Key 并保存。默认选用 `deepseek-flash`，支持题图、联网搜索、阅读公开链接和内容安全审核。纯文字题也可以手动选择 `deepseek-v4-pro`。开启联网工具时，脚本改用兼容文本请求，可在【监视】查看模型返回的来源和用量。 [DeepSeek 联网工具文档](https://api-docs.deepseek.com/zh-cn/guides/web_tools/)

**思考与上下文**。每个官方方案可分别保存思考强度、最大输出 Token、文本输入上限和作答参考资料。思考强度支持跟随模型、关闭、低、高、最高；留空的最大输出 Token 由模型决定。文本输入上限按字符检查题目、作答提示和参考资料，超限会在【监视】标出。参考资料会随每题发给 DeepSeek，导出方案时会省略资料和密钥。 [DeepSeek 思考模式文档](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)

**直接引用作答参考文件**。打开对应课程的学习页，在 DeepSeek Flash 方案下点击「上传作答参考文件」，选择 PDF、Word 或 PPT 后运行上传，再点「用此文件辅助作答」。每门课程可绑定一份文件，绑定即时保存到脚本管理器，重启浏览器后仍可用。新文件在 DeepSeek 无到期时间，旧版上传的限时文件请重新上传并绑定。文档里的图表也要参与作答时，上传前选「图文混排解析」。 [DeepSeek 文件解析](https://api-docs.deepseek.com/guides/document_parsing/)

「解除课程绑定」只移除当前课程的引用。「删除云端文件」需要确认，DeepSeek 确认删除后会清理本机上引用同一文件的课程绑定。 [DeepSeek 文件删除接口](https://api-docs.deepseek.com/api/delete-file/)

**试卷草稿和视频设置**。草稿按试卷独立保存，保留最近 30 份，保存后 90 天到期。关闭二倍速或静音时，播放器会立即恢复被脚本锁定前的设置。

**DeepSeek 独立工具**。支持手动搜索、抓取、上传文件并提问、OCR、转写音频和合成语音。可以把工具输出加入当前方案的作答参考资料。 [DeepSeek 计费文档](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

**接管课程**。在【接管】点【开始接管】。如果希望遇到测验时自动启动 AI，先在【AI 作答】打开「接管遇到测验时自动启动 AI」。这个开关和「自动提交视频小题」分别设置，均默认关闭。

**交卷和验证**。脚本回填后会逐题检查，在【监视】标出「未填完整」的题目。补齐后点【提交当前答案】并确认。点「再等等」或按 Esc 可取消确认，已回填答案会保留在试卷里。手动完成验证码后，站点会继续提交，脚本会等待结果。默认开启的「测验交卷提示音」会在交卷确认框和验证码弹出时分别响起。

**小测等待**。如果接管显示「等待当前视频小测关闭…」，先处理屏幕上的小测。v1.2.5 修复了小测已关闭、题目容器仍留在播放器下方时，接管误以为弹窗还开着的问题。

---

## 本地构建

环境要求：**Node.js ≥ 22**、npm。

```bash
git clone https://github.com/emo-bird/szuer-toolbox.git
cd szuer-toolbox
npm install --ignore-scripts   # 只装构建期依赖，不跑第三方安装脚本
npm run check                  # typecheck + 测试 + 构建 + 产物自检
```

产物在 `dist/szuer-toolbox.user.js`（**已提交进 git**，供 raw 链接自动更新，所以改完源码要一并提交 dist）。

常用命令：

| 命令 | 作用 |
|---|---|
| `npm run build` | 只重新生成 `dist/szuer-toolbox.user.js` |
| `npm test` | 纯函数冒烟测试（零依赖、秒级） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | 产物自检（头部字段 / 无 ESM 残留 / 适配器已注册 …） |
| `npm run check` | 以上四步串起来（提交前跑它） |
| `npm run graph` | 生成交互式架构依赖图 `docs/architecture.html` |
| `npm run knip` | 查未使用的文件 / 导出 / 依赖 |

**开发要点**（改代码前请读 [`docs/开发文档.md`](docs/开发文档.md)）：

- 源码是 TypeScript，esbuild 打包成单文件 IIFE；
- 公共面板样式在 `src/common/ui/style.css`，构建时嵌入脚本；
- 请求统一走 `src/common/core/http.ts`；
- 公共层**不许** `import` 站点层。

文档入口：[`docs/README.md`](docs/README.md) ｜ 架构图：[`docs/architecture.html`](docs/architecture.html)

---

## GitHub 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=emo-bird/szuer-toolbox&type=Date)](https://star-history.com/#emo-bird/szuer-toolbox&Date)

## 参考与致谢

站点适配与交互设计参考了以下公开脚本（仅作逆向思路与功能形态的参考，本项目代码为自研）：

| 参考项目 | 说明 |
|---|---|
| [UOOC Assistant](https://greasyfork.org/zh-CN/scripts/413268-uooc-assistant) | 优课联盟课程页自动化助手 |
| [UOOC 防止失去焦点 · 自动二倍速播放](https://greasyfork.org/zh-CN/scripts/423015-uooc%E9%98%B2%E6%AD%A2%E5%A4%B1%E5%8E%BB%E7%84%A6%E7%82%B9-%E8%87%AA%E5%8A%A8%E4%BA%8C%E5%80%8D%E6%95%B0%E6%92%AD%E6%94%BE) | 失焦防护 + 自动二倍速播放 |
| [fuckuooc](https://github.com/YusongXiao/fuckuooc) | 一键全自动完成 UOOC 课程（视频 / 弹题 / 测验，支持多课程并行） |

## 开发工具

本项目的开发过程使用了 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 作为 AI 编码代理：
需求拆解、代码实现、构建自检与文档整理都有它参与，所有提交由维护者逐项审阅后合入。

## 许可

本项目使用 **[MIT License](LICENSE)**：可自由使用、修改、分发（含商业用途），
只需保留版权声明与许可声明。软件按「原样」提供，作者不对使用后果承担责任。

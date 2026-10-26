# 深大人工具箱 · szuer-toolbox

面向深圳大学校园站点的**一体化油猴脚本**：一个统一的悬浮窗，按域名加载对应站点的适配器。
完全自研 UI，**零运行时依赖**，所有危险操作默认关闭、必须显式开启 + 二次确认。

[![Stars](https://img.shields.io/github/stars/emo-bird/szuer-toolbox?style=flat-square)](https://github.com/emo-bird/szuer-toolbox/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/emo-bird/szuer-toolbox?style=flat-square)](https://github.com/emo-bird/szuer-toolbox/commits/master)
[![Issues](https://img.shields.io/github/issues/emo-bird/szuer-toolbox?style=flat-square)](https://github.com/emo-bird/szuer-toolbox/issues)

---

## 项目功能

### UOOC 优课联盟（`*.uooc.net.cn`，旧版课程页）

| 功能 | 说明 |
|---|---|
| 视频助手 | 二倍速 / 静音 / **防暂停**（被暂停就恢复） |
| 视频随机小测 | 播放中弹出的随机测，读页面里的答案自动作答 |
| **接管（API 驱动连播）** | 自己算下一个任务点、改 `location.hash` 跳转；视频等播完、测验等交卷，整个目录自动连播。由你在面板点【开始接管】启动 |
| AI 答题 | 抓取试卷 → 问大模型 → 自动回填/交卷（**默认关闭**，属于不可逆操作） |
| 监视 | 目录树「章→节→任务点」分层列表 + 接管进度 |
| 参数设置 | 跳转等待 / 播完停留 / 全局超时三个时间参数 |

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

## 直接使用（不写代码）

**1. 装一个用户脚本管理器**

任选其一：Tampermonkey（篡改猴）、Violentmonkey（暴力猴）；Chrome / Edge / Firefox 均可。

**2. 安装脚本**

点下面的链接，管理器会自动弹出安装页，确认即可：

> **https://raw.githubusercontent.com/emo-bird/szuer-toolbox/master/dist/szuer-toolbox.user.js**

也可以打开管理器面板 →「实用工具 / 添加新脚本」，把上面这个 raw 链接粘进去。
装好后脚本会通过 `@updateURL` **自动检查更新**，以后无需手动重装。

**3. 打开网站**

- 优课联盟课程页 → 右上角出现悬浮球 / 悬浮窗；
- 深圳大学本科选课系统 → 同上。

点悬浮球展开面板，左侧是标签页（面板分「公共」与「站点」两组，中间一条分隔线）。
所有开关都在面板里，改完立即生效。

**4. 危险功能怎么开**

🟠 / 🔴 级别的功能（AI 交卷、抢课写接口）**默认关闭**，且必须由你在面板里手动勾选。
开启后每次执行前还会弹二次确认。不确定就先别开。

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
- 站点 CSS 写在 `.ts` 字符串里，不能 `import './x.css'`（测试用 Node 原生加载 TS）；
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

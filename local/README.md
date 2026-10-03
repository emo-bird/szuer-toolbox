# local/ —— 本地资料（不随 git 提交）

本目录整体被 `.gitignore` 忽略。放一切「有用但不该进仓库」的东西：
体积大、含隐私、或属于第三方的参考素材。

| 子目录 | 放什么 | 说明 |
|---|---|---|
| `capture/` | mitmproxy `.flow`、`.har` | 抓包原始文件，可能含真实姓名/学号/手机号，**绝不喂云端模型** |
| `reference/` | 第三方参考脚本、参考数据 | 例如 UOOC 参考脚本、`szu_bkxk` 的参考片段 |
| `export/` | 导出的数据 | 例如测验答案 JSON、课程表 CSV |
| `manual/` | 手动测试台页面 | 复刻站点 DOM 契约的离线页，配合 `tools/serve.mjs` 验证悬浮窗/设置/门禁 |

## 手动测试台怎么用

```
node tools/serve.mjs                                     # 起在 127.0.0.1:8080
浏览器打开 http://localhost:8080/manual.html#sztb-demo    # 带 hash 标记才会被框架接管
```

真实站点适配器在框架层不碰 DOM，`localhost` 又被 `@noframes` 挡着不能用 iframe 套真实页面，
所以只能手工复刻一份页面契约来验「悬浮球 → 展开 → 设置页 → 风险门禁 → 日志」这条链路。
`manual.html` **不是交付物，也不参与构建**。

## 处理 flows 的规矩（摘自 preset）

`.flow` 文件**绝不整份读入上下文**，按以下流程：

```
tools/flow_probe.py   → 体检，确认文件可读
tools/flow_index.py   → 请求总表
（与用户确认目标接口）
tools/flow_slice.py   → 按域名/路径分片，每片约 24KB
tools/flow_extract.py → 单条精简
tools/flow_replay.py  → 复现某条请求
```

分片交**本地模型**提炼，汇总结果才写进 `docs/接口清单.md`。

## 隐私红线

含用户真实姓名、手机号、学号的抓包与导出数据，
**只走本地模型（LM Studio :1234）**，严禁喂给云端模型。

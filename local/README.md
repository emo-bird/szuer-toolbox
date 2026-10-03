# local/ —— 本地资料（不随 git 提交）

本目录整体被 `.gitignore` 忽略。放一切「有用但不该进仓库」的东西：
体积大、含隐私、或属于第三方的参考素材。

| 子目录 | 放什么 | 说明 |
|---|---|---|
| `capture/` | mitmproxy `.flow`、`.har` | 抓包原始文件，可能含真实姓名/学号/手机号，**绝不喂云端模型** |
| `reference/` | 第三方参考脚本、参考数据 | 例如 UOOC 参考脚本、`szu_bkxk` 的参考片段 |
| `export/` | 导出的数据 | 例如测验答案 JSON、课程表 CSV |

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

# 手测清单 · UOOC 视频助手 · 第 5 轮

- **被测构建号：#55**
- 提交：`d93853c`
- 分支：`feat/uooc-ai`
- 安装：Tampermonkey 里重新粘贴 `dist/szuer-toolbox.user.js`（或直接覆盖导入）

本轮修的是**上一轮的六条反馈**：

| # | 你报的问题 | 这轮怎么了 |
| --- | --- | --- |
| 1 | min 版字符串里的 CSS 没压 | 改成构建期先用 esbuild 把 CSS 真压一遍（10.9 KB → 7.0 KB）再内联 |
| 2 | 测验做完也该自动下一节 | 停在测验上会记一笔，做完自动继续连播（跨整页跳转也有效） |
| 3 | **连播依然不能跑** | **找到真凶了**：`ended` 事件压根没注册监听，连播一次都不会被触发 |
| 4 | 压缩版能用 | 保持 |
| 5 | 默认上下限改 300~600 | 已改 |
| 6 | 上报参数顺序 | 已按你给的顺序重排 |

---

## A. 准备工作

- [ ] 装好 #55，打开学习页，F12 → Console，过滤 `[sztb]`。
- [ ] 打开 UOOC【设置】标签页，确认「上报间隔下限 / 上限」显示 **300 / 600**。

---

## B. 连播（这轮的重点）

> ⚠️ 装完新版本后**先把页面刷新一次**，再去打开「自动连播」。

### #207 ⭐ 连播真的会动了（旧版）
- 动作：旧版学习页，开「自动连播」，挑一个**没看过**的视频，把进度条拖到只剩 5~10 秒，等它播完。
- 预期：Console 出现 `连播：打开下一个视频 …`，并且**页面自动切到下一个视频、自己播起来**。
- 失败时贴回：Console 里 `[sztb]` 的**全部输出**。

### #208 ⭐ 连播能连跑好几集
- 动作：让 #207 一直跑下去（可以把每个视频拖到快结尾）。
- 预期：一集接一集，中途不用手点。
- 失败时贴回：在第几集断的 + Console 全文。

### #209 跳过已看过 / 文档 / 附件 / 做过的测验
- 动作：让连播路径上经过这四种。
- 预期：全部跳过，Console 有对应的 `跳过…` 日志。

### #210 ⭐ 测验做完自动继续
- 动作：连播走到一道**没做过**的测验 → 日志出现「连播停在测验 …，做完会自动继续」→ 你**手动把这道测验做完**。
- 预期：做完了之后（不管是页内切的还是跳走再回来），**自动接着往后连播**，Console 出现「测验 … 已完成，继续连播」。
- 失败时贴回：做测验前后各一段 Console 全文。

### #211 本章走完
- 动作：连播到本章最后一个视频播完。
- 预期：`止于本章` → 停住并打日志；`跨章继续` → 自动打开下一章的第一个视频。

### #212 新版学习页
- 动作：把 #207 / #210 在新版学习页（`/home/learn/new/{cid}#/...`）上重跑。

---

## C. 如果连播还是不动 —— 用诊断口

这轮我在页面上留了两个 Console 函数（**只在这个脚本挂载的学习页上有**）：

```js
// 1) 只读快照：此刻目录长什么样、连播会看到什么（不点任何东西，可反复调）
__sztbUooc()

// 2) 真的往后走一步，返回判定结果（会点一下页面）
__sztbUoocStep()
```

### #213 诊断口可用
- 动作：在学习页 Console 里敲 `__sztbUooc()`。
- 预期：返回一个对象，形如
  ```js
  {
    hasAngular: true,
    hash: { cid: '…', chapterId: '…', sectionId: '…', resourceId: '…' },
    selectorHits: { chapterItem: 10, chapterTitle: 10, sectionItem: 5, sectionTitle: 5, resourceItem: 1 },
    chapterIds: [...], currentChapterFound: true,
    sectionIds: [...], currentSectionFound: true,
    resources: [{ id: '…', type: 10, finished: false, videoPos: 0 }],
    resourceReadFailures: 0,
    autoNext: true, nextScope: 'chapter', autoProgress: false, waitingQuiz: null,
  }
  ```
- 预期：`hasAngular: true`、`currentChapterFound: true`、`resourceItem` ≥ 1、`resourceReadFailures: 0`。
- **失败时贴回整个返回值** —— 这一个对象就能定位到底是哪一环读不到。

### #214 手动走一步
- 动作：敲 `__sztbUoocStep()`。
- 预期：返回 `{ kind: 'clicked', id: '…', title: '…' }`，并且**页面真的跳到那个视频**。
- 如果返回 `{ kind: 'stop', reason: '…' }` —— 把整条贴回来，reason 就是答案。

---

## D. 进度上报

### #215 默认区间变成 300~600，且能生效
- 动作：打开「进度上报」（过二次确认），播放视频，看 Network 里的 `markVideoLearn`。
- 预期：间隔落在 **5~10 分钟**之间；body 形如
  `chapter_id=…&cid=…&hidemsg_=true&network=…&resource_id=…&section_id=…&source=1&subsection_id=0&video_length=…&video_pos=…`
  （字段顺序已照抄站点）。
- 失败时贴回：Console 全文 + 一条该请求的 Form Data。

---

## E. 打包与回归

### #216 压缩版里的 CSS 已经压过
- 动作：把 `dist/szuer-toolbox.min.user.js` 装进 Tampermonkey（先禁用正式版）。
- 预期：
  - 悬浮球 / 面板**外观正常**（样式没被压坏）；
  - 在 Tampermonkey 里打开该脚本源码，搜 `sztb-panel` —— 前后**没有注释和换行**。
- 失败时贴回：截图 + Console 全文。

### #217 正式版回归
- 动作：换回 `dist/szuer-toolbox.user.js`。
- 预期：U1 二倍速 / U2 静音 / U4 防暂停 照旧；bkxk 那边不受影响。

---

## 需要特别回执的

1. **#207 / #208 —— 连播到底动没动**（这轮最核心）。
2. **#210 —— 测验做完会不会自动继续**。
3. **#213 —— 如果连播不动，`__sztbUooc()` 的返回值整个贴回来**。

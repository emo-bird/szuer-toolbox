# UOOC AI 答题方案 —— 逆向笔记（分支 `feat/uooc-ai`）

> 本文件是**新方案**（AI 答题：抓题 → 问 API → 填充 → 可选提交）的实测记录。
> 旧方案（U6 答案采集/回填）的逆向结论在分支 `feat/uooc-phase3` 的
> `docs/UOOC-制作方案.md` 里，仍可查阅，但**与本方案无关**。
>
> 数据来源：`local/capture/` 下的抓包与 DOM 采样（`local/` 不入库）。
> 采样工具：[`tools/dom-probe-uooc-exam.js`](../tools/dom-probe-uooc-exam.js)、
> [`tools/dom-probe-uooc-captcha.js`](../tools/dom-probe-uooc-captcha.js)。

---

## 1. 做题页的三种形态（实测）

| 采样文件 | 顶层 URL | iframe | 性质 |
|---|---|---|---|
| `dom-uooc-exam-新-已完成-多选.txt` | `https://www.uooc.net.cn/exam/paper?cid=2042342697&tid=165023122` | 无 | 新版「查看已交卷的试卷」只读视图 |
| `dom-uooc-exam-旧-已完成-单选-填空.txt` | `https://www.uooc.net.cn/home/learn/index#/2042342697/57920722/1629578551/1107224086/section` | `top > frame[0] → /exam/paper?cid=2042342697&tid=736720049` | 旧版学习页里**用 iframe 嵌**只读试卷 |
| `dom-uooc-exam-新-未完成-单选.txt` | `https://www.uooc.net.cn/exam/1870897911` | `top > frame[0] → about:blank`（无关，空帧） | 新版**答题界面** |
| `dom-uooc-exam-新-未完成-单选-多选-验证码.txt` | `https://www.uooc.net.cn/exam/983779533##anchor942674265` | 同上 | 新版答题界面（含人脸识别关卡） |

**结论**
- **新版答题页 = 顶层 `/exam/{tid}`，tid 直接写在 URL 里** ⇒ 新方案**完全不需要枚举 tid**。
- **旧版**是在 `/home/learn/index#/…` 里开 iframe 指向 `/exam/paper?cid=&tid=` ⇒ tid 从 iframe 的 `src` 读。
- 新版那个 `about:blank` iframe 是空帧，与试卷无关。

---

## 2. 新版答题页 DOM 结构（实测原文）

### 2.1 技术栈
- **AngularJS**（`window.angular` 存在；满屏 `ng-*` 属性）。无 shadow DOM，无富文本编辑器。
- `window.UE` 在部分页面是 `object`（UEditor 全局存在），但**试卷内没有 `.edui-editor`**
  ⇒ **填空题不是富文本**。

### 2.2 题目容器路径

```
h2.queItems-type                                   ← 大题标题，文本 = "一、单选题" / "二、多选题"
  > label.queItems-type-scores
      > span.color-red                             ← 该大题总分，如 "60.00" / "40.00"
      > div.queContainer        ×N                 ← 一道题 = 一个 .queContainer
          > div.index                              ← 题号，文本 "1."
          > div.queBox > div.smallTest             ← 题干
          > div.scores > label.ng-binding          ← "( 4.00 分 )"
          > div.answerBox                          ← 作答区（选项 / 填空输入框都在这）
```

### 2.3 选项元素（单选 / 多选）

```html
<input type="radio"
       ng-if="question.type == 10 || question.type == …"
       ng-checked="item.checked"
       ng-click="vm.addAnswer($event,question)"
       name="1494613494"        ← 题目 id（= 卷面 JSON 里 questions[].id）
       ng-value="item.key"
       value="A"                ← 选项字母
       class="ng-scope">
```

实测（`新-未完成-单选`）：
- `name` 就是题目 id：`1494613494` / `1069716011`，每题一组，各组互不重名。
- `value` 就是选项字母：`A` / `B` / `C` / `D`。
- 已有作答的题上会带 `checked="checked"`。
- 尺寸 `13x13`，`可见=true`。
- 多选题采样里 20 个 input 分 5 组，同样 `name` = 题 id、`value` = 字母。

⇒ **填答案的做法**：找到 `input[name="<题id>"][value="<字母>"]`，`el.click()`。
   点击会触发 Angular 的 `ng-click="vm.addAnswer($event,question)"`，是站点自己的写入路径。

### 2.4 填空题
- `textarea` 全页只有 1 个，是**评论区**（`id="content"`、`placeholder="课程是否给力？快分享你的学习心得吧~"`），与试卷无关。
- `[contenteditable]` 计数为 **0**，`div.answerBox > div.ng-scope ×4` + `input ×4`
  （旧版只读样本）⇒ 填空大概率是 `<input>`，**但尚无「未完成 + 含填空」的采样佐证**（见 §5 数据缺口）。

### 2.5 按钮（实测原文）

| 选择器 | 文本 | 绑定的方法 | 可见性 |
|---|---|---|---|
| `button#takeShot.btn.btn-warning.shot-active` | 点击拍摄照片 | — | 采样时 `0x0@0,0`（隐藏） |
| `button#uploadShot.btn.btn-warning.shot-focus` | 使用这张 | — | 隐藏 |
| `button#resetShot.btn.btn-warning.shot-focus` | 重新拍摄 | — | 隐藏 |
| `button.btn.btn-success` | 保存试卷 | `ng-click="vm.saveTask()"`，`ng-if="vm.paper.can_do && vm.task.type != 30"` | 可见 `80x36@68,884` |
| `button.btn.btn-danger` | 提交试卷 | `ng-click="vm.commitTask()"`，`ng-if="vm.paper.can_do"` | 可见 `80x36@162,884` |

其他（人脸关卡相关，见 §3）：`div.btn`「开始考试」、`a.color-warning`「暂不开始考试」、
`a.btn`「重新录入」、`div.faceRecPopup-btn`「重试」、`div.faceRec-video-info-btn`「刷新页面」、
`a`「《诚信条款》」。

### 2.6 ⭐ AngularJS scope 入口（重要）

因为控制器把数据挂在 `vm` 上，可以从页面直接拿到**整份试卷对象**，比爬 DOM 干净得多：

```js
const scope = window.angular.element(document.body).scope(); // 或就近 [ng-controller] 元素
// 待确认字段名：scope.vm.questionList / scope.vm.questions / scope.vm.paper …
```

已知 `vm` 上存在的成员（从 ng-* 绑定反推）：
`vm.addAnswer($event, question)`、`vm.saveTask()`、`vm.commitTask()`、
`vm.paper.can_do`、`vm.task.type`、`vm.comment.content`、`vm.comment.checked`。

> ⚠️ 字段名尚未实测。需要一次采样的补充（见 §5）。

---

## 3. 人脸识别关卡（新发现，方案风险）

`新-未完成-*` 两个采样里都出现了**开考前的拍照关卡**：

- `button#takeShot`「点击拍摄照片」、`#uploadShot`「使用这张」、`#resetShot`「重新拍摄」
- `div.btn`「开始考试」/ `a.color-warning`「暂不开始考试」/ `a`「《诚信条款》」
- `div.faceRecPopup-btn`「重试」、`div.faceRec-video-info-btn`「刷新页面」、`a.btn`「重新录入」
- 相关类名：`shot-focus`、`shot-active`、`camReset`

**这不等于阿里云的「点击」人机验证**（阿里云那套在抓包里是另一组请求，见 §4）。
两者是**不同的关卡**，需要分开对待。

---

## 4. 抓包侧（截至 `uooc-完整流程.flow`）

- 该文件 **138 条 flow / 59.2 MB**，但**没有一条请求发往 `www.uooc.net.cn`**
  （`www.uooc.net.cn` 字符串出现 132 次，全部在 referer 头里）。
- 已捕获的主机：`assets.uooconline.com` 107、`edge.microsoft.com` 11、`hm.baidu.com` 6、
  `source11.uooconline.com` 5（视频 5 条，最大 18.7 MB）、
  `cloudauth-device-dualstack.cn-shanghai.aliyuncs.com` 3（设备指纹）、
  `g.alicdn.com` 2（阿里云验证码 SDK）、`dq1y8x.captcha-open.aliyuncs.com` 1（InitCaptchaV3）、
  `dq1y8x-verify.captcha-open.aliyuncs.com` 1（VerifyCaptchaV3）、
  `upload.captcha-open.aliyuncs.com` 1（行为轨迹 UploadLog）、`alive.github.com` 1（WebSocket）。
- ⇒ **站点自身的 HTML 文档与全部 XHR（含 `/exam/commit`）都没抓到**，原因待查（见 §5）。

---

## 5. 数据缺口

1. **抓包缺 `www.uooc.net.cn`** —— 站点自身的文档与 XHR 一条都没有。
2. **缺「未完成 + 含填空题」的 DOM 采样** —— 填空题到底是不是 `<input>`、`ng-model` 叫什么，
   目前只有间接证据。
3. **缺 AngularJS scope 字段名** —— 需要在答题页 Console 里 `angular.element(...).scope()` 探一次。
4. **缺人脸识别关卡的 DOM 详细结构** —— 本轮的 `dom-probe-uooc-captcha.js` 捕获到的其实是人脸关卡
   （`faceRec*`），阿里云验证码的 DOM 尚未采到。

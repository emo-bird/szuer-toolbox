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
| （无采样文件，2026-10-18 活页实测） | `https://www.uooc.net.cn/home/learn/index#/2042342697/168063548/2095339664/1830195947/section` | `top > frame[0] → /exam/1901349073` | 新版学习页外壳 + 旧版试卷 iframe，**含未作答填空题**（见 §2.4） |

**结论**
- **新版答题页 = 顶层 `/exam/{tid}`，tid 直接写在 URL 里** ⇒ 新方案**完全不需要枚举 tid**。
- **旧版**是在 `/home/learn/index#/…` 里开 iframe 指向 `/exam/paper?cid=&tid=` ⇒ tid 从 iframe 的 `src` 读。
- 新版那个 `about:blank` iframe 是空帧，与试卷无关。
- ⭐ **题号元素自带题 id**：`div.index` 的 `id = "anchor" + question.id`（`#anchor832695642`），
  **所有题型都有**。所以「题 id → 题容器」统一用
  `querySelector('div.index[id="anchor'+qid+'"]').closest('div.queContainer')`，
  不必再靠 `input[name="<qid>"]`（填空没有 name，靠它找不到）。

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

### 2.4 填空题（2026-10-18 实测补全，不再是猜测）

> 旧版笔记这里写的是「填空大概率是 `<input>`，尚无未完成采样佐证」——**已作废**。
> 下面这份是活的未完成试卷（`tid=1901349073`）上抓到的原文，含改动前后的 scope 状态。

**入口是两层**：用户给的链接是**新版学习页外壳**
`/home/learn/index#/…/section`，顶层文档里 `div.queContainer` 计数 **0**、
`textarea` 计数 **0**；真正的试卷在**同源 iframe** `/exam/{tid}` 里（旧版 Angular 页）。
⇒ 读数、回填都必须先 `collectRoots()` 进 iframe（`fill-dom.ts` 已经这么做）。

**一道填空题的 DOM（实测原文）**：

```html
<div class="queContainer" ng-repeat="question in group.items"
     ng-mouseenter="vm.activeQuestion(question)">
  <div class="index" id="anchor832695642">1.</div>     ← id = "anchor" + 题 id，**所有题型都有**
  <div class="queBox"><div class="smallTest"><div class="smallTest-view"><div class="ti">
    <div class="ti-q"><div class="ti-q-c"><p>＿＿就是金山银山</p></div></div>   ← 题干（全角下划线）
    <div class="ti-alist">
      <label class="ti-a" ng-repeat="item in question.options track by $index">  ← **一个空一个 label**
        <span class="ti-a-i">第1空: </span>
        <div class="ti-a-c">
          <textarea class="ue-container1 ng-binding" id="u8326956420"  ← id = "u" + 题 id + 空序
                    ng-mouseleave="vm.addAnswer($event,question)"></textarea>
        </div>
      </label>
    </div>
  </div></div></div></div>
  <div class="scores"><label>( 50.00 分 )</label></div>
</div>
```

实测属性（原文照抄，别再猜）：
- 控件是 **`textarea.ue-container1`**，**没有 `name`、没有 `ng-model`** —— 所以
  `input[name="<qid>"]` 那条路对填空**完全无效**（这也是旧实现只会「跳过填空」的原因）。
- `id = "u" + question.id + 空序`（`u8326956420` = 题 `832695642` 的第 0 个空）；`readOnly=false`、`disabled=false`、可见 `1387x50`。
- 空数 = 容器内 `textarea.ue-container1` 的个数；题干里的空用**全角下划线** `＿＿` 占位。
- scope 里 `question.options` 是**数组**（`[{"text":"","key":"第1空"}]`，一个空一项），
  而 `/exam/getTaskPaper` 返回的是**对象** `{第1空:""}` —— 同一件事两种形状，`paper.ts` 两种都吃（`blankCountOf`）。
- 未作答时 `question.student_answer` = `[""]`（有几个空就几个空串），`question.checked` = `false`。

**站点怎么把字读进去（从页面自己的函数体读出来的）**：

```js
// vm.addAnswer 的 type == 30 分支
} else if (type == 30) {
  _.each(question.options, function (option, n) {
    var ueditorId = 'u' + question.id + n;
    answer.push($('#' + ueditorId).val());          // ← 读的是 DOM value，不是 scope
  });
  question.student_answer = answer;
  question.checked = isComplete(question);
}
```

⇒ 回填只要「把字写进 textarea.value」+「让这个函数跑一次」。
`ng-mouseleave` 是站点自己给「打完字离开输入框」准备的入口。

⚠️ **但实测派发 `mouseleave` 事件不触发**：页面用的是 **jQuery 1.12.2**，
jQuery 把 `mouseleave` 做成了**特殊事件**（内部监听 `mouseover`/`mouseout`），
手搓 `new Event('mouseleave')` 派过去没有监听器接（实测派发后 `student_answer` 仍是 `[""]`、`checked` 仍 `false`）。

✅ **直接调 scope 函数才可靠**（实测一次就成）：

```js
const s = angular.element(ta).scope();
ta.value = '绿水青山';
s.vm.addAnswer(null, s.question);      // 填空题分支根本不看 $event
// ⇒ s.question.student_answer = ["绿水青山"]，s.question.checked = true
```

还原也一样（`ta.value=''` 再调一次 ⇒ `[""]` / `checked=false`），所以这条路径**没有副作用残留**。
实现见 `src/sites/uooc/ai/fill.ts` 的 `commitBlank()`（两条路都留着：事件给纯 jqLite 页面，scope 调用是主力）。

**其他实测**：`vm.autoSaveInterval` = 120（秒），`vm.saveTask()` = `autoSaveTask()` + 无新内容时
`layer.msg('没有新的内容需要保存')`；`vm.task.type` = 10（考试）；每次 `addAnswer` 末尾都会 `recordAvatar()`。

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

## 4. 抓包侧 —— 契约已全部拿到（2026-10 补）

> **先纠正上一版的一个错误结论**：上一版写「`uooc-完整流程.flow` 里没有一条请求发往
> `www.uooc.net.cn`」，那句**只对那一个文件成立**。换到
> `local/capture/uooc-C-全流程（数据量极大）+测验做题.flow`（2.4 MB，145 条请求 / 93 个 endpoint）
> 里，**站点自己的文档与全部 XHR 都在**，包括 `/exam/save`、`/exam/commit`、`/exam/view`。
>
> 手法（不整份读抓包）：
> `python tools/flow_index.py <flow> --out local/flowidx-quiz.txt` 出请求总表 →
> `python tools/flow_slice.py <flow> --match "exam/(save|commit|taskInfo|getTaskPaper)" --out local/exam-slice.txt`
> 只切出目标请求。切片默认会 redact，正文没进上下文。
>
> ⚠️ 整份 flow 里含 `data.paper.student`（学生真实姓名）⇒ **不得整份喂给云端模型**。

### 4.1 `GET /exam/taskInfo?tid=<tid>`

`{code,msg,data}`；`data` 字段实测 39 个，答题真正关心的：
`id` / `course_id` / `name` / `status` / **`answer_review`** / **`allow_view_paper`** /
`allow_view_score` / `pass_score` / `answer_hint` / `require_face` / `face_verified` /
`is_ai_correct` / `time_limit` / `end_time` / `course_name`。

⭐ **`tid` = `data.id` = 目录资源里的 `task_id` = `/home/cheatrecord/getAlert?...relation_id=` 的值**，
四个地方是同一个数（实测 `736720049` 与 `291597830` 两例）⇒ 不需要任何换算。

### 4.2 `GET /exam/getTaskPaper?tid=<tid>` —— **做题时**的题面

`data.questions[]`，每题：
`id` / `type` / **`type_text`** / `question` / `level` / `level_text` / `options` /
`parent` / `is_subjective` / `section` / `chapter` / `from` / `dir` / `score` /
`student_answer` / `options_app`；另有 `data.paper{course_title,student,can_do,end_time}`。

- `question` 是**纯文本题干**（不含 HTML 标签）⇒ 直接能喂 LLM，不用洗标签。
- `options` 单选 / 多选是**对象** `{A:"经济",B:"外交",C:"科技",D:"教育"}`；填空是 `{第1空:""}`。
- ⭐ **`type_text` 直接给中文题型**（实测 `"多选题"` / `"填空题"`）⇒ **不要自己猜 `type` 数字编码**。
- ❌ **没有 `answer` 字段** ⇒ 做题时这个接口不给答案。

### 4.3 ⭐ `GET /exam/view?cid=<cid>&tid=<tid>` —— **看答案时**的题面，**含标准答案**

与 4.2 同构，但多出：
`course_id`（注意与外面的 `course_id` 不是一个值）/ **`answer`** / `tips` /
`corrector_id` / `grade_score` / `memo`；外层 `data.task{name,answer_hint,allow_view_score,
allow_view_paper,answer_review,_type,type,course_title,student,dotime,score}`。

实测一条：
```json
{ "id":"525911367", "type":"11", "type_text":"多选题",
  "question":"国防就是指国家防备和抵抗侵略……",
  "options":{"A":"经济","B":"外交","C":"科技","D":"教育"},
  "answer":["A"],            ← 标准答案
  "student_answer":["A"], "grade_score":"50.00", "corrector_id":"-1" }
```
`task.score = "100.00"`。

> ⚠️ **本样本里 `/exam/view` 出现在 `/exam/commit` 之后**，`answer` 会不会因为「已提交 + 开放查看」
> 才下发，**没有证据**。「未提交状态下能不能调」是本方案唯一必须先实测的点。

### 4.4 `POST /exam/save`（保存）

- `Content-Type: application/x-www-form-urlencoded;charset=UTF-8`
- 字段三个：`cid`、`tid`、`data`（**URL-encoded 的 JSON 数组**）
- `data` 形状（解出来后）：
```json
[{"qid":1150154591,"answer":["B"],
  "options":[{"text":"<p>…</p>","key":"A","keyText":"A","checked":false}, …]},
 {"qid":1721785978,"answer":["钢少气多"],
  "options":[{"text":"","key":"第1空"}]}]
```
  - 单选 `answer:["B"]`；多选 `answer:["A","B","C","D"]`；**填空 `answer:["钢少气多"]`（纯文本），
    其 `options` 是 `[{"text":"","key":"第1空"}]`**
  - `checked` 恒 `false`（站点自己不设这个字段）
  - `options[].text` 里**带 HTML**（`<p><span style=…>`），与 getTaskPaper 的纯文本不同
- 响应 `{"code":1,"msg":""}`（19 字节）

### 4.5 `POST /exam/commit`（提交）

与 save **同一套字段**，额外三个：
```
captchaVerifyParam=<base64(JSON)，再做 URL 编码>
reason=用户提交
sceneId=137o3jmc
```
`captchaVerifyParam` 解开后：
```json
{"certifyId":"brYS0cGZG0","sceneId":"137o3jmc","isSign":true,
 "securityToken":"6oOo7e72nA61uVLiZVKiLd9DbYUVp3ZOeniYglWbfwkXfZRJ…"}
```
- `certifyId` **每次提交都不同**；`securityToken` 是**服务端下发**的（两次提交前缀相同、中段不同）
  ⇒ **无法离线伪造**。
- 响应 `{"code":1,"msg":""}`；随后 `GET /exam/<tid>` → **302** → `/exam/paper?cid=&tid=`（200）。
- ⭐ **save 与 commit 的 `data` 字段逐字节相同** ⇒ `data` 是站点从**它自己的 Angular scope** 拼出来的，
  不是从 DOM 现读的。这一点决定了「只调 API 保存、再让站点自己提交」是**行不通的**
  （scope 里没答案，提交出去就是空卷）。

### 4.6 请求头

`save` / `commit` 都带 `content-type` / `origin` / `referer` / **`xsrf`** / `cookie` / `sec-fetch-*`。
**`xsrf` 的取值来源未确认**（可能是同名 cookie）。
⇒ 用**页面自己的 XHR**发就不用管它；用 `src/common/core/http.ts` 的 `request()` 发，就必须先确认。

---

## 5. 验证码：脚本到底能不能替你点「提交」

实测证据（`uooc-完整流程.flow` 的 Host 分布）：
`g.alicdn.com` 2（阿里云验证码 SDK）、`dq1y8x.captcha-open.aliyuncs.com` 1（`InitCaptchaV3`）、
`dq1y8x-verify.captcha-open.aliyuncs.com` 1（`VerifyCaptchaV3`）、
`upload.captcha-open.aliyuncs.com` 1（行为轨迹 `UploadLog`）、
`cloudauth-device-dualstack.cn-shanghai.aliyuncs.com` 3（设备指纹、人脸）。

结论（**现象 — 机制 — 后果**）：

| 问题 | 答案 | 机制 |
|---|---|---|
| 脚本能点中站点自己的「提交」按钮吗？ | **能** | `button.click()` 会跑到 `ng-click` → `vm.commitTask()`，站点自己拼 `data`、自己调 SDK |
| 这样就能把卷子交上去吗？ | **不能** | `commitTask()` 会先要 `captchaVerifyParam`，SDK 弹出**点击验证码**，等的是**人的操作** |
| 能自己合成 `captchaVerifyParam` 吗？ | **不能** | `securityToken` 由阿里云服务端下发，`certifyId` 每次不同（见 4.5） |
| 能直接对页面调 `getCaptchaVerifyParam()` 吗？ | **理论上可以，但没用** | 该函数只在**用户完成验证之后**才返回凭证；提前调只会拿到空值 |

⇒ **验证码那一下必然要人点**。这不是我们的实现问题，验证码存在的意义就是区分这两者。

**但「合成点击」仍然有价值**：它可以**替用户点开提交入口**（免去在页面上找按钮），
把「需要人做的事」压缩到最小 —— 只剩滑动 / 点击验证码那一下。

⚠️ **由此推出一条硬约束**：因为 `data` 来自站点自己的 scope（4.5），
所以**光调 `/exam/save` 不把答案回填进页面，点提交等于交白卷**。
回填必须走**真实的 DOM 交互**（点 `input` 触发站点自己的 `ng-click="vm.addAnswer(...)"`），
让 scope 同步；`/exam/save` 只能当「额外的草稿保险」，不能替代回填。

---

## 6. 数据缺口（2026-10 重写）

**已由本轮抓包解决**（原编号见需求细则 §D）：
D2 答题页 URL（新版顶层 `/exam/{tid}`；旧版页内 iframe）、D4 回填与提交契约、D5 `temperature`、
D7 测验样本、D10 `tid` 与 `task_id` 的关系（同一个数）、D11 提交后去向（302 → `/exam/paper`）、
D12 `www.uooc.net.cn` 抓包。

**顺带澄清**：D8（填空 / 判断 DOM）与 D9（验证码 DOM）**其实早就采过了**，只是没登记进表 ——
`local/capture/` 里已有 `dom-uooc-exam-旧-已完成-单选-填空.txt`、
`dom-uooc-exam-旧-提交未通过-单选-多选-判断.txt`、
`dom-uooc-exam-{新,旧}-未完成-单选-多选-验证码.txt`、
`dom-uooc-quiz-新-提交{通过,未通过}.txt`、`dom-uooc-quiz-新-点击确定通过按钮.txt`。
人脸识别一项按用户口径**忽略**（实测 `require_face: "False"`，且从未遇到过）。

**D8（填空 DOM）本轮已彻底闭环**：旧采样都是「已完成 / 只读」视图，看不到可编辑控件；
2026-10-18 在活的未完成试卷上实测把结构、`id` 规则、空数、回填入口都写进了 §2.4
（`textarea.ue-container1` + `#u<qid><n>` + `vm.addAnswer` 读 DOM value + jQuery 1.12 的 `mouseleave` 陷阱）。

**仍然缺的**：

1. **`/exam/view` 在未提交状态下能不能拿到 `answer`** —— 唯一的关键未知，必须先实测。
2. **各类题型的 `type` 数字编码与 `type_text` 的完整对照** —— 目前样本只有多选（`11`）/ 填空（`30`）。
   实现时优先用 `type_text`，但要确认单选 / 判断的取值。
3. **`xsrf` 头的来源** —— 见 4.6，只影响「用 `request()` 直接打接口」这条路。
4. **AngularJS scope 字段名** —— 如果最终决定用「点 DOM input」回填，这项**就不再需要**。
5. **`dom-uooc-quiz-新-提交通过 / 未通过` 两份采样的具体结构** —— 已落盘未读，
   提交后「通过与否」的判定要等实现到那一步再取。

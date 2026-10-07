# UOOC 双版目录结构底图

> 取证日期：本次会话
> 取证方式：ego-browser（CDP 直连用户已登录的 Edge），**只读**——不点按钮、不发请求、不改 DOM。
> 取证对象：同一门课的同一节，旧版与新版各开一个标签页，同时在线。
> 课程：`cid = 2005836044`

---

## 0. 一句话结论

**旧版 `/home/learn/index` 与新版 `/home/learn/new/{cid}` 的目录树结构完全同构。**

层级数量、字段名、导航函数名（`toggleChapter` / `goSource`）、ui-router 状态名（`main.chapter` /
`main.chapter.section`）、URL 形状、`sourceType` 映射——**全部一致**；
差别只在 **CSS 类名**和少数容器元素上。

更关键：两版**共用同一份 Angular 数据源**。实测两版从页面里导出的整棵树**逐字相同**（10 章 / 54 节）。

→ 结论：U3 自动连播**只需要写一套逻辑**，用一份"类名映射表"适配两版即可。

---

## 1. 路由：URL 形状

```
旧版  #/{cid}/{chapterId}/{sectionId}/{sourceId}/section
新版  #/{cid}/{chapterId}/{sectionId}/{sourceId}/section
```

两版 URL **完全同形**，只有新版多了 `/learn/new/{cid}` 这一段前缀（在 `#` 之前）。

| URL 段 | 含义 | 本次实测值 |
|---|---|---|
| `cid` | 课程 ID | `2005836044` |
| `chapterId` | 章 ID | `1177669809`（第4章） |
| `sectionId` | 节 ID | `1171204376`（第1节） |
| `sourceId` | 当前资源 ID（可省略） | `1289718123` |
| 尾段 | ui-router 状态名末段 | `section` |

**页面只有两个状态**：

| 状态 | URL 尾段 | 含义 |
|---|---|---|
| `main.chapter` | 无（或省略） | 章节标题页——**没有视频**。用户点章标题会落到这里 |
| `main.chapter.section` | `/section` | 节页——可能含视频 / 测验 / 附件 |

> ⚠️ 这条解释了一个早期误判：`#/{cid}/{chapterId}/{sectionId}` 这种链接打开后**没有播放器**，
> 因为它只是章节标题页；必须选到具体的「节」才会出内容。

---

## 2. 三层树模型

```
L1 章 (chapter)
 └─ L2 节 (section)
     ├─ 叶子：直接挂 unitSource（资源清单）
     └─ L3 知识点
         └─ 叶子：挂 unitSource
```

**每个节点要么是「容器」（有 `children` 数组），要么是「叶子」（有 `unitSource` 数组），二者不同时出现。**

实测本课程：**10 章 / 54 个 L2 节点**；L3 只在部分节点下存在（如
`L2[1408189092] 第1节 劳动` 下有 2 个 L3，`L2[1171204376] 第1节 中国传统劳动文化` 直接是叶子）。

树的完整文本快照：`local/capture/uooc-treewalk-新.txt` / `-旧.txt`（各 105 行，逐字相同）。
树的 JSON 快照：`local/capture/uooc-fulltree-新.json` / `-旧.json`。

---

## 3. 两版 DOM 同构对照表

层次结构一模一样，只是类名/标签换了皮：

| 层 | 旧版 `/home/learn/index` | 新版 `/home/learn/new/{cid}` |
|---|---|---|
| 章容器 | `ul.rank-1` | `ul.newlearn_left_card_chapter_list` |
| 章项 | `li.catalogItem[id="{chapterId}"]` | `li`（**无 id**） |
| 章标题 | `div.basic.chapter.{complete\|uncomplete}` | `div.level_1_title[id="id_{chapterId}"]` |
| 节容器 | `ul.rank-2` | `ul.level_2` |
| 节项 | `li[id="{sectionId}"]` | `li`（**无 id**） |
| 节标题 | `div.basic` | `div.level_2_title[id="id_{sectionId}"]` |
| 资源容器 | `div.resourcelist` | `div.level_2_resourcelist` |
| 资源项 | `div.basic` | `div.level_2_resourcelist_item` |
| 三级容器 | `ul.rank-3` | `ul.level_3` |
| 展开箭头 | `i.iconfont.icon-xiangshang` | `img.active` |

**注意 id 的位置**：旧版把 id 放在 `li` 上；新版把 id 放在标题 div 上、且加了 `id_` 前缀
（`id="id_1171204376"`）。两版都能从 `href` 拿到 id（见下节）。

外侧播放区：

| 层 | 旧版 | 新版 |
|---|---|---|
| 播放器外壳 | `div.video-js#player` | 同（**完全一样**） |
| `<video>` | `video#player_html5_api.vjs-tech` | 同（**完全一样**） |
| 外壳的父容器 | `div.showViewer` | `div.newlearn_source_video` |

> ✅ **播放器部分两版完全相同**——现有的 `src/sites/uooc/video.ts`（U1/U2/U4 三件套）
> 不需要为双版做任何适配。

新版比旧版多两个外层容器：`div.newlearn_center > div.newlearn_center_top > div.newlearn_chapter[ui-view]`。
`div.newlearn_chapter` 上有 `ng-if="$state.current.name != 'main.chapter'"`——即**只有进到节页才渲染播放区**。

---

## 4. 导航：三层各自的跳转方式

**两版完全一致**（属性内容逐字相同）：

### 4.1 跳到「章」
```html
<div class="level_1_title"          <!-- 旧版: div.basic.chapter -->
     ng-click="toggleChapter(chapterItem)"
     ui-sref="main.chapter({ chapterId: chapterItem.id })"
     href="#/2005836044/1177669809">
```
- `href` 可直接用：`#/{cid}/{chapterId}`
- **但这是标题页，没有视频**

### 4.2 跳到「节」（U3 的主力动作）
```html
<div class="level_2_title"          <!-- 旧版: div.basic -->
     ng-click="toggleChapter(sectionItem)"
     ui-sref="main.chapter.section({ sectionId: sectionItem.id })"
     href="#/2005836044/1177669809/1171204376">
```
- `href` 可直接用：`#/{cid}/{chapterId}/{sectionId}`
- 注意 `ui-sref` 的 `main.chapter.section` **只传 `sectionId`**（`chapterId` 由父状态 `main.chapter` 继承）
- **`href` 里同时含 chapterId 和 sectionId，更适合我们直接拼**

### 4.3 选中「资源」（同一个节里的多个视频/测验）
```html
<div class="level_2_resourcelist_item"   <!-- 旧版: div.basic -->
     ng-repeat="source in sectionItem.unitSource"
     ng-click="goSource(source, 'section')"
     ng-if="isSocial ? (source.type == 10 || source.type == 50 || source.type == 60) : true">
```
- ⚠️ **资源项没有 `href`**——只能靠 `ng-click="goSource(source, 'section')"`，
  也就是必须拿到 Angular scope 上的函数才能跳
- `ng-class="{ active: stateParams.sourceId == source.id && $state.current.name == 'main.chapter.section...' }"`
  → 「当前选中哪个资源」由 **URL 里的 sourceId** 决定

---

## 5. Angular 数据层：整棵树在哪

**整棵树在一个叫 `chapterList` 的数组里，挂在左侧目录的控制器 scope 上。**

访问方法（两版同法，只是选择器不同）：

```js
// 新版
angular.element(document.querySelector('.newlearn_left_card_chapter_list > li')).scope().chapterList
// 旧版
angular.element(document.querySelector('div.basic.chapter')).scope().chapterList
```

要点：
- `chapterList` 本身挂在**外层控制器 scope**上，不在 `<li>` 的 scope 上；
  但 `<li>` 的 scope 通过**原型继承**能读到它——所以从任意一个 `<li>` 取 `.scope().chapterList` 都行。
- `li` / `div.basic.chapter` 的 scope 上还有 `chapterItem`（`ng-repeat` 的迭代变量），指向树里的当前节点。

旧版/新版**左侧目录控制器 scope 的自有键完全一致**（同名函数、同名字段）：

```
curQsource, hideCard, noteContent, sourceType, progress, getProgress,
showVideoTab, tabType, selectTab, sliceData, curSliceTime, courseInfo, isSocial,
showSourceList, openNotice, openReviewTime, openCourseMsg, goPoint, toMinuteString,
jumpSlice, moveSlice, getCourseSliceData, toggleCard, clearVisible, toggleChapter,
goSource, studyBuddyUrl, openFormulaDialog, updateSourceFinished,
noteList, noteListPaper, getNoteList, questionPaper, getQuestionList, questionList
```

其中与本任务相关的关键函数：

| 函数 | 观察到的签名 | 猜测用途 |
|---|---|---|
| `goSource` | `goSource(source, type)` | 跳到某个资源（`type` 传 `'section'`） |
| `toggleChapter` | `toggleChapter(item)` | 展开/收起某个节点 |
| `showSourceList` | `showSourceList(item)` | 返回布尔，判断该节点资源是否可见/可点 |
| `updateSourceFinished` | `updateSourceFinished(learnParams, sourceId, finished)` | 上报「学完了」 |
| `setFinishedSource` | `setFinishedSource(source)` | 仅旧版有，标记资源完成 |

播放区还有独立的 isolateScope（**在这里能读到「当前正在播的资源对象」**）：
- 旧版 `div.showViewer` → `.isolateScope().source` = `{id, course_id, title, content, uri, type}`
- 新版 `div.newlearn_source_video` → 对应位置

---

## 6. 节点字段字典（L1 章 / L2 节 / L3 知识点通用）

实测 章 与 节 的字段**完全相同**（同一套结构体）：

```
id, name, desc, parent, status, task_id, order_id, learn_mode, learn_task_cnt,
is_pay, number, pid, finished, learning, icon_list, _level, hide,
children, unitSource, errorMsg, $$hashKey
```

| 字段 | 实测值示例 | 含义（推断） |
|---|---|---|
| `id` | `1177669809` | 节点 ID = URL 里的 chapterId / sectionId |
| `name` | `"第1节 中国传统劳动文化"` | 显示名 |
| `_level` | `1` / `2` / `3` | **树深度**，1=章、2=节、3=知识点 |
| `number` | `"第1节"` | 序号文本 |
| `status` | `2` | 本课程所有节点实测都是 `2` |
| `finished` | `1` / `0` | **是否学完** |
| `hide` | `true` / `false` | **是否在当前路径之外**（见下） |
| `children` | `[...]` | 子节点数组（容器节点才有） |
| `unitSource` | `[...]` | 资源数组（叶子节点才有） |
| `icon_list` | `[{id,type,catalog_id,type_name}]` | 图标标记 |
| `errorMsg` | 仅当前节上有 | 错误提示（未展开看内容） |

### `hide` 字段 = 「当前位置」的锚点 ⭐

实测：**当前路径上的节点 `hide = false`，其它全部 `hide = true`。**

```
第1章 hide=true   ← 不在当前路径
第2章 hide=true
第3章 hide=true
第4章 hide=false  ← 当前章
   第1节 中国传统劳动文化 hide=false  ← 当前节
   第2节 ~ 第5节 hide=true
第5~10章 hide=true
```

→ **不依赖 URL，只靠树就能定位「我在树的哪个位置」**：找 `hide === false` 的那条链。

---

## 7. 资源字段字典（`unitSource` 的元素）

叶子节点的 `unitSource` 数组里每个元素的字段：

```
id, course_id, title, content, uri, type, is_task, task_id, discuss_id, sort,
parent, transcode_url, desc, _level, pid, catalog_id, video_url, video_play_list,
subtitle, quiz, video_pos, finished, pay_status
```

旧版额外多一个 `preview`。

实测当前资源 `1289718123`：

| 字段 | 实测值 | 含义 |
|---|---|---|
| `id` | `1289718123` | 资源 ID = URL 里的 sourceId |
| `type` | `10` | **资源类型**（见下表） |
| `title` | `"04- 1.mp4"` | 显示名 |
| `uri` | 字符串 | 原始地址 |
| `video_url` | `object` | 播放地址对象（未展开） |
| `transcode_url` | `object` | 转码地址对象（未展开） |
| `video_play_list` | `arr len=1` | 播放列表（未展开） |
| `subtitle` | `object` | 字幕（未展开） |
| `quiz` | **`arr len=0`** | **测验数据**——视频资源上为空数组 |
| `video_pos` | number | 上次播放位置（记进度用） |
| `finished` | `number`（旧版）/ 无（新版） | 完成度 |
| `is_task` | string | 是否任务点 |
| `sort` | number | 排序 |

### `sourceType` 映射 ⭐（两版逐字相同，写在控制器 scope 上）

```js
sourceType = {
  "10": "视频",
  "50": "附件",
  "60": "文本",
  "70": "讨论",
  "80": "测验"
}
```

→ **U3「只对视频连播」= 只认 `type == 10`；U6–U9「找测验」= 找 `type == 80`。**
（`quiz` 字段挂在资源对象上，视频资源的 `quiz` 为空数组，说明测验资源才带题。）

---

## 8. ⚠️ 关键障碍：资源清单是**懒加载**的

实测证据：

| 节点 | `children` | `unitSource` |
|---|---|---|
| `L2[1171204376]` 第1节 中国传统劳动文化（**当前节**） | 无 | **`len=1`** |
| `L2[1408189092]` 第1节 劳动（第1章的，非当前） | `len=2` | **`undefined`**（字段不存在） |
| `L2[465358461]` 第2节 从古至今的劳动成就（第4章第2节） | 无 | `undefined` |
| 第5~10章 的所有 L2 节点 | 无 | `undefined` |

**规律**：`unitSource` **只有「当前正在浏览的那个叶子节点」才被填充**，其它节点上这个字段根本不存在（不是空数组，是 `undefined`）。

`children` 也有一部分节点没加载（第1章的 `L2[733704712] 第5节` 显示为 `leaf(empty)`，但它其实应该属于某个容器）。

**这意味着：**
1. ❌ 不能「开局把整棵树的视频清单读出来，排好队一个个播」——数据不全。
2. ✅ 只能「走到哪读到哪」：导航到下一节 → 等它加载 → 读 DOM/数据判断有没有视频 → 有就播。
3. ⚠️ 更糟：非当前路径上的节点，**无法从数据判断它到底是「容器」还是「叶子」**
   （两者都可能表现为既无 `children` 又无 `unitSource`）——所以「下一个节点是谁」也得靠试探。

**这是 U3 设计的核心约束，需要用户拍板走哪条路（见文末待确认）。**

---

## 9. 帧结构（新版特有，关系到 U6–U9）

新版页面实测有 **8 个 frame**：

| frame | URL | 说明 |
|---|---|---|
| top | `/home/learn/new/{cid}#/...` | 播放器在这里 |
| `frame[0..1]` | `about:blank` | |
| **`frame[2]`** | `https://www.uooc.net.cn/ai/studybuddy?type=learn&cid=2005836044&pid=1384333741` | **AI 学伴**——U6–U9 的落点候选 |
| `frame[3..6]` | `about:blank` | |

旧版页面实测只有 **1 个 frame**（无 iframe）。

另注：新版页面里还有 UEditor 的编辑器帧（`ueditor_0/1/2`），那是讨论区用的，与答题无关。

---

## 10. 可复现的取证命令

采样已落盘（`local/` 不随 git）：

| 文件 | 内容 |
|---|---|
| `local/capture/uooc-treewalk-新.txt` / `-旧.txt` | 整棵树的可读缩进快照（105 行） |
| `local/capture/uooc-fulltree-新.json` / `-旧.json` | 整棵树的 JSON（含资源字段） |
| `local/capture/uooc-domskel-新.txt`（112 行） / `-旧.txt`（85 行） | 目录树 DOM 骨架（含全部 ng-* 属性） |
| `local/capture/dom-uooc-learn-旧2.txt` / `-新2.txt` | 早期探针输出 |
| `local/capture/dom-uooc-新-词汇.txt` | 新版类名词汇表 |

一键复读整棵树（在 ego_exit 里 `page.evaluate`，两版通用）：

```js
const s = angular.element(document.querySelector(SEL)).scope();
// SEL: 新版 '.newlearn_left_card_chapter_list > li' / 旧版 'div.basic.chapter'
const tree = s.chapterList;
```

---

## 11. 待确认 / 未取证

- [ ] **资源清单接口**：页面按什么接口、带什么参数去拉某个节点的 `unitSource`？（需抓包）
      拿到它就能一次性把整条播放队列算出来，彻底绕开懒加载。
- [ ] `goSource(source, 'section')` 的完整行为（是否会改 URL、是否会写进度）。
- [ ] `status = 2` 的确切含义（本课程所有节点都是 2）。
- [ ] `quiz` 数组的元素结构（当前视频资源的 `quiz` 为空数组，需要一个测验资源做样本）。
- [ ] `video_pos` / `finished` 的上报时机与接口（影响 U3「播完自动下一节」的判定）。
- [ ] 新版 `frame[2]`（AI 学伴）内部的接口与页面结构——U6–U9 的落点。

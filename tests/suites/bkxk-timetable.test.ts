/**
 * 档 1 冒烟：`bkxk/timetable-model.ts`（要不要请站点重画）+ `bkxk/tt-mark.ts`（标记怎么拼）。
 *
 * v0.29 起课表由站点自己画，我们只剩两件纯逻辑：**判据**与**标记文本**。
 * `timetable.ts` 碰 `document`，档 1 测不了（本项目既定边界）；站点 DOM 契约靠手测。
 */

import { describe, it, assert, assertEqual } from '../harness.ts';
import {
  MAX_REFETCH_TRIES,
  SITE_CARD_SELECTOR,
  SITE_TABLE_ID,
  SITE_TABLE_SELECTOR,
  shouldRefetchSite,
} from '../../src/sites/bkxk/timetable-model.ts';
import type { RefetchInput } from '../../src/sites/bkxk/timetable-model.ts';
import {
  TT_MARK_ATTR,
  TT_TAG_CLASS,
  TT_TAG_HTML,
  TT_TAG_SELECTOR,
  TT_TAG_TEXT,
  escapeText,
  tagMarkedName,
} from '../../src/sites/bkxk/tt-mark.ts';

/** 一份「什么都成立」的输入：五个条件全真 ⇒ 应该动手 */
function input(over: Partial<RefetchInput> = {}): RefetchInput {
  return {
    hijackOn: true,
    tried: 0,
    maxTries: MAX_REFETCH_TRIES,
    enabledCourses: 1,
    siteCards: 14,
    tags: 0,
    ...over,
  };
}

describe('bkxk/timetable —— 站点画的课表长什么样（常量对齐站点契约）', () => {
  it('容器用站点自己写的 id，兜底选择器留着防容器 id 变了', () => {
    assertEqual(SITE_TABLE_ID, 'myCourseTable');
    assertEqual(SITE_TABLE_SELECTOR, '.cv-my-course');
  });

  it('「一张卡片」的类名与 `curriculum.min.js` 里拼字符串时用的一致', () => {
    assertEqual(SITE_CARD_SELECTOR, '.cv-course-card-single');
  });

  it('自动补请的次数上限是个有限值（防与站点互刷）', () => {
    assert(MAX_REFETCH_TRIES > 0 && MAX_REFETCH_TRIES <= 10, `上限 ${String(MAX_REFETCH_TRIES)} 应在 1..10`);
  });
});

describe('bkxk/timetable —— 要不要请站点重画（shouldRefetchSite）', () => {
  it('晚到了：站点已画完卡片、里面没有我们的标记 ⇒ 请它重画', () => {
    assertEqual(shouldRefetchSite(input()), true);
  });

  it('接管开关关着 ⇒ 不请（重画一次也还是老样子）', () => {
    assertEqual(shouldRefetchSite(input({ hijackOn: false })), false);
  });

  it('没有启用的自定义课程 ⇒ 不请（无事可做）', () => {
    assertEqual(shouldRefetchSite(input({ enabledCourses: 0 })), false);
  });

  it('站点还没画完（表里一个卡片都没有）⇒ 不请，再等等', () => {
    assertEqual(shouldRefetchSite(input({ siteCards: 0 })), false);
  });

  it('已经有我们的标记 ⇒ 不请（这一轮接住了）', () => {
    assertEqual(shouldRefetchSite(input({ tags: 1 })), false);
    assertEqual(shouldRefetchSite(input({ tags: 19 })), false);
  });

  it('自动补请到达上限 ⇒ 不请（避免与站点互相触发）', () => {
    assertEqual(shouldRefetchSite(input({ tried: MAX_REFETCH_TRIES - 1 })), true);
    assertEqual(shouldRefetchSite(input({ tried: MAX_REFETCH_TRIES })), false);
    assertEqual(shouldRefetchSite(input({ tried: MAX_REFETCH_TRIES + 5 })), false);
  });

  it('五种「不请」的理由互相独立：任一为假都不动手', () => {
    const blocked: Partial<RefetchInput>[] = [
      { hijackOn: false },
      { enabledCourses: 0 },
      { siteCards: 0 },
      { tags: 3 },
      { tried: MAX_REFETCH_TRIES },
    ];
    for (const over of blocked) {
      assertEqual(shouldRefetchSite(input(over)), false, `这条为假就不该请：${JSON.stringify(over)}`);
    }
  });
});

describe('bkxk/tt-mark —— 拼进 courseName 的标记', () => {
  it('标记是一段 span：类名 + 数据属性 + 「自定义」三个字', () => {
    assertEqual(TT_TAG_HTML, `<span class="${TT_TAG_CLASS}" ${TT_MARK_ATTR}="1">${TT_TAG_TEXT}</span>`);
    assertEqual(TT_TAG_CLASS, 'sztb-bkxk-tt-tag');
    assertEqual(TT_MARK_ATTR, 'data-sztb-tt');
    assertEqual(TT_TAG_TEXT, '自定义');
    assertEqual(TT_TAG_SELECTOR, '[data-sztb-tt]');
  });

  it('课名 + 标记：站点会把它拼成 `<div>课名<span…>自定义</span></div>`', () => {
    assertEqual(tagMarkedName('线性代数'), `线性代数${TT_TAG_HTML}`);
  });

  it('课名里的尖括号 / & / 引号被转义（拼 HTML 的是我们，得自己负责）', () => {
    assertEqual(escapeText('A<B>&C"D'), 'A&lt;B&gt;&amp;C&quot;D');
    assertEqual(tagMarkedName('<img onerror=x>'), `&lt;img onerror=x&gt;${TT_TAG_HTML}`);
  });

  it('转义是可逆的观感：浏览器把 &lt; 显示回 <，所以用户看到的课名不变', () => {
    assertEqual(escapeText('线性代数（2）'), '线性代数（2）', '正常课名一个字符都不该动');
  });

  it('标记只认数据属性，不认文本 —— 课名叫「自定义」的课不会被误认', () => {
    assert(TT_TAG_SELECTOR.includes(TT_MARK_ATTR), '选择器必须挂在数据属性上');
    assertEqual(tagMarkedName('自定义').startsWith('自定义'), true);
  });
});

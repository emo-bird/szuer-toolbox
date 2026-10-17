/**
 * 档 1 冒烟：AI 作答的纯函数（解析、投票、题型判定、提示词、交接条）。
 *
 * 这里只测「不碰网络、不碰 DOM」的部分 —— 它们是最容易悄悄坏掉的地方：
 * 模型的回答格式一变，坏的就是解析器；而解析器坏了整份卷子的答案都会作废。
 * 拉题/回填/交卷属于档 2、档 3，不在这里测。
 */
import {
  describe,
  it,
  assert,
  assertEqual,
  assertDeepEqual,
} from '../harness.ts';

import {
  MAX_SAMPLES,
  judgeToLetter,
  majority,
  normalizeAnswer,
  normalizeChoice,
  parseAnswerLines,
  parseAnswers,
} from '../../src/sites/uooc/ai/parse.ts';
import { blankCountOf, isAnswerable, kindOf, type QuestionKind } from '../../src/sites/uooc/ai/paper.ts';
import { blankSegments } from '../../src/sites/uooc/ai/fill.ts';
import { SHARED_INSTRUCTION, TEMPLATES, buildPrompt } from '../../src/sites/uooc/ai/prompts.ts';
import { chatUrl, extractContent } from '../../src/sites/uooc/ai/llm.ts';

import type { ExamQuestion } from '../../src/sites/uooc/ai/paper.ts';

describe('uooc/ai · 题型判定', () => {
  it('认中文 type_text，并且中文优先于数字 type', () => {
    assertEqual(kindOf('单选题', '10'), 'single');
    assertEqual(kindOf('多选题', '11'), 'multi');
    assertEqual(kindOf('判断题', '20'), 'judge');
    assertEqual(kindOf('填空题', '30'), 'blank');
    // 站点真给的是「一、单选题」这种带序号的，必须也能认
    assertEqual(kindOf('一、单选题', '10'), 'single');
    // 中文与数字打架时听中文的
    assertEqual(kindOf('多选题', '10'), 'multi');
  });

  it('没有 type_text 时回退数字 type', () => {
    assertEqual(kindOf('', '10'), 'single');
    assertEqual(kindOf('', '11'), 'multi');
    assertEqual(kindOf('', '20'), 'judge');
    assertEqual(kindOf('', '30'), 'blank');
  });

  it('不认识的题型算 other，不猜', () => {
    assertEqual(kindOf('', ''), 'other');
    assertEqual(kindOf('', '99'), 'other');
    assertEqual(kindOf('计算题', '50'), 'other');
  });

  it('单选/多选/判断/填空能自动作答，主观题不能（填空自用户 m00107 起纳入）', () => {
    assert(isAnswerable('single'), 'single 应该可作答');
    assert(isAnswerable('multi'), 'multi 应该可作答');
    assert(isAnswerable('judge'), 'judge 应该可作答');
    assert(isAnswerable('blank'), 'blank 现在应该可作答');
    assert(!isAnswerable('other'), 'other（名词解释/问答/论述）不该被算进自动作答');
  });

  it('空数：接口给对象、页面给数组，两种都数得对', () => {
    assertEqual(blankCountOf({ 第1空: '' }, 'blank'), 1);
    assertEqual(blankCountOf({ 第1空: '', 第2空: '' }, 'blank'), 2);
    // 页面 scope 里的形状（活页实测）：一个空一项的数组
    assertEqual(blankCountOf([{ text: '', key: '第1空' }], 'blank'), 1);
    assertEqual(blankCountOf([{ text: '', key: '第1空' }, { text: '', key: '第2空' }], 'blank'), 2);
  });

  it('空数只对填空题有意义，别的题型恒 0（避免选择题的 4 个选项被当成 4 个空）', () => {
    assertEqual(blankCountOf({ A: '经济', B: '外交', C: '科技', D: '教育' }, 'single'), 0);
    assertEqual(blankCountOf({ A: '甲', B: '乙' }, 'multi'), 0);
    assertEqual(blankCountOf(null, 'blank'), 0);
    assertEqual(blankCountOf(undefined, 'blank'), 0);
    assertEqual(blankCountOf('第1空', 'blank'), 0);
  });
});

describe('uooc/ai · 答案归一化', () => {
  it('单个字母：大小写与全角都归一', () => {
    assertEqual(normalizeChoice('a'), 'A');
    assertEqual(normalizeChoice(' A '), 'A');
    assertEqual(normalizeChoice('Ａ'), 'A');
    assertEqual(normalizeChoice('A.'), 'A');
    assertEqual(normalizeChoice('A。'), 'A');
  });

  it('多选：分隔符、顺序、重复都归一', () => {
    assertEqual(normalizeChoice('C, A'), 'A,C');
    assertEqual(normalizeChoice('C，A'), 'A,C');
    assertEqual(normalizeChoice('A、C'), 'A,C');
    assertEqual(normalizeChoice('A;C'), 'A,C');
    assertEqual(normalizeChoice('A/C'), 'A,C');
    assertEqual(normalizeChoice('A,A'), 'A');
    assertEqual(normalizeChoice('A;B;A'), 'A,B');
  });

  it('判断题的中文/符号写法归一成 A/B', () => {
    assertEqual(normalizeChoice('正确'), 'A');
    assertEqual(normalizeChoice('对'), 'A');
    assertEqual(normalizeChoice('×'), 'B');
    assertEqual(normalizeChoice('错误'), 'B');
  });

  it('认不出来的东西返回 null，不硬凑', () => {
    assertEqual(normalizeChoice(''), null);
    assertEqual(normalizeChoice('   '), null);
    assertEqual(normalizeChoice('ABC'), null);
    assertEqual(normalizeChoice('第1空'), null);
    // 空格也是分隔符：多选写成「A B C」照样认（站点与模型都偶尔这么回）
    assertEqual(normalizeChoice('A B C'), 'A,B,C');
  });

  it('judgeToLetter 只认判断词，不认字母本身', () => {
    assertEqual(judgeToLetter('正确'), 'A');
    assertEqual(judgeToLetter('T'), 'A');
    assertEqual(judgeToLetter('true'), 'A');
    assertEqual(judgeToLetter('√'), 'A');
    assertEqual(judgeToLetter('错误'), 'B');
    assertEqual(judgeToLetter('F'), 'B');
    assertEqual(judgeToLetter('false'), 'B');
    assertEqual(judgeToLetter('✗'), 'B');
    assertEqual(judgeToLetter('A'), null);
    assertEqual(judgeToLetter('第1空'), null);
  });

  it('normalizeAnswer 按题型走不同口径', () => {
    assertEqual(normalizeAnswer('c,a', 'multi'), 'A,C');
    assertEqual(normalizeAnswer('正确', 'judge'), 'A');
    assertEqual(normalizeAnswer('  朝鲜战争  ', 'blank'), '朝鲜战争');
    assertEqual(normalizeAnswer('', 'blank'), null);
    assertEqual(normalizeAnswer('   ', 'blank'), null);
    // 填空题不该被当成字母答案归一
    assertEqual(normalizeAnswer('第1空', 'blank'), '第1空');
  });

  it('字母大小写归一（题号与题型无关）', () => {
    const kinds: readonly QuestionKind[] = ['single'];
    assertDeepEqual(parseAnswers('1. b', kinds), ['B']);
  });
});

describe('uooc/ai · 回答解析', () => {
  it('标准的多行回答', () => {
    const m = parseAnswerLines('1. A\n2. B,C\n3. 正确');
    assertEqual(m.get(1), 'A');
    assertEqual(m.get(2), 'B,C');
    assertEqual(m.get(3), '正确');
  });

  it('各种题号分隔符都认', () => {
    for (const line of ['1. A', '1、A', '1．A', '1：A', '1:A', '1）A', '1) A']) {
      assertEqual(parseAnswerLines(line).get(1), 'A', `分隔符解析失败：${line}`);
    }
  });

  it('同一题号出现两次时保留第一次', () => {
    assertEqual(parseAnswerLines('1. A\n1. B').get(1), 'A');
  });

  it('去掉 ``` 围栏', () => {
    const m = parseAnswerLines('```\n1. A\n2. B\n```');
    assertEqual(m.get(1), 'A');
    assertEqual(m.get(2), 'B');
  });

  it('一行挤了好几题也要解析出来（否则整行答案全废）', () => {
    const m = parseAnswerLines('1.A 2.B 3.C');
    assertEqual(m.get(1), 'A');
    assertEqual(m.get(2), 'B');
    assertEqual(m.get(3), 'C');
  });

  it('一行多题 + 多选字母也认', () => {
    const m = parseAnswerLines('1. A,C 2. B 3. A,B,D');
    assertEqual(m.get(1), 'A,C');
    assertEqual(m.get(2), 'B');
    assertEqual(m.get(3), 'A,B,D');
  });

  it('正文里的数字不会被误当题号（题号前面得有空白或行首）', () => {
    const m = parseAnswerLines('1. 第2.3条讲的是这个道理');
    assertEqual(m.size, 1, '只该解析出第 1 题');
    assertEqual(m.get(1), '第2.3条讲的是这个道理');
  });

  it('解析结果长度恒等于题目数（对齐依据，不能短）', () => {
    const kinds: readonly QuestionKind[] = ['single', 'multi', 'judge'];
    const r = parseAnswers('1. A', kinds);
    assertEqual(r.length, 3);
    assertEqual(r[0], 'A');
    assertEqual(r[1], null);
    assertEqual(r[2], null);
  });

  it('全空回答得到全 null', () => {
    const kinds: readonly QuestionKind[] = ['single', 'single'];
    assertDeepEqual(parseAnswers('', kinds), [null, null]);
    assertDeepEqual(parseAnswers('我不会', kinds), [null, null]);
  });

  it('parseAnswers 按题型归一', () => {
    const kinds: readonly QuestionKind[] = ['single', 'multi', 'judge', 'blank'];
    const r = parseAnswers('1. b\n2. c，a\n3. 错误\n4. 朝鲜战争', kinds);
    assertDeepEqual(r, ['B', 'A,C', 'B', '朝鲜战争']);
  });
});

describe('uooc/ai · 多数投票', () => {
  it('两票相同即定稿', () => {
    const v = majority(['A', 'A']);
    assertEqual(v.decided, true);
    assertEqual(v.answer, 'A');
  });

  it('两票不同且没到上限时不定稿', () => {
    const v = majority(['A', 'B']);
    assertEqual(v.decided, false);
  });

  it('三票里出现两票相同即定稿', () => {
    const v = majority(['A', 'B', 'B']);
    assertEqual(v.decided, true);
    assertEqual(v.answer, 'B');
  });

  it('多个都够两票时取先出现的（保证同批样本结果稳定）', () => {
    const v = majority(['A', 'B', 'A', 'B']);
    assertEqual(v.decided, true);
    assertEqual(v.answer, 'A');
  });

  it('到上限还没有多数就取最后一次', () => {
    assertEqual(MAX_SAMPLES, 4);
    const v = majority(['A', 'B', 'C', 'D']);
    assertEqual(v.decided, true);
    assertEqual(v.answer, 'D');
  });

  it('空样本不定稿', () => {
    const v = majority([]);
    assertEqual(v.decided, false);
    assertEqual(v.answer, '');
  });
});

describe('uooc/ai · 提示词', () => {
  const q: ExamQuestion = {
    id: '1',
    kind: 'single',
    typeText: '单选题',
    stem: '中华人民共和国的首都是哪里？',
    options: [
      { key: 'A', text: '北京' },
      { key: 'B', text: '上海' },
    ],
    score: '5.00',
    studentAnswer: [],
  };

  it('五套模板齐、id 唯一、都有正文', () => {
    assertEqual(TEMPLATES.length, 5);
    const ids = TEMPLATES.map((t) => t.id);
    assertEqual(new Set(ids).size, 5, '模板 id 必须唯一');
    for (const t of TEMPLATES) {
      assert(t.body.trim().length > 0, `模板 ${t.id} 正文为空`);
      assert(t.label.trim().length > 0, `模板 ${t.id} 缺 label`);
    }
  });

  it('共用指令包含「只要答案、不要解释」的口径', () => {
    assert(SHARED_INSTRUCTION.includes('不要'), '共用指令里得明确要求不输出解释');
    assert(SHARED_INSTRUCTION.includes('升序'), '多选答案的排序口径得写进去');
  });

  it('题干带题号与题型，选项缩进在下一行', () => {
    const p = buildPrompt([q], TEMPLATES[0]!);
    assert(p.includes(TEMPLATES[0]!.body), '提示词里得有模板正文');
    assert(p.includes('题目：'), '提示词里得有题目分隔');
    assert(p.includes('1. [单选题] 中华人民共和国的首都是哪里？'), `题干行不对：\n${p}`);
    assert(p.includes('   A. 北京  B. 上海'), `选项行不对：\n${p}`);
  });

  it('题号从 1 开始、按传入顺序（这是解析对齐的依据）', () => {
    const p = buildPrompt([q, { ...q, id: '2', stem: '第二题' }], TEMPLATES[1]!);
    const i1 = p.indexOf('1. [单选题]');
    const i2 = p.indexOf('2. [单选题] 第二题');
    assert(i1 >= 0 && i2 > i1, `题号顺序不对：\n${p}`);
  });

  it('没有选项的题不渲染空的选项行', () => {
    const blankish: ExamQuestion = { ...q, kind: 'blank', typeText: '填空题', options: [] };
    const p = buildPrompt([blankish], TEMPLATES[0]!);
    assert(p.includes('1. [填空题]'), '填空题该有题型标记');
    assert(!p.includes('   A.'), '没有选项就不该有选项行');
  });

  it('多空的填空题要告诉模型「几个空」（少一段答案站点就判没填完）', () => {
    const two: ExamQuestion = { ...q, kind: 'blank', typeText: '填空题', options: [], blankCount: 2 };
    const p = buildPrompt([two], TEMPLATES[0]!);
    assert(p.includes('本题共 2 个空'), `多空提示没写进去：\n${p}`);
    assert(p.includes('| 分隔'), `切段口径没写进去：\n${p}`);
  });

  it('单空填空不加多余提示（提示词越短越稳）', () => {
    const one: ExamQuestion = { ...q, kind: 'blank', typeText: '填空题', options: [], blankCount: 1 };
    const p = buildPrompt([one], TEMPLATES[0]!);
    assert(!p.includes('（本题共'), `单空不该有多空提示：\n${p}`);
  });
});

describe('uooc/ai · 填空题切段', () => {
  it('没竖线的就是一段（绝大多数填空题只有一个空）', () => {
    assertDeepEqual(blankSegments('钢少气多'), ['钢少气多']);
    assertDeepEqual(blankSegments('  钢少气多  '), ['钢少气多']);
  });

  it('多个空按空序切开，全角竖线也认', () => {
    assertDeepEqual(blankSegments('甲|乙'), ['甲', '乙']);
    assertDeepEqual(blankSegments('甲｜乙'), ['甲', '乙']);
    assertDeepEqual(blankSegments('甲 | 乙 | 丙'), ['甲', '乙', '丙']);
  });

  it('尾部多写的竖线不算一个空（否则第 2 空会被写成空串）', () => {
    assertDeepEqual(blankSegments('甲|'), ['甲']);
    assertDeepEqual(blankSegments('甲||'), ['甲']);
  });

  it('全空/只有竖线 ⇒ 没有段（调用方当「没答出来」）', () => {
    assertDeepEqual(blankSegments(''), []);
    assertDeepEqual(blankSegments('   '), []);
    assertDeepEqual(blankSegments('|'), []);
  });
});

describe('uooc/ai · 模型接口', () => {
  it('chatUrl 拼 /chat/completions，且不重复拼', () => {
    assertEqual(chatUrl('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions');
    assertEqual(chatUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
    assertEqual(chatUrl('  https://api.example.com/v1  '), 'https://api.example.com/v1/chat/completions');
    assertEqual(
      chatUrl('https://api.example.com/v1/chat/completions'),
      'https://api.example.com/v1/chat/completions',
    );
    assertEqual(chatUrl(''), '');
  });

  it('extractContent 只认 choices[0].message.content 是字符串的情况', () => {
    assertEqual(extractContent({ choices: [{ message: { content: '1. A' } }] }), '1. A');
    assertEqual(extractContent({ choices: [] }), null);
    assertEqual(extractContent({ choices: [{ message: {} }] }), null);
    assertEqual(extractContent({ choices: [{ message: { content: 42 } }] }), null);
    assertEqual(extractContent({}), null);
    assertEqual(extractContent(null), null);
    assertEqual(extractContent('not json'), null);
  });
});

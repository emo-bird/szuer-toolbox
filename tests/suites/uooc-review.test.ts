import { listKeys, read, remove, write } from '../../src/common/core/storage.ts';
import type { ExamQuestion } from '../../src/sites/uooc/ai/paper.ts';
import { loadReviewDraft, saveReviewDraft, type QuizReview } from '../../src/sites/uooc/ai/review.ts';
import { assert, assertDeepEqual, assertEqual, describe, it } from '../harness.ts';

const LEGACY_KEY = 'uooc:ai:quiz-draft';
const DRAFT_PREFIX = `${LEGACY_KEY}:`;
const ORIGIN = 'https://www.uooc.net.cn';
const question: ExamQuestion = {
  id: '1', kind: 'single', typeText: '单选', stem: '首题', options: [{ key: 'A', text: '甲' }],
  score: '1', studentAnswer: [],
};

function paper(tid: string, stem = question.stem, answer = 'A'): QuizReview {
  return {
    tid, doc: {} as Document, current: () => true,
    entries: new Map([[question.id, { question: { ...question, stem }, suggestion: answer }]]),
  };
}

function draftKeys(): string[] {
  return listKeys().filter((key) => key === LEGACY_KEY || key.startsWith(DRAFT_PREFIX));
}

function withDraftStorage(run: () => Promise<void>): () => Promise<void> {
  return async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
    const priorNow = Date.now;
    const previousDrafts = draftKeys().map((key) => [key, read<unknown>(key, null)] as const);
    for (const [key] of previousDrafts) remove(key);
    Object.defineProperty(globalThis, 'location', { value: { origin: ORIGIN }, configurable: true });
    try {
      await run();
    } finally {
      Date.now = priorNow;
      for (const key of draftKeys()) remove(key);
      for (const [key, value] of previousDrafts) write(key, value);
      if (previous === undefined) Reflect.deleteProperty(globalThis, 'location');
      else Object.defineProperty(globalThis, 'location', previous);
    }
  };
}

describe('UOOC 按卷保存草稿', () => {
  it('并发保存不同试卷时互不覆盖，同卷题目变化后不可恢复', withDraftStorage(async () => {
    const first = paper('11');
    const second = paper('22', '另一份卷子', 'B');
    assertDeepEqual(await Promise.all([saveReviewDraft(first), saveReviewDraft(second)]), [1, 1]);
    assertDeepEqual([...await loadReviewDraft(first)], [['1', 'A']]);
    assertDeepEqual([...await loadReviewDraft(second)], [['1', 'B']]);
    assertEqual((await loadReviewDraft(paper('11', '修改题干'))).size, 0);
  }));

  it('旧版草稿在匹配的试卷首次恢复时才迁移', withDraftStorage(async () => {
    const original = paper('11');
    await saveReviewDraft(original);
    const storageKey = draftKeys()[0];
    assert(storageKey !== undefined, '应存在独立试卷草稿键');
    write(LEGACY_KEY, { key: storageKey.slice(DRAFT_PREFIX.length), entries: [['1', 'A'], [2, 3]] });
    remove(storageKey);
    assertEqual((await loadReviewDraft(paper('22'))).size, 0);
    assert(draftKeys().includes(LEGACY_KEY), '其他试卷应保留旧草稿');
    assertDeepEqual([...await loadReviewDraft(original)], [['1', 'A']]);
    assertDeepEqual(draftKeys(), [storageKey]);
    assertDeepEqual([...await loadReviewDraft(original)], [['1', 'A']]);
  }));

  it('保存第 31 份时清理最早一份，超过 90 天的草稿视为过期', withDraftStorage(async () => {
    let now = 1_800_000_000_000;
    Date.now = () => now;
    for (let i = 0; i < 31; i++) {
      now += 1000;
      await saveReviewDraft(paper(String(i)));
    }
    assertEqual(draftKeys().length, 30);
    assertEqual((await loadReviewDraft(paper('0'))).size, 0);
    assertEqual((await loadReviewDraft(paper('1'))).size, 1);
    now += 90 * 24 * 60 * 60 * 1000;
    assertEqual((await loadReviewDraft(paper('30'))).size, 0);
    assertEqual(draftKeys().length, 29, '恢复已过期草稿时应删除该条记录');
    await saveReviewDraft(paper('31'));
    assertEqual(draftKeys().length, 1, '下一次保存应清理其余过期草稿');
  }));

  it('等待指纹期间离开试卷时跳过草稿保存', withDraftStorage(async () => {
    let current = true;
    const pending = saveReviewDraft({ ...paper('11'), current: () => current });
    current = false;
    assertEqual(await pending, 0);
    assertEqual(draftKeys().length, 0);
  }));
});

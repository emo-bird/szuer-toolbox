import { assert, assertEqual, describe, it } from '../harness.ts';
import { resetQueueForTest } from '../../src/common/core/http.ts';
import { clearAnswerCache } from '../../src/sites/uooc/ai/answer-cache.ts';
import { answerOne, answerQuestions, createAnswerExecution } from '../../src/sites/uooc/ai/runner.ts';
import type { ExamQuestion } from '../../src/sites/uooc/ai/paper.ts';

const config = { baseUrl: 'https://model.example/v1', model: 'primary', apiKey: '', timeoutMs: 500 };
const settings = { budget: 0, explain: false, reviewModel: '', cache: false };
const question: ExamQuestion = {
  id: 'first', kind: 'single', typeText: '单选', stem: '选一个',
  options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }],
  score: '1', studentAnswer: [],
};

interface FakeReply {
  status: number;
  text: string;
  headers?: string;
}

function answer(letter: string): FakeReply {
  return {
    status: 200,
    text: JSON.stringify({
      choices: [{ message: { content: `1. ${letter}` } }],
      usage: { total_tokens: 12 },
    }),
  };
}

async function fakeModels(
  responder: (model: string, index: number) => FakeReply,
  run: (models: string[]) => Promise<void>,
): Promise<void> {
  const globals = globalThis as Record<string, unknown>;
  const previous = globals['GM_xmlhttpRequest'];
  const models: string[] = [];
  resetQueueForTest();
  clearAnswerCache();
  globals['GM_xmlhttpRequest'] = (details: {
    data: string;
    onload(response: { status: number; statusText: string; responseText: string; responseHeaders?: string }): void;
  }) => {
    const model = (JSON.parse(details.data) as { model: string }).model;
    const reply = responder(model, models.length);
    models.push(model);
    details.onload({ status: reply.status, statusText: '', responseText: reply.text, responseHeaders: reply.headers });
    return { abort() {} };
  };
  try {
    await run(models);
  } finally {
    resetQueueForTest();
    clearAnswerCache();
    if (previous === undefined) delete globals['GM_xmlhttpRequest'];
    else globals['GM_xmlhttpRequest'] = previous;
  }
}

describe('UOOC 作答执行策略', () => {
  it('多个并发题及后续重答共享请求预算，只统计接口实际返回的 token 用量', async () => {
    await fakeModels(() => answer('A'), async (models) => {
      const execution = createAnswerExecution({ ...settings, budget: 2 });
      const outcomes = await answerQuestions([question, { ...question, id: 'second' }], {
        cfg: config, execution, concurrency: 2,
      });
      const retry = await answerOne(question, config, { execution, exclude: 'A' });
      assertEqual(models.length, 2);
      assertEqual(outcomes.every((outcome) => outcome.review === true), true);
      assertEqual(retry.requests, 0);
      assert(retry.error.includes('预算'), '预算用尽需要提供原因');
      assertEqual(execution.snapshot.totalTokens, 24);
      assertEqual(execution.snapshot.usageResponses, 2);
    });
  });

  it('平票标记为待复核，只有分歧题才额外调用复核模型', async () => {
    await fakeModels((model, index) => answer(model === 'secondary' || index % 2 !== 0 ? 'B' : 'A'), async (models) => {
      const execution = createAnswerExecution({ ...settings, reviewModel: 'secondary' });
      const outcome = await answerOne(question, config, { execution });
      assertEqual(outcome.review, true);
      assertEqual(outcome.requests, 5);
      assertEqual(models.join(','), 'primary,primary,primary,primary,secondary');
      assert(outcome.note?.includes('2/4'), '保留原始分歧证据');
      assert(outcome.note?.includes('「B」'), '展示复核模型的意见');
    });
  });

  it('401 和服务商的 429 余额不足属于终止错误', async () => {
    for (const response of [{ status: 401, text: '{}' }, { status: 429, text: '{"error":{"code":"insufficient_quota"}}' }]) {
      await fakeModels(() => response, async (models) => {
        const outcomes = await answerQuestions([question, { ...question, id: 'second' }], { cfg: config });
        assertEqual(models.length, 1);
        assertEqual(outcomes[0]?.requests, 1);
        assertEqual(outcomes[1]?.requests, 0);
        assertEqual(outcomes[1]?.error, outcomes[0]?.error);
      });
    }
  });

  it('缓存匹配题目内容和模型，手动重新生成绕过读取', async () => {
    await fakeModels(() => answer('A'), async (models) => {
      const execution = createAnswerExecution({ ...settings, cache: true });
      await answerOne(question, config, { execution });
      const hit = await answerOne(question, config, { execution });
      assertEqual(hit.cached, true);
      assertEqual(hit.requests, 0);
      await answerOne({ ...question, stem: '新题干' }, config, { execution });
      await answerOne(question, { ...config, model: 'another' }, { execution });
      await answerOne(question, config, { execution, force: true });
      assertEqual(models.length, 8);
      assertEqual(execution.snapshot.cacheHits, 1);
    });
  });
});

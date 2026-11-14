import { assert, assertEqual, describe, it } from '../harness.ts';
import { resetQueueForTest } from '../../src/common/core/http.ts';
import { clearAnswerCache } from '../../src/sites/uooc/ai/answer-cache.ts';
import { answerOne, answerQuestions, createAnswerExecution } from '../../src/sites/uooc/ai/runner.ts';
import { toExamQuestion, type ExamQuestion } from '../../src/sites/uooc/ai/paper.ts';

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
  it('DeepSeek 作答引用已关联文件，过期或更换为不支持的模型时不发送请求', async () => {
    const globals = globalThis as Record<string, unknown>;
    const previous = globals['GM_xmlhttpRequest'];
    const bodies: string[] = [];
    globals['GM_xmlhttpRequest'] = (req: { data: string; onload(result: object): void }) => {
      bodies.push(req.data);
      req.onload({ status: 200, responseText: answer('A').text });
      return { abort() {} };
    };
    const referenceFile = { id: 'file-api-course', name: '讲义.pdf', expiresAt: Date.now() + 60_000 };
    const deepSeek = { thinking: 'auto' as const, search: false, readUrl: false, safety: false, referenceFile };
    const cfg = { ...config, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', deepSeek };
    try {
      const execution = createAnswerExecution(settings);
      assertEqual((await answerOne(question, cfg, { execution })).answer, 'A');
      assertEqual(bodies.length, 2);
      for (const body of bodies) {
        const parts = JSON.parse(body).messages[0].content;
        assertEqual(parts[0].file_id, referenceFile.id);
        assert(parts[1].text.includes(question.stem), '文件引用必须保留题干');
      }
      const expired = await answerOne(question, { ...cfg,
        deepSeek: { ...deepSeek, referenceFile: { ...referenceFile, expiresAt: Date.now() - 1 } },
      }, { execution });
      assert(expired.error.includes('已过期'), '文件已过期需要提示');
      const pro = await answerOne(question, { ...cfg, model: 'deepseek-v4-pro' }, { execution });
      assert(pro.error.includes('参考文件需要 DeepSeek Flash'), 'Pro 不能发送参考文件');
      assertEqual(execution.snapshot.requests, 2);
      assertEqual(bodies.length, 2);
    } finally {
      resetQueueForTest();
      globals['GM_xmlhttpRequest'] = previous;
    }
  });
  it('DeepSeek 参考资料超限不消耗请求预算，截断的题仍统计用量', async () => {
    const cfg = { ...config, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash',
      deepSeek: { thinking: 'max' as const, search: true, readUrl: false, safety: false, inputLimit: 5, context: '讲义' } };
    await fakeModels(() => ({
      status: 200,
      text: JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: '1. A' } }],
        usage: { total_tokens: 12, server_tool_use: { tool_search: 2, tool_fetch: 1 } },
      }),
    }), async (models) => {
      const execution = createAnswerExecution({ ...settings, budget: 1 });
      const tooLong = await answerOne(question, cfg, { execution });
      assert(tooLong.error.includes('文本输入上限'), '监视须显示可处理的超限原因');
      assertEqual(execution.snapshot.requests, 0);
      const truncated = await answerOne(question, { ...cfg, deepSeek: { ...cfg.deepSeek, inputLimit: 3000 } }, { execution });
      assert(truncated.error.includes('回复被截断'), '监视须显示截断原因');
      assertEqual(truncated.answer, '');
      assertEqual(models.length, 1);
      assertEqual(execution.snapshot.totalTokens, 12);
      assertEqual(execution.snapshot.searches, 2);
      assertEqual(execution.snapshot.fetches, 1);
    });
  });

  it('启用图片输入时读取优课公开图片，采样时重复使用同一份图像', async () => {
    const url = 'https://assets.uooconline.com/upload/2019/08/01/example.png';
    const parsed = toExamQuestion({
      id: '1', type_text: '单选题', question: '<img src="' + url.replace('https:', 'http:') + '">看图作答',
      options: { A: '甲', B: '乙' },
    })!;
    const globals = globalThis as Record<string, unknown>;
    const previous = globals['GM_xmlhttpRequest'];
    const bytes = new Uint8Array(332004);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    let downloads = 0;
    let modelRequests = 0;
    globals['GM_xmlhttpRequest'] = (req: {
      url: string; anonymous: boolean; redirect?: string; responseType?: string; data?: string;
      onload(result: object): void;
    }) => {
      if (req.url === url) {
        downloads++;
        assertEqual(req.anonymous, true);
        assertEqual(req.redirect, 'error');
        assertEqual(req.responseType, 'arraybuffer');
        req.onload({ status: 200, finalUrl: url, responseHeaders: 'Content-Type: image/png', response: bytes.buffer });
      } else {
        modelRequests++;
        const request = JSON.parse(req.data ?? '');
        const image = request.messages[0].content.find((part: { type: string }) => part.type === 'image_url');
        assert(image.image_url.url.startsWith('data:image/png;base64,'), '模型应收到图片数据');
        assertEqual(atob(image.image_url.url.split(',')[1]).length, bytes.length);
        assert(!req.data?.includes(url), '模型请求不含资源地址');
        req.onload({ status: 200, statusText: '', responseText: answer('A').text });
      }
      return { abort() {} };
    };
    try {
      const disabled = await answerOne(parsed, config);
      assertEqual(disabled.unsupported, true);
      assertEqual(downloads, 0);
      assertEqual(modelRequests, 0);
      const enabled = await answerOne(parsed, { ...config, vision: true });
      assertEqual(enabled.answer, 'A');
      assertEqual(downloads, 1);
      assertEqual(modelRequests, 2);
    } finally {
      resetQueueForTest();
      if (previous === undefined) delete globals['GM_xmlhttpRequest'];
      else globals['GM_xmlhttpRequest'] = previous;
    }
  });
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

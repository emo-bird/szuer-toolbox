import { assert, assertEqual, describe, it } from '../harness.ts';
import { read, remove, write } from '../../src/common/core/storage.ts';
import { chatDetailed, chatUrl, LlmError, testConnection } from '../../src/sites/uooc/ai/llm.ts';
import { aiConfig, aiProfileSecret, aiProfiles, exportAiProfiles, removeAiProfile, saveAiProfile, selectAiProfile } from '../../src/sites/uooc/settings.ts';

describe('UOOC 模型方案', () => {
  it('保留查询参数，拒绝含认证信息的接口地址', () => {
    assertEqual(chatUrl('https://example.invalid/v1?region=test'), 'https://example.invalid/v1/chat/completions?region=test');
    assertEqual(chatUrl('https://example.invalid/v1/chat/completions/?region=test'), 'https://example.invalid/v1/chat/completions?region=test');
    assertEqual(chatUrl('https://example.invalid/v1?api_key=sensitive'), '');
    assertEqual(chatUrl('https://user:secret@example.invalid/v1'), '');
    assertEqual(chatUrl('file:///tmp/response'), '');
  });

  it('旧方案可继续使用，密钥与方案分开且仅用于原接口来源', () => {
    const storageKeys = ['uooc:ai-profiles', 'uooc:ai-active-profile', 'value:uooc:ai-base-url', 'value:uooc:ai-model'];
    const snapshot = storageKeys.map((key) => read<unknown>(key, undefined));
    const profile = {
      id: 'test-provider', name: '测试', baseUrl: 'https://test.example.invalid/v1?region=private', model: 'mock',
      timeoutMs: 5000, concurrency: 2, responseFormat: 'json' as const, vision: false,
    };
    try {
      for (const key of storageKeys) remove(key);
      write('value:uooc:ai-base-url', 'https://legacy.example.invalid/v1');
      write('value:uooc:ai-model', 'legacy-model');
      assertEqual(aiConfig()?.model, 'legacy-model');

      saveAiProfile(profile, 'test-secret');
      assertEqual(aiConfig()?.apiKey, 'test-secret');
      assertEqual(aiConfig()?.profileId, profile.id);
      assert(!JSON.stringify(aiProfiles()).includes('test-secret'), '公开方案不能携带密钥');
      const exported = exportAiProfiles();
      assert(exported.includes('https://test.example.invalid/v1'), '导出应包含接口地址');
      assert(!exported.includes('test-secret') && !exported.includes('region=private'), '导出应移除密钥与地址查询参数');
      assertEqual(aiProfileSecret(profile.id, 'https://other.example.invalid/v1'), '');
      selectAiProfile('default');
      assertEqual(aiConfig()?.model, 'legacy-model');
      saveAiProfile({ ...profile, baseUrl: 'https://other.example.invalid/v1' });
      assertEqual(aiConfig()?.apiKey, '');
      assertEqual(aiProfileSecret(profile.id, profile.baseUrl), '');
    } finally {
      removeAiProfile(profile.id);
      storageKeys.forEach((key, index) => {
        if (snapshot[index] === undefined) remove(key);
        else write(key, snapshot[index]);
      });
    }
  });
});

describe('UOOC 模型连接诊断', () => {
  const cfg = { baseUrl: 'https://test.example.invalid/v1', model: 'mock', apiKey: 'test-secret', timeoutMs: 1000 };
  const globals = globalThis as Record<string, unknown>;

  it('样题解析成功与不兼容回复给出不同状态', async () => {
    const previous = globals['GM_xmlhttpRequest'];
    let content = '1. A';
    try {
      globals['GM_xmlhttpRequest'] = ({ onload }: {
        onload(response: { status: number; responseText: string }): void;
      }) => onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content } }] }) });
      assertEqual((await testConnection(cfg)).ok, true);
      content = '你好，已收到';
      const failure = await testConnection(cfg);
      assertEqual(failure.ok, false);
      assert(failure.detail.includes('样题回复格式'), '接口可达时应单独报告答案格式问题');
    } finally {
      globals['GM_xmlhttpRequest'] = previous;
    }
  });

  it('报告限流及 Retry-After，隐藏服务端回显的敏感信息', async () => {
    const previous = globals['GM_xmlhttpRequest'];
    try {
      globals['GM_xmlhttpRequest'] = ({ onload }: {
        onload(response: { status: number; responseText: string; responseHeaders: string }): void;
      }) => onload({ status: 429, responseText: 'test-secret', responseHeaders: 'Retry-After: 3\r\n' });
      const [result] = await Promise.allSettled([chatDetailed(cfg, '样题')]);
      assert(result?.status === 'rejected' && result.reason instanceof LlmError, '应返回分类后的模型错误');
      assertEqual(result.reason.status, 429);
      assertEqual(result.reason.retryAfterMs, 3000);
      assert(!result.reason.message.includes('test-secret'), '错误正文不应进入 UI 或日志');
    } finally {
      globals['GM_xmlhttpRequest'] = previous;
    }
  });

  it('图片仅在显式开启时以受限数据 URL 发送，同时提供用量', async () => {
    const previous = globals['GM_xmlhttpRequest'];
    const inputs: unknown[] = [];
    try {
      globals['GM_xmlhttpRequest'] = ({ data, onload }: {
        data: string;
        onload(response: { status: number; responseText: string }): void;
      }) => {
        inputs.push(JSON.parse(data).messages[0].content);
        onload({ status: 200, responseText: JSON.stringify({
          choices: [{ message: { content: '1. A' } }], usage: { total_tokens: 12 },
        }) });
      };
      const options = { images: ['data:image/png;base64,AAAA', 'https://example.invalid/private.png'] };
      await chatDetailed(cfg, '样题', undefined, options);
      const result = await chatDetailed({ ...cfg, vision: true }, '样题', undefined, options);
      assertEqual(inputs[0], '样题');
      assert(Array.isArray(inputs[1]) && inputs[1].length === 2, '应仅发送文本和一张内嵌图');
      assertEqual(result.usage?.totalTokens, 12);
    } finally {
      globals['GM_xmlhttpRequest'] = previous;
    }
  });
});

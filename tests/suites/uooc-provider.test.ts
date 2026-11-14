import { assert, assertEqual, describe, it } from '../harness.ts';
import { read, remove, write } from '../../src/common/core/storage.ts';
import { chatDetailed, chatUrl, LlmError, prepareLlmPrompt, testConnection } from '../../src/sites/uooc/ai/llm.ts';
import { deleteDeepSeekFile, runDeepSeekTool } from '../../src/sites/uooc/ai/deepseek-tools.ts';
import { aiConfig, aiProfileSecret, aiProfiles, exportAiProfiles, referenceCourseId, removeAiProfile, saveAiProfile, selectAiProfile, setCourseReferenceFile } from '../../src/sites/uooc/settings.ts';

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

describe('DeepSeek 官方 API', () => {
  it('删除只发送到官方文件接口，并要求响应确认同一文件已删除', async () => {
    const globals = globalThis as Record<string, unknown>;
    const previous = globals['GM_xmlhttpRequest'];
    let reportedId = 'file-api-other';
    let calls = 0;
    try {
      globals['GM_xmlhttpRequest'] = (req: {
        url: string; method: string; headers: Record<string, string>; redirect: string;
        onload(response: { status: number; responseText: string }): void;
      }) => {
        calls++;
        assertEqual(req.url, 'https://api.deepseek.com/files/file-api-demo');
        assertEqual(req.method, 'DELETE');
        assertEqual(req.redirect, 'error');
        assertEqual(req.headers['Authorization'], 'Bearer mock-key');
        req.onload({ status: 200, responseText: JSON.stringify({ id: reportedId, deleted: true }) });
      };
      const [invalid] = await Promise.allSettled([deleteDeepSeekFile('../demo', 'mock-key')]);
      assertEqual(invalid?.status, 'rejected');
      assertEqual(calls, 0);
      const [mismatch] = await Promise.allSettled([deleteDeepSeekFile('file-api-demo', 'mock-key')]);
      assertEqual(mismatch?.status, 'rejected');
      reportedId = 'file-api-demo';
      await deleteDeepSeekFile('file-api-demo', 'mock-key');
      assertEqual(calls, 2);
    } finally {
      globals['GM_xmlhttpRequest'] = previous;
    }
  });
  it('只有当前学习页的课程会加载各自的参考文件，旧方案的全局文件不会跨课使用', () => {
    const keys = ['uooc:ai-profiles', 'uooc:ai-active-profile', 'uooc:reference-file:1', 'uooc:reference-file:2'];
    const snapshot = keys.map((key) => read<unknown>(key, undefined));
    const profile = {
      id: 'course-file-test', name: '课程测试', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash',
      timeoutMs: 5000, concurrency: 1, responseFormat: 'text' as const, vision: false,
      deepSeek: { thinking: 'auto' as const, search: false, readUrl: false, safety: false,
        referenceFile: { id: 'file-api-legacy', name: '旧文件.pdf', expiresAt: Date.now() + 3600000 } },
    };
    try {
      saveAiProfile(profile);
      const first = referenceCourseId({ pathname: '/home/learn/index', hash: '#/1/11/12/13/section' });
      const second = referenceCourseId({ pathname: '/home/learn/new/2', hash: '#/1/11/12/13/section' });
      assertEqual(first, '1');
      assertEqual(second, '2');
      assertEqual(referenceCourseId({ pathname: '/user/login', hash: '#/1/11' }), null);
      assertEqual(aiConfig(first)?.deepSeek?.referenceFile, undefined);
      setCourseReferenceFile('1', { id: 'file-api-first', name: '第一门课.pdf' });
      setCourseReferenceFile('2', { id: 'file-api-second', name: '第二门课.pdf' });
      assertEqual(aiConfig(first)?.deepSeek?.referenceFile?.id, 'file-api-first');
      assertEqual(aiConfig(first)?.deepSeek?.referenceFile?.expiresAt, undefined);
      assertEqual(aiConfig(second)?.deepSeek?.referenceFile?.id, 'file-api-second');
      assertEqual(aiConfig(null)?.deepSeek?.referenceFile, undefined);
      assert(!exportAiProfiles().includes('file-api-'), '导出不包含文件 ID');
      setCourseReferenceFile('1');
      assertEqual(aiConfig(first)?.deepSeek?.referenceFile, undefined);
      assertEqual(aiConfig(second)?.deepSeek?.referenceFile?.id, 'file-api-second');
    } finally {
      removeAiProfile(profile.id);
      keys.forEach((key, index) => snapshot[index] === undefined ? remove(key) : write(key, snapshot[index]));
    }
  });
  const config = {
    baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'mock-key', timeoutMs: 1000,
    responseFormat: 'json' as const,
  };
  const tuning = { thinking: 'max' as const, search: true, readUrl: true, safety: true,
    maxTokens: 393216, inputLimit: 1000, context: '讲义摘录' };
  const globals = globalThis as Record<string, unknown>;

  it('联网作答发送思考、上下文与审核配置，返回引用和独立工具用量', async () => {
    const previous = globals['GM_xmlhttpRequest'];
    const sent: Record<string, unknown>[] = [];
    try {
      globals['GM_xmlhttpRequest'] = ({ data, onload }: {
        data: string;
        onload(response: { status: number; responseText: string }): void;
      }) => {
        sent.push(JSON.parse(data));
        onload({ status: 200, responseText: JSON.stringify({
          choices: [{ finish_reason: 'stop', message: {
            content: '1. A', annotations: [
              { type: 'url_citation', url_citation: { url: 'https://example.com/course', title: '讲义' } },
              { type: 'url_citation', url_citation: { url: 'javascript:alert(1)', title: '不安全链接' } },
            ],
          } }],
          usage: { total_tokens: 37, server_tool_use: { tool_search: 3, tool_fetch: 2, tool_image_search: 1 } },
        }) });
      };
      const cfg = { ...config, deepSeek: tuning };
      const prompt = prepareLlmPrompt(cfg, '第 1 题\nA. 4\nB. 5');
      const result = await chatDetailed(cfg, prompt, undefined, { responseFormat: 'json' });
      const body = sent[0]!;
      assertEqual(body['model'], 'deepseek-flash');
      assertEqual(body['reasoning_effort'], 'max');
      assertEqual(JSON.stringify(body['thinking']), '{"type":"enabled"}');
      assertEqual(body['max_tokens'], 393216);
      assertEqual(JSON.stringify(body['tools']), '[{"type":"deepseek_web_search"},{"type":"deepseek_read_url"}]');
      assertEqual(JSON.stringify(body['safety_check']), '{"level":"high"}');
      assertEqual(body['response_format'], undefined);
      assert(prompt.includes('讲义摘录') && prompt.endsWith('第 1 题\nA. 4\nB. 5'), '需完整保留题干和选项');
      assertEqual(result.citations?.length, 1);
      assertEqual(result.citations?.[0]?.title, '讲义');
      assertEqual(result.usage?.totalTokens, 37);
      assertEqual(result.usage?.searches, 4);
      assertEqual(result.usage?.fetches, 2);
      assertEqual((await testConnection(cfg)).ok, true);
      assert(!JSON.stringify(sent[1]).includes('讲义摘录'), '连接测试不发送参考资料');

      await chatDetailed({ ...cfg, model: 'deepseek-chat', deepSeek: undefined }, '样题', undefined, { responseFormat: 'json' });
      assertEqual(sent[2]?.['model'], 'deepseek-flash');
      assertEqual(JSON.stringify(sent[2]?.['thinking']), '{"type":"disabled"}');
      assertEqual(JSON.stringify(sent[2]?.['response_format']), '{"type":"json_object"}');
      await chatDetailed({ ...cfg, baseUrl: 'https://api.deepseek.com.example.invalid/v1', model: 'deepseek-chat' }, '样题');
      assertEqual(sent[3]?.['model'], 'deepseek-chat');
      assertEqual(sent[3]?.['tools'], undefined);
      assertEqual(sent[3]?.['thinking'], undefined);
    } finally {
      globals['GM_xmlhttpRequest'] = previous;
    }
  });

  it('限制输入长度，支持文件内容块，区别不支持图片、内容审核和回复截断', async () => {
    const previous = globals['GM_xmlhttpRequest'];
    let sent = '';
    let status = 200;
    let response = { choices: [{ finish_reason: 'stop', message: { content: '1. A' } }] } as Record<string, unknown>;
    try {
      globals['GM_xmlhttpRequest'] = ({ data, onload }: {
        data: string;
        onload(result: { status: number; responseText: string }): void;
      }) => { sent = data; onload({ status, responseText: JSON.stringify(response) }); };
      const [input, image, file] = await Promise.allSettled([
        Promise.resolve().then(() => prepareLlmPrompt({ ...config, deepSeek: { ...tuning, inputLimit: 5 } }, '样题')),
        chatDetailed({ ...config, model: 'deepseek-v4-pro', vision: true }, '样题', undefined,
          { images: ['data:image/png;base64,AAAA'] }),
        chatDetailed(config, '样题', undefined, { fileId: 'invalid' }),
      ]);
      assert(input?.status === 'rejected' && input.reason.category === 'incomplete', '超限须报告');
      assert(image?.status === 'rejected' && image.reason.category === 'refusal', 'Pro 图片须拒绝');
      assert(file?.status === 'rejected' && file.reason.category === 'config', '文件 ID 须校验');
      assertEqual(sent, '');
      await chatDetailed(config, '讲义里的结论？', undefined, { fileId: 'file-api-demo' });
      assert(sent.includes('"type":"file","file_id":"file-api-demo"'), '发送官方文件引用块');
      for (const finish of ['content_filter', 'length']) {
        response = { choices: [{ finish_reason: finish, message: { content: '1. A' } }] };
        const [result] = await Promise.allSettled([chatDetailed(config, '样题')]);
        assert(result?.status === 'rejected' && result.reason instanceof LlmError, '部分答复不能回填');
        assertEqual(result.reason.category, finish === 'length' ? 'incomplete' : 'refusal');
      }
      status = 400;
      response = { error: { message: 'Content Exists Risk' } };
      const [blocked] = await Promise.allSettled([chatDetailed(config, '样题')]);
      assert(blocked?.status === 'rejected' && blocked.reason.category === 'refusal', '输入拒绝应与配置错误区分');
    } finally {
      globals['GM_xmlhttpRequest'] = previous;
    }
  });

  it('导出官方方案保留思考设置和输入输出上限，省略参考资料', () => {
    const storageKeys = ['uooc:ai-profiles', 'uooc:ai-active-profile'];
    const snapshot = storageKeys.map((key) => read<unknown>(key, undefined));
    const id = 'test-deepseek';
    try {
      saveAiProfile({ ...config, id, name: 'DeepSeek', concurrency: 1, vision: true, deepSeek: tuning }, 'mock-key');
      assertEqual(aiConfig()?.deepSeek?.context, '讲义摘录');
      const exported = exportAiProfiles();
      assert(exported.includes('"thinking": "max"') && exported.includes('"maxTokens": 393216'), '导出保留公开设置');
      assert(!exported.includes('讲义摘录') && !exported.includes('mock-key'), '导出省略私密内容');
    } finally {
      removeAiProfile(id);
      storageKeys.forEach((key, index) => {
        if (snapshot[index] === undefined) remove(key);
        else write(key, snapshot[index]);
      });
    }
  });

  it('独立工具请求按官方 JSON、multipart 与 WAV 格式收发', async () => {
    const previous = globals['GM_xmlhttpRequest'];
    const responses = new Map<string, unknown>([
      ['/v1/tools/search', { results: [{ title: '来源', url: 'https://example.com', snippet: '摘要' }] }],
      ['/v1/tools/fetch', { title: '正文', content: '课件内容' }],
      ['/files', { id: 'file-api-demo' }],
      ['/v1/tools/ocr', { pages: [{ text: '第一页', finish_reason: 'length' }] }],
      ['/v1/tools/asr', { text: '转写内容' }],
    ]);
    try {
      globals['GM_xmlhttpRequest'] = (req: {
        url: string; data: FormData | string; headers: Record<string, string>; responseType: string;
        onload(result: { status: number; response?: ArrayBuffer; responseText?: string }): void;
      }) => {
        const { pathname } = new URL(req.url);
        assertEqual(req.headers['Authorization'], 'Bearer mock-key');
        if (pathname === '/files' || pathname === '/v1/tools/ocr' || pathname === '/v1/tools/asr') {
          assert(req.data instanceof FormData, '需要 multipart 表单');
          assertEqual(req.headers['Content-Type'], undefined);
          const fields = [...req.data.keys()];
          assertEqual(fields[0], pathname.endsWith('/asr') ? 'file' : 'purpose');
          if (pathname === '/files') {
            assertEqual(req.data.get('expires_after[anchor]'), null);
            assertEqual(req.data.get('expires_after[seconds]'), null);
          }
        } else {
          assertEqual(req.headers['Content-Type'], 'application/json');
        }
        if (pathname.endsWith('/tts')) {
          assertEqual(req.responseType, 'arraybuffer');
          const wav = new Uint8Array(46);
          wav.set(new TextEncoder().encode('RIFF0000WAVE'));
          req.onload({ status: 200, response: wav.buffer });
          return;
        }
        req.onload({ status: 200, responseText: JSON.stringify(responses.get(pathname)) });
      };
      const file = new File(['fixture'], 'sample.pdf');
      assert((await runDeepSeekTool('search', { text: '讲义' }, config.apiKey)).text.includes('摘要'), '读取搜索摘要');
      assert((await runDeepSeekTool('fetch', { text: 'https://example.com' }, config.apiKey)).text.includes('课件内容'), '读取抓取内容');
      assertEqual((await runDeepSeekTool('upload', { file }, config.apiKey)).uploadedFile?.id, 'file-api-demo');
      assert((await runDeepSeekTool('ocr', { file }, config.apiKey)).text.includes('已截断'), '标识 OCR 截断页');
      assertEqual((await runDeepSeekTool('asr', { file: new File(['fixture'], 'sample.wav') }, config.apiKey)).text, '转写内容');
      assertEqual((await runDeepSeekTool('tts', { text: '朗读' }, config.apiKey)).audio?.type, 'audio/wav');
    } finally {
      globals['GM_xmlhttpRequest'] = previous;
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

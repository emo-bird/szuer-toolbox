/** 模型请求统一经匿名 GM 通道发送。 */
import { PRIORITY, request } from '../../../common/core/http.ts';
import { parseQuestionAnswer } from './parse.ts';

export type LlmResponseFormat = 'text' | 'json';

export interface LlmConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly responseFormat?: LlmResponseFormat;
  readonly profileId?: string;
  readonly vision?: boolean;
}

export type EndpointValidation = { url: string; issue?: never } | { url?: never; issue: string };

/** 用 URL 的路径补接口后缀，保留服务商使用的查询参数。 */
export function validateLlmEndpoint(baseUrl: string): EndpointValidation {
  const value = baseUrl.trim();
  if (value === '') return { issue: '请填写接口地址' };
  if (!/^https?:\/\//i.test(value)) return { issue: '接口地址须以 https:// 或 http:// 开头' };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { issue: '接口地址格式有误，请检查域名、端口和路径' };
  }
  if (url.username !== '' || url.password !== '') return { issue: '请将认证信息填入 API Key 字段' };
  if (url.hash !== '') return { issue: '请去掉接口地址中 # 开头的片段' };
  for (const key of url.searchParams.keys()) {
    if (/^(?:api[_-]?key|access[_-]?token|token|key|password|secret|authorization|signature)$/i.test(key)) {
      return { issue: '请将密钥从接口地址移到 API Key 字段' };
    }
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (/(\/chat\/completions){2,}$/.test(path)) return { issue: '接口路径重复包含 /chat/completions' };
  if (/\/responses$/.test(path)) return { issue: '请填写 Chat Completions 兼容地址' };
  url.pathname = path.endsWith('/chat/completions') ? path : `${path}/chat/completions`;
  return { url: url.href };
}

export function chatUrl(baseUrl: string): string {
  return validateLlmEndpoint(baseUrl).url ?? '';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

export function extractContent(json: unknown): string | null {
  const choices = record(json)?.['choices'];
  if (!Array.isArray(choices)) return null;
  const content = record(record(choices[0])?.['message'])?.['content'];
  return typeof content === 'string' ? content : null;
}

type ErrorCategory = 'config' | 'network' | 'timeout' | 'auth' | 'quota' | 'not-found'
  | 'rate-limit' | 'request' | 'server' | 'format';

export class LlmError extends Error {
  readonly category: ErrorCategory;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(category: ErrorCategory, message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = 'LlmError';
    this.category = category;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryDelay(value?: string): number | undefined {
  if (!value) return undefined;
  const delay = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
}

function statusError(status: number, response: string, retryAfter?: string): LlmError {
  // 服务可能把请求内容或密钥回显在错误正文中，只读取约定错误码。
  let code: unknown;
  try {
    const error = record(record(JSON.parse(response))?.['error']);
    code = error?.['code'] ?? error?.['type'];
  } catch { /* 非 JSON 网关错误按 HTTP 状态判断 */ }

  if (status === 401) return new LlmError('auth', '认证失败（HTTP 401），请检查 API Key 是否有效且与当前接口匹配', status);
  if (status === 403) return new LlmError('auth', '接口拒绝访问（HTTP 403），请检查 API Key 和模型的访问权限', status);
  if (status === 402 || code === 'insufficient_quota' || code === 'billing_hard_limit_reached') {
    return new LlmError('quota', `接口额度不足（HTTP ${status}），请检查服务商余额或调用配额`, status);
  }
  if (code === 'model_not_found') {
    return new LlmError('not-found', `服务未找到模型（HTTP ${status}），请检查模型 ID 是否正确且已开通`, status);
  }
  if (status === 404) {
    return new LlmError('not-found', `未找到接口或模型（HTTP ${status}），请检查请求地址和模型 ID`, status);
  }
  if (status === 429) return new LlmError('rate-limit', '请求过于频繁（HTTP 429），请稍后再试或降低并发数', status, retryDelay(retryAfter));
  if (status >= 500) return new LlmError('server', `模型服务暂时不可用（HTTP ${status}），请稍后重试`, status, retryDelay(retryAfter));
  return new LlmError('request', `接口拒绝请求（HTTP ${status}），请检查地址、模型及输出格式设置`, status);
}

export interface LlmUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

function extractUsage(json: unknown): LlmUsage | undefined {
  const usage = record(record(json)?.['usage']);
  if (!usage) return undefined;
  const count = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const promptTokens = count(usage['prompt_tokens']);
  const completionTokens = count(usage['completion_tokens']);
  const totalTokens = count(usage['total_tokens']);
  return { promptTokens, completionTokens, totalTokens };
}

export async function chatDetailed(
  cfg: LlmConfig,
  prompt: string,
  signal?: AbortSignal,
  options?: { responseFormat?: 'json'; images?: readonly string[] },
): Promise<{ content: string; usage?: LlmUsage }> {
  const endpoint = validateLlmEndpoint(cfg.baseUrl);
  if (endpoint.issue !== undefined) throw new LlmError('config', endpoint.issue);
  if (cfg.model.trim() === '') throw new LlmError('config', '请填写模型 ID');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey.trim() !== '') headers['Authorization'] = `Bearer ${cfg.apiKey.trim()}`;
  const images = cfg.vision === true
    ? (options?.images ?? []).filter((url) => url.length <= 262144 && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(url)).slice(0, 4)
    : [];
  const input = images.length === 0 ? prompt : [
    { type: 'text', text: prompt },
    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
  let res;
  try {
    res = await request({
      url: endpoint.url,
      method: 'POST',
      channel: 'gm',
      headers,
      data: {
        model: cfg.model.trim(),
        messages: [{ role: 'user', content: input }],
        ...(options?.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      },
      responseType: 'text',
      timeoutMs: cfg.timeoutMs,
      signal,
      priority: PRIORITY.HIGH,
    });
  } catch (err) {
    if (signal?.aborted) throw signal.reason;
    if (err instanceof Error && err.name === 'TimeoutError') throw new LlmError('timeout', '模型请求超时，请检查网络或延长单次超时');
    if (err instanceof Error && err.message.startsWith('GM_xmlhttpRequest 不可用')) {
      throw new LlmError('config', '脚本管理器未提供跨域请求权限，请检查脚本安装和授权');
    }
    throw new LlmError('network', '无法连接模型接口，请检查网络、接口地址及脚本管理器的连接权限');
  }
  if (res.status === 0) throw new LlmError('network', '接口连接未完成，请检查网络及脚本管理器的连接权限');
  if (res.status < 200 || res.status >= 300) throw statusError(res.status, res.text, res.retryAfter);

  let json: unknown;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new LlmError('format', '接口有响应，但返回了非 JSON 内容，请检查是否误填了网页地址', res.status);
  }
  const content = extractContent(json);
  if (content === null || content.trim() === '') {
    throw new LlmError('format', '接口有响应，但缺少有效的模型回复，请确认服务支持 Chat Completions', res.status);
  }
  return { content, usage: extractUsage(json) };
}

export async function chat(cfg: LlmConfig, prompt: string, signal?: AbortSignal): Promise<string> {
  return (await chatDetailed(cfg, prompt, signal)).content;
}

/** 连接测试只发送自带样题，并复用作答流程的解析器。 */
export async function testConnection(
  cfg: LlmConfig,
  signal?: AbortSignal,
): Promise<{ ok: boolean; detail: string }> {
  const json = cfg.responseFormat === 'json';
  const sample = '单选测试题：2 + 2 等于多少？A. 4，B. 5。';
  const prompt = json ? sample + '只回复 JSON 对象，格式 {"question":1,"answer":["A"]}' : sample + '只回复一行，格式：1. A';
  try {
    const { content } = await chatDetailed(cfg, prompt, signal, json ? { responseFormat: 'json' } : undefined);
    const answer = parseQuestionAnswer(content, {
      id: 'probe', kind: 'single', typeText: '单选题', stem: '2 + 2',
      options: [{ key: 'A', text: '4' }, { key: 'B', text: '5' }], score: '1', studentAnswer: [],
    });
    if (answer === null || (json && !content.trim().startsWith('{'))) {
      return { ok: false, detail: '接口可用，样题回复格式不符合要求。请检查输出格式或更换模型后重试' };
    }
    if (answer !== 'A') return { ok: false, detail: '接口可用，样题可以解析，但模型答错了。请检查所选模型' };
    return { ok: true, detail: '连接成功，接口、模型和样题回复格式均通过测试' };
  } catch (err) {
    if (signal?.aborted) return { ok: false, detail: '测试已取消' };
    return { ok: false, detail: err instanceof LlmError ? err.message : '连接测试失败，请检查配置后重试' };
  }
}

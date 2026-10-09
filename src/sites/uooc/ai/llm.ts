/**
 * 大模型调用（OpenAI Chat Completions 兼容格式）。
 *
 * ## 为什么走 `channel: 'gm'`
 *
 * 接口域名是**用户自己填的**（官方、中转、自建都行），不可能预先写进 `@match`。
 * 页面 `fetch` 打跨域会被浏览器 CORS 拦掉，所以这里必须走 `GM_xmlhttpRequest`（用户 m03875 选 A）。
 *
 * 代价是它**不带页面 cookie** —— 这是我们要的：不该把优课的登录态发给第三方模型。
 *
 * ## 为什么不传 temperature
 *
 * 需求细则 §B.1 定稿：多样性由「5 套不同提示词 + 抽过不放回」提供，
 * 不靠采样温度。**别加回来**，加了就等于把两处随机叠在一起，
 * 投票结果会变得没法复现、出了问题也说不清是提示词还是温度。
 */

import { PRIORITY, request } from '../../../common/core/http.ts';

export interface LlmConfig {
  /** 接口根地址，如 `https://api.openai.com/v1` */
  readonly baseUrl: string;
  /** API Key；留空时不发 Authorization 头（本地 ollama / vllm 常不需要） */
  readonly apiKey: string;
  /** 模型名，如 `gpt-4o-mini` */
  readonly model: string;
  readonly timeoutMs: number;
}

/**
 * 拼出 `/chat/completions` 的完整地址。
 *
 * 容错两件真实会犯的错：末尾多余的 `/`；以及用户直接把完整地址填了进来。
 * 拼错时**不报错、只是 404** —— 那种失败最难查，所以在设置面板那边也要提示。
 */
export function chatUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base === '') return '';
  if (/\/chat\/completions$/.test(base)) return base;
  return `${base}/chat/completions`;
}

/** 从 Chat Completions 响应里取出正文；取不到返回 null（由调用方决定怎么报错） */
export function extractContent(json: unknown): string | null {
  if (json === null || typeof json !== 'object') return null;
  const choices = (json as Record<string, unknown>)['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown> | null;
  const message = (first?.['message'] ?? null) as Record<string, unknown> | null;
  const content = message?.['content'];
  if (typeof content === 'string') return content;
  return null;
}

/**
 * 问一次模型。返回正文（未解析的原始回答文本）。
 *
 * 出错一律抛 —— 调用方 `runner.ts` 会把它记进日志并让这道题走「没答出来」，
 * **不会**把异常吞掉当成空答案（空答案会静默交白卷）。
 */
export async function chat(cfg: LlmConfig, prompt: string): Promise<string> {
  const url = chatUrl(cfg.baseUrl);
  if (url === '') throw new Error('未配置大模型接口地址');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.apiKey.trim() !== '') headers['Authorization'] = `Bearer ${cfg.apiKey.trim()}`;

  const res = await request({
    url,
    method: 'POST',
    channel: 'gm',
    headers,
    data: {
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
    },
    responseType: 'text',
    timeoutMs: cfg.timeoutMs,
    priority: PRIORITY.HIGH,
  });

  if (res.status < 200 || res.status >= 300) {
    // 把响应体截断后带上：服务端把原因写在 body 里的情况太多了（模型名不对、余额不足、Key 无效）
    throw new Error(`模型接口返回 ${res.status}：${res.text.slice(0, 200)}`);
  }

  let json: unknown = null;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new Error(`模型接口返回的不是 JSON（前 200 字）：${res.text.slice(0, 200)}`);
  }
  const content = extractContent(json);
  if (content === null) throw new Error(`模型响应里没有 choices[0].message.content`);
  return content;
}

/**
 * 「测试连接」按钮用：发一句最短的话，只关心通不通。
 * 返回 `{ ok, detail }`，**不抛异常** —— 这是给用户看的诊断，不是业务路径。
 */
export async function testConnection(
  cfg: LlmConfig,
): Promise<{ ok: boolean; detail: string; content: string }> {
  try {
    const content = await chat(cfg, '只回复两个字：收到');
    return { ok: true, detail: `连接正常，模型回复：${content.trim().slice(0, 40)}`, content };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err), content: '' };
  }
}



import { request } from '../../../common/core/http.ts';
import { DEEPSEEK_ORIGIN, isDeepSeekFileId, type DeepSeekReferenceFile } from './deepseek.ts';

export type DeepSeekTool = 'search' | 'fetch' | 'ocr' | 'asr' | 'tts' | 'upload';
export type DeepSeekFilePurpose = 'user_data' | 'text_recognition' | 'rich_layout_recognition';
export type DeepSeekToolInput = {
  text?: string;
  file?: File;
  purpose?: DeepSeekFilePurpose;
  voice?: 'stella' | 'tide';
};

function toolBody(tool: DeepSeekTool, input: DeepSeekToolInput): FormData | Record<string, unknown> {
  const text = input.text?.trim() ?? '';
  if (tool === 'search') {
    if (!text || Array.from(text).length > 128) throw new Error('请输入 1 至 128 字的搜索词');
    return { query: text, count: 5 };
  }
  if (tool === 'fetch') {
    let url: URL;
    try { url = new URL(text); } catch { throw new Error('请输入完整的公开网页地址'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || text.length > 8192) {
      throw new Error('请输入完整的公开网页地址');
    }
    return { url: url.href };
  }
  if (tool === 'tts') {
    const body = { text, voice_id: input.voice ?? 'stella', format: 'wav' };
    const billedLength = [...text].reduce((length, char) => length + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0);
    if (!billedLength || billedLength > 10000 || new TextEncoder().encode(JSON.stringify(body)).length > 65536) {
      throw new Error('朗读文本最多 10,000 个计费字符（每个汉字计 2 个），请求体最多 64 KiB');
    }
    return body;
  }
  const file = input.file;
  if (!file?.size) throw new Error('请选择非空文件');
  const purpose = input.purpose ?? 'text_recognition';
  const maxMiB = tool === 'asr' ? 8 : tool === 'upload' && purpose === 'user_data'
    ? (/\.(?:png|jpe?g|gif|webp)$/i.test(file.name) ? 64 : 32) : 100;
  if (file.size > maxMiB * 1024 * 1024) throw new Error(`文件大小不能超过 ${maxMiB} MiB`);
  if (tool === 'asr' && !/\.(?:wav|ogg|opus)$/i.test(file.name)) throw new Error('请选择 PCM WAV 或 Ogg Opus 音频文件');
  const form = new FormData();
  if (tool !== 'asr') form.append('purpose', tool === 'ocr' && purpose === 'user_data' ? 'text_recognition' : purpose);
  form.append('file', file);
  return form;
}

function toolError(status: number): Error {
  const reason = status === 401 || status === 403 ? '请检查 DeepSeek API Key 或访问权限'
    : status === 402 ? '请检查 DeepSeek 账户余额'
    : status === 429 ? '接口限流，请稍后重试'
    : status === 413 ? '请求内容超过服务端限制'
    : status >= 500 ? 'DeepSeek 服务暂时不可用'
    : '请检查输入、文件格式或 API 权限';
  return new Error(`DeepSeek 请求失败（HTTP ${status}），${reason}`);
}

export async function deleteDeepSeekFile(fileId: string, apiKey: string): Promise<void> {
  if (!isDeepSeekFileId(fileId)) throw new Error('DeepSeek 文件 ID 无效');
  if (!apiKey.trim()) throw new Error('请先为 DeepSeek 官方方案填写 API Key');
  const res = await request({
    url: `${DEEPSEEK_ORIGIN}/files/${fileId}`, method: 'DELETE', channel: 'gm', rejectRedirects: true,
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  if (res.status === 404) throw new Error('当前 DeepSeek 账号找不到此文件，请检查账号或手动解除课程绑定');
  if (res.status < 200 || res.status >= 300) throw toolError(res.status);
  let result;
  try { result = JSON.parse(res.text); } catch { throw new Error('DeepSeek 返回了无法解析的删除结果'); }
  if (result?.id !== fileId || result.deleted !== true) throw new Error('DeepSeek 未确认文件已删除');
}

export async function runDeepSeekTool(
  tool: DeepSeekTool, input: DeepSeekToolInput, apiKey: string, signal?: AbortSignal,
): Promise<{ text: string; audio?: Blob; uploadedFile?: DeepSeekReferenceFile }> {
  if (!apiKey.trim()) throw new Error('请先为 DeepSeek 官方方案填写 API Key');
  const data = toolBody(tool, input);
  const res = await request({
    url: DEEPSEEK_ORIGIN + (tool === 'upload' ? '/files' : `/v1/tools/${tool}`),
    method: 'POST', channel: 'gm', rejectRedirects: true, data, signal,
    timeoutMs: tool === 'search' || tool === 'fetch' ? 120000 : 600000,
    headers: { Authorization: `Bearer ${apiKey.trim()}`, ...(data instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    responseType: tool === 'tts' ? 'arraybuffer' : 'text',
  });
  if (res.status < 200 || res.status >= 300) throw toolError(res.status);
  if (tool === 'tts') {
    const bytes = res.bytes;
    if (!bytes || bytes.byteLength < 44 ||
      new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' || new TextDecoder().decode(bytes.slice(8, 12)) !== 'WAVE') {
      throw new Error('DeepSeek 未返回有效 WAV 音频');
    }
    return { text: '语音已生成', audio: new Blob([bytes], { type: 'audio/wav' }) };
  }
  let json;
  try { json = JSON.parse(res.text); } catch { throw new Error('DeepSeek 工具返回了无法解析的结果'); }
  if (!json || typeof json !== 'object' || json.error) throw new Error('DeepSeek 未能完成本次工具请求');
  if (tool === 'upload' && isDeepSeekFileId(json.id)) {
    const expiresAt = Number.isSafeInteger(json.expires_at) && json.expires_at > 0 ? json.expires_at * 1000 : undefined;
    return { text: '文件已上传。', uploadedFile: { id: json.id, name: input.file!.name, ...(expiresAt === undefined ? {} : { expiresAt }) } };
  }
  if (tool === 'ocr' && Array.isArray(json.pages)) {
    const text = json.pages.map((page: { text?: unknown; finish_reason?: unknown }, i: number) =>
      `第 ${i + 1} 页${page?.finish_reason === 'length' ? '（已截断）' : ''}\n${typeof page?.text === 'string' ? page.text : ''}`).join('\n\n');
    return { text: text.slice(0, 200000) || '没有识别到文字' };
  }
  if (tool === 'fetch' && typeof json.content === 'string') {
    return { text: [typeof json.title === 'string' ? json.title : '', json.content].join('\n\n').trim().slice(0, 200000) };
  }
  if (tool === 'asr' && typeof json.text === 'string') return { text: json.text || '没有识别到语音' };
  if (tool === 'search' && Array.isArray(json.results)) {
    const text = json.results.slice(0, 5).map((result: { title?: unknown; url?: unknown; snippet?: unknown }) =>
      [result?.title, result?.url, result?.snippet].filter((item): item is string => typeof item === 'string').join('\n')).join('\n\n');
    return { text: text.slice(0, 200000) || '未找到搜索结果' };
  }
  throw new Error('DeepSeek 工具响应缺少预期字段');
}

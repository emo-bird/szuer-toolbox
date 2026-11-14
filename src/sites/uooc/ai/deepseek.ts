export const DEEPSEEK_ORIGIN = 'https://api.deepseek.com';
export const DEEPSEEK_FLASH = 'deepseek-flash';
export const DEEPSEEK_PRO = 'deepseek-v4-pro';
export const DEEPSEEK_MAX_OUTPUT = 393216;
export const DEEPSEEK_MAX_LOCAL_INPUT = 200000;
export const THINKING_MODES = ['auto', 'off', 'low', 'high', 'max'] as const;
type ThinkingMode = typeof THINKING_MODES[number];

export interface DeepSeekReferenceFile {
  readonly id: string;
  readonly name: string;
  readonly expiresAt?: number;
}

export function isDeepSeekFileId(value: unknown): value is string {
  return typeof value === 'string' && /^file-api-[\w-]{1,128}$/.test(value);
}

export function deepSeekReferenceFile(value: unknown): DeepSeekReferenceFile | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const file = value as Partial<DeepSeekReferenceFile>;
  if (!isDeepSeekFileId(file.id) || typeof file.name !== 'string') return undefined;
  if (file.expiresAt !== undefined && (!Number.isSafeInteger(file.expiresAt) || file.expiresAt <= 0)) return undefined;
  return { id: file.id, name: file.name.slice(0, 512), ...(file.expiresAt === undefined ? {} : { expiresAt: file.expiresAt }) };
}

export function deepSeekFileExpired(file: DeepSeekReferenceFile): boolean {
  return file.expiresAt !== undefined && file.expiresAt <= Date.now();
}

export interface DeepSeekOptions {
  readonly thinking: ThinkingMode;
  readonly search: boolean;
  readonly readUrl: boolean;
  readonly safety: boolean;
  readonly maxTokens?: number;
  readonly inputLimit?: number;
  readonly context?: string;
  readonly referenceFile?: DeepSeekReferenceFile;
}

export function deepSeekOptions(value: unknown): DeepSeekOptions | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const options = value as Partial<DeepSeekOptions>;
  return {
    thinking: options.thinking !== undefined && THINKING_MODES.includes(options.thinking) ? options.thinking : 'auto',
    search: options.search === true,
    readUrl: options.readUrl === true,
    safety: options.safety === true,
    ...bounded('maxTokens', options.maxTokens, DEEPSEEK_MAX_OUTPUT),
    ...bounded('inputLimit', options.inputLimit, DEEPSEEK_MAX_LOCAL_INPUT),
    ...(typeof options.context === 'string' && options.context.trim()
      ? { context: options.context.trim().slice(0, DEEPSEEK_MAX_LOCAL_INPUT) } : {}),
  };
}

function bounded(key: 'maxTokens' | 'inputLimit', value: unknown, max: number): Record<string, number> {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max ? { [key]: value } : {};
}

export function isDeepSeekEndpoint(address: string): boolean {
  try { return new URL(address).origin === DEEPSEEK_ORIGIN; } catch { return false; }
}

export function deepSeekModel(model: string): string {
  switch (model) {
    case 'deepseek-chat': case 'deepseek-reasoner':
    case 'deepseek-v4-flash': case 'deepseek-v4-flash-vision-exp': return DEEPSEEK_FLASH;
    default: return model;
  }
}

export function deepSeekParams(model: string, options?: DeepSeekOptions): Record<string, unknown> {
  const current = deepSeekModel(model);
  if (current !== DEEPSEEK_FLASH && current !== DEEPSEEK_PRO) return {};
  const thinking = options?.thinking && options.thinking !== 'auto'
    ? options.thinking : model === 'deepseek-chat' ? 'off' : model === 'deepseek-reasoner' ? 'high' : 'auto';
  const tools = [];
  if (current === DEEPSEEK_FLASH && options?.search) tools.push({ type: 'deepseek_web_search' });
  if (current === DEEPSEEK_FLASH && options?.readUrl) tools.push({ type: 'deepseek_read_url' });
  return {
    ...(thinking === 'auto' ? {} : { thinking: { type: thinking === 'off' ? 'disabled' : 'enabled' } }),
    ...(thinking === 'auto' || thinking === 'off' ? {} : { reasoning_effort: thinking }),
    ...(tools.length === 0 ? {} : { tools }),
    ...(current === DEEPSEEK_FLASH && options?.safety ? { safety_check: { level: 'high' } } : {}),
    ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
  };
}

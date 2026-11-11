interface CachedAnswer {
  readonly answer: string;
  readonly explanation?: string;
  readonly samples: readonly (string | null)[];
}

const MAX_ENTRIES = 100;
const MAX_AGE_MS = 30 * 60 * 1000;
const cache = new Map<string, { answer: CachedAnswer; time: number }>();

export function clearAnswerCache(): void {
  cache.clear();
}

export function getCachedAnswer(key: string): CachedAnswer | undefined {
  const entry = cache.get(key);
  if (entry === undefined) return undefined;
  if (Date.now() - entry.time <= MAX_AGE_MS) return entry.answer;
  cache.delete(key);
  return undefined;
}

export function setCachedAnswer(key: string, answer: CachedAnswer): void {
  cache.delete(key);
  cache.set(key, { answer, time: Date.now() });
  if (cache.size <= MAX_ENTRIES) return;
  const oldest = cache.keys().next().value;
  if (oldest !== undefined) cache.delete(oldest);
}

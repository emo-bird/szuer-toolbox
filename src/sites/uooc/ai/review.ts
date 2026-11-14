import { listKeys, read, remove, write } from '../../../common/core/storage.ts';
import { containerFor, inputsFor, readQuestionAnswer, restoreQuestionAnswer } from './fill.ts';
import type { ExamQuestion } from './paper.ts';

export interface ReviewEntry {
  readonly question: ExamQuestion;
  suggestion?: string;
  original?: readonly string[];
  applied?: readonly string[];
}

export interface QuizReview {
  readonly tid: string;
  readonly doc: Document;
  readonly current: () => boolean;
  readonly entries: ReadonlyMap<string, ReviewEntry>;
}

let review: QuizReview | null = null;

export function currentReview(): QuizReview | null {
  return review !== null && review.current() ? review : null;
}

export function openReview(
  tid: string,
  doc: Document,
  current: () => boolean,
  questions: readonly ExamQuestion[],
): QuizReview {
  review = { tid, doc, current, entries: new Map(questions.map((q) => [q.id, { question: q }])) };
  return review;
}

export function locateReviewQuestion(id: string): boolean {
  const current = currentReview();
  if (current === null) return false;
  const target = containerFor([current.doc], id) ?? inputsFor([current.doc], id)[0];
  if (target === undefined || target === null) return false;
  target.scrollIntoView({ block: 'center' });
  inputsFor([current.doc], id)[0]?.focus({ preventScroll: true });
  return true;
}

export function sameAnswer(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

export function undoReviewAnswer(current: QuizReview, entry: ReviewEntry): boolean {
  const { question, applied, original } = entry;
  if (!current.current() || applied === undefined || original === undefined) return false;
  if (!sameAnswer(readQuestionAnswer(question.id, question.kind, current.doc), applied)) return false;
  if (!restoreQuestionAnswer(question.id, question.kind, original, current.doc)) return false;
  delete entry.applied;
  delete entry.original;
  return true;
}

const LEGACY_DRAFT_KEY = 'uooc:ai:quiz-draft';
const DRAFT_PREFIX = `${LEGACY_DRAFT_KEY}:`;
const DRAFT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const DRAFT_LIMIT = 30;

interface StoredDraft {
  readonly savedAt: number;
  readonly entries: readonly [string, string][];
}

function questionIdentity(question: ExamQuestion): readonly unknown[] {
  return [question.id, question.kind, question.stem, question.options, question.blankCount,
    question.contentIssue, question.images];
}

export function sameReviewPaper(current: QuizReview, questions: readonly ExamQuestion[]): boolean {
  if (current.entries.size !== questions.length) return false;
  return questions.every((question) => {
    const previous = current.entries.get(question.id)?.question;
    return previous !== undefined &&
      JSON.stringify(questionIdentity(previous)) === JSON.stringify(questionIdentity(question));
  });
}

async function fingerprint(current: QuizReview): Promise<string> {
  const content = JSON.stringify([location.origin, current.tid, [...current.entries.values()].map(({ question }) =>
    questionIdentity(question))]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function saveReviewDraft(current: QuizReview): Promise<number> {
  const key = await fingerprint(current);
  if (!current.current()) return 0;
  const entries = [...current.entries.values()]
    .flatMap(({ question, suggestion }): [string, string][] => suggestion === undefined ? [] : [[question.id, suggestion]]);
  if (entries.length === 0) return 0;
  storeDraft(key, entries);
  if (legacyDraft()?.key === key) remove(LEGACY_DRAFT_KEY);
  return entries.length;
}

export async function loadReviewDraft(current: QuizReview): Promise<Map<string, string>> {
  const key = await fingerprint(current);
  if (!current.current()) return new Map();
  const storageKey = DRAFT_PREFIX + key;
  const stored = savedDraft(storageKey);
  if (stored !== null) {
    if (isRecent(stored, Date.now())) return new Map(answerEntries(stored.entries));
    remove(storageKey);
    if (legacyDraft()?.key === key) remove(LEGACY_DRAFT_KEY);
    return new Map();
  }
  const legacy = legacyDraft();
  if (legacy?.key !== key) return new Map();
  const entries = answerEntries(legacy.entries);
  if (entries.length > 0) {
    storeDraft(key, entries);
    remove(LEGACY_DRAFT_KEY);
  }
  return new Map(entries);
}

function answerEntries(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is [string, string] =>
    Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string',
  );
}

function legacyDraft(): { key?: unknown; entries?: unknown } | null {
  return read<{ key?: unknown; entries?: unknown } | null>(LEGACY_DRAFT_KEY, null);
}

function savedDraft(storageKey: string): StoredDraft | null {
  return read<StoredDraft | null>(storageKey, null);
}

function isRecent(draft: StoredDraft, now: number): boolean {
  return Number.isFinite(draft.savedAt) && draft.savedAt > now - DRAFT_MAX_AGE_MS;
}

function storeDraft(fingerprintKey: string, entries: StoredDraft['entries']): void {
  const key = DRAFT_PREFIX + fingerprintKey;
  const now = Date.now();
  write(key, { savedAt: now, entries });

  const remaining: { key: string; savedAt: number }[] = [];
  for (const storageKey of listKeys()) {
    if (!storageKey.startsWith(DRAFT_PREFIX) || storageKey === key) continue;
    const draft = savedDraft(storageKey);
    if (draft !== null && isRecent(draft, now)) remaining.push({ key: storageKey, savedAt: draft.savedAt });
    else remove(storageKey);
  }
  remaining.sort((a, b) => b.savedAt - a.savedAt);
  for (const old of remaining.slice(DRAFT_LIMIT - 1)) remove(old.key);
}

import { read, write } from '../../../common/core/storage.ts';
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

const DRAFT_KEY = 'uooc:ai:quiz-draft';

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
  const entries = [...current.entries.values()]
    .flatMap(({ question, suggestion }) => suggestion === undefined ? [] : [[question.id, suggestion]]);
  if (entries.length === 0) return 0;
  const key = await fingerprint(current);
  if (!current.current()) return 0;
  write(DRAFT_KEY, { key, entries });
  return entries.length;
}

export async function loadReviewDraft(current: QuizReview): Promise<Map<string, string>> {
  const key = await fingerprint(current);
  const stored = read<{ key?: string; entries?: unknown } | null>(DRAFT_KEY, null);
  if (stored?.key !== key || !Array.isArray(stored.entries)) return new Map();
  return new Map(stored.entries.filter((entry): entry is [string, string] =>
    Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string',
  ));
}

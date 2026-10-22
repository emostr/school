import { QuestionType } from '../generated/prisma/enums';

export interface SnapshotOption {
  id: string;
  content: string;
  /** Буква варианта на бланке: А, Б, В… */
  letter: string;
}

export interface SnapshotQuestion {
  id: string;
  order: number;
  /** 0 — задание во всех вариантах, 1..N — только в своём. */
  variant: number;
  type: QuestionType;
  content: string;
  points: number;
  options: SnapshotOption[];
  answerKey: AnswerKey;
  /** Сколько клеток занимает ответ на бланке. */
  cells: number;
}

export interface AnswerKey {
  correct?: string[];
  partial?: boolean;
  accepted?: string[];
  caseSensitive?: boolean;
  numeric?: boolean;
  tolerance?: number;
  guideline?: string;
}

export interface TestSnapshot {
  testId: string;
  title: string;
  description: string;
  instructions: string;
  gradeScale: Record<string, number>;
  variantCount: number;
  /** Задания всех вариантов сразу: набор конкретного варианта выбирается ниже. */
  questions: SnapshotQuestion[];
  /** Максимум за первый вариант — для списков, где вариант ещё не известен. */
  maxScore: number;
}

/** Задания одного варианта: общие плюс помеченные этим номером. */
export function questionsForVariant(snapshot: TestSnapshot, variant: number): SnapshotQuestion[] {
  if ((snapshot.variantCount ?? 1) <= 1) {
    return snapshot.questions;
  }
  return snapshot.questions.filter((question) => !question.variant || question.variant === variant);
}

export function maxScoreFor(snapshot: TestSnapshot, variant: number): number {
  return questionsForVariant(snapshot, variant).reduce((sum, question) => sum + question.points, 0);
}

export const OPTION_LETTERS = 'АБВГДЕЖЗИК'.split('');

/** Сколько клеток печатать под ответ и сколько потом резать при распознавании. */
export function cellsFor(type: QuestionType, options: number, key: AnswerKey): number {
  if (type === 'SINGLE_CHOICE') {
    return 1;
  }
  if (type === 'MULTIPLE_CHOICE') {
    // Клеток ровно столько, сколько вариантов в ключе, но не меньше двух:
    // иначе по длине строки ответ читался бы с листа.
    return Math.max(2, Math.min(options, key.correct?.length ? key.correct.length + 1 : 3));
  }
  if (type === 'SHORT_ANSWER') {
    const longest = (key.accepted ?? []).reduce((max, value) => Math.max(max, value.length), 0);
    return Math.min(16, Math.max(6, longest + 2));
  }
  return 0;
}

/** Нормализация написанного от руки ответа: регистр, ё, пробелы, запятая в числе. */
export function normalizeAnswer(value: string, key: AnswerKey): string {
  let out = value.trim().replace(/\s+/g, ' ');
  if (key.numeric) {
    return out.replace(/\s/g, '').replace(',', '.');
  }
  if (!key.caseSensitive) {
    out = out.toLowerCase();
  }
  return out.replace(/ё/g, 'е');
}

function numeric(value: string): number | null {
  const parsed = Number(value.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export interface Verdict {
  /** null — платформа не берётся судить, нужен учитель. */
  correct: boolean | null;
  score: number;
}

/** Проверка одного ответа по ключу. Общая и для OCR, и для правки руками. */
export function judge(question: SnapshotQuestion, raw: string): Verdict {
  const key = question.answerKey ?? {};
  const value = (raw ?? '').trim();

  if (question.type === 'EXTENDED') {
    return { correct: null, score: 0 };
  }

  if (!value) {
    return { correct: false, score: 0 };
  }

  if (question.type === 'SINGLE_CHOICE') {
    const chosen = letterToOptionId(question, value);
    const correct = Boolean(chosen && (key.correct ?? []).includes(chosen));
    return { correct, score: correct ? question.points : 0 };
  }

  if (question.type === 'MULTIPLE_CHOICE') {
    const chosen = new Set(
      value
        .split(/[^А-ЯЁA-Z]/i)
        .join('')
        .split('')
        .map((letter) => letterToOptionId(question, letter))
        .filter((id): id is string => Boolean(id)),
    );
    const expected = new Set(key.correct ?? []);
    const hits = [...chosen].filter((id) => expected.has(id)).length;
    const extra = [...chosen].filter((id) => !expected.has(id)).length;

    if (hits === expected.size && extra === 0) {
      return { correct: true, score: question.points };
    }
    if (key.partial && expected.size > 0) {
      // Частичный балл: за каждый верный минус каждый лишний, но не ниже нуля.
      const share = Math.max(0, (hits - extra) / expected.size);
      return { correct: false, score: Math.round(question.points * share) };
    }
    return { correct: false, score: 0 };
  }

  // SHORT_ANSWER
  const accepted = key.accepted ?? [];
  if (key.numeric) {
    const got = numeric(value);
    if (got === null) {
      return { correct: false, score: 0 };
    }
    const tolerance = key.tolerance ?? 0;
    const hit = accepted.some((item) => {
      const expected = numeric(item);
      return expected !== null && Math.abs(expected - got) <= tolerance + 1e-9;
    });
    return { correct: hit, score: hit ? question.points : 0 };
  }

  const normalized = normalizeAnswer(value, key);
  const hit = accepted.some((item) => normalizeAnswer(item, key) === normalized);
  return { correct: hit, score: hit ? question.points : 0 };
}

/** «Б» → id второго варианта. Учитывает и латинские буквы: их часто пишут по привычке. */
export function letterToOptionId(question: SnapshotQuestion, letter: string): string | null {
  const clean = letter.trim().toUpperCase().replace(/A/g, 'А').replace(/B/g, 'В').replace(/E/g, 'Е');
  const index = OPTION_LETTERS.indexOf(clean[0] ?? '');
  if (index < 0) {
    return question.options.find((o) => o.letter === clean[0])?.id ?? null;
  }
  return question.options[index]?.id ?? null;
}

/** Оценка по порогам в процентах: { "5": 85, "4": 70, "3": 50 }. */
export function gradeFor(percent: number, scale: Record<string, number>): number {
  const pairs = Object.entries(scale)
    .map(([grade, threshold]) => [Number(grade), Number(threshold)] as const)
    .filter(([grade, threshold]) => Number.isFinite(grade) && Number.isFinite(threshold))
    .sort((a, b) => b[0] - a[0]);
  for (const [grade, threshold] of pairs) {
    if (percent >= threshold) {
      return grade;
    }
  }
  return 2;
}

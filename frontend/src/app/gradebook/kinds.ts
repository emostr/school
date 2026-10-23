import { GradeKind } from '../core/types';

/** Виды работ и их вес по умолчанию — те же, что на сервере. */
export const GRADE_KINDS: { value: GradeKind; label: string; short: string; weight: number }[] = [
  { value: 'LESSON', label: 'работа на уроке', short: 'урок', weight: 1 },
  { value: 'ORAL', label: 'устный ответ', short: 'устно', weight: 1 },
  { value: 'HOMEWORK', label: 'домашняя работа', short: 'д/з', weight: 1 },
  { value: 'INDEPENDENT', label: 'самостоятельная работа', short: 'с/р', weight: 2 },
  { value: 'QUIZ', label: 'проверочная работа', short: 'п/р', weight: 2 },
  { value: 'TEST', label: 'контрольная работа', short: 'к/р', weight: 3 },
  { value: 'DICTATION', label: 'диктант', short: 'дикт.', weight: 2 },
  { value: 'ESSAY', label: 'сочинение / изложение', short: 'соч.', weight: 2 },
  { value: 'LAB', label: 'лабораторная / практическая', short: 'л/р', weight: 2 },
  { value: 'PROJECT', label: 'проект / доклад', short: 'проект', weight: 2 },
  { value: 'EXAM', label: 'итоговая работа', short: 'итог.', weight: 4 },
  { value: 'OTHER', label: 'другое', short: 'др.', weight: 1 },
];

export function kindLabel(kind: GradeKind): string {
  return GRADE_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

export function kindShort(kind: GradeKind): string {
  return GRADE_KINDS.find((item) => item.value === kind)?.short ?? '';
}

export function defaultWeight(kind: GradeKind): number {
  return GRADE_KINDS.find((item) => item.value === kind)?.weight ?? 1;
}

/** Цвет оценки — подпись цифрой рядом всегда есть, цвет лишь помогает глазу. */
export function gradeTone(value: number): string {
  if (value >= 5) return 'bg-success text-white';
  if (value === 4) return 'bg-cyan text-white';
  if (value === 3) return 'bg-warning text-white';
  return 'bg-danger text-white';
}

/** Средний балл цветом текста: 4,5+ — хорошо, ниже 3 — тревожно. */
export function averageTone(value: number | null): string {
  if (value === null) return 'text-faint';
  if (value >= 4.5) return 'text-success';
  if (value >= 3.5) return 'text-cyan';
  if (value >= 2.5) return 'text-warning';
  return 'text-danger';
}

export function formatAverage(value: number | null): string {
  return value === null ? '—' : value.toFixed(2).replace('.', ',');
}

import type { QuestionType, WorkStatus } from './test-types';

export const CLASS_NUMBERS = Array.from({ length: 11 }, (_, i) => i + 1);

export const CLASS_LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('');

/** Буквы вариантов ответа — те же, что печатаются на бланке. */
export const OPTION_LETTERS = 'АБВГДЕЖЗИК'.split('');

export const QUESTION_TYPES: { value: QuestionType; label: string; hint: string; icon: string }[] = [
  {
    value: 'SINGLE_CHOICE',
    label: 'Один вариант',
    hint: 'Ученик вписывает в клетку букву верного варианта',
    icon: 'checkCircle',
  },
  {
    value: 'MULTIPLE_CHOICE',
    label: 'Несколько вариантов',
    hint: 'Несколько клеток под буквы; можно засчитывать частично',
    icon: 'list',
  },
  {
    value: 'SHORT_ANSWER',
    label: 'Краткий ответ',
    hint: 'Слово, число или формула — по знаку в клетке, проверяется автоматически',
    icon: 'edit',
  },
  {
    value: 'EXTENDED',
    label: 'Развёрнутый ответ',
    hint: 'Пишется на обороте, платформа не проверяет — только учитель',
    icon: 'fileText',
  },
];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Один вариант',
  MULTIPLE_CHOICE: 'Несколько вариантов',
  SHORT_ANSWER: 'Краткий ответ',
  EXTENDED: 'Развёрнутый ответ',
};

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  PENDING: 'Не сдана',
  RECOGNIZED: 'Распознана',
  NEEDS_REVIEW: 'Нужна проверка',
  CHECKED: 'Проверена',
};

export const WORK_STATUS_TONES: Record<WorkStatus, string> = {
  PENDING: 'neutral',
  RECOGNIZED: 'info',
  NEEDS_REVIEW: 'warning',
  CHECKED: 'success',
};

export const GRADE_TONES: Record<number, string> = {
  5: 'success',
  4: 'info',
  3: 'warning',
  2: 'danger',
};

/** Пороги оценок по умолчанию — привычная школьная шкала. */
export const DEFAULT_GRADE_SCALE: Record<string, number> = { '5': 85, '4': 70, '3': 50 };

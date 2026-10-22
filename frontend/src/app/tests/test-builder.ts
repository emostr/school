import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Notify } from '../core/notify';
import { Icon } from '../ui/icon';
import { RichEditor } from '../editor/rich-editor';
import { DEFAULT_GRADE_SCALE, OPTION_LETTERS, QUESTION_TYPES, QUESTION_TYPE_LABELS } from './catalog';
import { AnswerKey, Question, QuestionOption, QuestionType } from './test-types';

export interface BuilderState {
  title: string;
  description: string;
  instructions: string;
  gradeScale: Record<string, number>;
  variantCount: number;
  questions: Question[];
}

let counter = 0;

function uid(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

export function emptyQuestion(type: QuestionType = 'SINGLE_CHOICE'): Question {
  const options: QuestionOption[] =
    type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE'
      ? [
          { id: uid('o'), content: '' },
          { id: uid('o'), content: '' },
        ]
      : [];
  return {
    id: uid('q'),
    order: 0,
    variant: 0,
    type,
    content: '',
    points: type === 'EXTENDED' ? 5 : 1,
    options,
    answerKey: type === 'SHORT_ANSWER' ? { accepted: [''] } : { correct: [] },
  };
}

export function emptyState(): BuilderState {
  return {
    title: '',
    description: '',
    instructions: 'Ответы записывайте печатными буквами и цифрами, по одному знаку в клетке.',
    gradeScale: { ...DEFAULT_GRADE_SCALE },
    variantCount: 1,
    questions: [emptyQuestion()],
  };
}

/** Тело запроса на сохранение: служебные поля конструктора серверу не нужны. */
export function toPayload(state: BuilderState) {
  return {
    title: state.title,
    description: state.description,
    instructions: state.instructions,
    gradeScale: state.gradeScale,
    variantCount: state.variantCount,
    questions: state.questions.map((question) => ({
      type: question.type,
      variant: question.variant,
      content: question.content,
      points: question.points,
      options: question.options,
      answerKey: question.answerKey,
    })),
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<span[^>]*data-formula="([^"]*)"[^>]*>.*?<\/span>/gi, ' $1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Конструктор проверочной работы: сведения о тесте, варианты, шкала оценок
 * и задания четырёх типов с ключами проверки. Состояние целиком живёт в
 * одном объекте — его и сохраняют страницы создания и правки.
 */
@Component({
  selector: 'es-test-builder',
  imports: [FormsModule, Icon, RichEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="space-y-6">
      <section class="es-panel">
        <h2 class="es-subtitle">о тесте</h2>
        <p class="mb-4 text-sm text-muted">Название видно коллегам и печатается на бланке</p>
        <div class="space-y-4">
          <div>
            <label class="es-label" for="t-title">название</label>
            <input id="t-title" class="es-input" placeholder="Контрольная работа по теме «Дроби»" [ngModel]="state().title" (ngModelChange)="patch({ title: $event })" />
          </div>
          <div>
            <label class="es-label" for="t-description">описание</label>
            <textarea id="t-description" class="es-textarea !min-h-0" rows="2" placeholder="Для чего этот тест и на каком материале" [ngModel]="state().description" (ngModelChange)="patch({ description: $event })"></textarea>
          </div>
          <div>
            <label class="es-label" for="t-instructions">инструкция для ученика</label>
            <textarea id="t-instructions" class="es-textarea !min-h-0" rows="3" [ngModel]="state().instructions" (ngModelChange)="patch({ instructions: $event })"></textarea>
            <p class="es-hint">Печатается вверху бланка. Про печатные буквы лучше напомнить.</p>
          </div>
        </div>
      </section>

      <section class="es-panel">
        <h2 class="es-subtitle">варианты</h2>
        <p class="mb-4 text-sm text-muted">Ученики получат их по очереди — соседям по парте достанутся разные</p>
        <div class="flex flex-wrap items-end gap-4">
          <div class="w-56">
            <label class="es-label" for="t-variants">сколько вариантов</label>
            <select id="t-variants" class="es-select" [ngModel]="state().variantCount" (ngModelChange)="patch({ variantCount: +$event || 1 })">
              @for (count of [1, 2, 3, 4]; track count) {
                <option [ngValue]="count">{{ count === 1 ? 'один — всем одинаковый' : count + ' варианта' }}</option>
              }
            </select>
          </div>
          @if (state().variantCount > 1) {
            <div class="flex flex-wrap items-center gap-2 pb-1">
              @for (score of variantScores(); track $index) {
                <span class="es-badge" [class.es-badge-warning]="uneven()">вариант {{ $index + 1 }} · {{ score }} б.</span>
              }
            </div>
          }
        </div>
        @if (state().variantCount > 1) {
          <p class="mt-3 text-xs" [class]="uneven() ? 'text-warning' : 'text-faint'">
            {{ uneven() ? 'Варианты стоят разного числа баллов — шкала оценок одна на всех, уравняйте их.' : 'Отметьте у каждого задания его вариант. Задания «во всех вариантах» попадут в каждый бланк.' }}
          </p>
        }
      </section>

      <section class="es-panel">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="es-subtitle">шкала оценок</h2>
            <p class="mb-4 text-sm text-muted">Порог в процентах от максимума — ниже тройки ставится двойка</p>
          </div>
          <span class="es-badge es-badge-accent">максимум {{ maxScore() }} б.</span>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          @for (grade of ['5', '4', '3']; track grade) {
            <div>
              <label class="es-label" [for]="'grade-' + grade">оценка «{{ grade }}» от, %</label>
              <input [id]="'grade-' + grade" type="number" min="1" max="100" class="es-input" [ngModel]="state().gradeScale[grade] ?? 0" (ngModelChange)="setGrade(grade, $event)" />
              <p class="es-hint">{{ threshold(grade) }} б. из {{ maxScore() }}</p>
            </div>
          }
        </div>
      </section>

      <div class="space-y-2">
        @for (question of state().questions; track question.id; let index = $index) {
          <section class="border-2 bg-surface transition-colors" [class]="open() === question.id ? 'border-accent' : 'border-transparent'" [attr.data-question]="index">
            <header class="flex items-center gap-3 px-4 py-3">
              <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" (click)="open.set(open() === question.id ? null : question.id)">
                <span class="grid h-8 w-8 shrink-0 place-items-center bg-surface-3 text-sm font-semibold">{{ index + 1 }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-semibold">{{ preview(question.content) || 'Новое задание' }}</span>
                  <span class="mt-0.5 block text-xs text-muted">
                    {{ typeLabel(question.type) }} · {{ question.points }} б.{{ state().variantCount > 1 ? (question.variant ? ' · вариант ' + question.variant : ' · во всех вариантах') : '' }}
                  </span>
                </span>
              </button>
              <div class="flex shrink-0 items-center gap-0.5">
                <button type="button" class="es-btn es-btn-ghost es-btn-icon es-btn-sm" title="Выше" [disabled]="index === 0" (click)="move(index, -1)"><es-icon name="chevronUp" [size]="16" /></button>
                <button type="button" class="es-btn es-btn-ghost es-btn-icon es-btn-sm" title="Ниже" [disabled]="index === state().questions.length - 1" (click)="move(index, 1)"><es-icon name="chevronDown" [size]="16" /></button>
                <button type="button" class="es-btn es-btn-ghost es-btn-icon es-btn-sm hover:!text-danger" title="Удалить" (click)="removeQuestion(question.id)"><es-icon name="trash" [size]="16" /></button>
              </div>
            </header>

            @if (open() === question.id) {
              @let key = question.answerKey;
              <div class="space-y-4 border-t border-line px-4 pt-4 pb-5">
                <div>
                  <span class="es-label">текст задания</span>
                  <es-editor mode="test" imageScope="test" placeholder="Текст задания…" [value]="question.content" (valueChange)="update(question.id, { content: $event })" />
                </div>

                @if (state().variantCount > 1) {
                  <div class="sm:max-w-xs">
                    <label class="es-label" [for]="'v-' + question.id">в каком варианте</label>
                    <select [id]="'v-' + question.id" class="es-select" [ngModel]="question.variant" (ngModelChange)="update(question.id, { variant: +$event || 0 })">
                      <option [ngValue]="0">во всех вариантах</option>
                      @for (n of variantNumbers(); track n) {
                        <option [ngValue]="n">только вариант {{ n }}</option>
                      }
                    </select>
                  </div>
                }

                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label class="es-label" [for]="'type-' + question.id">тип задания</label>
                    <select [id]="'type-' + question.id" class="es-select" [ngModel]="question.type" (ngModelChange)="changeType(question, $event)">
                      @for (type of types; track type.value) {
                        <option [ngValue]="type.value">{{ type.label }}</option>
                      }
                    </select>
                  </div>
                  <div>
                    <label class="es-label" [for]="'points-' + question.id">баллов за задание</label>
                    <input [id]="'points-' + question.id" type="number" min="1" max="100" class="es-input" [ngModel]="question.points" (ngModelChange)="update(question.id, { points: max1($event) })" />
                  </div>
                </div>

                @if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
                  <div>
                    <div class="mb-2 flex items-center justify-between gap-3">
                      <span class="es-label !mb-0">варианты ответа · отметьте верные</span>
                      <button type="button" class="es-btn es-btn-ghost es-btn-sm" (click)="addOption(question)"><es-icon name="plus" [size]="16" /> вариант</button>
                    </div>
                    <div class="space-y-2">
                      @for (option of question.options; track option.id; let optionIndex = $index) {
                        <div class="flex items-start gap-2" [attr.data-option]="optionIndex">
                          <button
                            type="button"
                            class="h-[78px] w-10 shrink-0 border-2 text-sm font-semibold transition-colors"
                            [class]="isCorrect(question, option.id) ? 'border-accent bg-accent text-white' : 'border-line bg-surface-2 text-muted hover:border-accent'"
                            [title]="isCorrect(question, option.id) ? 'Верный ответ' : 'Отметить верным'"
                            (click)="toggleCorrect(question, option.id)"
                          >
                            {{ letter(optionIndex) }}
                          </button>
                          <div class="min-w-0 flex-1">
                            <es-editor mode="compact" [placeholder]="'Вариант ' + letter(optionIndex)" [value]="option.content" (valueChange)="setOption(question, option.id, $event)" />
                          </div>
                          <button type="button" class="grid h-[78px] w-9 shrink-0 place-items-center text-muted hover:text-danger" title="Убрать вариант" (click)="removeOption(question, option.id)">
                            <es-icon name="minus" [size]="16" />
                          </button>
                        </div>
                      }
                    </div>
                    @if (question.type === 'MULTIPLE_CHOICE') {
                      <label class="mt-3 flex items-start gap-3">
                        <input type="checkbox" class="es-switch mt-0.5" [checked]="!!key.partial" (change)="setKey(question, { partial: !key.partial })" />
                        <span><span class="block text-sm font-semibold">засчитывать частично</span><span class="block text-xs text-muted">За каждый верный вариант — доля балла, за лишний — вычет</span></span>
                      </label>
                    }
                  </div>
                }

                @if (question.type === 'SHORT_ANSWER') {
                  <div class="space-y-3">
                    <div>
                      <div class="mb-2 flex items-center justify-between gap-3">
                        <span class="es-label !mb-0">верные ответы</span>
                        <button type="button" class="es-btn es-btn-ghost es-btn-sm" (click)="setKey(question, { accepted: [...accepted(question), ''] })"><es-icon name="plus" [size]="16" /> ещё вариант</button>
                      </div>
                      <div class="space-y-2">
                        @for (value of accepted(question); track $index; let valueIndex = $index) {
                          <div class="flex items-center gap-2">
                            <input class="es-input flex-1" placeholder="Например: 3/4" maxlength="14" [ngModel]="value" (ngModelChange)="setAccepted(question, valueIndex, $event)" [attr.aria-label]="'Верный ответ ' + (valueIndex + 1)" />
                            <button type="button" class="grid h-9 w-9 shrink-0 place-items-center text-muted hover:text-danger" title="Убрать" (click)="removeAccepted(question, valueIndex)"><es-icon name="minus" [size]="16" /></button>
                          </div>
                        }
                      </div>
                      <p class="es-hint mt-2">До 14 знаков: столько клеток помещается в строку бланка. Регистр и «ё» платформа сверяет сама.</p>
                    </div>
                    <div class="flex flex-wrap gap-5">
                      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="es-check" [checked]="!!key.numeric" (change)="setKey(question, { numeric: !key.numeric })" /> числовой ответ</label>
                      <label class="flex items-center gap-2 text-sm"><input type="checkbox" class="es-check" [checked]="!!key.caseSensitive" (change)="setKey(question, { caseSensitive: !key.caseSensitive })" /> учитывать регистр</label>
                    </div>
                    @if (key.numeric) {
                      <div class="max-w-xs">
                        <label class="es-label" [for]="'tol-' + question.id">допустимое отклонение</label>
                        <input [id]="'tol-' + question.id" type="number" min="0" step="any" class="es-input" [ngModel]="key.tolerance ?? 0" (ngModelChange)="setKey(question, { tolerance: +$event || 0 })" />
                        <p class="es-hint">Например, 0.01 для ответов с округлением</p>
                      </div>
                    }
                  </div>
                }

                @if (question.type === 'EXTENDED') {
                  <div>
                    <label class="es-label" [for]="'g-' + question.id">что засчитывать при проверке</label>
                    <textarea [id]="'g-' + question.id" class="es-textarea !min-h-0" rows="3" [ngModel]="key.guideline ?? ''" (ngModelChange)="setKey(question, { guideline: $event })"></textarea>
                    <p class="es-hint">Подсказка себе и коллеге: она видна на странице проверки работы</p>
                  </div>
                }
              </div>
            }
          </section>
        }
      </div>

      <section class="es-panel">
        <h2 class="es-subtitle mb-4">добавить задание</h2>
        <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          @for (type of types; track type.value) {
            <button type="button" class="bg-surface-2 p-4 text-left transition-transform hover:bg-surface-3 active:scale-[0.98]" (click)="addQuestion(type.value)">
              <span class="flex items-center gap-2 font-semibold"><es-icon [name]="type.icon" [size]="18" class="text-accent-hover" /> {{ type.label }}</span>
              <span class="mt-1.5 block text-xs leading-snug text-muted">{{ type.hint }}</span>
            </button>
          }
        </div>
      </section>
    </div>
  `,
})
export class TestBuilder {
  private readonly notify = inject(Notify);

  readonly state = model.required<BuilderState>();
  protected readonly open = signal<string | null>(null);
  protected readonly types = QUESTION_TYPES;

  /**
   * Максимум считается по варианту: общие задания идут во все, остальные —
   * только в свой. Расхождение между вариантами платформа не пропустит.
   */
  protected readonly variantScores = computed(() => {
    const state = this.state();
    return Array.from({ length: state.variantCount }, (_, index) =>
      state.questions
        .filter((question) => !question.variant || question.variant === index + 1)
        .reduce((sum, question) => sum + (question.points || 0), 0),
    );
  });
  protected readonly maxScore = computed(() => this.variantScores()[0] ?? 0);
  protected readonly uneven = computed(() => new Set(this.variantScores()).size > 1);
  protected readonly variantNumbers = computed(() => Array.from({ length: this.state().variantCount }, (_, i) => i + 1));

  constructor() {
    queueMicrotask(() => this.open.set(this.state().questions[0]?.id ?? null));
  }

  protected patch(next: Partial<BuilderState>): void {
    this.state.update((state) => ({ ...state, ...next }));
  }

  protected update(id: string, next: Partial<Question>): void {
    this.patch({ questions: this.state().questions.map((question) => (question.id === id ? { ...question, ...next } : question)) });
  }

  protected setGrade(grade: string, value: unknown): void {
    this.patch({ gradeScale: { ...this.state().gradeScale, [grade]: Number(value) || 0 } });
  }

  protected threshold(grade: string): number {
    return Math.round(((this.state().gradeScale[grade] ?? 0) / 100) * this.maxScore());
  }

  protected addQuestion(type: QuestionType): void {
    const question = emptyQuestion(type);
    this.patch({ questions: [...this.state().questions, question] });
    this.open.set(question.id);
  }

  protected async removeQuestion(id: string): Promise<void> {
    if (this.state().questions.length === 1) {
      this.notify.warning('В тесте должно остаться хотя бы одно задание');
      return;
    }
    const ok = await this.notify.confirm({
      title: 'Удалить задание?',
      message: 'Вместе с ним пропадут варианты ответа и ключ проверки.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (ok) {
      this.patch({ questions: this.state().questions.filter((question) => question.id !== id) });
    }
  }

  protected move(index: number, delta: number): void {
    const target = index + delta;
    const questions = [...this.state().questions];
    if (target < 0 || target >= questions.length) return;
    [questions[index], questions[target]] = [questions[target], questions[index]];
    this.patch({ questions });
  }

  protected changeType(question: Question, type: QuestionType): void {
    const next = emptyQuestion(type);
    this.update(question.id, {
      type,
      options: type === 'SHORT_ANSWER' || type === 'EXTENDED' ? [] : next.options,
      answerKey: next.answerKey,
    });
  }

  protected setKey(question: Question, next: Partial<AnswerKey>): void {
    this.update(question.id, { answerKey: { ...question.answerKey, ...next } });
  }

  protected setOption(question: Question, id: string, content: string): void {
    const current = this.state().questions.find((q) => q.id === question.id) ?? question;
    this.update(question.id, { options: current.options.map((option) => (option.id === id ? { ...option, content } : option)) });
  }

  protected addOption(question: Question): void {
    if (question.options.length >= OPTION_LETTERS.length) {
      this.notify.warning(`Больше ${OPTION_LETTERS.length} вариантов на бланк не помещается`);
      return;
    }
    this.update(question.id, { options: [...question.options, { id: uid('o'), content: '' }] });
  }

  protected removeOption(question: Question, id: string): void {
    if (question.options.length <= 2) {
      this.notify.warning('Вариантов должно остаться хотя бы два');
      return;
    }
    this.update(question.id, {
      options: question.options.filter((option) => option.id !== id),
      answerKey: { ...question.answerKey, correct: (question.answerKey.correct ?? []).filter((value) => value !== id) },
    });
  }

  protected isCorrect(question: Question, id: string): boolean {
    return (question.answerKey.correct ?? []).includes(id);
  }

  protected toggleCorrect(question: Question, id: string): void {
    const correct = question.answerKey.correct ?? [];
    if (question.type === 'SINGLE_CHOICE') {
      this.setKey(question, { correct: [id] });
      return;
    }
    this.setKey(question, { correct: correct.includes(id) ? correct.filter((value) => value !== id) : [...correct, id] });
  }

  protected accepted(question: Question): string[] {
    return question.answerKey.accepted ?? [''];
  }

  protected setAccepted(question: Question, index: number, value: string): void {
    this.setKey(question, { accepted: this.accepted(question).map((item, i) => (i === index ? value : item)) });
  }

  protected removeAccepted(question: Question, index: number): void {
    this.setKey(question, { accepted: this.accepted(question).filter((_, i) => i !== index) });
  }

  protected letter(index: number): string {
    return OPTION_LETTERS[index] ?? String(index + 1);
  }

  protected typeLabel(type: QuestionType): string {
    return QUESTION_TYPE_LABELS[type];
  }

  protected preview(html: string): string {
    return stripHtml(html);
  }

  protected max1(value: unknown): number {
    return Math.max(1, Number(value) || 1);
  }
}

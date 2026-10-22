import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { formatDay } from '../core/dates';
import { ClassDetail } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Rich } from '../ui/rich';
import { GRADE_TONES, QUESTION_TYPE_LABELS, WORK_STATUS_LABELS, WORK_STATUS_TONES } from './catalog';
import { QuestionType, WorkAnswer, WorkDetail } from './test-types';

const TONE_BADGE: Record<string, string> = {
  neutral: '',
  info: 'es-badge-info',
  warning: 'es-badge-warning',
  success: 'es-badge-success',
  danger: 'es-badge-danger',
};

@Component({
  selector: 'es-work-page',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, Rich],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (work(); as w) {
      <es-page [title]="w.studentName || 'Запасной бланк'" [subtitle]="w.testTitle + ' · ' + w.className + ' · ' + day(w.date)">
        <ng-container page-actions>
          <a [routerLink]="['/tests/assignments', w.assignmentId]" class="es-btn es-btn-ghost"><es-icon name="arrowLeft" [size]="18" /> к назначению</a>
          @if (w.status === 'CHECKED') {
            <button type="button" class="es-btn" [disabled]="busy()" (click)="reopen()"><es-icon name="unlock" [size]="18" /> вернуть на проверку</button>
          } @else {
            <button type="button" class="es-btn es-btn-primary" [disabled]="busy()" (click)="finalize()"><es-icon name="check" [size]="18" /> завершить и выставить оценку</button>
          }
        </ng-container>

        <div class="mb-6 flex flex-wrap items-center gap-2">
          <span class="es-badge {{ tone(statusTone(w)) }}">{{ statusLabel(w) }}</span>
          <span class="es-badge es-badge-accent">{{ total() }} из {{ w.maxScore }} баллов · {{ w.percent }}%</span>
          @if (w.variantCount > 1) {
            <span class="es-badge es-badge-info">вариант {{ w.variant }}</span>
          }
          @if (w.grade) {
            <span class="es-badge {{ tone(gradeTone(w.grade)) }}">оценка {{ w.grade }}</span>
          }
          <span class="text-xs text-faint">код {{ w.code.slice(0, 4) }}-{{ w.code.slice(4) }}</span>
        </div>

        @if (!w.studentId && students().length) {
          <section class="es-panel mb-6">
            <h2 class="es-subtitle">чья это работа?</h2>
            <p class="mb-3 text-sm text-muted">Бланк был запасным — подпишите его</p>
            <select class="es-select max-w-sm" [ngModel]="''" (ngModelChange)="assignStudent($event)" aria-label="Ученик">
              <option [ngValue]="''" disabled>выберите ученика</option>
              @for (student of students(); track student.id) {
                <option [ngValue]="student.id">{{ student.fullName }}</option>
              }
            </select>
          </section>
        }

        <div class="grid gap-6 xl:grid-cols-2">
          <div class="space-y-2">
            @for (question of w.questions; track question.id) {
              @if (answerOf(question.id); as answer) {
                <article class="bg-surface p-5">
                  <div class="mb-3 flex items-start justify-between gap-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="grid h-7 w-7 shrink-0 place-items-center bg-surface-3 text-xs font-semibold">{{ answer.number }}</span>
                      <span class="es-badge">{{ typeLabel(question.type) }}</span>
                      @if (!answer.auto) {
                        <span class="es-badge es-badge-info">проверено вручную</span>
                      }
                      @if (answer.auto && answer.confidence < 0.75 && answer.raw) {
                        <span class="es-badge es-badge-warning">прочитано неуверенно</span>
                      }
                    </div>
                    <span class="shrink-0 font-semibold tabular-nums">{{ answer.score }} / {{ answer.maxScore }}</span>
                  </div>

                  <div class="mb-3 text-[15px]" [esRich]="question.content"></div>

                  @if (question.options.length) {
                    <div class="mb-3 flex flex-wrap gap-1.5">
                      @for (option of question.options; track option.id) {
                        @let correct = (question.answerKey.correct ?? []).includes(option.id);
                        <span class="inline-flex items-center gap-1.5 border px-2 py-1 text-xs" [class]="correct ? 'border-accent text-accent-hover' : 'border-line text-muted'">
                          <span class="font-semibold">{{ option.letter }}</span>
                          <span [esRich]="option.content"></span>
                        </span>
                      }
                    </div>
                  }

                  @if (question.type === 'SHORT_ANSWER') {
                    <p class="mb-3 text-xs text-muted">Эталон: <span class="text-ink">{{ (question.answerKey.accepted ?? []).join(' / ') }}</span></p>
                  }
                  @if (question.type === 'EXTENDED' && question.answerKey.guideline) {
                    <p class="mb-3 border-l-4 border-info bg-info/10 px-3 py-2 text-sm">{{ question.answerKey.guideline }}</p>
                  }

                  <div class="flex flex-wrap items-end gap-3">
                    @if (question.type === 'EXTENDED') {
                      <div class="w-32">
                        <label class="es-label" [for]="'score-' + question.id">баллы</label>
                        <input [id]="'score-' + question.id" type="number" min="0" [max]="question.points" class="es-input" [ngModel]="answer.score" (change)="setScore(question.id, question.points, $event)" />
                      </div>
                    } @else {
                      <div class="min-w-[160px] flex-1">
                        <label class="es-label" [for]="'raw-' + question.id">ответ ученика</label>
                        <input [id]="'raw-' + question.id" class="es-input font-mono" placeholder="—" [ngModel]="answer.raw" (change)="setRaw(question.id, $event)" />
                        <p class="es-hint">Правка пересчитывает балл по ключу</p>
                      </div>
                      <div class="flex items-center gap-1.5 pb-6">
                        <button type="button" class="grid h-10 w-10 place-items-center border-2 transition-colors" [class]="answer.correct === true ? 'border-success bg-success text-white' : 'border-line text-muted hover:border-success hover:text-success'" title="Засчитать" (click)="patchAnswer(question.id, { correct: true })">
                          <es-icon name="check" [size]="18" />
                        </button>
                        <button type="button" class="grid h-10 w-10 place-items-center border-2 transition-colors" [class]="answer.correct === false ? 'border-danger bg-danger text-white' : 'border-line text-muted hover:border-danger hover:text-danger'" title="Не засчитывать" (click)="patchAnswer(question.id, { correct: false })">
                          <es-icon name="close" [size]="18" />
                        </button>
                      </div>
                    }
                  </div>

                  <label class="es-label mt-3" [for]="'comment-' + question.id">комментарий</label>
                  <textarea [id]="'comment-' + question.id" class="es-textarea !min-h-0" rows="2" placeholder="Что не так — увидите вы, когда вернётесь к работе" [ngModel]="answer.comment" (change)="setComment(question.id, $event)"></textarea>
                </article>
              }
            }
          </div>

          <div class="xl:sticky xl:top-6 xl:self-start">
            <section class="bg-surface">
              <header class="flex items-center justify-between gap-3 p-4">
                <div>
                  <h2 class="es-subtitle">скан работы</h2>
                  <p class="text-sm text-muted">{{ w.pages.length ? 'Страница ' + (page() + 1) + ' из ' + w.pages.length : 'Скана нет' }}</p>
                </div>
                @if (w.pages.length > 1) {
                  <div class="flex gap-1">
                    <button type="button" class="es-btn es-btn-ghost es-btn-icon es-btn-sm" aria-label="Предыдущая страница" (click)="page.set(max0(page() - 1))"><es-icon name="chevronLeft" [size]="16" /></button>
                    <button type="button" class="es-btn es-btn-ghost es-btn-icon es-btn-sm" aria-label="Следующая страница" (click)="page.set(minPage(page() + 1, w.pages.length))"><es-icon name="chevronRight" [size]="16" /></button>
                  </div>
                }
              </header>
              @if (w.pages[page()]; as current) {
                <a [href]="current.url" target="_blank" rel="noreferrer"><img [src]="current.url" alt="Скан бланка" class="w-full bg-white" /></a>
              } @else {
                <p class="p-8 text-center text-sm text-muted">Работа ещё не загружена. Отсканируйте бланк и загрузите его на странице назначения — или впишите ответы руками слева.</p>
              }
            </section>
            @if (w.pages.length) {
              <div class="mt-3 flex justify-end">
                <button type="button" class="es-btn es-btn-ghost es-btn-sm hover:!text-danger" (click)="reset()"><es-icon name="trash" [size]="16" /> сбросить работу</button>
              </div>
            }
          </div>
        </div>
      </es-page>
    } @else {
      <es-dots class="my-16" />
    }
  `,
})
export class WorkPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  readonly id = input.required<string>();
  protected readonly work = signal<WorkDetail | null>(null);
  protected readonly students = signal<ClassDetail['students']>([]);
  protected readonly busy = signal(false);
  protected readonly page = signal(0);
  protected readonly total = computed(() => (this.work()?.autoScore ?? 0) + (this.work()?.manualScore ?? 0));

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    try {
      const data = await this.api.get<WorkDetail>(`/works/${id}`);
      this.work.set(data);
      // Список класса нужен, чтобы подписать запасной бланк.
      if (!data.studentId) {
        try {
          const assignment = await this.api.get<{ classId: string }>(`/assignments/${data.assignmentId}`);
          const detail = await this.api.get<ClassDetail>(`/classes/${assignment.classId}`);
          this.students.set(detail.students);
        } catch {
          // Без списка просто не покажем выбор.
        }
      }
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось открыть работу');
    }
  }

  protected answerOf(questionId: string): WorkAnswer | undefined {
    return this.work()?.answers.find((item) => item.questionId === questionId);
  }

  protected async patchAnswer(questionId: string, patch: Partial<WorkAnswer>): Promise<void> {
    this.busy.set(true);
    try {
      this.work.set(await this.api.patch<WorkDetail>(`/works/${this.id()}/answers`, { questionId, ...patch }));
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось сохранить');
    } finally {
      this.busy.set(false);
    }
  }

  protected setRaw(questionId: string, event: Event): void {
    void this.patchAnswer(questionId, { raw: (event.target as HTMLInputElement).value });
  }

  protected setScore(questionId: string, points: number, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) || 0;
    void this.patchAnswer(questionId, { score: Math.max(0, Math.min(points, value)) });
  }

  protected setComment(questionId: string, event: Event): void {
    void this.patchAnswer(questionId, { comment: (event.target as HTMLTextAreaElement).value });
  }

  protected async finalize(): Promise<void> {
    this.busy.set(true);
    try {
      const updated = await this.api.post<WorkDetail>(`/works/${this.id()}/finalize`, {});
      this.work.set(updated);
      this.notify.success(`${updated.grade} · ${updated.autoScore + updated.manualScore} из ${updated.maxScore} баллов`, 'Оценка выставлена');
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось завершить проверку');
    } finally {
      this.busy.set(false);
    }
  }

  protected async reopen(): Promise<void> {
    this.busy.set(true);
    try {
      this.work.set(await this.api.post<WorkDetail>(`/works/${this.id()}/reopen`, {}));
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async assignStudent(studentId: string): Promise<void> {
    try {
      this.work.set(await this.api.patch<WorkDetail>(`/works/${this.id()}/student`, { studentId }));
      this.notify.success('Работа подписана');
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось подписать работу');
    }
  }

  protected async reset(): Promise<void> {
    const ok = await this.notify.confirm({
      title: 'Сбросить работу?',
      message: 'Сканы и распознанные ответы удалятся, работа вернётся в состояние «не сдана».',
      confirmText: 'Сбросить',
      danger: true,
    });
    if (!ok) return;
    try {
      this.work.set(await this.api.post<WorkDetail>(`/works/${this.id()}/reset`, {}));
      this.page.set(0);
      this.notify.success('Работа сброшена');
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось сбросить');
    }
  }

  protected day(date: string): string {
    return formatDay(date);
  }

  protected typeLabel(type: QuestionType): string {
    return QUESTION_TYPE_LABELS[type];
  }

  protected statusLabel(work: WorkDetail): string {
    return WORK_STATUS_LABELS[work.status];
  }

  protected statusTone(work: WorkDetail): string {
    return WORK_STATUS_TONES[work.status];
  }

  protected gradeTone(grade: number): string {
    return GRADE_TONES[grade];
  }

  protected tone(name: string): string {
    return TONE_BADGE[name] ?? '';
  }

  protected max0(value: number): number {
    return Math.max(0, value);
  }

  protected minPage(value: number, count: number): number {
    return Math.min(count - 1, value);
  }
}

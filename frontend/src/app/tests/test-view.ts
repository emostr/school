import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { formatDateTime } from '../core/dates';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { Rich } from '../ui/rich';
import { OPTION_LETTERS, QUESTION_TYPE_LABELS } from './catalog';
import { QuestionType, TestDetail } from './test-types';

@Component({
  selector: 'es-test-view',
  imports: [RouterLink, Page, Icon, Dots, Empty, Rich],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (test(); as t) {
      <es-page [title]="t.title" [subtitle]="t.description || 'Без описания'">
        <ng-container page-actions>
          <a routerLink="/tests" class="es-btn es-btn-ghost"><es-icon name="arrowLeft" [size]="18" /> к списку</a>
          @if (t.canEdit) {
            <a [routerLink]="['/tests', t.id, 'edit']" class="es-btn"><es-icon name="edit" [size]="18" /> редактировать</a>
            <button type="button" class="es-btn" [class.es-btn-primary]="!t.isPublished" [disabled]="busy()" (click)="togglePublish(t)">
              <es-icon [name]="t.isPublished ? 'slash' : 'send'" [size]="18" /> {{ t.isPublished ? 'снять с публикации' : 'опубликовать' }}
            </button>
          }
          @if (t.isPublished) {
            <a routerLink="/tests/assignments" [queryParams]="{ testId: t.id }" class="es-btn es-btn-primary"><es-icon name="calendar" [size]="18" /> назначить классу</a>
          }
        </ng-container>

        <div class="mb-6 flex flex-wrap items-center gap-2">
          <span class="es-badge" [class.es-badge-success]="t.isPublished">{{ t.isPublished ? 'опубликован' : 'черновик' }}</span>
          <span class="es-badge es-badge-accent">{{ maxScore() }} баллов</span>
          <span class="es-badge">{{ t.questions.length }} заданий</span>
          @if (t.variantCount > 1) {
            <span class="es-badge es-badge-info">{{ t.variantCount }} варианта</span>
          }
          <span class="es-badge es-badge-info">5 — от {{ t.gradeScale['5'] }}%, 4 — от {{ t.gradeScale['4'] }}%, 3 — от {{ t.gradeScale['3'] }}%</span>
          <span class="text-xs text-faint">автор {{ t.ownerName }} · изменён {{ when(t.updatedAt) }}</span>
        </div>

        @if (t.instructions) {
          <section class="es-panel mb-6">
            <h2 class="mb-2 text-sm font-semibold text-muted">инструкция на бланке</h2>
            <p class="text-sm whitespace-pre-line">{{ t.instructions }}</p>
          </section>
        }

        <div class="space-y-2">
          @for (question of t.questions; track question.id; let index = $index) {
            <article class="flex items-start gap-4 bg-surface p-5">
              <span class="grid h-9 w-9 shrink-0 place-items-center bg-surface-3 font-semibold">{{ index + 1 }}</span>
              <div class="min-w-0 flex-1">
                <div class="mb-2 flex flex-wrap items-center gap-2">
                  <span class="es-badge">{{ typeLabel(question.type) }}</span>
                  <span class="es-badge es-badge-accent">{{ question.points }} б.</span>
                  @if (t.variantCount > 1) {
                    <span class="es-badge" [class.es-badge-info]="question.variant">{{ question.variant ? 'вариант ' + question.variant : 'во всех вариантах' }}</span>
                  }
                </div>
                <div class="text-[15px]" [esRich]="question.content"></div>
                @if (question.options.length) {
                  <ul class="mt-3 space-y-1.5">
                    @for (option of question.options; track option.id; let optionIndex = $index) {
                      @let correct = (question.answerKey.correct ?? []).includes(option.id);
                      <li class="flex items-start gap-2.5 text-sm">
                        <span class="grid h-6 w-6 shrink-0 place-items-center text-xs font-semibold" [class]="correct ? 'bg-accent text-white' : 'bg-surface-3 text-muted'">{{ letter(optionIndex) }}</span>
                        <span [class]="correct ? 'font-semibold' : 'text-muted'" [esRich]="option.content"></span>
                      </li>
                    }
                  </ul>
                }
                @if (question.type === 'SHORT_ANSWER') {
                  <p class="mt-3 text-sm text-muted">
                    Ответ: <span class="font-semibold text-ink">{{ (question.answerKey.accepted ?? []).join(' / ') || '—' }}</span>{{ question.answerKey.numeric ? ' · числовой' : '' }}
                  </p>
                }
                @if (question.type === 'EXTENDED') {
                  <p class="mt-3 text-sm text-muted">Проверяется вручную. {{ question.answerKey.guideline ? 'Критерий: ' + question.answerKey.guideline : '' }}</p>
                }
              </div>
            </article>
          } @empty {
            <es-empty icon="list" title="В тесте нет заданий" />
          }
        </div>
      </es-page>
    } @else {
      <es-dots class="my-16" />
    }
  `,
})
export class TestViewPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  readonly id = input.required<string>();
  protected readonly test = signal<TestDetail | null>(null);
  protected readonly busy = signal(false);
  protected readonly maxScore = computed(() => {
    const test = this.test();
    if (!test) return 0;
    // Максимум первого варианта — у остальных он такой же.
    return test.questions.filter((q) => !q.variant || q.variant === 1).reduce((sum, q) => sum + q.points, 0);
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    try {
      this.test.set(await this.api.get<TestDetail>(`/tests/${id}`));
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось открыть тест');
    }
  }

  protected async togglePublish(test: TestDetail): Promise<void> {
    this.busy.set(true);
    try {
      this.test.set(await this.api.post<TestDetail>(`/tests/${test.id}/${test.isPublished ? 'unpublish' : 'publish'}`));
      this.notify.success(test.isPublished ? 'Снят с публикации' : 'Тест опубликован');
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected typeLabel(type: QuestionType): string {
    return QUESTION_TYPE_LABELS[type];
  }

  protected letter(index: number): string {
    return OPTION_LETTERS[index] ?? String(index + 1);
  }

  protected when(iso: string): string {
    return formatDateTime(iso);
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Notify } from '../core/notify';
import { formatDay, formatDayLong } from '../core/dates';
import { Diary, Grade } from '../core/types';
import { Page } from '../ui/page';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { PeriodSelect, Range } from './period-select';
import { averageTone, formatAverage, gradeTone, kindLabel, kindShort } from './kinds';

/**
 * Оценки ученика — его собственные или, у родителя, выбранного ребёнка.
 * По предмету в строку: все оценки за период и средний балл. Наведение на
 * оценку показывает, за что она, когда и с каким весом.
 */
@Component({
  selector: 'es-diary-page',
  imports: [Page, Dots, Empty, PeriodSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="оценки" [subtitle]="subtitle()">
      <es-period-select class="mb-6" [(value)]="range" />

      @if (diary(); as d) {
        @if (d.recent.length) {
          <section class="mb-8">
            <h2 class="es-subtitle mb-3">свежие</h2>
            <div class="flex flex-wrap gap-2">
              @for (grade of d.recent; track grade.id) {
                <div class="flex items-center gap-2 bg-surface py-1.5 pr-3 pl-1.5" [title]="title(grade)">
                  <span class="inline-grid h-9 w-9 place-items-center text-lg font-semibold {{ color(grade.value) }}" [class.underline]="grade.weight >= 3">{{ grade.value }}</span>
                  <span class="leading-tight">
                    <span class="block text-sm font-semibold">{{ grade.subject }}</span>
                    <span class="block text-xs text-muted">{{ kind(grade.kind) }} · {{ day(grade.date) }}</span>
                  </span>
                </div>
              }
            </div>
          </section>
        }

        @if (!d.subjects.length) {
          <es-empty icon="award" title="За этот период оценок нет" />
        } @else {
          <div class="divide-y divide-line border-y border-line">
            @for (row of d.subjects; track row.subject.id) {
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <span class="w-full font-semibold sm:w-56">{{ row.subject.name }}</span>
                <span class="flex min-w-0 flex-1 flex-wrap gap-1">
                  @for (grade of row.grades; track grade.id) {
                    <span
                      class="inline-grid h-8 min-w-8 place-items-center px-1 font-semibold {{ color(grade.value) }}"
                      [class.underline]="grade.weight >= 3"
                      [title]="title(grade)"
                    >{{ grade.value }}</span>
                  }
                </span>
                <span class="w-16 text-right text-xl font-light tabular-nums {{ avgTone(row.average) }}" title="средний балл">{{ avg(row.average) }}</span>
              </div>
            }
          </div>
          <p class="mt-4 text-xs text-faint">
            Средний балл взвешенный: оценка за контрольную весит больше, чем за ответ на уроке. Подчёркнуты работы с весом 3 и больше.
          </p>
        }
      } @else {
        <es-dots class="my-10" />
      }
    </es-page>
  `,
})
export class DiaryPage {
  protected readonly auth = inject(Auth);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly range = signal<Range>({ from: '', to: '' });
  protected readonly diary = signal<Diary | null>(null);
  protected readonly subtitle = computed(() => {
    const diary = this.diary();
    if (this.auth.isParent() && diary) return diary.student.fullName;
    return this.auth.profile()?.studentClass?.name ?? '';
  });

  constructor() {
    effect(() => {
      const range = this.range();
      const child = this.auth.childParam();
      untracked(() => {
        if (range.from) void this.load(range, child);
      });
    });
  }

  private async load(range: Range, child: string | undefined): Promise<void> {
    try {
      this.diary.set(await this.api.get<Diary>('/gradebook/me', { ...range, child }));
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected title(grade: Grade): string {
    return [
      `${kindLabel(grade.kind)} (${kindShort(grade.kind)}), вес ${grade.weight}`,
      formatDayLong(grade.date),
      grade.comment,
      grade.teacher?.fullName,
    ]
      .filter(Boolean)
      .join('\n');
  }

  protected color(value: number): string {
    return gradeTone(value);
  }

  protected kind(kind: Grade['kind']): string {
    return kindLabel(kind);
  }

  protected day(date: string): string {
    return formatDay(date);
  }

  protected avg(value: number | null): string {
    return formatAverage(value);
  }

  protected avgTone(value: number | null): string {
    return averageTone(value);
  }
}

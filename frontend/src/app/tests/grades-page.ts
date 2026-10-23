import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { formatDay } from '../core/dates';
import { ClassRow } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { TestsNav } from './tests-nav';
import { GRADE_TONES } from './catalog';
import { GradeRow, GradeSummary, TestSummary } from './test-types';

const TONE_BADGE: Record<string, string> = {
  info: 'es-badge-info',
  warning: 'es-badge-warning',
  success: 'es-badge-success',
  danger: 'es-badge-danger',
};

const GRADES = [
  { grade: '5', label: 'отлично', bar: 'bg-success' },
  { grade: '4', label: 'хорошо', bar: 'bg-info' },
  { grade: '3', label: 'удовлетворительно', bar: 'bg-warning' },
  { grade: '2', label: 'неудовлетворительно', bar: 'bg-danger' },
];

/** Журнал оценок по проверенным работам: фильтры, сводка, распределение, CSV. */
@Component({
  selector: 'es-grades-page',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, Empty, TestsNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="оценки за тесты" subtitle="Проверенные работы по дате, классу и тесту">
      <ng-container page-actions>
        <button type="button" class="es-btn" (click)="reload()"><es-icon name="refresh" [size]="18" /> обновить</button>
        <button type="button" class="es-btn es-btn-primary" [disabled]="!rows().length" (click)="exportCsv()"><es-icon name="download" [size]="18" /> выгрузить CSV</button>
      </ng-container>
      <es-tests-nav />

      <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label class="es-label" for="g-class">класс</label>
          <select id="g-class" class="es-select" [ngModel]="classId()" (ngModelChange)="classId.set($event)">
            <option [ngValue]="''">все классы</option>
            @for (item of classes(); track item.id) {
              <option [ngValue]="item.id">{{ item.name }}</option>
            }
          </select>
        </div>
        <div>
          <label class="es-label" for="g-test">тест</label>
          <select id="g-test" class="es-select" [ngModel]="testId()" (ngModelChange)="testId.set($event)">
            <option [ngValue]="''">все тесты</option>
            @for (item of tests(); track item.id) {
              <option [ngValue]="item.id">{{ item.title }}</option>
            }
          </select>
        </div>
        <div>
          <label class="es-label" for="g-from">с даты</label>
          <input id="g-from" type="date" class="es-input" [ngModel]="from()" (ngModelChange)="from.set($event)" />
        </div>
        <div>
          <label class="es-label" for="g-to">по дату</label>
          <input id="g-to" type="date" class="es-input" [ngModel]="to()" (ngModelChange)="to.set($event)" />
        </div>
      </div>

      @if (summary(); as s) {
        <div class="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div class="bg-accent p-4 text-white">
            <p class="text-4xl font-light">{{ s.average || '—' }}</p>
            <p class="mt-1 text-sm">средний балл · {{ s.graded }} работ</p>
          </div>
          <div class="bg-surface p-4">
            <p class="text-4xl font-light">{{ s.quality }}%</p>
            <p class="mt-1 text-sm text-muted">качество знаний — доля «5» и «4»</p>
          </div>
          <div class="bg-surface p-4">
            <p class="text-4xl font-light">{{ s.success }}%</p>
            <p class="mt-1 text-sm text-muted">успеваемость — без двоек</p>
          </div>
          <div class="bg-surface p-4">
            <p class="text-4xl font-light">{{ s.percent }}%</p>
            <p class="mt-1 text-sm text-muted">средний процент от максимума</p>
          </div>
        </div>
      }

      @if (loading()) {
        <es-dots class="my-10" />
      } @else {
        <div class="grid gap-6 xl:grid-cols-3">
          <section class="bg-surface xl:col-span-2">
            @if (rows().length) {
              <div class="overflow-x-auto">
                <table class="es-table">
                  <thead>
                    <tr><th>дата</th><th>класс</th><th>ученик</th><th class="hidden md:table-cell">тест</th><th class="!text-right">баллы</th><th class="!text-right">оценка</th></tr>
                  </thead>
                  <tbody>
                    @for (row of rows(); track row.workId) {
                      <tr>
                        <td class="text-xs whitespace-nowrap text-muted">{{ day(row.date) }}</td>
                        <td><span class="es-badge">{{ row.className }}</span></td>
                        <td>
                          <a [routerLink]="['/tests/works', row.workId]" class="font-semibold hover:text-accent-hover">{{ row.studentName }}</a>
                          <span class="block text-xs text-faint md:hidden">{{ row.testTitle }}</span>
                        </td>
                        <td class="hidden text-xs text-muted md:table-cell">{{ row.testTitle }}</td>
                        <td class="text-right tabular-nums">{{ row.score }} / {{ row.maxScore }}<span class="block text-xs text-faint">{{ row.percent }}%</span></td>
                        <td class="text-right">
                          @if (row.grade) {
                            <span class="es-badge {{ gradeTone(row.grade) }}">{{ row.grade }}</span>
                          } @else {
                            —
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <es-empty icon="award" title="Оценок пока нет" text="Здесь появятся проверенные работы: по дате, классу и тесту.">
                <a routerLink="/tests/assignments" class="es-btn">к выдачам</a>
              </es-empty>
            }
          </section>

          <section class="es-panel self-start">
            <h2 class="es-subtitle">распределение</h2>
            <p class="mb-5 text-sm text-muted">По выбранной выборке</p>
            @if (summary()?.graded) {
              <ul class="space-y-4" aria-label="Распределение оценок">
                @for (item of distribution(); track item.grade) {
                  <li [title]="item.grade + ' — ' + item.count + ' работ, ' + item.share + '%'">
                    <div class="mb-1 flex items-baseline justify-between text-sm">
                      <span><span class="font-semibold">«{{ item.grade }}»</span> <span class="text-muted">{{ item.label }}</span></span>
                      <span class="tabular-nums">{{ item.count }} <span class="text-faint">· {{ item.share }}%</span></span>
                    </div>
                    <div class="h-3 bg-surface-3">
                      <div class="h-full {{ item.bar }}" [style.width.%]="item.share"></div>
                    </div>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-sm text-muted">Нет данных</p>
            }
          </section>
        </div>
      }
    </es-page>
  `,
})
export class GradesPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly rows = signal<GradeRow[]>([]);
  protected readonly summary = signal<GradeSummary | null>(null);
  protected readonly classes = signal<ClassRow[]>([]);
  protected readonly tests = signal<TestSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly classId = signal('');
  protected readonly testId = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');

  private readonly filters = computed(() => ({ classId: this.classId(), testId: this.testId(), from: this.from(), to: this.to() }));

  protected readonly distribution = computed(() => {
    const summary = this.summary();
    const total = summary?.graded || 1;
    return GRADES.map((item) => {
      const count = summary?.distribution[item.grade] ?? 0;
      return { ...item, count, share: Math.round((count / total) * 100) };
    });
  });

  constructor() {
    effect(() => {
      const filters = this.filters();
      untracked(() => void this.load(filters));
    });
  }

  protected reload(): void {
    void this.load(this.filters());
  }

  private async load(filters: Record<string, string>): Promise<void> {
    try {
      const [journal, stats, classList, testList] = await Promise.all([
        this.api.get<GradeRow[]>('/grades', filters),
        this.api.get<GradeSummary>('/grades/summary', filters),
        this.api.get<ClassRow[]>('/classes'),
        this.api.get<TestSummary[]>('/tests'),
      ]);
      this.rows.set(journal);
      this.summary.set(stats);
      this.classes.set(classList);
      this.tests.set(testList);
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось загрузить журнал');
    } finally {
      this.loading.set(false);
    }
  }

  protected async exportCsv(): Promise<void> {
    try {
      const text = await this.api.text('/grades/export', this.filters());
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `edway-grades-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось выгрузить');
    }
  }

  protected day(date: string): string {
    return formatDay(date);
  }

  protected gradeTone(grade: number): string {
    return TONE_BADGE[GRADE_TONES[grade]] ?? '';
  }
}

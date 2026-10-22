import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { addDays, formatDayLong } from '../core/dates';
import { ScheduleChange } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';

const KIND_LABEL: Record<string, string> = { REPLACE: 'замена', CANCEL: 'отмена', ADD: 'доп. урок' };

/** Лист замен на день по всей школе — то, что вешают у учительской. */
@Component({
  selector: 'es-changes-page',
  imports: [FormsModule, Page, Icon, Dots, Empty],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="лист замен" [subtitle]="label()">
      <ng-container page-actions>
        <button type="button" class="es-btn" (click)="print()"><es-icon name="printer" [size]="18" /> печать</button>
      </ng-container>

      <div class="es-no-print mb-6 flex flex-wrap items-center gap-2">
        <button type="button" class="es-btn es-btn-icon es-btn-ghost" aria-label="Предыдущий день" (click)="shift(-1)"><es-icon name="chevronLeft" /></button>
        <input type="date" class="es-input w-auto" [ngModel]="date()" (ngModelChange)="date.set($event)" />
        <button type="button" class="es-btn es-btn-icon es-btn-ghost" aria-label="Следующий день" (click)="shift(1)"><es-icon name="chevronRight" /></button>
        <button type="button" class="es-btn es-btn-sm" (click)="date.set(school.today())">сегодня</button>
        <button type="button" class="es-btn es-btn-sm" (click)="date.set(tomorrow())">завтра</button>
      </div>

      @if (loading()) {
        <es-dots />
      } @else if (!changes().length) {
        <es-empty icon="checkCircle" title="Изменений нет" text="В этот день все уроки идут по постоянной сетке." />
      } @else {
        <div class="overflow-x-auto">
          <table class="es-table">
            <thead>
              <tr><th>класс</th><th>урок</th><th>что</th><th>предмет</th><th>учитель</th><th>кабинет</th><th>примечание</th></tr>
            </thead>
            <tbody>
              @for (row of changes(); track row.id) {
                <tr>
                  <td class="text-lg font-light">{{ row.className }}</td>
                  <td>{{ row.number }}{{ row.group ? ' (гр. ' + row.group + ')' : '' }}</td>
                  <td>
                    <span class="es-badge" [class]="row.kind === 'CANCEL' ? 'es-badge-danger' : 'es-badge-accent'">{{ kind(row.kind) }}</span>
                  </td>
                  <td>{{ row.subject?.name ?? '' }}</td>
                  <td>{{ row.teacher?.fullName ?? '' }}</td>
                  <td>{{ row.room?.name ?? '' }}</td>
                  <td class="text-sm text-muted">{{ row.note }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </es-page>
  `,
})
export class ChangesPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly school = inject(School);

  protected readonly date = signal(this.school.today());
  protected readonly changes = signal<ScheduleChange[]>([]);
  protected readonly loading = signal(true);

  constructor() {
    effect(() => {
      const date = this.date();
      untracked(() => void this.load(date));
    });
  }

  protected label(): string {
    return this.date() ? formatDayLong(this.date()) : '';
  }

  protected tomorrow(): string {
    return addDays(this.school.today(), 1);
  }

  protected shift(days: number): void {
    this.date.set(addDays(this.date(), days));
  }

  protected kind(value: string): string {
    return KIND_LABEL[value] ?? value;
  }

  protected print(): void {
    window.print();
  }

  private async load(date: string): Promise<void> {
    if (!date) return;
    this.loading.set(true);
    try {
      const result = await this.api.get<{ changes: ScheduleChange[] }>('/schedule/changes', { date });
      this.changes.set(result.changes);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.loading.set(false);
    }
  }
}

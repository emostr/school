import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { addDays, formatRange, weekStart } from '../core/dates';
import { Icon } from './icon';

/** Листалка недель: «‹ 19–25 октября › сегодня». */
@Component({
  selector: 'es-week-nav',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-1' },
  template: `
    <button type="button" class="es-btn es-btn-icon es-btn-ghost" aria-label="Предыдущая неделя" (click)="changed.emit(shift(-7))">
      <es-icon name="chevronLeft" />
    </button>
    <span class="min-w-[170px] text-center text-lg font-light">{{ label() }}</span>
    <button type="button" class="es-btn es-btn-icon es-btn-ghost" aria-label="Следующая неделя" (click)="changed.emit(shift(7))">
      <es-icon name="chevronRight" />
    </button>
    @if (!isCurrent()) {
      <button type="button" class="es-btn es-btn-sm ml-1" (click)="changed.emit(today())">сегодня</button>
    }
  `,
})
export class WeekNav {
  readonly date = input.required<string>();
  readonly today = input.required<string>();
  readonly changed = output<string>();

  protected readonly start = computed(() => weekStart(this.date()));
  protected readonly label = computed(() => formatRange(this.start(), addDays(this.start(), 6)));
  protected readonly isCurrent = computed(() => this.start() === weekStart(this.today()));

  protected shift(days: number): string {
    return addDays(this.start(), days);
  }
}

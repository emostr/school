import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { School } from '../core/school';
import { addDays } from '../core/dates';

export interface Range {
  from: string;
  to: string;
}

/**
 * Промежуток журнала: учебные периоды школы (четверти, триместры), последний
 * месяц или свои даты. По умолчанию — период, в который попадает сегодня.
 */
@Component({
  selector: 'es-period-select',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-wrap items-end gap-3' },
  template: `
    <div>
      <label class="es-label" for="period">период</label>
      <select id="period" class="es-select w-auto min-w-[180px]" [ngModel]="choice()" (ngModelChange)="pick($event)">
        @for (period of periods(); track period.title) {
          <option [ngValue]="period.title">{{ period.title }}</option>
        }
        <option ngValue="month">последний месяц</option>
        <option ngValue="custom">свои даты</option>
      </select>
    </div>
    @if (choice() === 'custom') {
      <div>
        <label class="es-label" for="range-from">с</label>
        <input id="range-from" type="date" class="es-input w-auto" [ngModel]="value().from" (ngModelChange)="value.set({ from: $event, to: value().to })" />
      </div>
      <div>
        <label class="es-label" for="range-to">по</label>
        <input id="range-to" type="date" class="es-input w-auto" [ngModel]="value().to" (ngModelChange)="value.set({ from: value().from, to: $event })" />
      </div>
    }
  `,
})
export class PeriodSelect {
  private readonly school = inject(School);
  readonly value = model<Range>({ from: '', to: '' });
  protected readonly choice = signal('month');
  /** Пока человек сам ничего не выбрал, встаём на текущий период. */
  private touched = false;
  protected readonly periods = computed(() => this.school.info()?.periods ?? []);

  constructor() {
    void this.school.loadInfo().catch(() => undefined);
    // Как только известны периоды школы — встаём на текущий.
    effect(() => {
      const periods = this.periods();
      const today = this.school.today();
      untracked(() => {
        if (this.touched) return;
        const current = periods.find((period) => period.from <= today && today <= period.to);
        this.apply(current ? current.title : 'month');
      });
    });
  }

  protected pick(choice: string): void {
    this.touched = true;
    this.apply(choice);
  }

  private apply(choice: string): void {
    if (choice === this.choice() && this.value().from) return;
    this.choice.set(choice);
    const today = this.school.today();
    if (choice === 'month') {
      this.value.set({ from: addDays(today, -30), to: today });
      return;
    }
    if (choice === 'custom') {
      if (!this.value().from) this.value.set({ from: addDays(today, -30), to: today });
      return;
    }
    const period = this.periods().find((item) => item.title === choice);
    if (period) this.value.set({ from: period.from, to: period.to });
  }
}

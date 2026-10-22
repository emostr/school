import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Плоская полоса прогресса без скруглений; цвет — по тону. */
@Component({
  selector: 'es-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (label() || showValue()) {
      <div class="mb-1 flex justify-between text-xs text-muted">
        <span>{{ label() }}</span>
        @if (showValue()) {
          <span class="tabular-nums">{{ rounded() }}%</span>
        }
      </div>
    }
    <div class="h-2 bg-surface-3">
      <div class="h-full transition-[width] duration-300" [class]="bar()" [style.width.%]="clamped()"></div>
    </div>
  `,
})
export class Progress {
  readonly value = input(0);
  readonly label = input('');
  readonly showValue = input(false);
  readonly tone = input<'accent' | 'success' | 'warning' | 'danger'>('accent');
  protected readonly clamped = computed(() => Math.max(0, Math.min(100, this.value())));
  protected readonly rounded = computed(() => Math.round(this.clamped()));
  protected readonly bar = computed(
    () => ({ accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' })[this.tone()],
  );
}

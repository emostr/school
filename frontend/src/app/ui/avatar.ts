import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Квадрат с инициалами — аватарка учётной записи в стиле плиток. */
@Component({
  selector: 'es-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-grid shrink-0 place-items-center bg-accent font-semibold text-white select-none',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[style.font-size.px]': 'size() * 0.38',
  },
  template: `{{ initials() }}`,
})
export class Avatar {
  readonly name = input('');
  readonly size = input(36);
  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );
}

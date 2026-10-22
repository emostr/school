import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from './icon';

export type TileTone = 'accent' | 'cobalt' | 'cyan' | 'teal' | 'steel' | 'indigo' | 'surface' | 'danger' | 'success';

const TONES: Record<TileTone, string> = {
  accent: 'bg-accent text-white hover:bg-accent-hover',
  cobalt: 'bg-cobalt text-white hover:brightness-110',
  cyan: 'bg-cyan text-white hover:brightness-110',
  teal: 'bg-teal text-white hover:brightness-110',
  steel: 'bg-steel text-white hover:brightness-110',
  indigo: 'bg-indigo text-white hover:brightness-110',
  surface: 'bg-surface-2 text-ink hover:bg-surface-3',
  danger: 'bg-danger text-white hover:brightness-110',
  success: 'bg-success text-white hover:brightness-110',
};

const SIZES = {
  small: 'col-span-1 row-span-1',
  wide: 'col-span-2 row-span-1',
  large: 'col-span-2 row-span-2',
} as const;

/**
 * Плитка стартового экрана Windows 8: цветной прямоугольник, иконка или
 * крупное число, подпись в левом нижнем углу. Нажатие слегка «утапливает»
 * плитку — так она отзывалась в Metro.
 */
@Component({
  selector: 'es-tile',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'hostClass()' },
  template: `
    <a
      [routerLink]="link()"
      class="relative flex h-full min-h-[128px] flex-col justify-between overflow-hidden p-4 transition-transform duration-100 select-none active:scale-[0.97] {{ toneClass() }}"
    >
      <div class="flex items-start justify-between gap-2">
        @if (count() !== null) {
          <span class="text-[44px] leading-none font-light">{{ count() }}</span>
        } @else {
          <span></span>
        }
        <es-icon [name]="icon()" [size]="size() === 'small' ? 28 : 32" [stroke]="1.6" class="opacity-90" />
      </div>
      <div class="min-w-0">
        <ng-content />
        <p class="mt-1 truncate text-[15px] font-semibold">{{ label() }}</p>
      </div>
    </a>
  `,
})
export class Tile {
  readonly label = input.required<string>();
  readonly icon = input('grid');
  readonly link = input<string | unknown[]>('/');
  readonly tone = input<TileTone>('accent');
  readonly size = input<keyof typeof SIZES>('small');
  readonly count = input<number | string | null>(null);

  protected readonly toneClass = computed(() => TONES[this.tone()]);
  protected readonly hostClass = computed(() => `block ${SIZES[this.size()]}`);
}

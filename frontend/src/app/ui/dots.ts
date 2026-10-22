import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Индикатор загрузки Windows 8: пять точек, пролетающих слева направо. */
@Component({
  selector: 'es-dots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', role: 'progressbar', 'aria-label': 'Загрузка' },
  template: `
    <div class="dots" [class.dots-inline]="inline()">
      @for (i of [0, 1, 2, 3, 4]; track i) {
        <span [style.animation-delay.ms]="i * 160"></span>
      }
    </div>
    @if (label()) {
      <p class="mt-3 text-center text-sm text-muted">{{ label() }}</p>
    }
  `,
  styles: `
    .dots {
      position: relative;
      height: 6px;
      overflow: hidden;
      width: 100%;
    }
    .dots span {
      position: absolute;
      top: 0;
      left: -10px;
      width: 6px;
      height: 6px;
      background: var(--es-accent);
      animation: fly 2.6s infinite cubic-bezier(0.2, 0.7, 0.8, 0.3);
      opacity: 0;
    }
    .dots-inline {
      width: 120px;
    }
    @keyframes fly {
      0% { left: 0; opacity: 0; }
      8% { opacity: 1; }
      30% { left: 45%; }
      60% { left: 55%; }
      85% { opacity: 1; }
      100% { left: 100%; opacity: 0; }
    }
  `,
})
export class Dots {
  readonly label = input('');
  readonly inline = input(false);
}

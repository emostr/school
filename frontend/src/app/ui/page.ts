import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Шапка страницы: крупный светлый заголовок строчными и место под кнопки. */
@Component({
  selector: 'es-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'animate-turnstile block origin-left' },
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        @if (kicker()) {
          <p class="mb-1 text-sm font-semibold text-accent-hover">{{ kicker() }}</p>
        }
        <h1 class="es-title">{{ title() }}</h1>
        @if (subtitle()) {
          <p class="mt-2 text-muted">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content select="[page-actions]" />
      </div>
    </header>
    <ng-content />
  `,
})
export class Page {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly kicker = input('');
}

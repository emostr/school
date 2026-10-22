import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ICONS } from './icons';

/** Контурная иконка 24×24 из набора ICONS: прямые углы, толщина 2. */
@Component({
  selector: 'es-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
  template: `<svg
    viewBox="0 0 24 24"
    [attr.width]="size()"
    [attr.height]="size()"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="stroke()"
    stroke-linecap="square"
    stroke-linejoin="miter"
    aria-hidden="true"
    [innerHTML]="svg()"
  ></svg>`,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);
  readonly name = input.required<string>();
  readonly size = input(20);
  readonly stroke = input(2);
  // Набор иконок — статичные строки из исходников, чужого ввода в нём нет.
  readonly svg = computed<SafeHtml>(() => this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()] ?? ''));
}

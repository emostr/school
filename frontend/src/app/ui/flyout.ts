import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { Icon } from './icon';

/**
 * Выдвижная панель справа — как «чудо-кнопки» и панели параметров Windows 8.
 * В ней живут все формы: создать класс, завести ученика, править задание.
 */
@Component({
  selector: 'es-flyout',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="animate-fade-in fixed inset-0 z-[80] bg-[var(--es-overlay)]" (click)="closed.emit()"></div>
      <aside
        class="animate-slide-in fixed top-0 right-0 bottom-0 z-[81] flex w-full flex-col border-l-4 border-accent bg-surface shadow-2xl"
        [style.max-width.px]="width()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
      >
        <header class="flex items-start gap-3 px-6 pt-6 pb-4">
          <div class="min-w-0 flex-1">
            <h2 class="text-[26px] leading-tight font-light">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="mt-1 text-sm text-muted">{{ subtitle() }}</p>
            }
          </div>
          <button type="button" class="es-btn es-btn-ghost es-btn-icon -mr-2" aria-label="Закрыть" (click)="closed.emit()">
            <es-icon name="close" />
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <ng-content />
        </div>
        <footer class="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4 empty:hidden">
          <ng-content select="[flyout-actions]" />
        </footer>
      </aside>
    }
  `,
})
export class Flyout {
  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input('');
  readonly width = input(480);
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  protected escape(): void {
    if (this.open()) {
      this.closed.emit();
    }
  }
}

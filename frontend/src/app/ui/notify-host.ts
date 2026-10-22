import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { Notify, Tone } from '../core/notify';
import { Icon } from './icon';

const TONE_ICON: Record<Tone, string> = {
  info: 'info',
  success: 'checkCircle',
  warning: 'alert',
  error: 'alert',
};

const TONE_BG: Record<Tone, string> = {
  info: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
};

/**
 * Тосты — цветные прямоугольники справа сверху, как уведомления Windows 8.
 * Окна — полоса во всю ширину экрана посреди затемнения: так в Windows 8
 * выглядели системные сообщения и вопросы.
 */
@Component({
  selector: 'es-notify-host',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pointer-events-none fixed top-3 right-3 z-[90] flex w-[min(380px,calc(100vw-24px))] flex-col gap-2" aria-live="polite">
      @for (toast of notify.toasts(); track toast.id) {
        <div class="animate-slide-in pointer-events-auto flex gap-3 p-4 text-white shadow-2xl {{ bg(toast.tone) }}" role="status">
          <es-icon [name]="icon(toast.tone)" [size]="22" class="mt-0.5" />
          <div class="min-w-0 flex-1">
            <p class="text-[15px] font-semibold leading-tight">{{ toast.title }}</p>
            <p class="mt-1 text-sm leading-snug text-white/90">{{ toast.message }}</p>
          </div>
          <button type="button" class="-m-1 h-7 w-7 shrink-0 text-white/80 hover:text-white" aria-label="Закрыть" (click)="notify.dismiss(toast.id)">
            <es-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>

    @if (notify.dialogs().at(-1); as dialog) {
      <div class="animate-fade-in fixed inset-0 z-[95] flex items-center bg-[var(--es-overlay)]" role="alertdialog" aria-modal="true" [attr.aria-label]="dialog.title">
        <div class="animate-band-in w-full py-8 {{ dialog.danger ? 'bg-danger text-white' : 'bg-accent text-white' }}">
          <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 sm:flex-row sm:items-end sm:justify-between">
            <div class="min-w-0">
              <h2 class="text-[28px] leading-tight font-light">{{ dialog.title }}</h2>
              @if (dialog.message) {
                <p class="mt-3 text-[15px] whitespace-pre-line text-white/90">{{ dialog.message }}</p>
              }
            </div>
            <div class="flex shrink-0 gap-2">
              <button type="button" class="es-btn border-white bg-white font-semibold !text-black hover:!bg-white/85" (click)="notify.close(dialog, true)" autofocus>
                {{ dialog.confirmText }}
              </button>
              @if (dialog.cancelText) {
                <button type="button" class="es-btn border-white text-white hover:!bg-white/15" (click)="notify.close(dialog, false)">
                  {{ dialog.cancelText }}
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class NotifyHost {
  protected readonly notify = inject(Notify);

  protected icon(tone: Tone): string {
    return TONE_ICON[tone];
  }

  protected bg(tone: Tone): string {
    return TONE_BG[tone];
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    const dialog = this.notify.dialogs().at(-1);
    if (dialog) {
      this.notify.close(dialog, false);
    }
  }
}

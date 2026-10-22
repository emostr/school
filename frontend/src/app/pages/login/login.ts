import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/api';
import { Icon } from '../../ui/icon';
import { Dots } from '../../ui/dots';

/**
 * Вход — экран блокировки Windows 8: крупные часы и дата на синем поле,
 * форма справа. Свободной регистрации нет: логин и временный пароль выдаёт
 * завуч (или администратор — для завучей).
 */
@Component({
  selector: 'es-login',
  imports: [FormsModule, Icon, Dots],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid min-h-dvh lg:grid-cols-[1.3fr_1fr]">
      <section class="relative hidden flex-col justify-end overflow-hidden bg-accent p-12 text-white lg:flex">
        <div class="absolute top-10 left-12 flex items-center gap-3">
          <span class="grid h-10 w-10 grid-cols-2 gap-[3px] bg-white/15 p-2">
            <span class="bg-white"></span><span class="bg-white/70"></span><span class="bg-white/70"></span><span class="bg-white/45"></span>
          </span>
          <span class="text-xl font-semibold">edway.space</span>
        </div>
        <p class="text-[120px] leading-none font-light tracking-tight tabular-nums">{{ time() }}</p>
        <p class="mt-3 text-[34px] font-light">{{ date() }}</p>
      </section>

      <section class="flex items-center justify-center bg-bg px-6 py-12">
        <div class="animate-turnstile w-full max-w-sm">
          <h1 class="es-title">{{ ticket() ? 'код из приложения' : 'вход' }}</h1>
          <p class="mt-3 text-sm text-muted">
            @if (ticket()) {
              Откройте приложение-аутентификатор и введите шесть цифр. Нет телефона под рукой — подойдёт резервный код.
            } @else {
              Логин и временный пароль выдаёт завуч или классный руководитель.
            }
          </p>

          <form class="mt-8 space-y-4" (ngSubmit)="submit()">
            @if (!ticket()) {
              <div>
                <label class="es-label" for="login">логин</label>
                <input id="login" name="login" class="es-input" autocomplete="username" autocapitalize="off" spellcheck="false" [(ngModel)]="login" required autofocus />
              </div>
              <div>
                <label class="es-label" for="password">пароль</label>
                <div class="relative">
                  <input id="password" name="password" class="es-input pr-10" [type]="showPassword() ? 'text' : 'password'" autocomplete="current-password" [(ngModel)]="password" required />
                  <button type="button" class="absolute top-0 right-0 grid h-full w-10 place-items-center text-faint hover:text-ink" [attr.aria-label]="showPassword() ? 'Скрыть пароль' : 'Показать пароль'" (click)="showPassword.set(!showPassword())">
                    <es-icon [name]="showPassword() ? 'eyeOff' : 'eye'" [size]="18" />
                  </button>
                </div>
              </div>
            } @else {
              <div>
                <label class="es-label" for="code">код</label>
                <input id="code" name="code" class="es-input text-center font-mono text-2xl tracking-[0.3em]" inputmode="numeric" autocomplete="one-time-code" [(ngModel)]="code" required autofocus maxlength="12" />
              </div>
            }

            @if (error()) {
              <p class="border-l-4 border-danger bg-danger/10 px-3 py-2 text-sm">{{ error() }}</p>
            }

            <div class="flex items-center gap-3 pt-2">
              <button type="submit" class="es-btn es-btn-primary min-w-[120px]" [disabled]="busy()">
                {{ ticket() ? 'подтвердить' : 'войти' }}
                <es-icon name="arrowRight" [size]="18" />
              </button>
              @if (ticket()) {
                <button type="button" class="es-btn es-btn-ghost" (click)="reset()">назад</button>
              }
            </div>
            @if (busy()) {
              <es-dots />
            }
          </form>
        </div>
      </section>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected login = '';
  protected password = '';
  protected code = '';
  protected readonly ticket = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  protected readonly time = signal('');
  protected readonly date = signal('');

  constructor() {
    const tick = () => {
      const now = new Date();
      this.time.set(now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
      this.date.set(now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }));
    };
    tick();
    const timer = setInterval(tick, 10_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async submit(): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      const ticket = this.ticket();
      if (ticket) {
        await this.auth.loginTotp(ticket, this.code.trim());
      } else {
        const result = await this.auth.login(this.login.trim(), this.password);
        if (result.stage === 'totp') {
          this.ticket.set(result.ticket);
          return;
        }
      }
      await this.router.navigateByUrl(this.auth.home());
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected reset(): void {
    this.ticket.set(null);
    this.code = '';
    this.error.set('');
  }
}

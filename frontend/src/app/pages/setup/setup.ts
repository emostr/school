import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { Api, errorMessage } from '../../core/api';
import { Profile } from '../../core/types';
import { Icon } from '../../ui/icon';
import { Qr } from '../../ui/qr';
import { BackupCodes } from '../../ui/backup-codes';

/**
 * Первая настройка учётной записи: сменить временный пароль, а
 * администратору и завучу — ещё и подключить второй фактор. Пока шаги не
 * пройдены, сервер не отдаёт никаких данных.
 */
@Component({
  selector: 'es-setup',
  imports: [FormsModule, Icon, Qr, BackupCodes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-12">
      <div class="animate-turnstile">
        <ol class="mb-8 flex gap-1">
          @for (step of steps(); track step.key; let i = $index) {
            <li class="h-1.5 flex-1" [class]="i <= stepIndex() ? 'bg-accent' : 'bg-surface-3'"></li>
          }
        </ol>

        @switch (view()) {
          @case ('password') {
            <h1 class="es-title">новый пароль</h1>
            <p class="mt-3 text-muted">
              Здравствуйте, {{ profile()?.firstName || profile()?.fullName }}! Временный пароль одноразовый — придумайте свой.
              Не короче 10 символов; удобно взять фразу из нескольких слов.
            </p>
            <form class="mt-8 max-w-sm space-y-4" (ngSubmit)="changePassword()">
              <div>
                <label class="es-label" for="current">временный пароль</label>
                <input id="current" name="current" type="password" class="es-input" autocomplete="current-password" [(ngModel)]="current" required />
              </div>
              <div>
                <label class="es-label" for="next">новый пароль</label>
                <input id="next" name="next" type="password" class="es-input" autocomplete="new-password" [(ngModel)]="next" required minlength="10" />
              </div>
              <div>
                <label class="es-label" for="repeat">ещё раз</label>
                <input id="repeat" name="repeat" type="password" class="es-input" autocomplete="new-password" [(ngModel)]="repeat" required />
              </div>
              @if (error()) {
                <p class="border-l-4 border-danger bg-danger/10 px-3 py-2 text-sm">{{ error() }}</p>
              }
              <button type="submit" class="es-btn es-btn-primary" [disabled]="busy()">сохранить пароль</button>
            </form>
          }

          @case ('totp') {
            <h1 class="es-title">второй фактор</h1>
            <p class="mt-3 text-muted">
              {{ profile()?.isAdmin ? 'У системного администратора' : 'У завуча' }} второй фактор обязателен. Установите приложение-аутентификатор
              (Яндекс Ключ, Google Authenticator, Aegis), отсканируйте код и введите шесть цифр из приложения.
            </p>
            @if (secret(); as s) {
              <div class="mt-8 flex flex-col gap-8 sm:flex-row sm:items-start">
                <es-qr [value]="s.otpauthUrl" [size]="190" />
                <form class="flex-1 space-y-4" (ngSubmit)="confirmTotp()">
                  <div>
                    <span class="es-label">или введите ключ вручную</span>
                    <code class="block bg-surface-2 px-3 py-2 font-mono text-sm break-all select-all">{{ s.secret }}</code>
                  </div>
                  <div>
                    <label class="es-label" for="code">код из приложения</label>
                    <input id="code" name="code" class="es-input max-w-[200px] text-center font-mono text-xl tracking-[0.3em]" inputmode="numeric" maxlength="6" autocomplete="one-time-code" [(ngModel)]="code" required />
                  </div>
                  @if (error()) {
                    <p class="border-l-4 border-danger bg-danger/10 px-3 py-2 text-sm">{{ error() }}</p>
                  }
                  <button type="submit" class="es-btn es-btn-primary" [disabled]="busy()">подключить</button>
                </form>
              </div>
            } @else {
              <button type="button" class="es-btn es-btn-primary mt-8" [disabled]="busy()" (click)="startTotp()">
                <es-icon name="shield" [size]="18" /> показать QR-код
              </button>
            }
          }

          @case ('codes') {
            <h1 class="es-title">резервные коды</h1>
            <p class="mt-3 text-muted">
              Если телефон потеряется, войти можно будет одним из этих кодов — каждый срабатывает один раз.
              Распечатайте или сохраните их там, где их не найдут другие. Больше они показаны не будут.
            </p>
            <es-backup-codes class="mt-6" [codes]="backupCodes()" />
            <button type="button" class="es-btn es-btn-primary mt-8" (click)="finish()">коды сохранены, продолжить</button>
          }
        }

        <button type="button" class="mt-12 text-sm text-faint hover:text-ink" (click)="logout()">выйти</button>
      </div>
    </div>
  `,
})
export class SetupPage {
  private readonly auth = inject(Auth);
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected readonly profile = this.auth.profile;
  protected current = '';
  protected next = '';
  protected repeat = '';
  protected code = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly secret = signal<{ secret: string; otpauthUrl: string } | null>(null);
  protected readonly backupCodes = signal<string[]>([]);

  protected readonly view = computed(() => (this.backupCodes().length ? 'codes' : this.auth.setupStep()));
  protected readonly steps = computed(() => {
    const required = this.profile()?.totpRequired;
    return required
      ? [{ key: 'password' }, { key: 'totp' }, { key: 'codes' }]
      : [{ key: 'password' }];
  });
  protected readonly stepIndex = computed(() => ['password', 'totp', 'codes'].indexOf(this.view()));

  protected async changePassword(): Promise<void> {
    this.error.set('');
    if (this.next.length < 10) {
      this.error.set('Пароль должен быть не короче 10 символов');
      return;
    }
    if (this.next !== this.repeat) {
      this.error.set('Пароли не совпадают');
      return;
    }
    await this.run(async () => {
      this.auth.setProfile(await this.api.post<Profile>('/auth/password', { currentPassword: this.current, newPassword: this.next }));
      this.current = this.next = this.repeat = '';
      if (this.auth.setupStep() === 'done') {
        await this.router.navigateByUrl(this.auth.home());
      }
    });
  }

  protected async startTotp(): Promise<void> {
    await this.run(async () => {
      this.secret.set(await this.api.post<{ secret: string; otpauthUrl: string }>('/auth/totp/setup'));
    });
  }

  protected async confirmTotp(): Promise<void> {
    await this.run(async () => {
      const result = await this.api.post<{ backupCodes: string[] }>('/auth/totp/confirm', { code: this.code.trim() });
      this.backupCodes.set(result.backupCodes);
    });
  }

  protected async finish(): Promise<void> {
    await this.auth.load();
    await this.router.navigateByUrl(this.auth.home());
  }

  protected async logout(): Promise<void> {
    await this.auth.logout().catch(() => undefined);
    await this.router.navigateByUrl('/login');
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

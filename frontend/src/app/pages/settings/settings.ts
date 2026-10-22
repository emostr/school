import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../core/auth';
import { Api, errorMessage } from '../../core/api';
import { Notify, Tone } from '../../core/notify';
import { formatDateTime } from '../../core/dates';
import { NotifyMode, Profile, Session, Theme } from '../../core/types';
import { Page } from '../../ui/page';
import { Icon } from '../../ui/icon';
import { Qr } from '../../ui/qr';
import { BackupCodes } from '../../ui/backup-codes';

type Tab = 'look' | 'security' | 'sessions';

@Component({
  selector: 'es-settings',
  imports: [FormsModule, Page, Icon, Qr, BackupCodes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="настройки" [subtitle]="profile()?.fullName + ' · ' + profile()?.login">
      <nav class="es-pivot mb-8">
        <button type="button" [class.is-active]="tab() === 'look'" (click)="tab.set('look')">оформление</button>
        <button type="button" [class.is-active]="tab() === 'security'" (click)="tab.set('security')">безопасность</button>
        <button type="button" [class.is-active]="tab() === 'sessions'" (click)="openSessions()">сеансы</button>
      </nav>

      @switch (tab()) {
        @case ('look') {
          <section class="max-w-3xl">
            <h2 class="es-subtitle">тема</h2>
            <div class="mt-4 grid max-w-xl grid-cols-2 gap-3">
              @for (option of themes; track option.value) {
                <button
                  type="button"
                  class="group border-4 p-1 text-left transition-colors"
                  [class]="auth.theme() === option.value ? 'border-accent' : 'border-transparent hover:border-line-strong'"
                  (click)="setTheme(option.value)"
                >
                  <span class="flex h-24 gap-1 p-2" [style.background]="option.bg">
                    <span class="w-6" [style.background]="option.rail"></span>
                    <span class="grid flex-1 grid-cols-3 gap-1">
                      <span class="col-span-2 bg-[#0078d7]"></span>
                      <span [style.background]="option.tile"></span>
                      <span [style.background]="option.tile"></span>
                      <span class="col-span-2 bg-[#00aba9]"></span>
                    </span>
                  </span>
                  <span class="mt-2 block px-1 pb-1 font-semibold">{{ option.label }}</span>
                </button>
              }
            </div>

            <h2 class="es-subtitle mt-12">уведомления</h2>
            <p class="mt-2 text-sm text-muted">Как сообщать о сохранении, ошибках и прочих событиях.</p>
            <div class="mt-4 space-y-2">
              @for (option of modes; track option.value) {
                <label class="flex cursor-pointer items-start gap-3 p-3 hover:bg-surface-2" [class.bg-surface-2]="auth.notifyMode() === option.value">
                  <input type="radio" name="notify" class="es-check mt-0.5 !rounded-none" [checked]="auth.notifyMode() === option.value" (change)="setMode(option.value)" />
                  <span>
                    <span class="block font-semibold">{{ option.label }}</span>
                    <span class="block text-sm text-muted">{{ option.hint }}</span>
                  </span>
                </label>
              }
            </div>
            <div class="mt-5">
              <span class="es-label">проверить</span>
              <div class="flex flex-wrap gap-2">
                @for (sample of samples; track sample.tone) {
                  <button type="button" class="es-btn es-btn-sm" (click)="test(sample.tone, sample.text)">{{ sample.label }}</button>
                }
              </div>
            </div>
          </section>
        }

        @case ('security') {
          <section class="grid max-w-5xl gap-10 lg:grid-cols-2">
            <div>
              <h2 class="es-subtitle">пароль</h2>
              <form class="mt-4 space-y-3" (ngSubmit)="changePassword()">
                <input name="current" type="password" class="es-input" placeholder="текущий пароль" autocomplete="current-password" [(ngModel)]="current" required />
                <input name="next" type="password" class="es-input" placeholder="новый пароль, от 10 символов" autocomplete="new-password" [(ngModel)]="next" required />
                <input name="repeat" type="password" class="es-input" placeholder="новый пароль ещё раз" autocomplete="new-password" [(ngModel)]="repeat" required />
                <p class="es-hint">После смены пароля остальные устройства выйдут из учётной записи.</p>
                <button type="submit" class="es-btn es-btn-primary" [disabled]="busy()">сменить пароль</button>
              </form>
            </div>

            <div>
              <h2 class="es-subtitle">второй фактор</h2>
              @if (profile()?.totpEnabled) {
                <p class="mt-4 flex items-center gap-2"><es-icon name="shieldCheck" class="text-success" /> подключён</p>
                <p class="mt-1 text-sm text-muted">Неиспользованных резервных кодов: {{ profile()?.unusedBackupCodes }}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <button type="button" class="es-btn" (click)="regenerateCodes()">новые резервные коды</button>
                  @if (!profile()?.totpRequired) {
                    <button type="button" class="es-btn es-btn-danger" (click)="disableTotp()">отключить</button>
                  }
                </div>
                @if (profile()?.totpRequired) {
                  <p class="es-hint mt-3">Для вашей учётной записи второй фактор обязателен.</p>
                }
              } @else {
                <p class="mt-4 text-sm text-muted">
                  Код из приложения на телефоне защищает вход, даже если пароль кто-то узнал. Для учеников и учителей — по желанию.
                </p>
                @if (secret(); as s) {
                  <div class="mt-5 flex flex-col gap-5 sm:flex-row">
                    <es-qr [value]="s.otpauthUrl" [size]="160" />
                    <form class="flex-1 space-y-3" (ngSubmit)="confirmTotp()">
                      <code class="block bg-surface-2 px-3 py-2 font-mono text-xs break-all select-all">{{ s.secret }}</code>
                      <input name="code" class="es-input max-w-[180px] text-center font-mono text-lg tracking-[0.3em]" inputmode="numeric" maxlength="6" placeholder="000000" [(ngModel)]="code" required />
                      <button type="submit" class="es-btn es-btn-primary" [disabled]="busy()">подключить</button>
                    </form>
                  </div>
                } @else {
                  <button type="button" class="es-btn es-btn-primary mt-4" (click)="startTotp()">подключить</button>
                }
              }
              @if (backupCodes().length) {
                <div class="mt-6">
                  <p class="mb-3 text-sm font-semibold">Сохраните резервные коды — больше они не покажутся:</p>
                  <es-backup-codes [codes]="backupCodes()" />
                </div>
              }
            </div>
          </section>
        }

        @case ('sessions') {
          <section class="max-w-4xl">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-sm text-muted">Устройства, на которых выполнен вход в вашу учётную запись.</p>
              <button type="button" class="es-btn es-btn-sm" (click)="revokeOthers()">завершить все, кроме этого</button>
            </div>
            <div class="mt-4 divide-y divide-line border-y border-line">
              @for (session of sessions(); track session.id) {
                <div class="flex items-center gap-4 py-3">
                  <es-icon [name]="isMobile(session.userAgent) ? 'smartphone' : 'monitor'" [size]="26" [stroke]="1.5" class="text-muted" />
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold">
                      {{ device(session.userAgent) }}
                      @if (session.current) {
                        <span class="es-badge es-badge-accent ml-2">это устройство</span>
                      }
                    </p>
                    <p class="truncate text-sm text-muted">{{ session.ip || 'адрес неизвестен' }} · последний раз {{ when(session.lastSeenAt) }}</p>
                  </div>
                  @if (!session.current) {
                    <button type="button" class="es-btn es-btn-sm" (click)="revoke(session)">завершить</button>
                  }
                </div>
              }
            </div>
          </section>
        }
      }
    </es-page>
  `,
})
export class SettingsPage {
  protected readonly auth = inject(Auth);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly profile = this.auth.profile;
  protected readonly tab = signal<Tab>('look');
  protected readonly busy = signal(false);
  protected readonly sessions = signal<Session[]>([]);
  protected readonly secret = signal<{ secret: string; otpauthUrl: string } | null>(null);
  protected readonly backupCodes = signal<string[]>([]);
  protected current = '';
  protected next = '';
  protected repeat = '';
  protected code = '';

  protected readonly themes: { value: Theme; label: string; bg: string; rail: string; tile: string }[] = [
    { value: 'dark', label: 'тёмная', bg: '#121212', rail: '#0a0a0a', tile: '#303030' },
    { value: 'light', label: 'светлая', bg: '#f0f0f0', rail: '#1d1d1d', tile: '#d4d4d4' },
  ];

  protected readonly modes: { value: NotifyMode; label: string; hint: string }[] = [
    { value: 'toast', label: 'Тосты', hint: 'Цветная плашка в правом верхнем углу, исчезает сама через несколько секунд.' },
    { value: 'popup', label: 'Всплывающие окна', hint: 'Полоса посреди экрана, закрывается кнопкой «OK». Труднее пропустить.' },
  ];

  protected readonly samples: { tone: Tone; label: string; text: string }[] = [
    { tone: 'success', label: 'успех', text: 'Домашнее задание опубликовано' },
    { tone: 'info', label: 'сведения', text: 'Завтра 3-й урок проходит в кабинете 204' },
    { tone: 'warning', label: 'предупреждение', text: 'Учитель в это время ведёт урок в другом классе' },
    { tone: 'error', label: 'ошибка', text: 'Нет связи с сервером. Проверьте интернет' },
  ];

  protected async setTheme(theme: Theme): Promise<void> {
    await this.auth.savePreferences({ theme }).catch((error) => this.notify.error(error));
  }

  protected async setMode(notify: NotifyMode): Promise<void> {
    await this.auth.savePreferences({ notify }).catch((error) => this.notify.error(error));
  }

  protected test(tone: Tone, text: string): void {
    this.notify.show(tone, text);
  }

  protected async changePassword(): Promise<void> {
    if (this.next !== this.repeat) {
      this.notify.error('Новые пароли не совпадают');
      return;
    }
    await this.run(async () => {
      this.auth.setProfile(await this.api.post<Profile>('/auth/password', { currentPassword: this.current, newPassword: this.next }));
      this.current = this.next = this.repeat = '';
      this.notify.success('Пароль изменён. Остальные устройства вышли из учётной записи');
    });
  }

  protected async startTotp(): Promise<void> {
    await this.run(async () => this.secret.set(await this.api.post('/auth/totp/setup')));
  }

  protected async confirmTotp(): Promise<void> {
    await this.run(async () => {
      const result = await this.api.post<{ backupCodes: string[] }>('/auth/totp/confirm', { code: this.code.trim() });
      this.backupCodes.set(result.backupCodes);
      this.secret.set(null);
      this.code = '';
      await this.auth.load();
      this.notify.success('Второй фактор подключён');
    });
  }

  protected async regenerateCodes(): Promise<void> {
    const ok = await this.notify.confirm({
      title: 'Выпустить новые резервные коды?',
      message: 'Старые коды перестанут работать.',
      confirmText: 'Выпустить',
    });
    if (!ok) return;
    await this.run(async () => {
      const result = await this.api.post<{ backupCodes: string[] }>('/auth/backup-codes');
      this.backupCodes.set(result.backupCodes);
      await this.auth.load();
    });
  }

  protected async disableTotp(): Promise<void> {
    const password = window.prompt('Чтобы отключить второй фактор, введите пароль');
    if (!password) return;
    await this.run(async () => {
      this.auth.setProfile(await this.api.post<Profile>('/auth/totp/disable', { password }));
      this.backupCodes.set([]);
      this.notify.success('Второй фактор отключён');
    });
  }

  protected async openSessions(): Promise<void> {
    this.tab.set('sessions');
    await this.run(async () => this.sessions.set(await this.api.get<Session[]>('/auth/sessions')));
  }

  protected async revoke(session: Session): Promise<void> {
    await this.run(async () => {
      await this.api.delete(`/auth/sessions/${session.id}`);
      this.sessions.update((list) => list.filter((item) => item.id !== session.id));
    });
  }

  protected async revokeOthers(): Promise<void> {
    await this.run(async () => {
      const result = await this.api.delete<{ revoked: number }>('/auth/sessions');
      this.sessions.update((list) => list.filter((item) => item.current));
      this.notify.success(`Завершено сеансов: ${result.revoked}`);
    });
  }

  protected when(iso: string): string {
    return formatDateTime(iso);
  }

  protected isMobile(agent: string): boolean {
    return /Mobile|Android|iPhone|iPad/i.test(agent);
  }

  protected device(agent: string): string {
    const browser = /Edg\//.test(agent)
      ? 'Edge'
      : /YaBrowser/.test(agent)
        ? 'Яндекс Браузер'
        : /Firefox\//.test(agent)
          ? 'Firefox'
          : /Chrome\//.test(agent)
            ? 'Chrome'
            : /Safari\//.test(agent)
              ? 'Safari'
              : 'Браузер';
    const os = /Windows/.test(agent)
      ? 'Windows'
      : /Android/.test(agent)
        ? 'Android'
        : /iPhone|iPad/.test(agent)
          ? 'iOS'
          : /Mac OS/.test(agent)
            ? 'macOS'
            : /Linux/.test(agent)
              ? 'Linux'
              : '';
    return os ? `${browser}, ${os}` : browser;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { Notify } from '../../core/notify';
import { formatDateTime } from '../../core/dates';
import { AccountRow, IssuedCredentials, Privilege } from '../../core/types';
import { Page } from '../../ui/page';
import { Icon } from '../../ui/icon';
import { Dots } from '../../ui/dots';
import { Flyout } from '../../ui/flyout';
import { Credentials } from '../../ui/credentials';
import { PRIVILEGE_LABELS, PRIVILEGE_TONES, sortPrivileges } from '../../ui/privileges';

/**
 * Администратор заводит завучей и возвращает доступ тем, кто его потерял.
 * Учебных данных он не видит: остальных пользователей заводят завучи.
 */
@Component({
  selector: 'es-admin-people',
  imports: [FormsModule, Page, Icon, Dots, Flyout, Credentials],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="завучи и доступ" subtitle="Завучи заводят всех остальных: учителей, учеников, классы">
      <ng-container page-actions>
        <button type="button" class="es-btn es-btn-primary" (click)="createOpen.set(true)"><es-icon name="userPlus" [size]="18" /> новый завуч</button>
      </ng-container>

      @if (heads().length === 0 && !loading()) {
        <div class="mb-8 border-l-4 border-accent bg-accent-soft p-5">
          <p class="text-lg font-light">Начните с завуча</p>
          <p class="mt-1 text-sm text-muted">Заведите хотя бы одного завуча и передайте ему логин с временным паролем — дальше он сам заведёт классы, учителей и учеников.</p>
        </div>
      }

      <div class="relative mb-4 max-w-sm">
        <es-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <input class="es-input pl-9" placeholder="найти любую учётную запись" [ngModel]="search()" (ngModelChange)="search.set($event)" (keyup.enter)="load()" />
      </div>

      @if (loading()) {
        <es-dots class="my-10" />
      } @else {
        <div class="overflow-x-auto">
          <table class="es-table">
            <thead>
              <tr><th>имя</th><th>логин</th><th>привилегии</th><th>второй фактор</th><th>последний вход</th><th></th></tr>
            </thead>
            <tbody>
              @for (row of visible(); track row.id) {
                <tr [class.opacity-50]="row.blocked">
                  <td class="font-semibold">{{ row.fullName }}</td>
                  <td class="font-mono text-sm">{{ row.login }}</td>
                  <td>
                    @if (row.isAdmin) {
                      <span class="es-badge es-badge-danger">администратор</span>
                    }
                    @for (privilege of sorted(row.privileges); track privilege) {
                      <span class="es-badge mr-1 {{ tone(privilege) }}">{{ label(privilege) }}</span>
                    }
                    @if (row.blocked) {
                      <span class="es-badge es-badge-danger">заблокирован</span>
                    }
                  </td>
                  <td>
                    @if (row.totpEnabled) {
                      <es-icon name="shieldCheck" [size]="18" class="text-success" />
                    } @else {
                      <span class="text-faint">—</span>
                    }
                  </td>
                  <td class="text-sm text-muted">{{ row.mustChangePassword ? 'не входил' : row.lastSeenAt ? when(row.lastSeenAt) : '—' }}</td>
                  <td class="text-right whitespace-nowrap">
                    @if (!row.isAdmin) {
                      <button type="button" class="es-btn es-btn-sm" (click)="resetPassword(row)">новый пароль</button>
                      @if (row.totpEnabled) {
                        <button type="button" class="es-btn es-btn-sm ml-1" (click)="resetTotp(row)">сбросить 2FA</button>
                      }
                      @if (!row.privileges.includes('STUDENT')) {
                        <button type="button" class="es-btn es-btn-sm ml-1" (click)="toggleHead(row)">{{ row.privileges.includes('HEAD') ? 'снять завуча' : 'сделать завучем' }}</button>
                      }
                      <button type="button" class="es-btn es-btn-sm ml-1" (click)="toggleBlock(row)">{{ row.blocked ? 'разблокировать' : 'заблокировать' }}</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (!search()) {
          <p class="mt-3 text-xs text-faint">Показаны администратор и сотрудники. Учеников ищите по фамилии или логину.</p>
        }
      }
    </es-page>

    <es-flyout [open]="createOpen()" title="новый завуч" (closed)="createOpen.set(false)">
      <form id="head-form" class="space-y-4" (ngSubmit)="create()">
        <div>
          <label class="es-label" for="h-last">фамилия</label>
          <input id="h-last" name="last" class="es-input" [(ngModel)]="lastName" required />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="es-label" for="h-first">имя</label>
            <input id="h-first" name="first" class="es-input" [(ngModel)]="firstName" required />
          </div>
          <div>
            <label class="es-label" for="h-middle">отчество</label>
            <input id="h-middle" name="middle" class="es-input" [(ngModel)]="middleName" />
          </div>
        </div>
        <div>
          <label class="es-label" for="h-subject">предмет (если ведёт уроки)</label>
          <input id="h-subject" name="subject" class="es-input" [(ngModel)]="subject" />
        </div>
        <label class="flex items-center gap-2"><input type="checkbox" name="teaches" class="es-check" [(ngModel)]="teaches" /> ещё и учитель — ведёт уроки</label>
        <p class="es-hint">При первом входе завуч сменит временный пароль и подключит второй фактор.</p>
      </form>
      <ng-container flyout-actions>
        <button type="button" class="es-btn" (click)="createOpen.set(false)">отмена</button>
        <button type="submit" form="head-form" class="es-btn es-btn-primary" [disabled]="busy()">завести</button>
      </ng-container>
    </es-flyout>

    <es-credentials [items]="issued()" (closed)="issued.set([])" />
  `,
})
export class AdminPeoplePage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly rows = signal<AccountRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly search = signal('');
  protected readonly createOpen = signal(false);
  protected readonly issued = signal<IssuedCredentials[]>([]);
  protected lastName = '';
  protected firstName = '';
  protected middleName = '';
  protected subject = '';
  protected teaches = false;

  protected readonly heads = computed(() => this.rows().filter((row) => row.privileges.includes('HEAD')));
  protected readonly visible = computed(() =>
    this.search().trim() ? this.rows() : this.rows().filter((row) => row.isAdmin || !row.privileges.includes('STUDENT')),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.rows.set(await this.api.get<AccountRow[]>('/admin/accounts', { search: this.search() }));
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.loading.set(false);
    }
  }

  protected sorted(list: Privilege[]): Privilege[] {
    return sortPrivileges(list);
  }

  protected label(privilege: Privilege): string {
    return PRIVILEGE_LABELS[privilege];
  }

  protected tone(privilege: Privilege): string {
    return PRIVILEGE_TONES[privilege];
  }

  protected when(iso: string): string {
    return formatDateTime(iso);
  }

  protected async create(): Promise<void> {
    this.busy.set(true);
    try {
      const credentials = await this.api.post<IssuedCredentials>('/admin/heads', {
        lastName: this.lastName,
        firstName: this.firstName,
        middleName: this.middleName,
        subject: this.subject,
        teaches: this.teaches,
      });
      this.createOpen.set(false);
      this.lastName = this.firstName = this.middleName = this.subject = '';
      this.teaches = false;
      this.issued.set([credentials]);
      await this.load();
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async resetPassword(row: AccountRow): Promise<void> {
    const ok = await this.notify.confirm({ title: `Выдать новый пароль: ${row.fullName}?`, confirmText: 'Выдать' });
    if (!ok) return;
    try {
      this.issued.set([await this.api.post<IssuedCredentials>(`/admin/accounts/${row.id}/reset-password`)]);
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async resetTotp(row: AccountRow): Promise<void> {
    const ok = await this.notify.confirm({
      title: `Сбросить второй фактор: ${row.fullName}?`,
      message: 'При следующем входе приложение-аутентификатор придётся подключить заново.',
      confirmText: 'Сбросить',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.post(`/admin/accounts/${row.id}/reset-totp`);
      this.notify.success('Второй фактор сброшен');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async toggleHead(row: AccountRow): Promise<void> {
    const head = !row.privileges.includes('HEAD');
    try {
      await this.api.patch(`/admin/accounts/${row.id}/head`, { head });
      this.notify.success(head ? `${row.fullName} теперь завуч` : `${row.fullName} больше не завуч`);
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async toggleBlock(row: AccountRow): Promise<void> {
    try {
      await this.api.post(`/admin/accounts/${row.id}/${row.blocked ? 'unblock' : 'block'}`);
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }
}

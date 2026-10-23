import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { formatDateTime, plural } from '../core/dates';
import { AccountRow, IssuedCredentials, Privilege } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Flyout } from '../ui/flyout';
import { Credentials } from '../ui/credentials';
import { PRIVILEGE_LABELS, PRIVILEGE_TONES, sortPrivileges } from '../ui/privileges';

type Filter = '' | 'STUDENT' | 'STAFF' | 'HEAD' | 'PARENT';

interface Form {
  id: string | null;
  lastName: string;
  firstName: string;
  middleName: string;
  subject: string;
  kind: 'student' | 'staff' | 'parent';
  teacher: boolean;
  head: boolean;
  trusted: boolean;
  classId: string;
  children: { id: string; fullName: string; className: string | null }[];
}

const emptyForm = (): Form => ({
  id: null,
  lastName: '',
  firstName: '',
  middleName: '',
  subject: '',
  kind: 'staff',
  teacher: true,
  head: false,
  trusted: false,
  classId: '',
  children: [],
});

@Component({
  selector: 'es-people-page',
  imports: [FormsModule, Page, Icon, Dots, Flyout, Credentials],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="люди" [subtitle]="summary()">
      <ng-container page-actions>
        <button type="button" class="es-btn es-btn-primary" (click)="openCreate()"><es-icon name="userPlus" [size]="18" /> новая учётная запись</button>
      </ng-container>

      <div class="mb-5 flex flex-wrap items-center gap-3">
        <nav class="es-pivot mr-4">
          @for (option of filters; track option.value) {
            <button type="button" [class.is-active]="filter() === option.value" (click)="filter.set(option.value)">{{ option.label }}</button>
          }
        </nav>
        <div class="relative min-w-[220px] flex-1 sm:max-w-sm">
          <es-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input class="es-input pl-9" placeholder="фамилия или логин" [ngModel]="search()" (ngModelChange)="search.set($event)" />
        </div>
      </div>

      @if (loading()) {
        <es-dots class="my-10" />
      } @else {
        <div class="overflow-x-auto">
          <table class="es-table">
            <thead>
              <tr><th>имя</th><th>логин</th><th>привилегии</th><th>класс</th><th>вход</th><th></th></tr>
            </thead>
            <tbody>
              @for (row of visible(); track row.id) {
                <tr [class.opacity-50]="row.blocked">
                  <td>
                    <span class="font-semibold">{{ row.fullName }}</span>
                    @if (row.subject) {
                      <span class="block text-xs text-muted">{{ row.subject }}</span>
                    }
                  </td>
                  <td class="font-mono text-sm">{{ row.login }}</td>
                  <td>
                    <span class="flex flex-wrap gap-1">
                      @for (privilege of sorted(row.privileges); track privilege) {
                        <span class="es-badge {{ tone(privilege) }}">{{ label(privilege) }}</span>
                      }
                      @for (cls of row.homeroomClasses; track cls.id) {
                        <span class="es-badge">классный {{ cls.name }}</span>
                      }
                    </span>
                  </td>
                  <td>
                    {{ row.studentClass?.name ?? '' }}
                    @for (child of row.children; track child.id) {
                      <span class="block text-xs text-muted">→ {{ child.fullName }}{{ child.className ? ', ' + child.className : '' }}</span>
                    }
                  </td>
                  <td class="text-xs text-muted">
                    @if (row.blocked) {
                      <span class="es-badge es-badge-danger">заблокирован</span>
                    } @else if (row.mustChangePassword) {
                      не входил
                    } @else {
                      {{ row.lastSeenAt ? when(row.lastSeenAt) : '—' }}
                      @if (row.totpEnabled) {
                        <es-icon name="shieldCheck" [size]="14" class="ml-1 align-[-2px] text-success" />
                      }
                    }
                  </td>
                  <td class="text-right whitespace-nowrap">
                    <button type="button" class="es-btn es-btn-sm es-btn-ghost es-btn-icon" title="Править" (click)="openEdit(row)"><es-icon name="edit" [size]="16" /></button>
                    <button type="button" class="es-btn es-btn-sm es-btn-ghost es-btn-icon" title="Новый пароль" (click)="resetPassword(row)"><es-icon name="key" [size]="16" /></button>
                    <button type="button" class="es-btn es-btn-sm es-btn-ghost es-btn-icon" title="Ещё" (click)="menu.set(menu() === row.id ? null : row.id)"><es-icon name="more" [size]="16" /></button>
                    @if (menu() === row.id) {
                      <div class="relative">
                        <div class="absolute right-0 z-20 mt-1 w-56 border-2 border-line bg-surface text-left shadow-2xl">
                          @if (row.totpEnabled) {
                            <button type="button" class="block w-full px-3 py-2 text-sm hover:bg-surface-3" (click)="resetTotp(row)">сбросить второй фактор</button>
                          }
                          @if (row.studentClass) {
                            <button type="button" class="block w-full px-3 py-2 text-sm hover:bg-surface-3" (click)="openMove(row)">перевести в другой класс</button>
                          }
                          @if (row.id !== auth.profile()?.id) {
                            <button type="button" class="block w-full px-3 py-2 text-sm hover:bg-surface-3" (click)="toggleBlock(row)">{{ row.blocked ? 'разблокировать' : 'заблокировать' }}</button>
                            <button type="button" class="block w-full px-3 py-2 text-sm text-danger hover:bg-surface-3" (click)="remove(row)">удалить</button>
                          }
                        </div>
                      </div>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="py-10 text-center text-muted">Никого не нашлось</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </es-page>

    <es-flyout [open]="!!form()" [title]="form()?.id ? 'правка учётной записи' : 'новая учётная запись'" [width]="560" (closed)="form.set(null)">
      @if (form(); as f) {
        <form id="account-form" class="space-y-4" (ngSubmit)="save()">
          @if (!f.id) {
            <div class="grid grid-cols-3 gap-1">
              <button type="button" class="es-btn" [class.es-btn-primary]="f.kind === 'staff'" (click)="f.kind = 'staff'">сотрудник</button>
              <button type="button" class="es-btn" [class.es-btn-primary]="f.kind === 'student'" (click)="f.kind = 'student'">ученик</button>
              <button type="button" class="es-btn" [class.es-btn-primary]="f.kind === 'parent'" (click)="f.kind = 'parent'">родитель</button>
            </div>
          }
          <div>
            <label class="es-label" for="acc-last">фамилия</label>
            <input id="acc-last" name="last" class="es-input" [(ngModel)]="f.lastName" required />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="es-label" for="acc-first">имя</label>
              <input id="acc-first" name="first" class="es-input" [(ngModel)]="f.firstName" required />
            </div>
            <div>
              <label class="es-label" for="acc-middle">отчество</label>
              <input id="acc-middle" name="middle" class="es-input" [(ngModel)]="f.middleName" />
            </div>
          </div>

          @if (f.kind === 'staff') {
            <div>
              <span class="es-label">привилегии</span>
              <label class="flex items-center gap-2 py-1"><input type="checkbox" name="teacher" class="es-check" [(ngModel)]="f.teacher" /> учитель — уроки, посещаемость по своим предметам, тесты</label>
              <label class="flex items-center gap-2 py-1"><input type="checkbox" name="head" class="es-check" [(ngModel)]="f.head" /> завуч — всё по школе, заводит учётные записи</label>
              @if (f.head) {
                <p class="es-hint">Завучу при первом входе потребуется подключить второй фактор.</p>
              }
            </div>
            <div>
              <label class="es-label" for="acc-subject">предмет (подпись)</label>
              <input id="acc-subject" name="subject" class="es-input" placeholder="например: математика и информатика" [(ngModel)]="f.subject" />
            </div>
          } @else if (f.kind === 'student') {
            @if (!f.id) {
              <div>
                <label class="es-label" for="acc-class">класс</label>
                <select id="acc-class" name="class" class="es-select" [(ngModel)]="f.classId" required>
                  <option [ngValue]="''" disabled>выберите класс</option>
                  @for (item of school.classes(); track item.id) {
                    <option [ngValue]="item.id">{{ item.name }}</option>
                  }
                </select>
              </div>
            }
            <label class="flex items-center gap-2"><input type="checkbox" name="trusted" class="es-check" [(ngModel)]="f.trusted" /> доверенный ученик — публикует задания и конспекты класса</label>
          }
          @if (f.kind === 'parent' || (f.id && f.kind === 'staff')) {
            <div>
              <span class="es-label">{{ f.kind === 'parent' ? 'дети' : 'дети в школе (если сотрудник — ещё и родитель)' }}</span>
              @for (child of f.children; track child.id) {
                <div class="mb-1 flex items-center justify-between gap-2 bg-surface-2 px-3 py-2 text-sm">
                  <span>{{ child.fullName }}{{ child.className ? ', ' + child.className : '' }}</span>
                  <button type="button" class="text-faint hover:text-danger" title="Отвязать" (click)="removeChild(f, child.id)"><es-icon name="close" [size]="16" /></button>
                </div>
              }
              <div class="relative mt-2">
                <es-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
                <input name="child-search" class="es-input pl-9" placeholder="найти ученика по фамилии" [ngModel]="childSearch()" (ngModelChange)="searchChildren($event)" />
              </div>
              @for (found of childResults(); track found.id) {
                <button type="button" class="block w-full border-b border-line px-3 py-2 text-left text-sm hover:bg-surface-3" (click)="addChild(f, found)">
                  {{ found.fullName }} <span class="text-faint">{{ found.studentClass?.name ?? '' }}</span>
                </button>
              }
            </div>
          }
          @if (!f.id) {
            <p class="es-hint">Логин составится из фамилии и инициалов, временный пароль покажем после сохранения.</p>
          }
        </form>
      }
      <ng-container flyout-actions>
        <button type="button" class="es-btn" (click)="form.set(null)">отмена</button>
        <button type="submit" form="account-form" class="es-btn es-btn-primary" [disabled]="busy()">{{ form()?.id ? 'сохранить' : 'завести' }}</button>
      </ng-container>
    </es-flyout>

    <es-flyout [open]="!!moving()" title="перевод в другой класс" [subtitle]="moving()?.fullName ?? ''" (closed)="moving.set(null)">
      <select class="es-select" [(ngModel)]="moveTo" aria-label="Класс">
        @for (item of school.classes(); track item.id) {
          <option [ngValue]="item.id">{{ item.name }}</option>
        }
      </select>
      <p class="es-hint mt-2">Прежнее место ученика с отметками и работами останется в архиве старого класса.</p>
      <ng-container flyout-actions>
        <button type="button" class="es-btn" (click)="moving.set(null)">отмена</button>
        <button type="button" class="es-btn es-btn-primary" (click)="move()">перевести</button>
      </ng-container>
    </es-flyout>

    <es-credentials [items]="issued()" (closed)="issued.set([])" />
  `,
})
export class PeoplePage {
  protected readonly auth = inject(Auth);
  protected readonly school = inject(School);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly filters: { value: Filter; label: string }[] = [
    { value: '', label: 'все' },
    { value: 'STAFF', label: 'сотрудники' },
    { value: 'HEAD', label: 'завучи' },
    { value: 'STUDENT', label: 'ученики' },
    { value: 'PARENT', label: 'родители' },
  ];
  protected readonly rows = signal<AccountRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly filter = signal<Filter>('STAFF');
  protected readonly search = signal('');
  protected readonly menu = signal<string | null>(null);
  protected readonly form = signal<Form | null>(null);
  protected readonly issued = signal<IssuedCredentials[]>([]);
  protected readonly moving = signal<AccountRow | null>(null);
  protected readonly childSearch = signal('');
  protected readonly childResults = signal<AccountRow[]>([]);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  protected moveTo = '';

  protected readonly visible = computed(() => {
    const needle = this.search().trim().toLowerCase();
    return needle
      ? this.rows().filter((row) => row.fullName.toLowerCase().includes(needle) || row.login.includes(needle))
      : this.rows();
  });
  protected readonly summary = computed(() => {
    const n = this.rows().length;
    return n ? `${n} ${plural(n, 'учётная запись', 'учётные записи', 'учётных записей')}` : '';
  });

  constructor() {
    void this.school.loadClasses().catch(() => undefined);
    effect(() => {
      const filter = this.filter();
      untracked(() => void this.load(filter));
    });
  }

  private async load(filter: Filter = this.filter()): Promise<void> {
    this.loading.set(!this.rows().length);
    try {
      this.rows.set(await this.api.get<AccountRow[]>('/accounts', { privilege: filter }));
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

  protected openCreate(): void {
    this.childSearch.set('');
    this.childResults.set([]);
    this.form.set(emptyForm());
  }

  protected searchChildren(value: string): void {
    this.childSearch.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (value.trim().length < 2) {
      this.childResults.set([]);
      return;
    }
    this.searchTimer = setTimeout(async () => {
      try {
        const rows = await this.api.get<AccountRow[]>('/accounts', { privilege: 'STUDENT', search: value.trim() });
        this.childResults.set(rows.slice(0, 8));
      } catch {
        this.childResults.set([]);
      }
    }, 250);
  }

  /** У новой записи дети копятся в форме, у существующей — привязываются сразу. */
  protected async addChild(form: Form, child: AccountRow): Promise<void> {
    if (form.children.some((item) => item.id === child.id)) return;
    const entry = { id: child.id, fullName: child.fullName, className: child.studentClass?.name ?? null };
    if (form.id) {
      try {
        await this.api.post(`/accounts/${form.id}/children`, { childId: child.id });
        await this.load();
      } catch (error) {
        this.notify.error(error);
        return;
      }
    }
    form.children = [...form.children, entry];
    this.childSearch.set('');
    this.childResults.set([]);
  }

  protected async removeChild(form: Form, childId: string): Promise<void> {
    if (form.id) {
      try {
        await this.api.delete(`/accounts/${form.id}/children/${childId}`);
        await this.load();
      } catch (error) {
        this.notify.error(error);
        return;
      }
    }
    form.children = form.children.filter((item) => item.id !== childId);
  }

  protected openEdit(row: AccountRow): void {
    this.menu.set(null);
    const student = row.privileges.includes('STUDENT');
    const staff = row.privileges.some((p) => p === 'TEACHER' || p === 'HEAD');
    this.childSearch.set('');
    this.childResults.set([]);
    this.form.set({
      id: row.id,
      lastName: row.lastName,
      firstName: row.firstName,
      middleName: row.middleName,
      subject: row.subject,
      kind: student ? 'student' : staff ? 'staff' : 'parent',
      teacher: row.privileges.includes('TEACHER'),
      head: row.privileges.includes('HEAD'),
      trusted: row.privileges.includes('TRUSTED'),
      classId: row.studentClass?.id ?? '',
      children: row.children,
    });
  }

  private privilegesOf(form: Form): Privilege[] {
    if (form.kind === 'student') return form.trusted ? ['STUDENT', 'TRUSTED'] : ['STUDENT'];
    if (form.kind === 'parent') return ['PARENT'];
    const list: Privilege[] = [];
    if (form.teacher) list.push('TEACHER');
    if (form.head) list.push('HEAD');
    if (form.children.length) list.push('PARENT');
    return list;
  }

  protected async save(): Promise<void> {
    const form = this.form();
    if (!form) return;
    const privileges = this.privilegesOf(form);
    if (!privileges.length) {
      this.notify.error('Отметьте хотя бы одну привилегию');
      return;
    }
    if (form.kind === 'parent' && !form.id && !form.children.length) {
      this.notify.error('Выберите хотя бы одного ребёнка');
      return;
    }
    this.busy.set(true);
    try {
      const body = {
        lastName: form.lastName,
        firstName: form.firstName,
        middleName: form.middleName,
        subject: form.subject,
        privileges,
      };
      if (form.id) {
        await this.api.patch(`/accounts/${form.id}`, body);
        this.notify.success('Сохранено');
      } else {
        const credentials = await this.api.post<IssuedCredentials>('/accounts', {
          ...body,
          ...(form.kind === 'student' ? { classId: form.classId } : {}),
          ...(form.kind === 'parent' ? { childIds: form.children.map((child) => child.id) } : {}),
        });
        this.issued.set([credentials]);
      }
      this.form.set(null);
      await this.load();
      await this.school.loadStaff(true).catch(() => undefined);
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async resetPassword(row: AccountRow): Promise<void> {
    this.menu.set(null);
    const ok = await this.notify.confirm({
      title: `Выдать новый пароль: ${row.fullName}?`,
      message: 'Старый пароль перестанет работать, все устройства выйдут из учётной записи.',
      confirmText: 'Выдать',
    });
    if (!ok) return;
    try {
      this.issued.set([await this.api.post<IssuedCredentials>(`/accounts/${row.id}/reset-password`)]);
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async resetTotp(row: AccountRow): Promise<void> {
    this.menu.set(null);
    const ok = await this.notify.confirm({
      title: `Сбросить второй фактор: ${row.fullName}?`,
      message: 'Так делают, если потерян телефон. При следующем входе приложение-аутентификатор подключается заново.',
      confirmText: 'Сбросить',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.post(`/accounts/${row.id}/reset-totp`);
      this.notify.success('Второй фактор сброшен');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async toggleBlock(row: AccountRow): Promise<void> {
    this.menu.set(null);
    try {
      await this.api.post(`/accounts/${row.id}/${row.blocked ? 'unblock' : 'block'}`);
      this.notify.success(row.blocked ? 'Учётная запись разблокирована' : 'Учётная запись заблокирована');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected openMove(row: AccountRow): void {
    this.menu.set(null);
    this.moveTo = row.studentClass?.id ?? '';
    this.moving.set(row);
  }

  protected async move(): Promise<void> {
    const row = this.moving();
    if (!row) return;
    try {
      await this.api.post(`/accounts/${row.id}/move`, { classId: this.moveTo });
      this.moving.set(null);
      this.notify.success('Ученик переведён');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async remove(row: AccountRow): Promise<void> {
    this.menu.set(null);
    const ok = await this.notify.confirm({
      title: `Удалить ${row.fullName}?`,
      message: 'Вход закроется, логин освободится. Отметки, работы и авторство заданий останутся в архиве.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/accounts/${row.id}`);
      this.notify.success('Учётная запись удалена');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }
}

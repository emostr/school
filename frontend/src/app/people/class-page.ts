import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { plural } from '../core/dates';
import { ClassDetail, ClassStudent, IssuedCredentials } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { Flyout } from '../ui/flyout';
import { Credentials } from '../ui/credentials';

@Component({
  selector: 'es-class-page',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, Empty, Flyout, Credentials],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (detail(); as d) {
      <es-page [title]="d.name" [kicker]="d.archivedAt ? 'класс в архиве' : 'класс'" [subtitle]="(d.homeroom?.fullName ?? 'без классного руководителя') + ' · ' + d.students.length + ' ' + pupils(d.students.length)">
        <ng-container page-actions>
          <a routerLink="/schedule" [queryParams]="{ class: d.id }" class="es-btn"><es-icon name="calendar" [size]="18" /> расписание</a>
          <a routerLink="/attendance" [queryParams]="{ class: d.id, tab: 'sheet' }" class="es-btn"><es-icon name="userCheck" [size]="18" /> табель</a>
          @if (auth.isHead() && !d.archivedAt) {
            <button type="button" class="es-btn" (click)="homeroomOpen.set(true)"><es-icon name="user" [size]="18" /> классный</button>
            <button type="button" class="es-btn es-btn-primary" (click)="importOpen.set(true)"><es-icon name="userPlus" [size]="18" /> добавить учеников</button>
          }
        </ng-container>

        @if (!d.students.length) {
          <es-empty icon="users" title="В классе пока нет учеников" [text]="auth.isHead() ? 'Вставьте список колонкой из журнала — каждому ученику заведётся учётная запись.' : 'Учеников добавляет завуч.'" />
        } @else {
          <div class="overflow-x-auto">
            <table class="es-table">
              <thead>
                <tr>
                  <th class="w-10">№</th>
                  <th>ученик</th>
                  @if (d.canManage) {
                    <th>логин</th>
                  }
                  <th>подгруппа</th>
                  <th>доверенный</th>
                  @if (d.canManage) {
                    <th></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (student of d.students; track student.id; let i = $index) {
                  <tr>
                    <td class="text-faint">{{ i + 1 }}</td>
                    <td>
                      {{ student.fullName }}
                      @if (student.blocked) {
                        <span class="es-badge es-badge-danger ml-1">заблокирован</span>
                      } @else if (student.mustChangePassword) {
                        <span class="es-badge ml-1" title="Ещё не входил: пароль временный">не входил</span>
                      }
                    </td>
                    @if (d.canManage) {
                      <td class="font-mono text-sm">{{ student.login }}</td>
                    }
                    <td>
                      @if (d.canManage && student.accountId) {
                        <select class="es-select !min-h-8 w-24 !py-0 text-sm" [ngModel]="student.group" (ngModelChange)="setGroup(student, $event)" aria-label="Подгруппа">
                          <option value="">—</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                        </select>
                      } @else {
                        {{ student.group || '—' }}
                      }
                    </td>
                    <td>
                      @if (d.canManage && student.accountId) {
                        <input type="checkbox" class="es-switch" [checked]="student.trusted" (change)="setTrusted(student)" [attr.aria-label]="'Доверенный: ' + student.fullName" />
                      } @else if (student.trusted) {
                        <span class="es-badge es-badge-info">да</span>
                      }
                    </td>
                    @if (d.canManage) {
                      <td class="text-right">
                        @if (student.accountId) {
                          <button type="button" class="es-btn es-btn-sm" (click)="resetPassword(student)">новый пароль</button>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="mt-4 text-xs text-faint">
            Доверенные ученики публикуют задания и конспекты своего класса. Подгруппы нужны для делёных уроков — иностранного языка, информатики.
          </p>
        }

        @if (auth.isHead() && !d.archivedAt) {
          <section class="mt-12 border-t border-line pt-6">
            <h2 class="es-subtitle mb-3">управление классом</h2>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="es-btn" (click)="promote()"><es-icon name="arrowUpRight" [size]="18" /> перевести в {{ d.number + 1 > 11 ? 'выпуск' : d.number + 1 + d.letter }}</button>
              <button type="button" class="es-btn es-btn-danger" (click)="remove()"><es-icon name="archive" [size]="18" /> {{ d.students.length ? 'удалить' : 'удалить или убрать в архив' }}</button>
            </div>
          </section>
        }
      </es-page>

      <es-flyout [open]="importOpen()" title="добавить учеников" [subtitle]="'класс ' + d.name" [width]="560" (closed)="importOpen.set(false)">
        <p class="mb-3 text-sm text-muted">
          Вставьте список колонкой: «Фамилия Имя Отчество» на строку. Номера по журналу можно не убирать. Уже заведённые ученики пропускаются.
        </p>
        <textarea class="es-textarea font-mono text-sm" rows="16" placeholder="1. Иванов Пётр Сергеевич&#10;2. Петрова Анна Ильинична" [ngModel]="importText()" (ngModelChange)="importText.set($event)"></textarea>
        <p class="es-hint">{{ importCount() }}</p>
        <ng-container flyout-actions>
          <button type="button" class="es-btn" (click)="importOpen.set(false)">отмена</button>
          <button type="button" class="es-btn es-btn-primary" [disabled]="busy()" (click)="importStudents()">завести учётные записи</button>
        </ng-container>
      </es-flyout>

      <es-flyout [open]="homeroomOpen()" title="классный руководитель" [subtitle]="'класс ' + d.name" (closed)="homeroomOpen.set(false)">
        <select class="es-select" [(ngModel)]="homeroomId" aria-label="Классный руководитель">
          <option [ngValue]="''">без классного руководителя</option>
          @for (person of school.staff(); track person.id) {
            <option [ngValue]="person.id">{{ person.fullName }}</option>
          }
        </select>
        <p class="es-hint mt-2">Классный руководитель правит расписание класса, отмечает посещаемость по всем предметам и назначает доверенных учеников.</p>
        <ng-container flyout-actions>
          <button type="button" class="es-btn" (click)="homeroomOpen.set(false)">отмена</button>
          <button type="button" class="es-btn es-btn-primary" (click)="saveHomeroom()">сохранить</button>
        </ng-container>
      </es-flyout>
    } @else {
      <es-dots class="my-16" />
    }

    <es-credentials [items]="issued()" title="новые учётные записи" (closed)="issued.set([])" />
  `,
})
export class ClassPage {
  protected readonly auth = inject(Auth);
  protected readonly school = inject(School);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly detail = signal<ClassDetail | null>(null);
  protected readonly issued = signal<IssuedCredentials[]>([]);
  protected readonly importOpen = signal(false);
  protected readonly homeroomOpen = signal(false);
  protected readonly busy = signal(false);
  protected readonly importText = signal('');
  protected homeroomId = '';

  protected readonly importCount = computed(() => {
    const count = this.importText().split('\n').filter((line) => line.trim()).length;
    return count ? `${count} ${plural(count, 'строка', 'строки', 'строк')}` : '';
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
    if (this.auth.isHead()) void this.school.loadStaff().catch(() => undefined);
  }

  private async load(id: string): Promise<void> {
    try {
      const detail = await this.api.get<ClassDetail>(`/classes/${id}`);
      this.detail.set(detail);
      this.homeroomId = detail.homeroom?.id ?? '';
    } catch (error) {
      this.notify.error(error);
      await this.router.navigateByUrl('/classes');
    }
  }

  private reload(): Promise<void> {
    return this.load(this.id());
  }

  protected pupils(n: number): string {
    return plural(n, 'ученик', 'ученика', 'учеников');
  }

  protected async setGroup(student: ClassStudent, group: string): Promise<void> {
    try {
      await this.api.patch(`/accounts/${student.accountId}/group`, { group });
      await this.reload();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async setTrusted(student: ClassStudent): Promise<void> {
    try {
      await this.api.patch(`/accounts/${student.accountId}/trusted`, { trusted: !student.trusted });
      this.notify.success(student.trusted ? `${student.fullName} больше не доверенный` : `${student.fullName} теперь доверенный ученик`);
      await this.reload();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async resetPassword(student: ClassStudent): Promise<void> {
    const ok = await this.notify.confirm({
      title: `Выдать ${student.fullName} новый пароль?`,
      message: 'Старый пароль перестанет работать, ученик выйдет со всех устройств.',
      confirmText: 'Выдать',
    });
    if (!ok) return;
    try {
      const credentials = await this.api.post<IssuedCredentials>(`/accounts/${student.accountId}/reset-password`);
      this.issued.set([{ ...credentials, className: this.detail()?.name }]);
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async importStudents(): Promise<void> {
    const lines = this.importText().split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      this.notify.error('Список пуст');
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.api.post<{ created: IssuedCredentials[]; skipped: string[] }>('/accounts/import', {
        classId: this.id(),
        lines,
      });
      this.importOpen.set(false);
      this.importText.set('');
      if (result.skipped.length) {
        this.notify.warning(`Пропущено строк: ${result.skipped.length} (уже в классе или без имени)`);
      }
      this.issued.set(result.created);
      await this.reload();
      await this.school.loadClasses(true);
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async saveHomeroom(): Promise<void> {
    try {
      await this.api.patch(`/classes/${this.id()}/homeroom`, { homeroomId: this.homeroomId || null });
      this.homeroomOpen.set(false);
      this.notify.success('Классный руководитель назначен');
      await this.reload();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async promote(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const next = d.number + 1 > 11 ? 'выпустить (класс уйдёт в архив)' : `перевести в ${d.number + 1}${d.letter}`;
    const ok = await this.notify.confirm({
      title: `${d.name}: ${next}?`,
      message: 'История класса — расписание, задания, посещаемость, работы — останется в архиве у прежней записи.',
      confirmText: 'Да',
    });
    if (!ok) return;
    try {
      await this.api.post(`/classes/${d.id}/promote`, {});
      this.notify.success('Готово');
      await this.school.loadClasses(true);
      await this.router.navigateByUrl('/classes');
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async remove(): Promise<void> {
    const d = this.detail();
    if (!d) return;
    const ok = await this.notify.confirm({
      title: `Удалить класс ${d.name}?`,
      message: 'Если у класса есть история, он уйдёт в архив. Класс с учениками удалить нельзя — сначала переведите их.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/classes/${d.id}`);
      await this.school.loadClasses(true);
      await this.router.navigateByUrl('/classes');
    } catch (error) {
      this.notify.error(error);
    }
  }
}

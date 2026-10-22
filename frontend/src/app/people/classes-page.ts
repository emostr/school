import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { plural } from '../core/dates';
import { ClassRow } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { Flyout } from '../ui/flyout';

const LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('');

@Component({
  selector: 'es-classes-page',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, Empty, Flyout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="классы" [subtitle]="summary()">
      @if (auth.isHead()) {
        <ng-container page-actions>
          <button type="button" class="es-btn" (click)="promoteAll()"><es-icon name="arrowUpRight" [size]="18" /> новый учебный год</button>
          <button type="button" class="es-btn es-btn-primary" (click)="openCreate()"><es-icon name="plus" [size]="18" /> новый класс</button>
        </ng-container>
      }
      @if (auth.isHead()) {
        <label class="mb-5 flex w-fit items-center gap-2 text-sm text-muted">
          <input type="checkbox" class="es-switch" [checked]="archived()" (change)="toggleArchived()" /> показывать архив
        </label>
      }

      @if (loading()) {
        <es-dots class="my-10" />
      } @else {
        @for (group of groups(); track group.number) {
          <section class="mb-8">
            <h2 class="es-subtitle mb-3 text-muted">{{ group.number }} {{ group.number === 1 ? 'класс' : 'классы' }}</h2>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7">
              @for (item of group.items; track item.id) {
                <a
                  [routerLink]="['/classes', item.id]"
                  class="flex h-36 flex-col justify-between p-4 transition-transform active:scale-[0.97]"
                  [class]="item.archivedAt ? 'bg-surface-2 text-muted' : isMine(item) ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface hover:bg-surface-3'"
                >
                  <span class="flex items-start justify-between">
                    <span class="text-[44px] leading-none font-light">{{ item.name }}</span>
                    @if (item.archivedAt) {
                      <es-icon name="archive" [size]="18" />
                    }
                  </span>
                  <span class="text-sm">
                    <span class="block truncate">{{ item.homeroom?.fullName ?? 'без классного руководителя' }}</span>
                    <span class="block opacity-70">{{ item.studentCount }} {{ pupils(item.studentCount) }}</span>
                  </span>
                </a>
              }
            </div>
          </section>
        } @empty {
          <es-empty icon="graduation" title="Классов пока нет" [text]="auth.isHead() ? 'Заведите классы, затем добавьте учеников списком.' : 'Вы не классный руководитель ни одного класса.'">
            @if (auth.isHead()) {
              <button type="button" class="es-btn es-btn-primary" (click)="openCreate()">новый класс</button>
            }
          </es-empty>
        }
      }
    </es-page>

    <es-flyout [open]="createOpen()" title="новый класс" (closed)="createOpen.set(false)">
      <form id="class-form" class="space-y-4" (ngSubmit)="create()">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="es-label" for="cl-number">параллель</label>
            <select id="cl-number" name="number" class="es-select" [(ngModel)]="number">
              @for (n of numbers; track n) {
                <option [ngValue]="n">{{ n }}</option>
              }
            </select>
          </div>
          <div>
            <label class="es-label" for="cl-letter">буква</label>
            <select id="cl-letter" name="letter" class="es-select" [(ngModel)]="letter">
              @for (l of letters; track l) {
                <option [ngValue]="l">{{ l }}</option>
              }
            </select>
          </div>
        </div>
        <div>
          <label class="es-label" for="cl-homeroom">классный руководитель</label>
          <select id="cl-homeroom" name="homeroom" class="es-select" [(ngModel)]="homeroomId">
            <option [ngValue]="''">назначить позже</option>
            @for (person of school.staff(); track person.id) {
              <option [ngValue]="person.id">{{ person.fullName }}</option>
            }
          </select>
        </div>
      </form>
      <ng-container flyout-actions>
        <button type="button" class="es-btn" (click)="createOpen.set(false)">отмена</button>
        <button type="submit" form="class-form" class="es-btn es-btn-primary" [disabled]="busy()">создать {{ number }}{{ letter }}</button>
      </ng-container>
    </es-flyout>
  `,
})
export class ClassesPage {
  protected readonly auth = inject(Auth);
  protected readonly school = inject(School);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly numbers = Array.from({ length: 11 }, (_, i) => i + 1);
  protected readonly letters = LETTERS;
  protected readonly classes = signal<ClassRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly archived = signal(false);
  protected readonly createOpen = signal(false);
  protected number = 5;
  protected letter = 'А';
  protected homeroomId = '';

  /** Классный руководитель (не завуч) видит только свои классы. */
  protected readonly visible = computed(() =>
    this.auth.isHead() ? this.classes() : this.classes().filter((item) => this.auth.homeroomIds().includes(item.id)),
  );
  protected readonly groups = computed(() => {
    const map = new Map<number, ClassRow[]>();
    for (const item of this.visible()) {
      map.set(item.number, [...(map.get(item.number) ?? []), item]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([number, items]) => ({ number, items }));
  });
  protected readonly summary = computed(() => {
    const active = this.visible().filter((item) => !item.archivedAt);
    const students = active.reduce((sum, item) => sum + item.studentCount, 0);
    return active.length ? `${active.length} ${plural(active.length, 'класс', 'класса', 'классов')}, ${students} ${this.pupils(students)}` : '';
  });

  constructor() {
    void this.load();
    if (this.auth.isHead()) void this.school.loadStaff().catch(() => undefined);
  }

  private async load(): Promise<void> {
    try {
      this.classes.set(await this.api.get<ClassRow[]>('/classes', { archived: this.archived() }));
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleArchived(): void {
    this.archived.set(!this.archived());
    void this.load();
  }

  protected isMine(item: ClassRow): boolean {
    return this.auth.homeroomIds().includes(item.id);
  }

  protected pupils(n: number): string {
    return plural(n, 'ученик', 'ученика', 'учеников');
  }

  protected openCreate(): void {
    this.homeroomId = '';
    this.createOpen.set(true);
  }

  protected async create(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.post('/classes', { number: this.number, letter: this.letter, homeroomId: this.homeroomId || undefined });
      this.notify.success(`Класс ${this.number}${this.letter} создан`);
      this.createOpen.set(false);
      await this.load();
      await this.school.loadClasses(true);
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async promoteAll(): Promise<void> {
    const ok = await this.notify.confirm({
      title: 'Перевести всю школу на следующий год?',
      message:
        'Каждый класс перейдёт в следующую параллель (7Б → 8Б), одиннадцатые классы уйдут в архив. ' +
        'Прошлогодние расписание, задания, посещаемость и работы останутся в архиве у прежних классов. ' +
        'Новые сетки расписания нужно будет составить заново.',
      confirmText: 'Перевести',
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await this.api.post<{ promoted: number; graduated: number }>('/classes/promote-all');
      this.notify.success(`Переведено классов: ${result.promoted}, выпущено: ${result.graduated}`);
      await this.load();
      await this.school.loadClasses(true);
    } catch (error) {
      this.notify.error(error);
    }
  }
}

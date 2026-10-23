import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { addDays, formatDay, formatDayLong, relativeDay, weekStart, WEEKDAYS } from '../core/dates';
import { Homework } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { WeekNav } from '../ui/week-nav';
import { Rich } from '../ui/rich';
import { AttachmentsView } from '../ui/attachments';
import { HomeworkDraft, HomeworkFlyout } from './homework-flyout';

type Tab = 'week' | 'archive';

@Component({
  selector: 'es-homework-page',
  imports: [FormsModule, NgTemplateOutlet, Page, Icon, Dots, Empty, WeekNav, Rich, AttachmentsView, HomeworkFlyout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="задания" [subtitle]="className()">
      @if (auth.canPublish()) {
        <ng-container page-actions>
          <button type="button" class="es-btn es-btn-primary" (click)="create()"><es-icon name="plus" [size]="18" /> новое задание</button>
        </ng-container>
      }

      <nav class="es-pivot mb-5">
        <button type="button" [class.is-active]="tab() === 'week'" (click)="tab.set('week')">по неделям</button>
        <button type="button" [class.is-active]="tab() === 'archive'" (click)="openArchive()">архив</button>
      </nav>

      <div class="mb-6 flex flex-wrap items-center gap-3">
        @if (auth.isStaff()) {
          <select class="es-select w-auto min-w-[120px]" [ngModel]="classId()" (ngModelChange)="navigate({ class: $event })" aria-label="Класс">
            <option [ngValue]="''" disabled>класс</option>
            @for (item of school.classes(); track item.id) {
              <option [ngValue]="item.id">{{ item.name }}</option>
            }
          </select>
        }
        @if (tab() === 'week') {
          <es-week-nav [date]="date()" [today]="school.today()" (changed)="navigate({ date: $event })" />
        } @else {
          <select class="es-select w-auto min-w-[200px]" [ngModel]="archiveSubject()" (ngModelChange)="archiveSubject.set($event); loadArchive(true)" aria-label="Предмет">
            <option [ngValue]="''">все предметы</option>
            @for (subject of school.subjects(); track subject.id) {
              <option [ngValue]="subject.id">{{ subject.name }}</option>
            }
          </select>
          <div class="relative min-w-[220px] flex-1 sm:max-w-sm">
            <es-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <input class="es-input pl-9" placeholder="поиск по тексту" [ngModel]="archiveSearch()" (ngModelChange)="archiveSearch.set($event)" (keyup.enter)="loadArchive(true)" />
          </div>
        }
      </div>

      @if (!classId()) {
        <es-empty icon="clipboard" title="Выберите класс" />
      } @else if (loading()) {
        <es-dots class="my-10" />
      } @else if (tab() === 'week') {
        <div class="grid gap-x-6 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
          @for (day of days(); track day.date) {
            <section [class.opacity-60]="day.date < school.today()">
              <header class="mb-3 flex items-baseline justify-between border-b-2 pb-1" [class]="day.date === school.today() ? 'border-accent' : 'border-line'">
                <h2 class="text-xl font-light">{{ weekday(day.date) }}</h2>
                <span class="text-sm text-faint">{{ when(day.date) }}</span>
              </header>
              @for (hw of day.items; track hw.id) {
                <ng-container *ngTemplateOutlet="card; context: { $implicit: hw }" />
              } @empty {
                <p class="text-sm text-faint">ничего не задано</p>
              }
            </section>
          }
        </div>
      } @else {
        <div class="max-w-3xl space-y-1">
          @for (hw of archive(); track hw.id) {
            <ng-container *ngTemplateOutlet="card; context: { $implicit: hw, showDate: true }" />
          } @empty {
            <es-empty icon="archive" title="В архиве пусто" />
          }
        </div>
        @if (archiveMore()) {
          <button type="button" class="es-btn mt-4" (click)="loadArchive(false)">показать ещё</button>
        }
      }
    </es-page>

    <ng-template #card let-hw let-showDate="showDate">
      <article class="group mb-2 bg-surface p-4">
        <header class="flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <p class="font-semibold">
              {{ hw.subject.name }}
              @if (hw.lessonNumber) {
                <span class="text-sm font-normal text-faint">· {{ hw.lessonNumber }}-й урок</span>
              }
              @if (hw.group) {
                <span class="text-sm font-normal text-faint">· группа {{ hw.group }}</span>
              }
            </p>
            @if (showDate) {
              <p class="text-sm text-accent-hover">{{ longDay(hw.date) }}</p>
            }
          </div>
          @if (hw.canEdit) {
            <div class="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100">
              <button type="button" class="es-btn es-btn-ghost es-btn-sm es-btn-icon" title="Править" (click)="edit(hw)"><es-icon name="edit" [size]="16" /></button>
              <button type="button" class="es-btn es-btn-ghost es-btn-sm es-btn-icon hover:!text-danger" title="Удалить" (click)="remove(hw)"><es-icon name="trash" [size]="16" /></button>
            </div>
          }
        </header>
        @if (hw.content) {
          <div class="mt-2 text-[15px]" [esRich]="hw.content"></div>
        }
        @if (hw.attachments.length) {
          <es-attachments-view class="mt-3" [items]="hw.attachments" />
        }
        @if (hw.author) {
          <p class="mt-3 text-xs text-faint">{{ hw.author.fullName }}</p>
        }
      </article>
    </ng-template>

    <es-homework-flyout [draft]="draft()" (closed)="draft.set(null)" (saved)="draft.set(null); reload()" />
  `,
})
export class HomeworkPage {
  protected readonly auth = inject(Auth);
  protected readonly school = inject(School);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly query = signal<Record<string, string>>({});
  protected readonly tab = signal<Tab>('week');
  protected readonly items = signal<Homework[]>([]);
  protected readonly loading = signal(true);
  protected readonly draft = signal<HomeworkDraft | null>(null);
  protected readonly archive = signal<Homework[]>([]);
  protected readonly archiveMore = signal(false);
  protected readonly archiveSubject = signal('');
  protected readonly archiveSearch = signal('');

  protected readonly classId = computed(
    () => this.query()['class'] || this.auth.learnerClassId() || this.auth.homeroomIds()[0] || '',
  );
  protected readonly date = computed(() => this.query()['date'] || this.school.today());
  protected readonly className = computed(() => this.school.classes().find((item) => item.id === this.classId())?.name ?? '');

  protected readonly days = computed(() => {
    const start = weekStart(this.date());
    const count = Math.max(this.school.weekDays(), 5);
    return Array.from({ length: count }, (_, i) => {
      const date = addDays(start, i);
      return { date, items: this.items().filter((hw) => hw.date === date) };
    });
  });

  constructor() {
    void this.school.loadClasses().catch(() => undefined);
    void this.school.loadSubjects().catch(() => undefined);
    this.route.queryParamMap.subscribe((params) => {
      this.query.set(Object.fromEntries(params.keys.map((key) => [key, params.get(key) ?? ''])));
    });
    effect(() => {
      const classId = this.classId();
      const date = this.date();
      untracked(() => void this.load(classId, date));
    });
  }

  protected navigate(params: { class?: string; date?: string }): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  private async load(classId: string, date: string): Promise<void> {
    if (!classId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(!this.items().length);
    try {
      const from = weekStart(date);
      const result = await this.api.get<{ items: Homework[] }>('/homework', { classId, from, to: addDays(from, 6) });
      this.items.set(result.items);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.loading.set(false);
    }
    if (this.tab() === 'archive') {
      await this.loadArchive(true);
    }
  }

  protected reload(): void {
    void this.load(this.classId(), this.date());
  }

  protected async openArchive(): Promise<void> {
    this.tab.set('archive');
    await this.loadArchive(true);
  }

  protected async loadArchive(reset: boolean): Promise<void> {
    if (!this.classId()) return;
    const before = reset ? undefined : this.archive().at(-1)?.date;
    try {
      const list = await this.api.get<Homework[]>('/homework/archive', {
        classId: this.classId(),
        subjectId: this.archiveSubject(),
        search: this.archiveSearch(),
        before,
      });
      this.archive.update((current) => (reset ? list : [...current, ...list.filter((hw) => !current.some((c) => c.id === hw.id))]));
      this.archiveMore.set(list.length === 40);
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected create(): void {
    this.draft.set({ homework: null, classId: this.classId(), subjectId: '', date: addDays(this.school.today(), 1), lessonNumber: null });
  }

  protected edit(hw: Homework): void {
    this.draft.set({ homework: hw, classId: hw.classId, subjectId: hw.subject.id, date: hw.date, lessonNumber: hw.lessonNumber });
  }

  protected async remove(hw: Homework): Promise<void> {
    const ok = await this.notify.confirm({
      title: 'Удалить задание?',
      message: `${hw.subject.name}, ${formatDayLong(hw.date)}`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/homework/${hw.id}`);
      this.notify.success('Задание удалено');
      this.reload();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected weekday(date: string): string {
    return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay() || 7];
  }

  protected when(date: string): string {
    const relative = relativeDay(date, this.school.today());
    return ['сегодня', 'завтра', 'вчера', 'послезавтра'].includes(relative) ? `${relative}, ${formatDay(date)}` : formatDay(date);
  }

  protected longDay(date: string): string {
    return formatDayLong(date);
  }
}

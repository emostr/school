import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { addDays, formatDay, weekStart, WEEKDAYS_SHORT } from '../core/dates';
import { Homework, Lesson, ScheduleDay, ScheduleWeek, VersionDetail, VersionRow } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { Flyout } from '../ui/flyout';
import { WeekNav } from '../ui/week-nav';
import { WeekView } from './week-view';
import { ChangeFlyout, ChangeTarget } from './change-flyout';

type Mode = 'mine' | 'class' | 'teacher';

@Component({
  selector: 'es-schedule-page',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, Empty, Flyout, WeekNav, WeekView, ChangeFlyout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="расписание" [subtitle]="week()?.title ?? ''">
      @if (auth.isStaff()) {
        <ng-container page-actions>
          <a routerLink="/schedule/changes" class="es-btn"><es-icon name="refresh" [size]="18" /> лист замен</a>
        </ng-container>
      }

      @if (modes().length > 1) {
        <nav class="es-pivot mb-5">
          @for (item of modes(); track item.value) {
            <button type="button" [class.is-active]="mode() === item.value" (click)="setMode(item.value)">{{ item.label }}</button>
          }
        </nav>
      }

      <div class="mb-5 flex flex-wrap items-center gap-3">
        @if (mode() === 'class') {
          <select class="es-select w-auto min-w-[140px]" [ngModel]="classId()" (ngModelChange)="navigate({ class: $event })" aria-label="Класс">
            <option [ngValue]="''" disabled>класс</option>
            @for (item of school.classes(); track item.id) {
              <option [ngValue]="item.id">{{ item.name }}</option>
            }
          </select>
        }
        @if (mode() === 'teacher') {
          <select class="es-select w-auto min-w-[240px]" [ngModel]="teacherId()" (ngModelChange)="navigate({ teacher: $event })" aria-label="Учитель">
            <option [ngValue]="''" disabled>учитель</option>
            @for (person of school.staff(); track person.id) {
              <option [ngValue]="person.id">{{ person.fullName }}</option>
            }
          </select>
        }
        <es-week-nav [date]="date()" [today]="school.today()" (changed)="navigate({ date: $event })" />

        @if (week()?.canEdit && week()?.classId; as id) {
          <div class="ml-auto flex flex-wrap gap-2">
            <button type="button" class="es-btn" (click)="addLesson()"><es-icon name="plus" [size]="18" /> урок на дату</button>
            <button type="button" class="es-btn" (click)="openVersions()"><es-icon name="archive" [size]="18" /> архив сеток</button>
            <a [routerLink]="['/schedule/edit', id]" class="es-btn es-btn-primary"><es-icon name="grid" [size]="18" /> постоянная сетка</a>
          </div>
        } @else if (week()?.kind === 'class') {
          <button type="button" class="es-btn ml-auto" (click)="openVersions()"><es-icon name="archive" [size]="18" /> архив сеток</button>
        }
      </div>

      @if (loading()) {
        <es-dots class="my-10" />
      } @else if (error()) {
        <es-empty icon="alert" title="Расписание не загрузилось" [text]="error()" />
      } @else if (week(); as w) {
        @if (!hasLessons() && w.kind === 'class' && !w.version) {
          <es-empty icon="calendar" title="Сетка ещё не составлена" text="Постоянное расписание класса заводит классный руководитель или завуч.">
            @if (w.canEdit) {
              <a [routerLink]="['/schedule/edit', w.classId]" class="es-btn es-btn-primary">составить сетку</a>
            }
          </es-empty>
        } @else {
          <es-week-view
            [days]="w.days"
            [today]="school.today()"
            [mode]="w.kind"
            [clickable]="w.canEdit"
            [homework]="homework()"
            (picked)="pickLesson($event.day, $event.lesson)"
          />
          @if (w.version) {
            <p class="mt-6 text-xs text-faint">
              Постоянная сетка действует с {{ day(w.version.validFrom) }}{{ w.version.note ? ' · ' + w.version.note : '' }}
            </p>
          }
        }
      } @else {
        <es-empty icon="calendar" title="Выберите класс" />
      }
    </es-page>

    <es-change-flyout [target]="change()" (closed)="change.set(null)" (saved)="change.set(null); load()" />

    <es-flyout [open]="versionsOpen()" title="архив сеток" subtitle="Каждая сетка действует до начала следующей" [width]="760" (closed)="versionsOpen.set(false); version.set(null)">
      @if (version(); as v) {
        <button type="button" class="es-btn es-btn-sm mb-4" (click)="version.set(null)"><es-icon name="arrowLeft" [size]="16" /> к списку</button>
        <p class="mb-3 text-lg font-light">с {{ day(v.validFrom) }}{{ v.note ? ' · ' + v.note : '' }}</p>
        <div class="overflow-x-auto">
          <table class="es-table text-xs">
            <thead>
              <tr>
                <th>№</th>
                @for (wd of weekdays(); track wd) {
                  <th>{{ short(wd) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (bell of school.bells(); track bell.number) {
                <tr>
                  <td class="text-faint">{{ bell.number }}</td>
                  @for (wd of weekdays(); track wd) {
                    <td>
                      @for (cell of cellsOf(v, wd, bell.number); track cell.group) {
                        <div>{{ school.subjectName(cell.subjectId) }}{{ cell.group ? ' (' + cell.group + ')' : '' }}</div>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <ul class="divide-y divide-line border-y border-line">
          @for (row of versions(); track row.id) {
            <li>
              <button type="button" class="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-surface-2" (click)="openVersion(row)">
                <span class="flex-1">
                  <span class="block font-semibold">с {{ day(row.validFrom) }}</span>
                  <span class="block text-sm text-muted">{{ row.lessonCount }} уроков · {{ row.createdBy ?? '—' }}{{ row.note ? ' · ' + row.note : '' }}</span>
                </span>
                <span class="es-badge" [class]="row.state === 'current' ? 'es-badge-success' : row.state === 'planned' ? 'es-badge-accent' : ''">
                  {{ row.state === 'current' ? 'действует' : row.state === 'planned' ? 'запланирована' : 'архив' }}
                </span>
              </button>
            </li>
          } @empty {
            <li class="py-6 text-center text-muted">Сеток пока нет</li>
          }
        </ul>
      }
    </es-flyout>
  `,
})
export class SchedulePage {
  protected readonly auth = inject(Auth);
  protected readonly school = inject(School);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly query = signal<Record<string, string>>({});
  protected readonly week = signal<ScheduleWeek | null>(null);
  protected readonly homework = signal<Homework[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly change = signal<ChangeTarget | null>(null);
  protected readonly versionsOpen = signal(false);
  protected readonly versions = signal<VersionRow[]>([]);
  protected readonly version = signal<VersionDetail | null>(null);

  protected readonly modes = computed(() => {
    const list: { value: Mode; label: string }[] = [];
    if (this.auth.isStudent() || this.auth.isTeacher()) list.push({ value: 'mine', label: this.auth.isStudent() ? 'мой класс' : 'мои уроки' });
    if (this.auth.isStaff()) list.push({ value: 'class', label: 'классы' });
    if (this.auth.isHead()) list.push({ value: 'teacher', label: 'учителя' });
    return list;
  });

  protected readonly mode = computed<Mode>(() => {
    const q = this.query();
    if (q['teacher'] && this.auth.isHead()) return 'teacher';
    if (q['class'] && this.auth.isStaff()) return 'class';
    if (q['mode'] === 'class' || q['mode'] === 'teacher') return q['mode'] as Mode;
    return this.modes()[0]?.value ?? 'mine';
  });
  protected readonly classId = computed(() => this.query()['class'] ?? '');
  protected readonly teacherId = computed(() => this.query()['teacher'] ?? '');
  protected readonly date = computed(() => this.query()['date'] ?? this.school.today());
  protected readonly hasLessons = computed(() => (this.week()?.days ?? []).some((day) => day.lessons.length > 0));
  protected readonly weekdays = computed(() => Array.from({ length: this.school.weekDays() }, (_, i) => i + 1));

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.query.set(Object.fromEntries(params.keys.map((key) => [key, params.get(key) ?? ''])));
    });
    void this.school.loadClasses().catch(() => undefined);
    if (this.auth.isStaff()) {
      void this.school.loadStaff().catch(() => undefined);
    }
    void this.school.loadSubjects().catch(() => undefined);
    effect(() => {
      this.query();
      untracked(() => void this.load());
    });
  }

  protected setMode(mode: Mode): void {
    void this.router.navigate([], { queryParams: { mode, class: null, teacher: null }, queryParamsHandling: 'merge' });
  }

  protected navigate(params: { class?: string; teacher?: string; date?: string }): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  protected async load(): Promise<void> {
    const mode = this.mode();
    const date = this.date();
    let path = '';
    if (mode === 'mine') path = '/schedule/me';
    if (mode === 'class') {
      // Классному руководителю логично сразу открыть его класс.
      const id = this.classId() || this.auth.homeroomIds()[0] || '';
      if (!id) {
        this.week.set(null);
        this.loading.set(false);
        return;
      }
      path = `/schedule/classes/${id}`;
    }
    if (mode === 'teacher') {
      if (!this.teacherId()) {
        this.week.set(null);
        this.loading.set(false);
        return;
      }
      path = `/schedule/teachers/${this.teacherId()}`;
    }

    this.loading.set(!this.week());
    this.error.set('');
    try {
      const week = await this.api.get<ScheduleWeek>(path, { date });
      this.week.set(week);
      this.homework.set([]);
      if (week.kind === 'class' && week.classId) {
        const list = await this.api.get<{ items: Homework[] }>('/homework', { classId: week.classId, from: week.from, to: week.to });
        this.homework.set(list.items);
      }
    } catch (error) {
      this.week.set(null);
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected pickLesson(day: ScheduleDay, lesson: Lesson): void {
    const classId = this.week()?.classId;
    if (!classId) return;
    this.change.set({ classId, date: day.date, number: lesson.number, group: lesson.group, lesson });
  }

  protected addLesson(): void {
    const classId = this.week()?.classId;
    if (!classId) return;
    const today = this.school.today();
    const from = weekStart(this.date());
    this.change.set({ classId, date: from <= today && today <= addDays(from, 6) ? today : from, number: 1, group: '', lesson: null });
  }

  protected async openVersions(): Promise<void> {
    const classId = this.week()?.classId;
    if (!classId) return;
    this.versionsOpen.set(true);
    try {
      this.versions.set(await this.api.get<VersionRow[]>(`/schedule/classes/${classId}/versions`));
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async openVersion(row: VersionRow): Promise<void> {
    try {
      this.version.set(await this.api.get<VersionDetail>(`/schedule/versions/${row.id}`));
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected cellsOf(version: VersionDetail, weekday: number, number: number) {
    return version.lessons.filter((lesson) => lesson.weekday === weekday && lesson.number === number);
  }

  protected day(date: string): string {
    return formatDay(date);
  }

  protected short(weekday: number): string {
    return WEEKDAYS_SHORT[weekday];
  }
}

import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { School } from '../../core/school';
import { addDays, formatDayLong, plural, weekStart } from '../../core/dates';
import { Diary, Homework, Lesson, MyAttendance, ScheduleWeek } from '../../core/types';
import { Tile } from '../../ui/tile';
import { Icon } from '../../ui/icon';

interface Overview {
  tiles: { pending: number; tests: number; checked: number };
}

/**
 * Стартовый экран — плитки Windows 8. Плитки «живые»: показывают уроки
 * сегодня, задание на завтра, неотмеченные уроки и работы на проверке.
 * Набор зависит от привилегий: у завуча, который ведёт уроки, — оба набора.
 */
@Component({
  selector: 'es-dashboard',
  imports: [RouterLink, Tile, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="animate-turnstile origin-left">
      <h1 class="es-title">{{ greeting() }}</h1>
      <p class="mt-2 text-muted">{{ today() }}{{ pureParentLabel() }}</p>

      <div class="mt-8 grid auto-rows-[136px] grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        <!-- Уроки сегодня -->
        <es-tile size="large" tone="accent" icon="calendar" link="/schedule" [label]="lessonsLabel()">
          <ul class="mb-1 space-y-0.5 text-sm">
            @for (lesson of todayLessons().slice(0, 6); track lesson.number + lesson.classId + lesson.group) {
              <li class="flex gap-2 truncate" [class.line-through]="lesson.status === 'cancelled'" [class.opacity-60]="lesson.end < nowTime()">
                <span class="w-4 shrink-0 text-white/70">{{ lesson.number }}</span>
                <span class="truncate">{{ lesson.subject?.short ?? '—' }}{{ pureLearner() ? '' : ' · ' + lesson.className }}{{ lesson.room ? ' · ' + lesson.room.name : '' }}</span>
              </li>
            } @empty {
              <li class="text-white/80">{{ holiday() || 'уроков нет' }}</li>
            }
          </ul>
        </es-tile>

        @if (auth.isLearner()) {
          <es-tile size="wide" tone="teal" icon="clipboard" link="/homework" label="задано на завтра" [count]="tomorrowHomework().length || null">
            <p class="line-clamp-2 text-sm text-white/90">{{ tomorrowSubjects() || 'пока ничего' }}</p>
          </es-tile>
          <es-tile size="wide" tone="cobalt" icon="award" link="/diary" [label]="'последние оценки' + (auth.isParent() ? ' · ' + (auth.child()?.firstName ?? '') : '')">
            <div class="flex flex-wrap gap-1">
              @for (grade of recentGrades(); track grade.id) {
                <span class="inline-flex items-center gap-1 bg-white/15 px-1.5 py-0.5 text-sm"><b>{{ grade.value }}</b><span class="text-xs text-white/80">{{ grade.subject }}</span></span>
              } @empty {
                <span class="text-sm text-white/80">пока нет</span>
              }
            </div>
          </es-tile>
          <es-tile tone="indigo" icon="userCheck" link="/attendance" label="пропуски" [count]="missed()" />
        }

        @if (auth.isStaff()) {
          <es-tile size="wide" [tone]="unmarked() ? 'cobalt' : 'steel'" icon="userCheck" link="/attendance" label="посещаемость" [count]="unmarked() || null">
            <p class="text-sm text-white/90">
              @if (unmarked()) {
                {{ unmarked() }} {{ lessonsWord(unmarked()) }} сегодня без отметки
              } @else {
                всё отмечено
              }
            </p>
          </es-tile>
          <es-tile tone="cyan" icon="clipboardCheck" link="/tests/assignments" label="на проверке" [count]="pendingWorks()" />
        }

        <es-tile [tone]="auth.isLearner() ? 'steel' : 'teal'" icon="clipboard" link="/homework" label="задания" />
        <es-tile tone="steel" icon="book" link="/notes" label="конспекты" />

        @if (auth.isStaff()) {
          <es-tile tone="teal" icon="table" link="/journal" label="журнал" />
          <es-tile tone="indigo" icon="list" link="/tests" label="тесты" [count]="testCount()" />
          <es-tile tone="surface" icon="refresh" link="/schedule/changes" label="лист замен" />
        }
        @if (auth.isHead() || auth.isHomeroom()) {
          <es-tile tone="surface" icon="graduation" link="/classes" label="классы" />
        }
        @if (auth.isHead()) {
          <es-tile tone="surface" icon="users" link="/people" label="люди" />
          <es-tile tone="surface" icon="layers" link="/catalog" label="справочники" />
        }
        <es-tile tone="surface" icon="settings" link="/settings" label="настройки" />
      </div>

      @if (auth.isLearner() && tomorrowHomework().length) {
        <section class="mt-12 max-w-3xl">
          <h2 class="es-subtitle mb-4">на завтра</h2>
          <ul class="divide-y divide-line">
            @for (hw of tomorrowHomework(); track hw.id) {
              <li class="py-3">
                <a routerLink="/homework" class="block hover:text-accent-hover">
                  <span class="font-semibold">{{ hw.subject.name }}</span>
                  <span class="mt-0.5 block text-sm text-muted">{{ plain(hw.content) || 'см. вложения' }}</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }

      @if (auth.isStaff() && myLessons().length) {
        <section class="mt-12 max-w-3xl">
          <h2 class="es-subtitle mb-4">мои уроки сегодня</h2>
          <ul class="divide-y divide-line">
            @for (lesson of myLessons(); track lesson.number + lesson.classId) {
              <li class="flex items-center gap-4 py-3">
                <span class="w-8 text-2xl font-light">{{ lesson.number }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold">{{ lesson.className }} · {{ lesson.subject?.name }}</span>
                  <span class="block text-sm text-muted">{{ lesson.start }}–{{ lesson.end }}{{ lesson.room ? ' · каб. ' + lesson.room.name : '' }}</span>
                </span>
                @if (lesson.marked) {
                  <span class="es-badge es-badge-success"><es-icon name="check" [size]="14" /> отмечено</span>
                } @else {
                  <a [routerLink]="['/attendance']" [queryParams]="{ class: lesson.classId, date: todayKey(), lesson: lesson.number }" class="es-btn es-btn-sm es-btn-primary">отметить</a>
                }
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class DashboardPage {
  protected readonly auth = inject(Auth);
  private readonly school = inject(School);
  private readonly api = inject(Api);

  protected readonly week = signal<ScheduleWeek | null>(null);
  protected readonly homework = signal<Homework[]>([]);
  protected readonly myLessons = signal<Lesson[]>([]);
  protected readonly missed = signal<number | null>(null);
  protected readonly pendingWorks = signal<number | null>(null);
  protected readonly testCount = signal<number | null>(null);
  protected readonly recentGrades = signal<{ id: string; value: number; subject: string }[]>([]);
  /** Ученик или родитель без уроков: главная целиком про класс ребёнка. */
  protected readonly pureLearner = computed(() => this.auth.isLearner() && !this.auth.isStaff());
  protected readonly pureParentLabel = computed(() => {
    const child = this.auth.child();
    return this.auth.isParent() && child ? ` · ${child.fullName}${child.className ? ', ' + child.className : ''}` : '';
  });
  protected readonly nowTime = signal(new Date().toTimeString().slice(0, 5));

  protected readonly todayKey = computed(() => this.school.today());
  protected readonly today = computed(() => formatDayLong(this.school.today()));
  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const name = this.auth.profile()?.firstName || '';
    const hello = hour < 5 ? 'доброй ночи' : hour < 12 ? 'доброе утро' : hour < 18 ? 'добрый день' : 'добрый вечер';
    return name ? `${hello}, ${name}` : hello;
  });

  private readonly todayDay = computed(() => this.week()?.days.find((day) => day.date === this.school.today()) ?? null);
  protected readonly todayLessons = computed(() => this.todayDay()?.lessons ?? []);
  protected readonly holiday = computed(() => this.todayDay()?.holiday ?? '');
  protected readonly lessonsLabel = computed(() => {
    const count = this.todayLessons().filter((lesson) => lesson.status !== 'cancelled').length;
    return count ? `сегодня ${count} ${plural(count, 'урок', 'урока', 'уроков')}` : 'сегодня';
  });

  protected readonly tomorrowHomework = computed(() => {
    const tomorrow = addDays(this.school.today(), 1);
    return this.homework().filter((hw) => hw.date === tomorrow);
  });
  protected readonly tomorrowSubjects = computed(() => [...new Set(this.tomorrowHomework().map((hw) => hw.subject.short))].join(', '));
  protected readonly unmarked = computed(() => {
    const now = this.nowTime();
    return this.myLessons().filter((lesson) => !lesson.marked && lesson.start <= now).length;
  });

  constructor() {
    // Родитель переключил ребёнка — плитки перечитываются за него.
    effect(() => {
      this.auth.child();
      untracked(() => void this.load());
    });
  }

  private async load(): Promise<void> {
    await this.school.loadInfo().catch(() => undefined);
    const today = this.school.today();
    const child = this.auth.childParam();
    const tasks: Promise<unknown>[] = [
      this.api
        .get<ScheduleWeek>('/schedule/me', { date: today, child: this.pureLearner() ? child : undefined })
        .then((week) => this.week.set(week)),
    ];
    const classId = this.auth.learnerClassId();
    if (this.auth.isLearner() && classId) {
      const from = weekStart(today);
      tasks.push(
        this.api
          .get<{ items: Homework[] }>('/homework', { classId, from: today, to: addDays(from, 13) })
          .then((result) => this.homework.set(result.items)),
        this.api
          .get<MyAttendance>('/attendance/me', { from: addDays(today, -30), to: today, child })
          .then((result) => this.missed.set(result.totals.lessons)),
        this.api
          .get<Diary>('/gradebook/me', { child })
          .then((result) => this.recentGrades.set(result.recent.slice(0, 6))),
      );
    }
    if (this.auth.isStaff()) {
      tasks.push(
        this.api.get<{ lessons: Lesson[] }>('/attendance/my-lessons', { date: today }).then((result) => this.myLessons.set(result.lessons)),
        this.api.get<Overview>('/analytics/overview').then((result) => {
          this.pendingWorks.set(result.tiles.pending || null);
          this.testCount.set(result.tiles.tests || null);
        }),
      );
    }
    await Promise.allSettled(tasks);
  }

  protected lessonsWord(n: number): string {
    return plural(n, 'урок', 'урока', 'уроков');
  }

  protected plain(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

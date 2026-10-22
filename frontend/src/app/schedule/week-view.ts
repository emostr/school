import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { formatDay, WEEKDAYS } from '../core/dates';
import { Homework, Lesson, ScheduleDay } from '../core/types';
import { Icon } from '../ui/icon';

const STATUS_LABEL: Record<string, string> = {
  replaced: 'замена',
  cancelled: 'отменён',
  added: 'доп. урок',
};

/**
 * Неделя колонками-днями. Каждый урок — плоская плашка: номер и время
 * слева, предмет крупно, учитель и кабинет мелко. Замены подсвечены
 * акцентом, отменённые уроки зачёркнуты.
 */
@Component({
  selector: 'es-week-view',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="grid gap-3" [style.grid-template-columns]="columns()">
      @for (day of days(); track day.date) {
        <section class="min-w-0" [class.opacity-75]="day.date < today()">
          <header class="mb-2 flex items-baseline justify-between gap-2 border-b-2 pb-1" [class]="day.date === today() ? 'border-accent' : 'border-line'">
            <h3 class="text-lg font-light" [class.text-accent-hover]="day.date === today()">{{ weekday(day.weekday) }}</h3>
            <span class="text-sm text-faint">{{ format(day.date) }}</span>
          </header>

          @if (day.holiday) {
            <div class="bg-teal/15 p-3 text-sm"><es-icon name="sun" [size]="16" class="mr-1 align-[-3px] text-teal" />{{ day.holiday }}</div>
          } @else if (!day.lessons.length) {
            <p class="py-3 text-sm text-faint">уроков нет</p>
          } @else {
            <ol class="space-y-1">
              @for (lesson of day.lessons; track lesson.number + lesson.group + lesson.classId) {
                <li>
                  <button
                    type="button"
                    class="flex w-full gap-3 p-2.5 text-left transition-colors"
                    [class]="cardClass(lesson)"
                    [disabled]="!clickable()"
                    (click)="picked.emit({ day, lesson })"
                  >
                    <span class="w-10 shrink-0 text-center">
                      <span class="block text-xl leading-none font-light">{{ lesson.number }}</span>
                      <span class="mt-1 block text-[11px] leading-tight text-faint">{{ lesson.start }}<br />{{ lesson.end }}</span>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-semibold" [class.line-through]="lesson.status === 'cancelled'">
                        {{ lesson.subject?.name ?? '—' }}
                        @if (lesson.group) {
                          <span class="text-xs font-normal text-muted">· группа {{ lesson.group }}</span>
                        }
                      </span>
                      <span class="block truncate text-xs text-muted">
                        @if (mode() === 'teacher') {
                          {{ lesson.className }}
                        } @else {
                          {{ initials(lesson.teacher?.fullName) }}
                        }
                        @if (lesson.room) {
                          · {{ roomLabel(lesson.room.name) }}
                        }
                      </span>
                      @if (lesson.status !== 'regular') {
                        <span class="mt-1 inline-block px-1.5 text-[11px] font-semibold text-white" [class]="lesson.status === 'cancelled' ? 'bg-danger' : 'bg-accent'">
                          {{ statusLabel(lesson.status) }}
                        </span>
                      }
                      @if (lesson.note) {
                        <span class="mt-1 block text-xs text-muted italic">{{ lesson.note }}</span>
                      }
                      @if (homeworkFor(day.date, lesson); as hw) {
                        <span class="mt-1.5 flex items-start gap-1 text-xs text-ink/80">
                          <es-icon name="clipboard" [size]="13" class="mt-0.5 text-accent-hover" />
                          <span class="line-clamp-2">{{ hw }}</span>
                        </span>
                      }
                    </span>
                  </button>
                </li>
              }
            </ol>
          }
        </section>
      }
    </div>
  `,
})
export class WeekView {
  readonly days = input.required<ScheduleDay[]>();
  readonly today = input.required<string>();
  readonly mode = input<'class' | 'teacher'>('class');
  readonly clickable = input(false);
  readonly homework = input<Homework[]>([]);
  readonly picked = output<{ day: ScheduleDay; lesson: Lesson }>();

  /** На телефоне дни идут столбиком, на широком экране — в ряд. */
  protected readonly columns = computed(
    () => `repeat(auto-fit, minmax(min(100%, ${this.days().length > 5 ? 150 : 180}px), 1fr))`,
  );

  protected weekday(n: number): string {
    return WEEKDAYS[n];
  }

  protected format(date: string): string {
    return formatDay(date);
  }

  /** «Петрова Анна Сергеевна» → «Петрова А. С.»: в узкой колонке полное имя не помещается. */
  protected initials(fullName: string | undefined): string {
    if (!fullName) return '';
    const [last, ...rest] = fullName.split(' ');
    return [last, ...rest.map((part) => `${part[0]}.`)].join(' ');
  }

  /** Номер кабинета — с подписью «каб.», название («спортзал») — как есть. */
  protected roomLabel(name: string): string {
    return /^\d/.test(name) ? `каб. ${name}` : name;
  }

  protected statusLabel(status: string): string {
    return STATUS_LABEL[status] ?? '';
  }

  protected cardClass(lesson: Lesson): string {
    const base = this.clickable() ? 'hover:bg-surface-3 ' : 'cursor-default ';
    if (lesson.status === 'cancelled') return base + 'bg-surface/60 text-faint';
    if (lesson.status !== 'regular') return base + 'bg-accent-soft border-l-4 border-accent';
    return base + 'bg-surface';
  }

  /** Короткий текст задания к уроку — без разметки, одной строкой. */
  protected homeworkFor(date: string, lesson: Lesson): string {
    const items = this.homework().filter(
      (hw) =>
        hw.date === date &&
        hw.subject.id === lesson.subject?.id &&
        (hw.lessonNumber === null || hw.lessonNumber === lesson.number),
    );
    if (!items.length) return '';
    const text = items
      .map((hw) => hw.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || 'вложение')
      .join(' · ');
    return text;
  }
}

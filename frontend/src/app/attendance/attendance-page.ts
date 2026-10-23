import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { addDays, formatDayLong, formatDayShort } from '../core/dates';
import { AttendanceSheet, AttendanceStatus, Lesson, LessonAttendance, MyAttendance, ScheduleDay } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';

type Tab = 'lesson' | 'sheet' | 'child';

const STATUSES: { value: AttendanceStatus; short: string; label: string; tone: string }[] = [
  { value: 'PRESENT', short: 'П', label: 'присутствует', tone: 'bg-success' },
  { value: 'SICK', short: 'Б', label: 'болен', tone: 'bg-sick' },
  { value: 'EXCUSED', short: 'У', label: 'уважительная причина', tone: 'bg-warning' },
  { value: 'UNEXCUSED', short: 'Н', label: 'неуважительная причина', tone: 'bg-danger' },
];

@Component({
  selector: 'es-attendance-page',
  imports: [FormsModule, Page, Icon, Dots, Empty],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="посещаемость" [subtitle]="subtitle()">
      @if (auth.isStaff()) {
        <nav class="es-pivot mb-5">
          <button type="button" [class.is-active]="tab() === 'lesson'" (click)="navigate({ tab: 'lesson' })">отметить урок</button>
          <button type="button" [class.is-active]="tab() === 'sheet'" (click)="navigate({ tab: 'sheet' })">табель</button>
          @if (auth.isParent()) {
            <button type="button" [class.is-active]="tab() === 'child'" (click)="navigate({ tab: 'child' })">{{ auth.child()?.firstName }}</button>
          }
        </nav>
      }

      @if (auth.isStaff() && tab() !== 'child') {

        <div class="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label class="es-label" for="att-class">класс</label>
            <select id="att-class" class="es-select w-auto min-w-[110px]" [ngModel]="classId()" (ngModelChange)="navigate({ class: $event })">
              <option [ngValue]="''" disabled>класс</option>
              @for (item of school.classes(); track item.id) {
                <option [ngValue]="item.id">{{ item.name }}</option>
              }
            </select>
          </div>
          @if (tab() === 'lesson') {
            <div>
              <label class="es-label" for="att-date">дата</label>
              <input id="att-date" type="date" class="es-input w-auto" [max]="school.today()" [ngModel]="date()" (ngModelChange)="navigate({ date: $event })" />
            </div>
            <div>
              <label class="es-label" for="att-lesson">урок</label>
              <select id="att-lesson" class="es-select w-auto min-w-[240px]" [ngModel]="lessonNumber()" (ngModelChange)="navigate({ lesson: $event })">
                <option [ngValue]="0" disabled>выберите урок</option>
                @for (lesson of dayLessons(); track lesson.number + lesson.group) {
                  <option [ngValue]="lesson.number">{{ lesson.number }}-й · {{ lesson.subject?.name }}{{ lesson.group ? ' (гр. ' + lesson.group + ')' : '' }}</option>
                }
              </select>
            </div>
          } @else {
            <div>
              <label class="es-label" for="sheet-from">с</label>
              <input id="sheet-from" type="date" class="es-input w-auto" [ngModel]="from()" (ngModelChange)="navigate({ from: $event })" />
            </div>
            <div>
              <label class="es-label" for="sheet-to">по</label>
              <input id="sheet-to" type="date" class="es-input w-auto" [ngModel]="to()" (ngModelChange)="navigate({ to: $event })" />
            </div>
            <button type="button" class="es-btn" [disabled]="!sheet()" (click)="exportCsv()"><es-icon name="download" [size]="18" /> CSV</button>
          }
        </div>

        @if (tab() === 'lesson' && myLessons().length) {
          <div class="mb-6 flex flex-wrap gap-1">
            <span class="mr-2 self-center text-sm text-muted">мои уроки сегодня:</span>
            @for (lesson of myLessons(); track lesson.number + lesson.classId) {
              <button type="button" class="es-btn es-btn-sm" [class.es-btn-primary]="lesson.classId === classId() && lesson.number === lessonNumber() && date() === school.today()" (click)="navigate({ class: lesson.classId, date: school.today(), lesson: lesson.number })">
                {{ lesson.number }} · {{ lesson.className }}
                @if (lesson.marked) {
                  <es-icon name="check" [size]="14" />
                }
              </button>
            }
          </div>
        }

        @if (!classId()) {
          <es-empty icon="userCheck" title="Выберите класс" />
        } @else if (tab() === 'lesson') {
          @if (!lessonNumber()) {
            <es-empty icon="clock" title="Выберите урок" [text]="dayLessons().length ? '' : 'По расписанию в этот день у класса уроков нет'" />
          } @else if (!attendance()) {
            <es-dots class="my-10" />
          } @else if (attendance(); as a) {
            <div class="max-w-3xl">
              <div class="mb-4 flex flex-wrap items-center gap-3">
                <p class="flex-1 text-muted">
                  @let lesson = a.lesson;
                  {{ longDay(a.date) }}, {{ a.number }}-й урок{{ lesson?.subject ? ' · ' + lesson!.subject!.name : '' }}{{ lesson?.teacher ? ' · ' + lesson!.teacher!.fullName : '' }}
                </p>
                @if (a.canEdit) {
                  <button type="button" class="es-btn es-btn-sm" (click)="allPresent()">все на месте</button>
                }
              </div>
              @if (!a.canEdit) {
                <p class="mb-4 border-l-4 border-warning bg-warning/10 px-3 py-2 text-sm">
                  Отмечать посещаемость на этом уроке может его учитель, классный руководитель или завуч.
                </p>
              }
              <ul class="divide-y divide-line border-y border-line">
                @for (student of a.students; track student.id; let i = $index) {
                  <li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                    <span class="w-6 text-right text-sm text-faint">{{ i + 1 }}</span>
                    <span class="min-w-[180px] flex-1">
                      {{ student.fullName }}
                      @if (student.group) {
                        <span class="text-xs text-faint">гр. {{ student.group }}</span>
                      }
                    </span>
                    <div class="flex" role="radiogroup" [attr.aria-label]="student.fullName">
                      @for (status of statuses; track status.value) {
                        <button
                          type="button"
                          class="h-9 w-10 border-2 text-sm font-semibold transition-colors"
                          [class]="marks()[student.id] === status.value ? status.tone + ' border-transparent text-white' : 'border-line text-muted hover:border-line-strong hover:text-ink'"
                          [title]="status.label"
                          [disabled]="!a.canEdit"
                          role="radio"
                          [attr.aria-checked]="marks()[student.id] === status.value"
                          (click)="mark(student.id, status.value)"
                        >
                          {{ status.short }}
                        </button>
                      }
                    </div>
                  </li>
                }
              </ul>
              @if (a.canEdit) {
                <div class="mt-5 flex items-center gap-3">
                  <button type="button" class="es-btn es-btn-primary" [disabled]="busy()" (click)="save()">сохранить отметки</button>
                  <span class="text-sm text-muted">{{ absentLabel() }}</span>
                </div>
              }
              <p class="mt-6 flex flex-wrap gap-4 text-xs text-faint">
                @for (status of statuses; track status.value) {
                  <span class="flex items-center gap-1.5"><span class="inline-block h-3 w-3 {{ status.tone }}"></span>{{ status.short }} — {{ status.label }}</span>
                }
              </p>
            </div>
          }
        } @else {
          @if (sheetLoading()) {
            <es-dots class="my-10" />
          } @else if (sheet(); as s) {
            <div class="overflow-x-auto border border-line">
              <table class="border-collapse text-xs">
                <thead>
                  <tr>
                    <th rowspan="2" class="sticky left-0 z-10 min-w-[200px] border-r border-b border-line bg-surface px-3 py-2 text-left font-semibold">ученик</th>
                    @for (column of s.columns; track column.date) {
                      <th [attr.colspan]="column.lessons.length || 1" class="border-r border-b border-line px-1 py-1 font-semibold whitespace-nowrap" [class.bg-surface-2]="column.date === school.today()">
                        {{ shortDay(column.date) }}
                      </th>
                    }
                    <th colspan="5" class="border-b border-line px-2 py-1 font-semibold">итого</th>
                  </tr>
                  <tr>
                    @for (column of s.columns; track column.date) {
                      @for (lesson of column.lessons; track lesson.number) {
                        <th class="w-7 border-r border-b border-line px-0.5 py-1 font-normal text-faint" [title]="lesson.subject">{{ lesson.number }}</th>
                      } @empty {
                        <th class="w-7 border-r border-b border-line text-faint">{{ column.holiday ? '—' : '' }}</th>
                      }
                    }
                    <th class="border-b border-line px-1 text-sick" title="болен">Б</th>
                    <th class="border-b border-line px-1 text-warning" title="уважительная">У</th>
                    <th class="border-b border-line px-1 text-danger" title="неуважительная">Н</th>
                    <th class="border-b border-line px-1" title="пропущено уроков">ур.</th>
                    <th class="border-b border-line px-1" title="пропущено дней">дн.</th>
                  </tr>
                </thead>
                <tbody>
                  @for (student of s.students; track student.id) {
                    <tr class="hover:bg-surface-2">
                      <td class="sticky left-0 z-10 border-r border-b border-line bg-surface px-3 py-1.5 text-sm whitespace-nowrap">{{ student.fullName }}</td>
                      @for (column of s.columns; track column.date) {
                        @for (lesson of column.lessons; track lesson.number) {
                          @let mark = student.marks[column.date + '|' + lesson.number];
                          <td class="h-7 border-r border-b border-line text-center font-semibold" [class]="cellTone(mark?.status)" [attr.title]="mark?.note || null">
                            {{ cellText(mark?.status) }}
                          </td>
                        } @empty {
                          <td class="border-r border-b border-line bg-surface-2"></td>
                        }
                      }
                      <td class="border-b border-line px-2 text-center">{{ student.totals.SICK || '' }}</td>
                      <td class="border-b border-line px-2 text-center">{{ student.totals.EXCUSED || '' }}</td>
                      <td class="border-b border-line px-2 text-center">{{ student.totals.UNEXCUSED || '' }}</td>
                      <td class="border-b border-line px-2 text-center font-semibold">{{ student.totals.lessons || '' }}</td>
                      <td class="border-b border-line px-2 text-center">{{ student.totals.days || '' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      } @else {
        <!-- Ученик: свои пропуски -->
        <div class="mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label class="es-label" for="my-from">с</label>
            <input id="my-from" type="date" class="es-input w-auto" [ngModel]="from()" (ngModelChange)="navigate({ from: $event })" />
          </div>
          <div>
            <label class="es-label" for="my-to">по</label>
            <input id="my-to" type="date" class="es-input w-auto" [ngModel]="to()" (ngModelChange)="navigate({ to: $event })" />
          </div>
        </div>
        @if (mine(); as m) {
          <div class="grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4">
            <div class="bg-surface p-4"><p class="text-4xl font-light">{{ m.totals.lessons }}</p><p class="mt-1 text-sm text-muted">уроков пропущено</p></div>
            <div class="bg-sick p-4 text-white"><p class="text-4xl font-light">{{ m.totals.SICK }}</p><p class="mt-1 text-sm">по болезни</p></div>
            <div class="bg-warning p-4 text-white"><p class="text-4xl font-light">{{ m.totals.EXCUSED }}</p><p class="mt-1 text-sm">по уважительной</p></div>
            <div class="bg-danger p-4 text-white"><p class="text-4xl font-light">{{ m.totals.UNEXCUSED }}</p><p class="mt-1 text-sm">без причины</p></div>
          </div>
          <ul class="mt-8 max-w-3xl divide-y divide-line border-y border-line">
            @for (mark of m.marks; track mark.date + mark.number) {
              <li class="flex items-center gap-4 py-2.5">
                <span class="inline-grid h-8 w-8 place-items-center font-semibold text-white {{ cellTone(mark.status) }}">{{ cellText(mark.status) }}</span>
                <span class="flex-1">{{ mark.subject || 'урок ' + mark.number }}<span class="block text-sm text-muted">{{ longDay(mark.date) }}, {{ mark.number }}-й урок</span></span>
                @if (mark.note) {
                  <span class="text-sm text-muted">{{ mark.note }}</span>
                }
              </li>
            } @empty {
              <li class="py-8 text-center text-muted">Пропусков нет — так держать!</li>
            }
          </ul>
        } @else {
          <es-dots />
        }
      }
    </es-page>
  `,
})
export class AttendancePage {
  protected readonly auth = inject(Auth);
  protected readonly school = inject(School);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly statuses = STATUSES;
  private readonly query = signal<Record<string, string>>({});
  protected readonly day = signal<ScheduleDay | null>(null);
  protected readonly attendance = signal<LessonAttendance | null>(null);
  protected readonly marks = signal<Record<string, AttendanceStatus>>({});
  protected readonly myLessons = signal<Lesson[]>([]);
  protected readonly sheet = signal<AttendanceSheet | null>(null);
  protected readonly sheetLoading = signal(false);
  protected readonly mine = signal<MyAttendance | null>(null);
  protected readonly busy = signal(false);

  protected readonly tab = computed<Tab>(() => {
    const tab = this.query()['tab'];
    return tab === 'sheet' || tab === 'child' ? tab : 'lesson';
  });
  protected readonly classId = computed(() => this.query()['class'] || this.auth.homeroomIds()[0] || '');
  protected readonly date = computed(() => this.query()['date'] || this.school.today());
  protected readonly lessonNumber = computed(() => Number(this.query()['lesson'] || 0));
  protected readonly from = computed(() => this.query()['from'] || addDays(this.school.today(), this.auth.isStaff() ? -13 : -30));
  protected readonly to = computed(() => this.query()['to'] || this.school.today());
  protected readonly dayLessons = computed(() => (this.day()?.lessons ?? []).filter((lesson) => lesson.status !== 'cancelled'));
  protected readonly subtitle = computed(() => {
    if (!this.auth.isStaff() || this.tab() === 'child') {
      const child = this.auth.isParent() ? this.auth.child() : null;
      return child ? `${child.fullName}${child.className ? ', ' + child.className : ''}` : (this.auth.profile()?.studentClass?.name ?? '');
    }
    return this.school.classes().find((item) => item.id === this.classId())?.name ?? '';
  });
  protected readonly absentLabel = computed(() => {
    const absent = Object.values(this.marks()).filter((status) => status !== 'PRESENT').length;
    return absent ? `отсутствует ${absent}` : 'все на месте';
  });

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.query.set(Object.fromEntries(params.keys.map((key) => [key, params.get(key) ?? ''])));
    });
    if (this.auth.isStaff()) {
      void this.school.loadClasses().catch(() => undefined);
      void this.api
        .get<{ lessons: Lesson[] }>('/attendance/my-lessons')
        .then((result) => this.myLessons.set(result.lessons))
        .catch(() => undefined);
    }
    effect(() => {
      const query = this.query();
      this.auth.child();
      untracked(() => void this.load(query));
    });
  }

  protected navigate(params: Record<string, string | number>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  private async load(_query: Record<string, string>): Promise<void> {
    try {
      if (!this.auth.isStaff() || this.tab() === 'child') {
        this.mine.set(
          await this.api.get<MyAttendance>('/attendance/me', { from: this.from(), to: this.to(), child: this.auth.childParam() }),
        );
        return;
      }
      const classId = this.classId();
      if (!classId) return;
      if (this.tab() === 'sheet') {
        this.sheetLoading.set(true);
        this.sheet.set(await this.api.get<AttendanceSheet>('/attendance/sheet', { classId, from: this.from(), to: this.to() }));
        return;
      }
      this.day.set(await this.api.get<ScheduleDay>(`/schedule/classes/${classId}/day`, { date: this.date() }));
      if (this.lessonNumber()) {
        this.attendance.set(null);
        const result = await this.api.get<LessonAttendance>('/attendance/lesson', {
          classId,
          date: this.date(),
          number: this.lessonNumber(),
        });
        this.attendance.set(result);
        // Неотмеченный урок по умолчанию — все присутствуют: отмечать надо отсутствующих.
        this.marks.set(Object.fromEntries(result.students.map((s) => [s.id, s.status ?? 'PRESENT'])));
      }
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.sheetLoading.set(false);
    }
  }

  protected mark(studentId: string, status: AttendanceStatus): void {
    this.marks.update((marks) => ({ ...marks, [studentId]: status }));
  }

  protected allPresent(): void {
    this.marks.update((marks) => Object.fromEntries(Object.keys(marks).map((id) => [id, 'PRESENT' as AttendanceStatus])));
  }

  protected async save(): Promise<void> {
    const attendance = this.attendance();
    if (!attendance) return;
    this.busy.set(true);
    try {
      const marks = Object.entries(this.marks()).map(([studentId, status]) => ({ studentId, status }));
      const result = await this.api.put<LessonAttendance>('/attendance/lesson', {
        classId: attendance.classId,
        date: attendance.date,
        number: attendance.number,
        marks,
      });
      this.attendance.set(result);
      const absent = marks.filter((m) => m.status !== 'PRESENT').length;
      this.notify.success(absent ? `Отмечено отсутствующих: ${absent}` : 'Отмечено: все на месте');
      this.myLessons.update((list) =>
        list.map((lesson) => (lesson.classId === attendance.classId && lesson.number === attendance.number ? { ...lesson, marked: true } : lesson)),
      );
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected cellTone(status: AttendanceStatus | undefined): string {
    if (!status) return '';
    if (status === 'PRESENT') return 'text-faint';
    return `${STATUSES.find((s) => s.value === status)?.tone ?? ''} text-white`;
  }

  protected cellText(status: AttendanceStatus | undefined): string {
    if (!status) return '';
    return status === 'PRESENT' ? '·' : (STATUSES.find((s) => s.value === status)?.short ?? '');
  }

  protected exportCsv(): void {
    const sheet = this.sheet();
    if (!sheet) return;
    const header = ['Ученик'];
    const keys: string[] = [];
    for (const column of sheet.columns) {
      for (const lesson of column.lessons) {
        header.push(`${formatDayShort(column.date)} ${lesson.number}`);
        keys.push(`${column.date}|${lesson.number}`);
      }
    }
    header.push('Болен', 'Уважительная', 'Неуважительная', 'Уроков', 'Дней');
    const rows = sheet.students.map((student) => [
      student.fullName,
      ...keys.map((key) => {
        const status = student.marks[key]?.status;
        return status && status !== 'PRESENT' ? this.cellText(status) : '';
      }),
      String(student.totals.SICK),
      String(student.totals.EXCUSED),
      String(student.totals.UNEXCUSED),
      String(student.totals.lessons),
      String(student.totals.days),
    ]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(';')).join('\r\n');
    // BOM — иначе Excel откроет кириллицу кракозябрами.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `табель-${sheet.className}-${sheet.from}-${sheet.to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  protected longDay(date: string): string {
    return formatDayLong(date);
  }

  protected shortDay(date: string): string {
    return formatDayShort(date);
  }
}

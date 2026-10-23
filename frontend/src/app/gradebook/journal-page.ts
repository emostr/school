import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { formatDayLong, parseDay, WEEKDAYS_SHORT, weekday } from '../core/dates';
import { AttendanceStatus, Grade, GradeKind, GradeSummary, GradeTarget, Journal, JournalColumn } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { Flyout } from '../ui/flyout';
import { PeriodSelect, Range } from './period-select';
import { averageTone, defaultWeight, formatAverage, GRADE_KINDS, gradeTone, kindLabel, kindShort } from './kinds';

type Tab = 'journal' | 'summary';
type JournalStudent = Journal['students'][number];

interface CellTarget {
  student: JournalStudent;
  column: JournalColumn;
}

const ABSENCE: Record<AttendanceStatus, string> = { PRESENT: '', SICK: 'б', EXCUSED: 'у', UNEXCUSED: 'н' };

/**
 * Электронный журнал учителя: ученики по строкам, уроки предмета по
 * столбцам. Клик по клетке — оценка ученику, клик по дате — оценки всему
 * классу за одну работу. Рядом с оценками — пропуски из посещаемости.
 */
@Component({
  selector: 'es-journal-page',
  imports: [FormsModule, Page, Icon, Dots, Empty, Flyout, PeriodSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="журнал" [subtitle]="subtitle()">
      @if (canSummary()) {
        <nav class="es-pivot mb-5">
          <button type="button" [class.is-active]="tab() === 'journal'" (click)="tab.set('journal')">по предмету</button>
          <button type="button" [class.is-active]="tab() === 'summary'" (click)="openSummary()">сводная ведомость</button>
        </nav>
      }

      <div class="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label class="es-label" for="j-class">класс</label>
          <select id="j-class" class="es-select w-auto min-w-[110px]" [ngModel]="classId()" (ngModelChange)="selectClass($event)">
            <option [ngValue]="''" disabled>класс</option>
            @for (target of targets(); track target.classId) {
              <option [ngValue]="target.classId">{{ target.className }}</option>
            }
          </select>
        </div>
        @if (tab() === 'journal') {
          <div>
            <label class="es-label" for="j-subject">предмет</label>
            <select id="j-subject" class="es-select w-auto min-w-[220px]" [ngModel]="subjectId()" (ngModelChange)="navigate({ subject: $event })">
              <option [ngValue]="''" disabled>предмет</option>
              @for (subject of subjects(); track subject.id) {
                <option [ngValue]="subject.id">{{ subject.name }}{{ subject.canGrade ? '' : ' (только просмотр)' }}</option>
              }
            </select>
          </div>
        }
        <es-period-select [(value)]="range" />
      </div>

      @if (!targets().length && !loading()) {
        <es-empty icon="table" title="Журнала пока нет" text="Журнал открывается по предметам, которые вы ведёте по расписанию. Составьте сетку класса — и предмет появится здесь." />
      } @else if (tab() === 'summary') {
        @if (summary(); as s) {
          @if (!s.subjects.length) {
            <es-empty icon="table" title="За этот период оценок нет" />
          } @else {
            <div class="overflow-x-auto border border-line">
              <table class="border-collapse text-sm">
                <thead>
                  <tr>
                    <th class="sticky left-0 z-10 min-w-[200px] border-r border-b border-line bg-surface px-3 py-2 text-left font-semibold">ученик</th>
                    @for (subject of s.subjects; track subject.id) {
                      <th class="h-28 border-r border-b border-line px-1 align-bottom font-normal text-muted">
                        <span class="inline-block max-h-24 [writing-mode:vertical-rl] rotate-180 text-xs whitespace-nowrap" [title]="subject.name">{{ subject.short }}</span>
                      </th>
                    }
                    <th class="border-b border-line px-3 align-bottom text-xs font-semibold">средний</th>
                  </tr>
                </thead>
                <tbody>
                  @for (student of s.students; track student.id) {
                    <tr class="hover:bg-surface-2">
                      <td class="sticky left-0 z-10 border-r border-b border-line bg-surface px-3 py-1.5 whitespace-nowrap">{{ student.fullName }}</td>
                      @for (subject of s.subjects; track subject.id) {
                        <td class="w-12 border-r border-b border-line px-1 text-center tabular-nums font-semibold {{ tone(student.averages[subject.id]) }}" [title]="(student.counts[subject.id] || 0) + ' оценок'">
                          {{ avg(student.averages[subject.id]) }}
                        </td>
                      }
                      <td class="border-b border-line px-3 text-center font-semibold tabular-nums {{ tone(student.average) }}">{{ avg(student.average) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-xs text-faint">Средний балл — взвешенный: контрольная весит больше ответа на уроке.</p>
          }
        } @else {
          <es-dots class="my-10" />
        }
      } @else if (!subjectId()) {
        <es-empty icon="table" title="Выберите предмет" />
      } @else if (journal(); as j) {
        @if (!j.canEdit) {
          <p class="mb-4 border-l-4 border-info bg-info/10 px-3 py-2 text-sm">Журнал открыт на просмотр: оценки по предмету ставит его учитель.</p>
        }
        @if (!j.columns.length) {
          <es-empty icon="calendar" title="Уроков в этом периоде нет" text="Столбцы журнала берутся из расписания класса." />
        } @else {
          <div class="overflow-x-auto border border-line">
            <table class="border-collapse text-sm">
              <thead>
                <tr>
                  <th class="sticky left-0 z-10 min-w-[220px] border-r border-b border-line bg-surface px-3 py-2 text-left font-semibold">ученик</th>
                  @for (column of j.columns; track column.date + column.lessonNumber) {
                    <th class="min-w-[44px] border-r border-b border-line p-0 font-normal" [class.bg-surface-2]="column.date === school.today()">
                      <button
                        type="button"
                        class="block w-full px-1 py-1 text-center leading-tight disabled:cursor-default"
                        [class.hover:bg-accent-soft]="j.canEdit"
                        [disabled]="!j.canEdit"
                        [title]="j.canEdit ? 'Оценки всему классу за ' + longDay(column.date) : longDay(column.date)"
                        (click)="openBulk(column)"
                      >
                        <span class="block text-[11px] text-faint">{{ short(column.date) }}</span>
                        <span class="block font-semibold">{{ dayNum(column.date) }}</span>
                        @if (column.group) {
                          <span class="block text-[10px] text-faint">гр.{{ column.group }}</span>
                        }
                      </button>
                    </th>
                  }
                  <th class="border-b border-line px-2 text-xs font-semibold">средний</th>
                </tr>
              </thead>
              <tbody>
                @for (student of j.students; track student.id; let i = $index) {
                  <tr class="hover:bg-surface-2" [class.opacity-50]="student.left">
                    <td class="sticky left-0 z-10 border-r border-b border-line bg-surface px-3 py-1 whitespace-nowrap">
                      <span class="mr-2 inline-block w-5 text-right text-xs text-faint">{{ i + 1 }}</span>{{ student.fullName }}
                    </td>
                    @for (column of j.columns; track column.date + column.lessonNumber) {
                      @let cell = gradesIn(student, column);
                      @let absent = absenceIn(student, column);
                      @let foreign = !!column.group && !!student.group && column.group !== student.group;
                      <td class="h-9 border-r border-b border-line p-0" [class.bg-surface-2]="foreign">
                        <button
                          type="button"
                          class="flex h-full min-h-9 w-full items-center justify-center gap-0.5 px-0.5 disabled:cursor-default"
                          [class.hover:bg-accent-soft]="j.canEdit && !foreign"
                          [disabled]="!j.canEdit || foreign"
                          (click)="openCell(student, column)"
                          [attr.aria-label]="student.fullName + ', ' + longDay(column.date)"
                        >
                          @for (grade of cell; track grade.id) {
                            <span
                              class="inline-grid h-6 min-w-6 place-items-center px-1 text-[13px] font-semibold {{ gradeColor(grade.value) }}"
                              [class.underline]="grade.weight >= 3"
                              [title]="gradeTitle(grade)"
                            >{{ grade.value }}</span>
                          }
                          @if (absent) {
                            <span class="text-xs font-semibold text-danger" [title]="'пропуск: ' + absent">{{ absent }}</span>
                          }
                        </button>
                      </td>
                    }
                    <td class="border-b border-line px-2 text-center font-semibold tabular-nums {{ tone(student.average) }}">{{ avg(student.average) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-faint">
            <span>клик по клетке — оценка ученику, по дате — всему классу</span>
            <span><span class="underline">подчёркнута</span> — работа с весом 3 и больше</span>
            <span>н, б, у — пропуск: без причины, болел, по уважительной</span>
          </p>
        }
      } @else {
        <es-dots class="my-10" />
      }
    </es-page>

    <!-- Оценки одному ученику за урок -->
    <es-flyout [open]="!!cell()" [title]="cell()?.student?.fullName ?? ''" [subtitle]="cellSubtitle()" [width]="440" (closed)="cell.set(null)">
      @if (cell(); as c) {
        @let existing = gradesIn(c.student, c.column);
        @if (existing.length) {
          <p class="es-label">уже стоят</p>
          <ul class="mb-6 space-y-2">
            @for (grade of existing; track grade.id) {
              <li class="bg-surface-2 p-3">
                <div class="flex items-center gap-3">
                  <span class="inline-grid h-9 w-9 place-items-center text-lg font-semibold {{ gradeColor(grade.value) }}">{{ grade.value }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold">{{ kind(grade.kind) }} · вес {{ grade.weight }}</span>
                    <span class="block truncate text-xs text-muted">{{ grade.comment || (grade.fromTest ? 'из теста' : '') }}{{ grade.teacher ? ' · ' + grade.teacher.fullName : '' }}</span>
                  </span>
                  <button type="button" class="es-btn es-btn-ghost es-btn-sm es-btn-icon" title="Править" (click)="editGrade(grade)"><es-icon name="edit" [size]="16" /></button>
                  <button type="button" class="es-btn es-btn-ghost es-btn-sm es-btn-icon hover:!text-danger" title="Удалить" (click)="removeGrade(grade)"><es-icon name="trash" [size]="16" /></button>
                </div>
              </li>
            }
          </ul>
        }

        <p class="es-label">{{ editing() ? 'правка оценки' : 'новая оценка' }}</p>
        <div class="grid grid-cols-5 gap-1">
          @for (value of [5, 4, 3, 2, 1]; track value) {
            <button
              type="button"
              class="h-14 border-2 text-2xl font-light transition-colors"
              [class]="draftValue() === value ? gradeColor(value) + ' border-transparent' : 'border-line hover:border-line-strong'"
              (click)="draftValue.set(value)"
            >{{ value }}</button>
          }
        </div>
        <div class="mt-4 grid grid-cols-[1fr_90px] gap-3">
          <div>
            <label class="es-label" for="g-kind">за что</label>
            <select id="g-kind" class="es-select" [ngModel]="draftKind()" (ngModelChange)="setKind($event)">
              @for (item of kinds; track item.value) {
                <option [ngValue]="item.value">{{ item.label }}</option>
              }
            </select>
          </div>
          <div>
            <label class="es-label" for="g-weight">вес</label>
            <input id="g-weight" type="number" min="1" max="10" class="es-input" [ngModel]="draftWeight()" (ngModelChange)="draftWeight.set(+$event || 1)" />
          </div>
        </div>
        <label class="es-label mt-4" for="g-comment">комментарий</label>
        <input id="g-comment" class="es-input" maxlength="300" placeholder="видят ученик и родители" [ngModel]="draftComment()" (ngModelChange)="draftComment.set($event)" />
      }
      <ng-container flyout-actions>
        @if (editing()) {
          <button type="button" class="es-btn mr-auto" (click)="resetDraft()">новая вместо правки</button>
        }
        <button type="button" class="es-btn" (click)="cell.set(null)">закрыть</button>
        <button type="button" class="es-btn es-btn-primary" [disabled]="!draftValue() || busy()" (click)="saveCell()">{{ editing() ? 'сохранить' : 'поставить' }}</button>
      </ng-container>
    </es-flyout>

    <!-- Колонка оценок всему классу -->
    <es-flyout [open]="!!bulk()" title="оценки всему классу" [subtitle]="bulkSubtitle()" [width]="620" (closed)="bulk.set(null)">
      @if (bulk(); as b) {
        <div class="mb-5 grid grid-cols-[1fr_90px] gap-3">
          <div>
            <label class="es-label" for="b-kind">за что</label>
            <select id="b-kind" class="es-select" [ngModel]="draftKind()" (ngModelChange)="setKind($event)">
              @for (item of kinds; track item.value) {
                <option [ngValue]="item.value">{{ item.label }}</option>
              }
            </select>
          </div>
          <div>
            <label class="es-label" for="b-weight">вес</label>
            <input id="b-weight" type="number" min="1" max="10" class="es-input" [ngModel]="draftWeight()" (ngModelChange)="draftWeight.set(+$event || 1)" />
          </div>
        </div>
        <ul class="divide-y divide-line border-y border-line">
          @for (student of bulkStudents(); track student.id; let i = $index) {
            <li class="flex items-center gap-3 py-1.5">
              <span class="w-5 text-right text-xs text-faint">{{ i + 1 }}</span>
              <span class="min-w-0 flex-1 truncate text-sm">
                {{ student.fullName }}
                @if (absenceIn(student, b); as absent) {
                  <span class="ml-1 text-xs font-semibold text-danger">{{ absent }}</span>
                }
              </span>
              <div class="flex">
                @for (value of [5, 4, 3, 2]; track value) {
                  <button
                    type="button"
                    class="h-8 w-9 border-2 text-sm font-semibold transition-colors"
                    [class]="bulkMarks()[student.id] === value ? gradeColor(value) + ' border-transparent' : 'border-line text-muted hover:border-line-strong'"
                    (click)="toggleBulk(student.id, value)"
                  >{{ value }}</button>
                }
              </div>
            </li>
          }
        </ul>
        <p class="es-hint mt-3">Пустая строка — оценки не будет. Уже стоящие оценки этого урока не трогаются.</p>
      }
      <ng-container flyout-actions>
        <span class="mr-auto self-center text-sm text-muted">{{ bulkCount() }} оценок</span>
        <button type="button" class="es-btn" (click)="bulk.set(null)">отмена</button>
        <button type="button" class="es-btn es-btn-primary" [disabled]="!bulkCount() || busy()" (click)="saveBulk()">выставить</button>
      </ng-container>
    </es-flyout>
  `,
})
export class JournalPage {
  protected readonly auth = inject(Auth);
  protected readonly school = inject(School);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly kinds = GRADE_KINDS;
  private readonly query = signal<Record<string, string>>({});
  protected readonly tab = signal<Tab>('journal');
  protected readonly targets = signal<GradeTarget[]>([]);
  protected readonly journal = signal<Journal | null>(null);
  protected readonly summary = signal<GradeSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly range = signal<Range>({ from: '', to: '' });

  protected readonly cell = signal<CellTarget | null>(null);
  protected readonly editing = signal<Grade | null>(null);
  protected readonly draftValue = signal<number | null>(null);
  protected readonly draftKind = signal<GradeKind>('LESSON');
  protected readonly draftWeight = signal(1);
  protected readonly draftComment = signal('');
  protected readonly bulk = signal<JournalColumn | null>(null);
  protected readonly bulkMarks = signal<Record<string, number>>({});

  protected readonly classId = computed(() => this.query()['class'] || this.targets()[0]?.classId || '');
  protected readonly target = computed(() => this.targets().find((t) => t.classId === this.classId()) ?? null);
  protected readonly subjects = computed(() => this.target()?.subjects ?? []);
  protected readonly subjectId = computed(() => {
    const wanted = this.query()['subject'];
    const subjects = this.subjects();
    if (wanted && subjects.some((s) => s.id === wanted)) return wanted;
    // Учителю сразу открываем его предмет.
    return subjects.find((s) => s.canGrade)?.id ?? '';
  });
  protected readonly canSummary = computed(() => this.auth.isHead() || this.auth.homeroomIds().includes(this.classId()));
  protected readonly subtitle = computed(() => {
    const target = this.target();
    if (!target) return '';
    if (this.tab() === 'summary') return target.className;
    const subject = this.subjects().find((s) => s.id === this.subjectId());
    return subject ? `${target.className} · ${subject.name}` : target.className;
  });
  protected readonly bulkStudents = computed(() => {
    const column = this.bulk();
    return (this.journal()?.students ?? []).filter(
      (student) => !student.left && (!column?.group || !student.group || student.group === column.group),
    );
  });
  protected readonly bulkCount = computed(() => Object.keys(this.bulkMarks()).length);

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      this.query.set(Object.fromEntries(params.keys.map((key) => [key, params.get(key) ?? ''])));
    });
    void this.api
      .get<GradeTarget[]>('/gradebook/targets')
      .then((targets) => this.targets.set(targets))
      .catch((error) => this.notify.error(error))
      .finally(() => this.loading.set(false));
    effect(() => {
      const classId = this.classId();
      const subjectId = this.subjectId();
      const range = this.range();
      const tab = this.tab();
      untracked(() => {
        if (!classId || !range.from) return;
        if (tab === 'summary') void this.loadSummary(classId, range);
        else if (subjectId) void this.load(classId, subjectId, range);
      });
    });
  }

  protected navigate(params: Record<string, string>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  protected selectClass(classId: string): void {
    this.navigate({ class: classId, subject: '' });
  }

  private async load(classId: string, subjectId: string, range: Range): Promise<void> {
    this.journal.set(null);
    try {
      this.journal.set(await this.api.get<Journal>('/gradebook/journal', { classId, subjectId, ...range }));
    } catch (error) {
      this.notify.error(error);
    }
  }

  private reload(): void {
    void this.load(this.classId(), this.subjectId(), this.range());
  }

  protected openSummary(): void {
    this.tab.set('summary');
  }

  private async loadSummary(classId: string, range: Range): Promise<void> {
    this.summary.set(null);
    try {
      this.summary.set(await this.api.get<GradeSummary>('/gradebook/summary', { classId, ...range }));
    } catch (error) {
      this.notify.error(error);
    }
  }

  // ─── Клетка ──────────────────────────────────────────────────────────────

  protected gradesIn(student: JournalStudent, column: JournalColumn): Grade[] {
    return student.grades.filter(
      (grade) => grade.date === column.date && (grade.lessonNumber === column.lessonNumber || grade.lessonNumber === null || column.lessonNumber === null),
    );
  }

  protected absenceIn(student: JournalStudent, column: JournalColumn): string {
    const mark = student.absences.find((item) => item.date === column.date && item.number === column.lessonNumber);
    return mark ? ABSENCE[mark.status] : '';
  }

  protected openCell(student: JournalStudent, column: JournalColumn): void {
    this.resetDraft();
    this.cell.set({ student, column });
  }

  protected resetDraft(): void {
    this.editing.set(null);
    this.draftValue.set(null);
    this.draftKind.set('LESSON');
    this.draftWeight.set(1);
    this.draftComment.set('');
  }

  protected editGrade(grade: Grade): void {
    this.editing.set(grade);
    this.draftValue.set(grade.value);
    this.draftKind.set(grade.kind);
    this.draftWeight.set(grade.weight);
    this.draftComment.set(grade.comment);
  }

  protected setKind(kind: GradeKind): void {
    this.draftKind.set(kind);
    this.draftWeight.set(defaultWeight(kind));
  }

  protected async saveCell(): Promise<void> {
    const target = this.cell();
    const journal = this.journal();
    const value = this.draftValue();
    if (!target || !journal || !value) return;
    this.busy.set(true);
    try {
      const editing = this.editing();
      if (editing) {
        await this.api.patch(`/gradebook/grades/${editing.id}`, {
          value,
          kind: this.draftKind(),
          weight: this.draftWeight(),
          comment: this.draftComment(),
        });
      } else {
        await this.api.post('/gradebook/grades', {
          classId: journal.classId,
          subjectId: journal.subject.id,
          studentId: target.student.id,
          date: target.column.date,
          lessonNumber: target.column.lessonNumber,
          value,
          kind: this.draftKind(),
          weight: this.draftWeight(),
          comment: this.draftComment(),
        });
      }
      this.cell.set(null);
      this.notify.success(editing ? 'Оценка исправлена' : `${target.student.fullName}: ${value}`);
      this.reload();
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async removeGrade(grade: Grade): Promise<void> {
    const ok = await this.notify.confirm({
      title: `Удалить оценку ${grade.value}?`,
      message: `${kindLabel(grade.kind)}, ${formatDayLong(grade.date)}`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/gradebook/grades/${grade.id}`);
      this.cell.set(null);
      this.notify.success('Оценка удалена');
      this.reload();
    } catch (error) {
      this.notify.error(error);
    }
  }

  // ─── Колонка ─────────────────────────────────────────────────────────────

  protected openBulk(column: JournalColumn): void {
    this.bulkMarks.set({});
    this.setKind('TEST');
    this.bulk.set(column);
  }

  protected toggleBulk(studentId: string, value: number): void {
    this.bulkMarks.update((marks) => {
      const next = { ...marks };
      if (next[studentId] === value) delete next[studentId];
      else next[studentId] = value;
      return next;
    });
  }

  protected async saveBulk(): Promise<void> {
    const column = this.bulk();
    const journal = this.journal();
    if (!column || !journal) return;
    this.busy.set(true);
    try {
      const marks = Object.entries(this.bulkMarks()).map(([studentId, value]) => ({ studentId, value }));
      await this.api.post('/gradebook/grades/bulk', {
        classId: journal.classId,
        subjectId: journal.subject.id,
        date: column.date,
        lessonNumber: column.lessonNumber,
        kind: this.draftKind(),
        weight: this.draftWeight(),
        marks,
      });
      this.bulk.set(null);
      this.notify.success(`Выставлено оценок: ${marks.length}`);
      this.reload();
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ─── Подписи ─────────────────────────────────────────────────────────────

  protected cellSubtitle(): string {
    const target = this.cell();
    if (!target) return '';
    const lesson = target.column.lessonNumber ? `, ${target.column.lessonNumber}-й урок` : '';
    return `${formatDayLong(target.column.date)}${lesson}`;
  }

  protected bulkSubtitle(): string {
    const column = this.bulk();
    if (!column) return '';
    const journal = this.journal();
    return `${journal?.subject.name ?? ''} · ${formatDayLong(column.date)}${column.lessonNumber ? `, ${column.lessonNumber}-й урок` : ''}`;
  }

  protected gradeTitle(grade: Grade): string {
    return [`${kindLabel(grade.kind)} · вес ${grade.weight}`, grade.comment, grade.teacher?.fullName].filter(Boolean).join('\n');
  }

  protected gradeColor(value: number): string {
    return gradeTone(value);
  }

  protected kind(kind: GradeKind): string {
    return kindLabel(kind);
  }

  protected kindTag(kind: GradeKind): string {
    return kindShort(kind);
  }

  protected tone(value: number | null | undefined): string {
    return averageTone(value ?? null);
  }

  protected avg(value: number | null | undefined): string {
    return formatAverage(value ?? null);
  }

  protected longDay(date: string): string {
    return formatDayLong(date);
  }

  protected short(date: string): string {
    return WEEKDAYS_SHORT[weekday(date)];
  }

  protected dayNum(date: string): string {
    const d = parseDay(date);
    return `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}

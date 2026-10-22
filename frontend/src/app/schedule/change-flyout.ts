import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { formatDayLong } from '../core/dates';
import { ChangeKind, Lesson } from '../core/types';
import { Flyout } from '../ui/flyout';

export interface ChangeTarget {
  classId: string;
  date: string;
  number: number;
  group: string;
  lesson: Lesson | null;
}

/**
 * Изменение расписания на один день: замена учителя, предмета или
 * кабинета, отмена урока или дополнительный урок. Постоянная сетка при
 * этом не трогается.
 */
@Component({
  selector: 'es-change-flyout',
  imports: [FormsModule, Flyout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-flyout [open]="!!target()" [title]="target()?.lesson ? 'изменить урок' : 'добавить урок'" [subtitle]="subtitle()" (closed)="closed.emit()">
      @if (target(); as t) {
        <form id="change-form" class="space-y-4" (ngSubmit)="save()">
          @if (t.lesson; as lesson) {
            <div class="bg-surface-2 p-3 text-sm">
              <p class="text-muted">по сетке</p>
              <p class="font-semibold">{{ lesson.subject?.name ?? '—' }}</p>
              <p class="text-muted">{{ lesson.teacher?.fullName ?? 'учитель не назначен' }}{{ lesson.room ? ' · каб. ' + lesson.room.name : '' }}</p>
            </div>
          }

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="es-label" for="ch-date">дата</label>
              <input id="ch-date" name="date" type="date" class="es-input" [(ngModel)]="date" required />
            </div>
            <div>
              <label class="es-label" for="ch-number">урок</label>
              <select id="ch-number" name="number" class="es-select" [(ngModel)]="number">
                @for (bell of school.bells(); track bell.number) {
                  <option [ngValue]="bell.number">{{ bell.number }} · {{ bell.start }}–{{ bell.end }}</option>
                }
              </select>
            </div>
          </div>

          <div>
            <span class="es-label">что происходит</span>
            <div class="grid grid-cols-3 gap-1">
              @for (option of kinds; track option.value) {
                <button type="button" class="es-btn es-btn-sm" [class.es-btn-primary]="kind() === option.value" (click)="kind.set(option.value)">
                  {{ option.label }}
                </button>
              }
            </div>
          </div>

          @if (kind() !== 'CANCEL') {
            <div>
              <label class="es-label" for="ch-subject">предмет</label>
              <select id="ch-subject" name="subject" class="es-select" [(ngModel)]="subjectId">
                <option [ngValue]="''">{{ kind() === 'REPLACE' ? 'как по сетке' : 'выберите' }}</option>
                @for (subject of school.subjects(); track subject.id) {
                  <option [ngValue]="subject.id">{{ subject.name }}</option>
                }
              </select>
            </div>
            <div>
              <label class="es-label" for="ch-teacher">учитель</label>
              <select id="ch-teacher" name="teacher" class="es-select" [(ngModel)]="teacherId">
                <option [ngValue]="''">{{ kind() === 'REPLACE' ? 'как по сетке' : 'не назначен' }}</option>
                @for (person of school.staff(); track person.id) {
                  <option [ngValue]="person.id">{{ person.fullName }}</option>
                }
              </select>
            </div>
            <div>
              <label class="es-label" for="ch-room">кабинет</label>
              <select id="ch-room" name="room" class="es-select" [(ngModel)]="roomId">
                <option [ngValue]="''">{{ kind() === 'REPLACE' ? 'как по сетке' : 'не указан' }}</option>
                @for (room of school.rooms(); track room.id) {
                  <option [ngValue]="room.id">{{ room.name }}</option>
                }
              </select>
            </div>
          }

          <div>
            <label class="es-label" for="ch-note">примечание</label>
            <input id="ch-note" name="note" class="es-input" placeholder="например: «учитель на курсах»" maxlength="300" [(ngModel)]="note" />
          </div>
        </form>
      }

      <ng-container flyout-actions>
        @if (target()?.lesson?.changeId) {
          <button type="button" class="es-btn es-btn-danger mr-auto" [disabled]="busy()" (click)="remove()">вернуть как по сетке</button>
        }
        <button type="button" class="es-btn" (click)="closed.emit()">отмена</button>
        <button type="submit" form="change-form" class="es-btn es-btn-primary" [disabled]="busy()">сохранить</button>
      </ng-container>
    </es-flyout>
  `,
})
export class ChangeFlyout {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly school = inject(School);

  readonly target = input<ChangeTarget | null>(null);
  readonly closed = output<void>();
  readonly saved = output<void>();

  protected readonly kinds: { value: ChangeKind; label: string }[] = [
    { value: 'REPLACE', label: 'замена' },
    { value: 'CANCEL', label: 'отмена' },
    { value: 'ADD', label: 'доп. урок' },
  ];

  protected readonly kind = signal<ChangeKind>('REPLACE');
  protected readonly busy = signal(false);
  protected date = '';
  protected number = 1;
  protected subjectId = '';
  protected teacherId = '';
  protected roomId = '';
  protected note = '';

  constructor() {
    void Promise.all([this.school.loadSubjects(), this.school.loadStaff(), this.school.loadRooms()]).catch(() => undefined);
    effect(() => {
      const target = this.target();
      if (!target) return;
      this.date = target.date;
      this.number = target.number;
      this.note = target.lesson?.note ?? '';
      const lesson = target.lesson;
      this.kind.set(lesson ? (lesson.status === 'cancelled' ? 'CANCEL' : 'REPLACE') : 'ADD');
      // У уже заменённого урока показываем то, что поставили в замену.
      this.subjectId = lesson && lesson.status !== 'regular' ? (lesson.subject?.id ?? '') : '';
      this.teacherId = lesson && lesson.status !== 'regular' ? (lesson.teacher?.id ?? '') : '';
      this.roomId = lesson && lesson.status !== 'regular' ? (lesson.room?.id ?? '') : '';
    });
  }

  protected subtitle(): string {
    const target = this.target();
    return target ? `${formatDayLong(target.date)}, ${target.number}-й урок` : '';
  }

  protected async save(): Promise<void> {
    const target = this.target();
    if (!target) return;
    this.busy.set(true);
    try {
      await this.api.put(`/schedule/classes/${target.classId}/changes`, {
        date: this.date,
        number: this.number,
        group: target.group,
        kind: this.kind(),
        subjectId: this.subjectId || null,
        teacherId: this.teacherId || null,
        roomId: this.roomId || null,
        note: this.note,
      });
      this.notify.success('Изменение расписания сохранено');
      this.saved.emit();
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const changeId = this.target()?.lesson?.changeId;
    if (!changeId) return;
    this.busy.set(true);
    try {
      await this.api.delete(`/schedule/changes/${changeId}`);
      this.notify.success('Урок снова идёт по сетке');
      this.saved.emit();
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

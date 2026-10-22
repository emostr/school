import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { formatDay, WEEKDAYS } from '../core/dates';
import { ClassDetail, GridLesson, VersionDetail, VersionRow } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';

interface Slot {
  subjectId: string;
  teacherId: string;
  roomId: string;
}

interface Cell {
  split: boolean;
  whole: Slot;
  groups: [Slot, Slot];
}

const emptySlot = (): Slot => ({ subjectId: '', teacherId: '', roomId: '' });
const emptyCell = (): Cell => ({ split: false, whole: emptySlot(), groups: [emptySlot(), emptySlot()] });

/**
 * Постоянная сетка класса. Сохраняется новой версией с датой начала:
 * прошлые недели остаются как были, по ним уже отмечена посещаемость.
 */
@Component({
  selector: 'es-grid-editor',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, Page, Icon, Dots],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="постоянная сетка" [subtitle]="schoolClass()?.name ? 'класс ' + schoolClass()?.name : ''">
      <ng-container page-actions>
        <a [routerLink]="['/schedule']" [queryParams]="{ class: classId() }" class="es-btn">отмена</a>
        <button type="button" class="es-btn es-btn-primary" [disabled]="busy() || loading()" (click)="save()">
          <es-icon name="save" [size]="18" /> сохранить сетку
        </button>
      </ng-container>

      @if (loading()) {
        <es-dots class="my-10" />
      } @else {
        <div class="mb-6 grid gap-4 sm:grid-cols-[200px_1fr]">
          <div>
            <label class="es-label" for="valid-from">действует с</label>
            <input id="valid-from" type="date" class="es-input" [(ngModel)]="validFrom" />
          </div>
          <div>
            <label class="es-label" for="note">примечание</label>
            <input id="note" class="es-input" placeholder="например: «второе полугодие»" maxlength="300" [(ngModel)]="note" />
          </div>
        </div>
        @if (baseInfo()) {
          <p class="mb-4 text-sm text-muted">{{ baseInfo() }}</p>
        }

        <div class="overflow-x-auto pb-2">
          <table class="w-full min-w-[980px] border-collapse">
            <thead>
              <tr>
                <th class="w-16"></th>
                @for (wd of weekdays(); track wd) {
                  <th class="border-b-2 border-line px-1 pb-2 text-left text-lg font-light">{{ weekdayName(wd) }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (bell of bells(); track bell.number) {
                <tr class="align-top">
                  <td class="border-b border-line py-2 pr-2">
                    <span class="block text-2xl leading-none font-light">{{ bell.number }}</span>
                    <span class="text-[11px] text-faint">{{ bell.start }}<br />{{ bell.end }}</span>
                  </td>
                  @for (wd of weekdays(); track wd) {
                    <td class="border-b border-line p-1">
                      @let cell = cellAt(wd, bell.number);
                      <div class="space-y-1 p-1.5" [class]="cell.whole.subjectId || cell.split ? 'bg-surface' : 'bg-surface/40'">
                        @if (!cell.split) {
                          <ng-container *ngTemplateOutlet="slot; context: { $implicit: cell.whole }" />
                        } @else {
                          @for (group of cell.groups; track $index) {
                            <p class="text-[11px] font-semibold text-muted">группа {{ $index + 1 }}</p>
                            <ng-container *ngTemplateOutlet="slot; context: { $implicit: group }" />
                          }
                        }
                        <label class="flex items-center gap-1.5 pt-0.5 text-[11px] text-faint">
                          <input type="checkbox" class="es-check !h-3.5 !w-3.5" [checked]="cell.split" (change)="toggleSplit(wd, bell.number)" />
                          по подгруппам
                        </label>
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </es-page>

    <ng-template #slot let-slot>
      <select class="es-select !min-h-7 !py-0.5 !text-xs" [(ngModel)]="slot.subjectId" (ngModelChange)="touch()" aria-label="Предмет">
        <option value="">—</option>
        @for (subject of school.subjects(); track subject.id) {
          <option [value]="subject.id">{{ subject.short || subject.name }}</option>
        }
      </select>
      @if (slot.subjectId) {
        <select class="es-select !min-h-7 !py-0.5 !text-xs" [(ngModel)]="slot.teacherId" (ngModelChange)="touch()" aria-label="Учитель">
          <option value="">учитель</option>
          @for (person of school.staff(); track person.id) {
            <option [value]="person.id">{{ person.fullName }}</option>
          }
        </select>
        <select class="es-select !min-h-7 !py-0.5 !text-xs" [(ngModel)]="slot.roomId" (ngModelChange)="touch()" aria-label="Кабинет">
          <option value="">кабинет</option>
          @for (room of school.rooms(); track room.id) {
            <option [value]="room.id">{{ room.name }}</option>
          }
        </select>
      }
    </ng-template>
  `,
})
export class GridEditorPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  protected readonly school = inject(School);

  readonly classId = input.required<string>();

  protected readonly schoolClass = signal<ClassDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly baseInfo = signal('');
  private readonly cells = signal(new Map<string, Cell>());
  private readonly version = signal(0);
  protected validFrom = '';
  protected note = '';

  protected readonly weekdays = computed(() => Array.from({ length: this.school.weekDays() }, (_, i) => i + 1));
  protected readonly bells = computed(() => {
    // Нулевой урок показываем, только если он есть в звонках.
    return this.school.bells().length ? this.school.bells() : Array.from({ length: 8 }, (_, i) => ({ number: i + 1, start: '', end: '' }));
  });

  constructor() {
    effect(() => {
      const id = this.classId();
      untracked(() => void this.load(id));
    });
  }

  protected weekdayName(n: number): string {
    return WEEKDAYS[n];
  }

  protected cellAt(weekday: number, number: number): Cell {
    this.version();
    const key = `${weekday}:${number}`;
    let cell = this.cells().get(key);
    if (!cell) {
      cell = emptyCell();
      this.cells().set(key, cell);
    }
    return cell;
  }

  protected toggleSplit(weekday: number, number: number): void {
    const cell = this.cellAt(weekday, number);
    cell.split = !cell.split;
    if (cell.split && cell.whole.subjectId) {
      // Делим урок — обе подгруппы начинают с того же предмета.
      cell.groups = [{ ...cell.whole }, { ...cell.whole, teacherId: '', roomId: '' }];
    }
    this.touch();
  }

  protected touch(): void {
    this.version.update((v) => v + 1);
  }

  private async load(classId: string): Promise<void> {
    this.loading.set(true);
    try {
      const [detail, versions] = await Promise.all([
        this.api.get<ClassDetail>(`/classes/${classId}`),
        this.api.get<VersionRow[]>(`/schedule/classes/${classId}/versions`),
        this.school.loadInfo(),
        this.school.loadSubjects(),
        this.school.loadStaff(),
        this.school.loadRooms(),
      ]);
      this.schoolClass.set(detail);
      // Правим запланированную сетку, если она есть, иначе берём действующую за основу.
      const base = versions.find((v) => v.state === 'planned') ?? versions.find((v) => v.state === 'current');
      const map = new Map<string, Cell>();
      if (base) {
        const version = await this.api.get<VersionDetail>(`/schedule/versions/${base.id}`);
        this.fill(map, version.lessons);
        this.note = version.note;
        if (base.state === 'planned') {
          this.validFrom = base.validFrom;
          this.baseInfo.set(`Правится запланированная сетка с ${formatDay(base.validFrom)}.`);
        } else {
          this.validFrom = this.school.today();
          this.baseInfo.set(`За основу взята действующая сетка с ${formatDay(base.validFrom)}. Новая начнёт действовать с выбранной даты.`);
        }
      } else {
        // Первую сетку обычно заводят с начала учебного года.
        const today = this.school.today();
        const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 9 ? 1 : 0);
        this.validFrom = `${year}-09-01`;
        this.baseInfo.set('Сетки у класса ещё нет. Первую можно завести и задним числом — с начала учебного года.');
      }
      this.cells.set(map);
      this.touch();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.loading.set(false);
    }
  }

  private fill(map: Map<string, Cell>, lessons: GridLesson[]): void {
    for (const lesson of lessons) {
      const key = `${lesson.weekday}:${lesson.number}`;
      const cell = map.get(key) ?? emptyCell();
      const slot = { subjectId: lesson.subjectId, teacherId: lesson.teacherId ?? '', roomId: lesson.roomId ?? '' };
      if (lesson.group) {
        cell.split = true;
        cell.groups[lesson.group === '2' ? 1 : 0] = slot;
      } else {
        cell.whole = slot;
      }
      map.set(key, cell);
    }
  }

  private collect(): GridLesson[] {
    const lessons: GridLesson[] = [];
    for (const [key, cell] of this.cells()) {
      const [weekday, number] = key.split(':').map(Number);
      if (weekday > this.school.weekDays()) continue;
      const push = (slot: Slot, group: string) => {
        if (slot.subjectId) {
          lessons.push({ weekday, number, group, subjectId: slot.subjectId, teacherId: slot.teacherId || null, roomId: slot.roomId || null });
        }
      };
      if (cell.split) {
        push(cell.groups[0], '1');
        push(cell.groups[1], '2');
      } else {
        push(cell.whole, '');
      }
    }
    return lessons;
  }

  protected async save(): Promise<void> {
    if (!this.validFrom) {
      this.notify.error('Укажите, с какой даты действует сетка');
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.api.post<{ warnings: string[] }>(`/schedule/classes/${this.classId()}/versions`, {
        validFrom: this.validFrom,
        note: this.note,
        lessons: this.collect(),
      });
      if (result.warnings.length) {
        this.notify.warning(result.warnings.slice(0, 6).join('\n'), 'Сетка сохранена, но есть накладки');
      } else {
        this.notify.success('Сетка сохранена');
      }
      await this.router.navigate(['/schedule'], { queryParams: { class: this.classId(), date: this.validFrom } });
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

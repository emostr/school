import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { formatDay } from '../core/dates';
import { Holiday, Room, Subject } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';

type Tab = 'subjects' | 'rooms' | 'holidays';

@Component({
  selector: 'es-catalog-page',
  imports: [FormsModule, Page, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="справочники">
      <nav class="es-pivot mb-6">
        <button type="button" [class.is-active]="tab() === 'subjects'" (click)="tab.set('subjects')">предметы</button>
        <button type="button" [class.is-active]="tab() === 'rooms'" (click)="tab.set('rooms')">кабинеты</button>
        <button type="button" [class.is-active]="tab() === 'holidays'" (click)="tab.set('holidays')">каникулы</button>
      </nav>

      @switch (tab()) {
        @case ('subjects') {
          <div class="max-w-3xl">
            <form class="mb-5 flex flex-wrap gap-2" (ngSubmit)="addSubject()">
              <input name="name" class="es-input min-w-[220px] flex-1" placeholder="название: Вероятность и статистика" [(ngModel)]="subjectName" />
              <input name="short" class="es-input w-40" placeholder="коротко: Вер. и стат." maxlength="20" [(ngModel)]="subjectShort" />
              <button type="submit" class="es-btn es-btn-primary"><es-icon name="plus" [size]="18" /> добавить</button>
            </form>
            @if (!subjects().length) {
              <div class="mb-4 bg-accent-soft p-4">
                <p class="text-sm">Предметов пока нет. Можно начать со стандартного набора школьной программы и поправить его.</p>
                <button type="button" class="es-btn es-btn-primary mt-3" (click)="seed()">стандартный набор</button>
              </div>
            }
            <ul class="divide-y divide-line border-y border-line">
              @for (subject of subjects(); track subject.id) {
                <li class="flex items-center gap-3 py-2">
                  @if (editing() === subject.id) {
                    <input class="es-input flex-1" [(ngModel)]="editName" aria-label="Название" />
                    <input class="es-input w-36" [(ngModel)]="editShort" aria-label="Коротко" />
                    <button type="button" class="es-btn es-btn-sm es-btn-primary" (click)="saveSubject(subject)">сохранить</button>
                    <button type="button" class="es-btn es-btn-sm" (click)="editing.set(null)">отмена</button>
                  } @else {
                    <span class="flex-1">{{ subject.name }}</span>
                    <span class="text-sm text-muted">{{ subject.short }}</span>
                    <button type="button" class="es-btn es-btn-sm es-btn-ghost es-btn-icon" title="Править" (click)="editSubject(subject)"><es-icon name="edit" [size]="16" /></button>
                    <button type="button" class="es-btn es-btn-sm es-btn-ghost es-btn-icon hover:!text-danger" title="В архив" (click)="archiveSubject(subject)"><es-icon name="archive" [size]="16" /></button>
                  }
                </li>
              }
            </ul>
          </div>
        }
        @case ('rooms') {
          <div class="max-w-2xl">
            <form class="mb-5 flex flex-wrap gap-2" (ngSubmit)="addRoom()">
              <input name="room" class="es-input w-40" placeholder="204" [(ngModel)]="roomName" />
              <input name="note" class="es-input min-w-[200px] flex-1" placeholder="примечание: кабинет физики" [(ngModel)]="roomNote" />
              <button type="submit" class="es-btn es-btn-primary"><es-icon name="plus" [size]="18" /> добавить</button>
            </form>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              @for (room of rooms(); track room.id) {
                <div class="group relative bg-surface p-4">
                  <p class="text-2xl font-light">{{ room.name }}</p>
                  <p class="truncate text-xs text-muted">{{ room.note || ' ' }}</p>
                  <button type="button" class="absolute top-2 right-2 text-faint opacity-0 group-hover:opacity-100 hover:text-danger" title="Убрать" (click)="archiveRoom(room)"><es-icon name="close" [size]="16" /></button>
                </div>
              }
            </div>
          </div>
        }
        @case ('holidays') {
          <div class="max-w-2xl">
            <form class="mb-5 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" (ngSubmit)="addHoliday()">
              <input name="title" class="es-input" placeholder="осенние каникулы" [(ngModel)]="holidayTitle" />
              <input name="from" type="date" class="es-input" [(ngModel)]="holidayFrom" aria-label="С" />
              <input name="to" type="date" class="es-input" [(ngModel)]="holidayTo" aria-label="По" />
              <button type="submit" class="es-btn es-btn-primary"><es-icon name="plus" [size]="18" /></button>
            </form>
            <p class="mb-4 text-sm text-muted">В эти дни расписание показывает каникулы вместо уроков.</p>
            <ul class="divide-y divide-line border-y border-line">
              @for (holiday of holidays(); track holiday.id) {
                <li class="flex items-center gap-3 py-2.5">
                  <es-icon name="sun" [size]="18" class="text-teal" />
                  <span class="flex-1">{{ holiday.title }}</span>
                  <span class="text-sm text-muted">{{ day(holiday.from) }} — {{ day(holiday.to) }}</span>
                  <button type="button" class="es-btn es-btn-sm es-btn-ghost es-btn-icon hover:!text-danger" title="Удалить" (click)="removeHoliday(holiday)"><es-icon name="trash" [size]="16" /></button>
                </li>
              } @empty {
                <li class="py-6 text-center text-muted">Каникулы не заведены</li>
              }
            </ul>
          </div>
        }
      }
    </es-page>
  `,
})
export class CatalogPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly school = inject(School);

  protected readonly tab = signal<Tab>('subjects');
  protected readonly subjects = signal<Subject[]>([]);
  protected readonly rooms = signal<Room[]>([]);
  protected readonly holidays = signal<Holiday[]>([]);
  protected readonly editing = signal<string | null>(null);
  protected subjectName = '';
  protected subjectShort = '';
  protected editName = '';
  protected editShort = '';
  protected roomName = '';
  protected roomNote = '';
  protected holidayTitle = '';
  protected holidayFrom = '';
  protected holidayTo = '';

  constructor() {
    void this.run(async () => {
      const [subjects, rooms, holidays] = await Promise.all([
        this.api.get<Subject[]>('/catalog/subjects'),
        this.api.get<Room[]>('/catalog/rooms'),
        this.api.get<Holiday[]>('/catalog/holidays'),
      ]);
      this.subjects.set(subjects);
      this.rooms.set(rooms);
      this.holidays.set(holidays);
    });
  }

  protected day(date: string): string {
    return formatDay(date);
  }

  protected seed(): Promise<void> {
    return this.run(async () => this.setSubjects(await this.api.post<Subject[]>('/catalog/subjects/defaults')));
  }

  protected addSubject(): Promise<void> {
    return this.run(async () => {
      this.setSubjects(await this.api.post<Subject[]>('/catalog/subjects', { name: this.subjectName, short: this.subjectShort }));
      this.subjectName = this.subjectShort = '';
    });
  }

  protected editSubject(subject: Subject): void {
    this.editName = subject.name;
    this.editShort = subject.short === subject.name ? '' : subject.short;
    this.editing.set(subject.id);
  }

  protected saveSubject(subject: Subject): Promise<void> {
    return this.run(async () => {
      this.setSubjects(await this.api.patch<Subject[]>(`/catalog/subjects/${subject.id}`, { name: this.editName, short: this.editShort }));
      this.editing.set(null);
    });
  }

  protected async archiveSubject(subject: Subject): Promise<void> {
    const ok = await this.notify.confirm({
      title: `Убрать предмет «${subject.name}» в архив?`,
      message: 'Задания, конспекты и прошлые сетки по нему останутся, но в новые его поставить будет нельзя.',
      confirmText: 'В архив',
    });
    if (ok) await this.run(async () => this.setSubjects(await this.api.delete<Subject[]>(`/catalog/subjects/${subject.id}`)));
  }

  protected addRoom(): Promise<void> {
    return this.run(async () => {
      this.rooms.set(await this.api.post<Room[]>('/catalog/rooms', { name: this.roomName, note: this.roomNote }));
      this.roomName = this.roomNote = '';
      await this.school.loadRooms(true);
    });
  }

  protected archiveRoom(room: Room): Promise<void> {
    return this.run(async () => {
      this.rooms.set(await this.api.delete<Room[]>(`/catalog/rooms/${room.id}`));
      await this.school.loadRooms(true);
    });
  }

  protected addHoliday(): Promise<void> {
    return this.run(async () => {
      this.holidays.set(
        await this.api.post<Holiday[]>('/catalog/holidays', { title: this.holidayTitle, from: this.holidayFrom, to: this.holidayTo }),
      );
      this.holidayTitle = this.holidayFrom = this.holidayTo = '';
    });
  }

  protected removeHoliday(holiday: Holiday): Promise<void> {
    return this.run(async () => this.holidays.set(await this.api.delete<Holiday[]>(`/catalog/holidays/${holiday.id}`)));
  }

  private setSubjects(list: Subject[]): void {
    this.subjects.set(list);
    void this.school.loadSubjects(true);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.notify.error(errorMessage(error));
    }
  }
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api';
import { localToday } from './dates';
import { ClassRow, Room, SchoolInfo, StaffMember, Subject } from './types';

/**
 * Справочники школы, нужные почти каждому экрану: звонки, предметы,
 * кабинеты, классы, сотрудники. Грузятся один раз и обновляются после правок.
 */
@Injectable({ providedIn: 'root' })
export class School {
  private readonly api = inject(Api);

  readonly info = signal<SchoolInfo | null>(null);
  readonly subjects = signal<Subject[]>([]);
  readonly rooms = signal<Room[]>([]);
  readonly classes = signal<ClassRow[]>([]);
  readonly staff = signal<StaffMember[]>([]);

  readonly today = computed(() => this.info()?.today ?? localToday());
  readonly bells = computed(() => this.info()?.bells ?? []);
  readonly weekDays = computed(() => this.info()?.weekDays ?? 5);

  private loaded = new Set<string>();

  async loadInfo(force = false): Promise<SchoolInfo> {
    if (!this.info() || force) {
      this.info.set(await this.api.get<SchoolInfo>('/school'));
    }
    return this.info()!;
  }

  async loadSubjects(force = false): Promise<Subject[]> {
    if (force || !this.loaded.has('subjects')) {
      this.subjects.set(await this.api.get<Subject[]>('/catalog/subjects'));
      this.loaded.add('subjects');
    }
    return this.subjects();
  }

  async loadRooms(force = false): Promise<Room[]> {
    if (force || !this.loaded.has('rooms')) {
      this.rooms.set(await this.api.get<Room[]>('/catalog/rooms'));
      this.loaded.add('rooms');
    }
    return this.rooms();
  }

  async loadClasses(force = false): Promise<ClassRow[]> {
    if (force || !this.loaded.has('classes')) {
      this.classes.set(await this.api.get<ClassRow[]>('/classes'));
      this.loaded.add('classes');
    }
    return this.classes();
  }

  async loadStaff(force = false): Promise<StaffMember[]> {
    if (force || !this.loaded.has('staff')) {
      this.staff.set(await this.api.get<StaffMember[]>('/accounts/staff'));
      this.loaded.add('staff');
    }
    return this.staff();
  }

  bell(number: number) {
    return this.bells().find((bell) => bell.number === number) ?? null;
  }

  subjectName(id: string | null | undefined): string {
    return this.subjects().find((subject) => subject.id === id)?.name ?? '';
  }

  /** После выхода справочники чужие — забываем. */
  reset(): void {
    this.loaded.clear();
    this.subjects.set([]);
    this.rooms.set([]);
    this.classes.set([]);
    this.staff.set([]);
  }
}

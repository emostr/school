import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { AccessService } from '../school/access.service';
import { addDays, dayKey, isValidDay, parseDay, startOfWeek } from '../common/dates';
import { className } from '../common/text';
import { has, isHead } from '../common/access';
import { RequestAccount } from '../common/types';
import { ScheduleResolver } from './schedule.resolver';
import { LessonInput, SaveChangeDto, SaveVersionDto } from './schedule.dto';

const WEEKDAY_NAMES = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
    private readonly access: AccessService,
    private readonly resolver: ScheduleResolver,
  ) {}

  /** Неделя, в которую попадает дата (по умолчанию — текущая в часовом поясе школы). */
  private async week(date?: string): Promise<{ from: Date; to: Date }> {
    const anchor = isValidDay(date) ? parseDay(date) : await this.school.today();
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }

  private async currentVersion(classId: string, at: Date) {
    return this.prisma.scheduleVersion.findFirst({
      where: { classId, validFrom: { lte: at } },
      orderBy: { validFrom: 'desc' },
      select: { id: true, validFrom: true, note: true },
    });
  }

  async classWeek(viewer: RequestAccount, classId: string, date?: string) {
    await this.access.assertViewClass(viewer, classId);
    const schoolClass = await this.access.requireClass(classId);
    const { from, to } = await this.week(date);
    const version = await this.currentVersion(classId, to);
    return {
      kind: 'class' as const,
      classId,
      title: className(schoolClass.number, schoolClass.letter),
      from: dayKey(from),
      to: dayKey(to),
      version: version ? { id: version.id, validFrom: dayKey(version.validFrom), note: version.note } : null,
      canEdit: this.access.canEditSchedule(viewer, classId),
      days: await this.resolver.resolveClass(classId, from, to),
    };
  }

  async teacherWeek(viewer: RequestAccount, teacherId: string, date?: string) {
    if (teacherId !== viewer.id && !isHead(viewer)) {
      throw new ForbiddenException('Чужие расписания учителей видит завуч');
    }
    const teacher = await this.prisma.account.findFirst({
      where: { id: teacherId, deletedAt: null, privileges: { hasSome: ['TEACHER', 'HEAD'] } },
      select: { id: true, fullName: true },
    });
    if (!teacher) {
      throw new NotFoundException('Учитель не найден');
    }
    const { from, to } = await this.week(date);
    return {
      kind: 'teacher' as const,
      teacherId,
      title: teacher.fullName,
      from: dayKey(from),
      to: dayKey(to),
      version: null,
      canEdit: false,
      days: await this.resolver.resolveTeacher(teacherId, from, to),
    };
  }

  /**
   * «Моё расписание»: ученику и родителю — класс (своего или ребёнка),
   * учителю — его уроки. Сотрудник-родитель смотрит своё, если не выбран ребёнок.
   */
  async myWeek(viewer: RequestAccount, date?: string, child?: string) {
    if (viewer.studentClassId) {
      return this.classWeek(viewer, viewer.studentClassId, date);
    }
    if (viewer.children.length && (child || !(has(viewer, 'TEACHER') || has(viewer, 'HEAD')))) {
      const learner = this.access.learner(viewer, child);
      if (!learner.classId) {
        throw new BadRequestException('Ребёнок пока не прикреплён к классу');
      }
      return this.classWeek(viewer, learner.classId, date);
    }
    if (has(viewer, 'TEACHER') || has(viewer, 'HEAD')) {
      return this.teacherWeek(viewer, viewer.id, date);
    }
    throw new BadRequestException('Вы пока не прикреплены к классу');
  }

  async day(viewer: RequestAccount, classId: string, date: string) {
    await this.access.assertViewClass(viewer, classId);
    if (!isValidDay(date)) {
      throw new BadRequestException('Некорректная дата');
    }
    const day = parseDay(date);
    const [resolved] = await this.resolver.resolveClass(classId, day, day);
    return resolved ?? { date, weekday: 0, holiday: null, lessons: [] };
  }

  async nextLesson(viewer: RequestAccount, classId: string, subjectId: string, after?: string, group?: string) {
    await this.access.assertViewClass(viewer, classId);
    const from = isValidDay(after) ? parseDay(after) : await this.school.today();
    return { lesson: await this.resolver.nextLesson(classId, subjectId, from, group ?? '') };
  }

  // ─── Версии постоянной сетки ─────────────────────────────────────────────

  async versions(viewer: RequestAccount, classId: string) {
    await this.access.assertViewClass(viewer, classId);
    const today = await this.school.today();
    const current = await this.currentVersion(classId, today);
    const rows = await this.prisma.scheduleVersion.findMany({
      where: { classId },
      orderBy: { validFrom: 'desc' },
      include: {
        createdBy: { select: { fullName: true } },
        _count: { select: { lessons: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      validFrom: dayKey(row.validFrom),
      note: row.note,
      createdBy: row.createdBy?.fullName ?? null,
      createdAt: row.createdAt.toISOString(),
      lessonCount: row._count.lessons,
      state: row.id === current?.id ? 'current' : row.validFrom > today ? 'planned' : 'archived',
    }));
  }

  async version(viewer: RequestAccount, id: string) {
    const version = await this.prisma.scheduleVersion.findUnique({
      where: { id },
      include: { lessons: { orderBy: [{ weekday: 'asc' }, { number: 'asc' }, { group: 'asc' }] } },
    });
    if (!version) {
      throw new NotFoundException('Версия расписания не найдена');
    }
    await this.access.assertViewClass(viewer, version.classId);
    return {
      id: version.id,
      classId: version.classId,
      validFrom: dayKey(version.validFrom),
      note: version.note,
      lessons: version.lessons.map((lesson) => ({
        weekday: lesson.weekday,
        number: lesson.number,
        group: lesson.group,
        subjectId: lesson.subjectId,
        teacherId: lesson.teacherId,
        roomId: lesson.roomId,
      })),
    };
  }

  private validateLessons(lessons: LessonInput[], weekDays: number): void {
    const slots = new Set<string>();
    for (const lesson of lessons) {
      if (lesson.weekday > weekDays) {
        throw new BadRequestException(`В школе ${weekDays}-дневная неделя — урок в ${WEEKDAY_NAMES[lesson.weekday]} не поставить`);
      }
      const group = lesson.group ?? '';
      const slot = `${lesson.weekday}:${lesson.number}:${group}`;
      if (slots.has(slot)) {
        throw new BadRequestException(
          `${WEEKDAY_NAMES[lesson.weekday]}, ${lesson.number}-й урок: на одно место поставлено два предмета`,
        );
      }
      // Делёный урок и урок всем классом в одну клетку не встают.
      const whole = `${lesson.weekday}:${lesson.number}:`;
      if (group ? slots.has(whole) : [...slots].some((item) => item.startsWith(whole) && item !== whole)) {
        throw new BadRequestException(
          `${WEEKDAY_NAMES[lesson.weekday]}, ${lesson.number}-й урок: и весь класс, и подгруппа сразу`,
        );
      }
      slots.add(slot);
    }
  }

  /**
   * Учитель или кабинет в одну клетку у двух классов — это почти всегда
   * ошибка, но не всегда: спаренный урок физкультуры ведут вместе. Поэтому
   * не запрещаем, а предупреждаем.
   */
  private async conflicts(classId: string, validFrom: Date, lessons: LessonInput[]): Promise<string[]> {
    const others = await this.prisma.schoolClass.findMany({
      where: { schoolId: await this.school.id(), archivedAt: null, id: { not: classId } },
      select: { id: true, number: true, letter: true },
    });
    const warnings: string[] = [];
    const teachers = new Map(
      (
        await this.prisma.account.findMany({
          where: { id: { in: lessons.map((l) => l.teacherId).filter((id): id is string => Boolean(id)) } },
          select: { id: true, fullName: true },
        })
      ).map((row) => [row.id, row.fullName]),
    );
    const rooms = new Map(
      (
        await this.prisma.room.findMany({
          where: { id: { in: lessons.map((l) => l.roomId).filter((id): id is string => Boolean(id)) } },
          select: { id: true, name: true },
        })
      ).map((row) => [row.id, row.name]),
    );

    for (const other of others) {
      const version = await this.currentVersion(other.id, validFrom);
      if (!version) {
        continue;
      }
      const theirs = await this.prisma.scheduleLesson.findMany({ where: { versionId: version.id } });
      for (const lesson of lessons) {
        const clash = theirs.filter((item) => item.weekday === lesson.weekday && item.number === lesson.number);
        const where = `${WEEKDAY_NAMES[lesson.weekday]}, ${lesson.number}-й урок`;
        if (lesson.teacherId && clash.some((item) => item.teacherId === lesson.teacherId)) {
          warnings.push(`${where}: ${teachers.get(lesson.teacherId) ?? 'учитель'} в это время ведёт урок в ${className(other.number, other.letter)}`);
        }
        if (lesson.roomId && clash.some((item) => item.roomId === lesson.roomId)) {
          warnings.push(`${where}: кабинет ${rooms.get(lesson.roomId) ?? ''} занят ${className(other.number, other.letter)}`);
        }
      }
    }
    return [...new Set(warnings)];
  }

  /**
   * Новая версия сетки. Задним числом сетку не правим — прошлые недели уже
   * прожиты, по ним отмечена посещаемость. Версия с той же датой начала
   * переписывается целиком.
   */
  async saveVersion(viewer: RequestAccount, classId: string, dto: SaveVersionDto) {
    await this.access.requireClass(classId);
    this.access.assertEditSchedule(viewer, classId);
    const validFrom = parseDay(dto.validFrom.slice(0, 10));
    const today = await this.school.today();
    const current = await this.currentVersion(classId, today);
    // Первую сетку класса можно завести и задним числом — с начала года.
    if (current && validFrom < today && current.validFrom.getTime() !== validFrom.getTime()) {
      throw new BadRequestException('Новая сетка начинает действовать сегодня или позже — прошлое остаётся в архиве');
    }

    const school = await this.school.get();
    this.validateLessons(dto.lessons, school.weekDays);
    await this.validateRefs(dto.lessons);

    const version = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.scheduleVersion.upsert({
        where: { classId_validFrom: { classId, validFrom } },
        create: { classId, validFrom, note: (dto.note ?? '').trim(), createdById: viewer.id },
        update: { note: (dto.note ?? '').trim(), createdById: viewer.id },
      });
      await tx.scheduleLesson.deleteMany({ where: { versionId: saved.id } });
      if (dto.lessons.length) {
        await tx.scheduleLesson.createMany({
          data: dto.lessons.map((lesson) => ({
            versionId: saved.id,
            weekday: lesson.weekday,
            number: lesson.number,
            group: lesson.group ?? '',
            subjectId: lesson.subjectId,
            teacherId: lesson.teacherId || null,
            roomId: lesson.roomId || null,
          })),
        });
      }
      return saved;
    });

    return {
      version: await this.version(viewer, version.id),
      warnings: await this.conflicts(classId, validFrom, dto.lessons),
    };
  }

  private async validateRefs(lessons: { subjectId?: string | null; teacherId?: string | null; roomId?: string | null }[]) {
    const subjectIds = [...new Set(lessons.map((l) => l.subjectId).filter((id): id is string => Boolean(id)))];
    const teacherIds = [...new Set(lessons.map((l) => l.teacherId).filter((id): id is string => Boolean(id)))];
    const roomIds = [...new Set(lessons.map((l) => l.roomId).filter((id): id is string => Boolean(id)))];
    const [subjects, teachers, rooms] = await Promise.all([
      this.prisma.subject.count({ where: { id: { in: subjectIds } } }),
      this.prisma.account.count({
        where: { id: { in: teacherIds }, deletedAt: null, privileges: { hasSome: ['TEACHER', 'HEAD'] } },
      }),
      this.prisma.room.count({ where: { id: { in: roomIds } } }),
    ]);
    if (subjects !== subjectIds.length) {
      throw new BadRequestException('В сетке указан неизвестный предмет');
    }
    if (teachers !== teacherIds.length) {
      throw new BadRequestException('Урок может вести только сотрудник школы');
    }
    if (rooms !== roomIds.length) {
      throw new BadRequestException('В сетке указан неизвестный кабинет');
    }
  }

  async removeVersion(viewer: RequestAccount, id: string) {
    const version = await this.prisma.scheduleVersion.findUnique({ where: { id } });
    if (!version) {
      throw new NotFoundException('Версия расписания не найдена');
    }
    this.access.assertEditSchedule(viewer, version.classId);
    if (version.validFrom <= (await this.school.today())) {
      throw new BadRequestException('Действующая и прошлые сетки — это архив, удалить можно только запланированную');
    }
    await this.prisma.scheduleVersion.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Изменения на даты ───────────────────────────────────────────────────

  async changes(viewer: RequestAccount, classId: string, from?: string, to?: string) {
    await this.access.assertViewClass(viewer, classId);
    const today = await this.school.today();
    const rows = await this.prisma.scheduleChange.findMany({
      where: {
        classId,
        date: {
          gte: isValidDay(from) ? parseDay(from) : addDays(today, -30),
          lte: isValidDay(to) ? parseDay(to) : addDays(today, 60),
        },
      },
      orderBy: [{ date: 'desc' }, { number: 'asc' }],
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
        room: { select: { id: true, name: true } },
        createdBy: { select: { fullName: true } },
      },
    });
    return rows.map((row) => this.changeRow(row));
  }

  private changeRow(row: {
    id: string;
    classId: string;
    date: Date;
    number: number;
    group: string;
    kind: string;
    note: string;
    subject: { id: string; name: string } | null;
    teacher: { id: string; fullName: string } | null;
    room: { id: string; name: string } | null;
    createdBy?: { fullName: string } | null;
    class?: { number: number; letter: string };
  }) {
    return {
      id: row.id,
      classId: row.classId,
      ...(row.class ? { className: className(row.class.number, row.class.letter) } : {}),
      date: dayKey(row.date),
      number: row.number,
      group: row.group,
      kind: row.kind,
      note: row.note,
      subject: row.subject,
      teacher: row.teacher,
      room: row.room,
      createdBy: row.createdBy?.fullName ?? null,
    };
  }

  /** Все изменения школы на день — лист замен, который вешают у учительской. */
  async changesOn(date?: string) {
    const day = isValidDay(date) ? parseDay(date) : await this.school.today();
    const rows = await this.prisma.scheduleChange.findMany({
      where: { date: day, class: { archivedAt: null } },
      orderBy: [{ number: 'asc' }],
      include: {
        class: { select: { number: true, letter: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
        room: { select: { id: true, name: true } },
        createdBy: { select: { fullName: true } },
      },
    });
    return {
      date: dayKey(day),
      changes: rows
        .map((row) => this.changeRow(row))
        .sort((a, b) => (a.className ?? '').localeCompare(b.className ?? '', 'ru', { numeric: true }) || a.number - b.number),
    };
  }

  async saveChange(viewer: RequestAccount, classId: string, dto: SaveChangeDto) {
    await this.access.requireClass(classId);
    this.access.assertEditSchedule(viewer, classId);
    const date = parseDay(dto.date.slice(0, 10));
    if (dto.kind === 'ADD' && !dto.subjectId) {
      throw new BadRequestException('Для дополнительного урока выберите предмет');
    }
    if (dto.kind === 'REPLACE' && !dto.subjectId && !dto.teacherId && !dto.roomId) {
      throw new BadRequestException('Укажите, что меняется: предмет, учитель или кабинет');
    }
    await this.validateRefs([dto]);

    const data = {
      kind: dto.kind,
      subjectId: dto.kind === 'CANCEL' ? null : dto.subjectId || null,
      teacherId: dto.kind === 'CANCEL' ? null : dto.teacherId || null,
      roomId: dto.kind === 'CANCEL' ? null : dto.roomId || null,
      note: (dto.note ?? '').trim(),
      createdById: viewer.id,
    };
    const group = dto.group ?? '';
    const saved = await this.prisma.scheduleChange.upsert({
      where: { classId_date_number_group: { classId, date, number: dto.number, group } },
      create: { classId, date, number: dto.number, group, ...data },
      update: data,
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, fullName: true } },
        room: { select: { id: true, name: true } },
        createdBy: { select: { fullName: true } },
      },
    });
    return this.changeRow(saved);
  }

  async removeChange(viewer: RequestAccount, id: string) {
    const change = await this.prisma.scheduleChange.findUnique({ where: { id } });
    if (!change) {
      throw new NotFoundException('Изменение не найдено');
    }
    this.access.assertEditSchedule(viewer, change.classId);
    await this.prisma.scheduleChange.delete({ where: { id } });
    return { ok: true };
  }
}

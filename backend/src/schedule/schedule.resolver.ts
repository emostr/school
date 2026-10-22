import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Bell, SchoolService } from '../school/school.service';
import { addDays, dayKey, eachDay, isoWeekday } from '../common/dates';
import { className } from '../common/text';

export interface LessonRef {
  id: string;
  name: string;
}

export interface ResolvedLesson {
  classId: string;
  className: string;
  number: number;
  group: string;
  start: string;
  end: string;
  subject: { id: string; name: string; short: string } | null;
  teacher: { id: string; fullName: string } | null;
  room: LessonRef | null;
  /** Учитель по постоянной сетке — до замены. */
  originalTeacherId: string | null;
  status: 'regular' | 'replaced' | 'cancelled' | 'added';
  changeId: string | null;
  note: string;
}

export interface ResolvedDay {
  date: string;
  weekday: number;
  holiday: string | null;
  lessons: ResolvedLesson[];
}

const LESSON_INCLUDE = {
  subject: { select: { id: true, name: true, short: true } },
  teacher: { select: { id: true, fullName: true } },
  room: { select: { id: true, name: true } },
} as const;

function subjectView(subject: { id: string; name: string; short: string } | null) {
  return subject ? { id: subject.id, name: subject.name, short: subject.short || subject.name } : null;
}

/**
 * Сборка расписания на даты: постоянная сетка действующей версии, поверх неё
 * изменения на конкретный день, а в каникулы — пусто. Считается пачкой сразу
 * для многих классов, чтобы недельная сетка учителя не превращалась в сотню
 * запросов.
 */
@Injectable()
export class ScheduleResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
  ) {}

  async resolve(classIds: string[], from: Date, to: Date): Promise<Map<string, ResolvedDay[]>> {
    const result = new Map<string, ResolvedDay[]>();
    if (!classIds.length) {
      return result;
    }

    const school = await this.school.get();
    const bells = new Map<number, Bell>(school.bells.map((bell) => [bell.number, bell]));

    const [classes, versions, changes, holidays] = await Promise.all([
      this.prisma.schoolClass.findMany({
        where: { id: { in: classIds } },
        select: { id: true, number: true, letter: true },
      }),
      this.prisma.scheduleVersion.findMany({
        where: { classId: { in: classIds }, validFrom: { lte: to } },
        orderBy: { validFrom: 'desc' },
        include: { lessons: { include: LESSON_INCLUDE } },
      }),
      this.prisma.scheduleChange.findMany({
        where: { classId: { in: classIds }, date: { gte: from, lte: to } },
        include: LESSON_INCLUDE,
      }),
      this.prisma.holiday.findMany({ where: { from: { lte: to }, to: { gte: from } } }),
    ]);

    const names = new Map(classes.map((item) => [item.id, className(item.number, item.letter)]));
    const days = eachDay(from, to);

    for (const classId of classIds) {
      const own = versions.filter((version) => version.classId === classId);
      const ownChanges = changes.filter((change) => change.classId === classId);
      const name = names.get(classId) ?? '';
      const resolved: ResolvedDay[] = [];

      for (const day of days) {
        const key = dayKey(day);
        const weekday = isoWeekday(day);
        const dayChanges = ownChanges.filter((change) => dayKey(change.date) === key);
        if (weekday > school.weekDays && !dayChanges.some((change) => change.kind === 'ADD')) {
          continue;
        }

        const holiday = holidays.find((item) => item.from <= day && item.to >= day);
        if (holiday) {
          resolved.push({ date: key, weekday, holiday: holiday.title, lessons: [] });
          continue;
        }

        const timeOf = (number: number) => ({
          start: bells.get(number)?.start ?? '',
          end: bells.get(number)?.end ?? '',
        });

        // Версии отсортированы по убыванию даты: первая подходящая и действует.
        const version = own.find((item) => item.validFrom <= day);
        const lessons = new Map<string, ResolvedLesson>();
        for (const lesson of version?.lessons ?? []) {
          if (lesson.weekday !== weekday) {
            continue;
          }
          lessons.set(`${lesson.number}:${lesson.group}`, {
            classId,
            className: name,
            number: lesson.number,
            group: lesson.group,
            ...timeOf(lesson.number),
            subject: subjectView(lesson.subject),
            teacher: lesson.teacher,
            room: lesson.room,
            originalTeacherId: lesson.teacherId,
            status: 'regular',
            changeId: null,
            note: '',
          });
        }

        for (const change of dayChanges) {
          const slot = `${change.number}:${change.group}`;
          const base = lessons.get(slot);
          if (change.kind === 'CANCEL') {
            if (base) {
              lessons.set(slot, { ...base, status: 'cancelled', changeId: change.id, note: change.note });
            }
            continue;
          }
          lessons.set(slot, {
            classId,
            className: name,
            number: change.number,
            group: change.group,
            ...timeOf(change.number),
            subject: subjectView(change.subject) ?? base?.subject ?? null,
            teacher: change.teacher ?? base?.teacher ?? null,
            room: change.room ?? base?.room ?? null,
            originalTeacherId: base?.originalTeacherId ?? null,
            status: base ? 'replaced' : 'added',
            changeId: change.id,
            note: change.note,
          });
        }

        resolved.push({
          date: key,
          weekday,
          holiday: null,
          lessons: [...lessons.values()].sort((a, b) => a.number - b.number || a.group.localeCompare(b.group)),
        });
      }
      result.set(classId, resolved);
    }
    return result;
  }

  async resolveClass(classId: string, from: Date, to: Date): Promise<ResolvedDay[]> {
    return (await this.resolve([classId], from, to)).get(classId) ?? [];
  }

  /**
   * Сетка учителя: его уроки во всех классах. Отменённые уроки тоже
   * показываем — учителю важно знать, что урока не будет.
   */
  async resolveTeacher(teacherId: string, from: Date, to: Date): Promise<ResolvedDay[]> {
    const classes = await this.prisma.schoolClass.findMany({
      where: { schoolId: await this.school.id(), archivedAt: null },
      select: { id: true },
    });
    const byClass = await this.resolve(
      classes.map((item) => item.id),
      from,
      to,
    );

    const school = await this.school.get();
    const holidays = await this.prisma.holiday.findMany({ where: { from: { lte: to }, to: { gte: from } } });
    const days: ResolvedDay[] = [];
    for (const day of eachDay(from, to)) {
      const key = dayKey(day);
      const weekday = isoWeekday(day);
      const lessons = [...byClass.values()]
        .flatMap((classDays) => classDays.find((item) => item.date === key)?.lessons ?? [])
        .filter(
          (lesson) =>
            lesson.teacher?.id === teacherId ||
            (lesson.status === 'cancelled' && lesson.originalTeacherId === teacherId),
        )
        .sort((a, b) => a.number - b.number || a.className.localeCompare(b.className, 'ru', { numeric: true }));
      if (weekday > school.weekDays && !lessons.length) {
        continue;
      }
      const holiday = holidays.find((item) => item.from <= day && item.to >= day);
      days.push({ date: key, weekday, holiday: holiday?.title ?? null, lessons });
    }
    return days;
  }

  /**
   * Ближайший урок предмета после даты — для кнопки «к следующему уроку»
   * в форме домашнего задания. Ищем на восемь недель вперёд: дальше уже
   * каникулы и новая сетка.
   */
  async nextLesson(classId: string, subjectId: string, after: Date, group = ''): Promise<ResolvedLesson & { date: string } | null> {
    const from = addDays(after, 1);
    const days = await this.resolveClass(classId, from, addDays(from, 56));
    for (const day of days) {
      const lesson = day.lessons.find(
        (item) =>
          item.subject?.id === subjectId &&
          item.status !== 'cancelled' &&
          (!group || !item.group || item.group === group),
      );
      if (lesson) {
        return { ...lesson, date: day.date };
      }
    }
    return null;
  }
}

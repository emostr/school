import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { AccessService } from '../school/access.service';
import { ScheduleResolver, ResolvedLesson } from '../schedule/schedule.resolver';
import { addDays, dayKey, isValidDay, parseDay } from '../common/dates';
import { className } from '../common/text';
import { isStaff } from '../common/access';
import { RequestAccount } from '../common/types';
import { SaveLessonDto } from './attendance.dto';

type Totals = Record<'SICK' | 'EXCUSED' | 'UNEXCUSED', number> & { lessons: number; days: number };

function emptyTotals(): Totals {
  return { SICK: 0, EXCUSED: 0, UNEXCUSED: 0, lessons: 0, days: 0 };
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
    private readonly access: AccessService,
    private readonly resolver: ScheduleResolver,
  ) {}

  /**
   * Состав класса на дату. Ученик, пришедший в марте, в январском табеле не
   * нужен, а ушедший в марте — нужен: по его местам в классе это и видно.
   */
  private async rosterOn(classId: string, from: Date, to: Date = from) {
    return this.prisma.student.findMany({
      where: {
        classId,
        createdAt: { lt: addDays(to, 1) },
        OR: [{ archivedAt: null }, { archivedAt: { gte: from } }],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, lastName: true, firstName: true, group: true, accountId: true },
    });
  }

  private async lessonAt(classId: string, date: Date, number: number): Promise<ResolvedLesson | null> {
    const [day] = await this.resolver.resolveClass(classId, date, date);
    return day?.lessons.find((lesson) => lesson.number === number && lesson.status !== 'cancelled') ?? null;
  }

  async lesson(viewer: RequestAccount, classId: string, date: string, number: number) {
    if (!isStaff(viewer)) {
      throw new ForbiddenException('Отметки ставят учителя');
    }
    if (!isValidDay(date)) {
      throw new BadRequestException('Некорректная дата');
    }
    const schoolClass = await this.access.requireClass(classId);
    const day = parseDay(date);
    const lesson = await this.lessonAt(classId, day, number);
    const roster = (await this.rosterOn(classId, day)).filter(
      (student) => !lesson?.group || !student.group || student.group === lesson.group,
    );
    const marks = await this.prisma.attendance.findMany({
      where: { classId, date: day, number },
      include: { markedBy: { select: { fullName: true } } },
    });
    const byStudent = new Map(marks.map((mark) => [mark.studentId, mark]));

    return {
      classId,
      className: className(schoolClass.number, schoolClass.letter),
      date,
      number,
      lesson,
      marked: marks.length > 0,
      canEdit: await this.access.canMarkAttendance(viewer, classId, lesson?.subject?.id ?? null, day, lesson?.teacher?.id ?? null),
      students: roster.map((student) => {
        const mark = byStudent.get(student.id);
        return {
          id: student.id,
          fullName: `${student.lastName} ${student.firstName}`,
          group: student.group,
          status: mark?.status ?? null,
          note: mark?.note ?? '',
          markedBy: mark?.markedBy?.fullName ?? null,
          updatedAt: mark?.updatedAt.toISOString() ?? null,
        };
      }),
    };
  }

  async saveLesson(viewer: RequestAccount, dto: SaveLessonDto) {
    const day = parseDay(dto.date.slice(0, 10));
    await this.access.requireClass(dto.classId);
    if (day > (await this.school.today())) {
      throw new BadRequestException('Отметить посещаемость наперёд нельзя');
    }
    const lesson = await this.lessonAt(dto.classId, day, dto.number);
    const subjectId = lesson?.subject?.id ?? null;
    const allowed = await this.access.canMarkAttendance(viewer, dto.classId, subjectId, day, lesson?.teacher?.id ?? null);
    if (!allowed) {
      throw new ForbiddenException('Учитель отмечает посещаемость только на своих уроках');
    }

    const roster = new Set((await this.rosterOn(dto.classId, day)).map((student) => student.id));
    if (dto.marks.some((mark) => !roster.has(mark.studentId))) {
      throw new BadRequestException('В отметках ученик не из этого класса');
    }

    await this.prisma.$transaction(
      dto.marks.map((mark) =>
        this.prisma.attendance.upsert({
          where: { studentId_date_number: { studentId: mark.studentId, date: day, number: dto.number } },
          create: {
            classId: dto.classId,
            studentId: mark.studentId,
            date: day,
            number: dto.number,
            subjectId,
            status: mark.status,
            note: (mark.note ?? '').trim(),
            markedById: viewer.id,
          },
          update: { status: mark.status, note: (mark.note ?? '').trim(), markedById: viewer.id, subjectId },
        }),
      ),
    );
    return this.lesson(viewer, dto.classId, dayKey(day), dto.number);
  }

  /**
   * Табель за период: ученики по строкам, уроки по столбцам, внизу итоги.
   * День считается пропущенным, если ученик не был ни на одном отмеченном уроке.
   */
  async sheet(viewer: RequestAccount, classId: string, fromValue?: string, toValue?: string) {
    if (!isStaff(viewer)) {
      throw new ForbiddenException('Табель класса видят сотрудники');
    }
    const schoolClass = await this.access.requireClass(classId);
    const today = await this.school.today();
    const from = isValidDay(fromValue) ? parseDay(fromValue) : addDays(today, -13);
    const to = isValidDay(toValue) ? parseDay(toValue) : today;
    if (to < from || to.getTime() - from.getTime() > 200 * 24 * 3600 * 1000) {
      throw new BadRequestException('Табель строится не больше чем за двести дней');
    }

    const [roster, marks, days] = await Promise.all([
      this.rosterOn(classId, from, to),
      this.prisma.attendance.findMany({
        where: { classId, date: { gte: from, lte: to } },
        select: { studentId: true, date: true, number: true, status: true, note: true },
      }),
      this.resolver.resolveClass(classId, from, to),
    ]);

    const table: Record<string, Record<string, { status: AttendanceStatus; note: string }>> = {};
    const totals: Record<string, Totals> = {};
    for (const student of roster) {
      table[student.id] = {};
      totals[student.id] = emptyTotals();
    }
    for (const mark of marks) {
      if (!table[mark.studentId]) {
        continue;
      }
      table[mark.studentId][`${dayKey(mark.date)}|${mark.number}`] = { status: mark.status, note: mark.note };
      if (mark.status !== 'PRESENT') {
        totals[mark.studentId][mark.status] += 1;
        totals[mark.studentId].lessons += 1;
      }
    }

    // Пропущенный день — все отмеченные уроки дня с пропуском.
    const byDay = new Map<string, typeof marks>();
    for (const mark of marks) {
      const key = `${mark.studentId}|${dayKey(mark.date)}`;
      byDay.set(key, [...(byDay.get(key) ?? []), mark]);
    }
    for (const [key, list] of byDay) {
      const studentId = key.split('|')[0];
      if (totals[studentId] && list.length && list.every((mark) => mark.status !== 'PRESENT')) {
        totals[studentId].days += 1;
      }
    }

    // Столбцы — уроки по расписанию плюс те, где отметки есть, а урока в сетке
    // уже нет (сетку поменяли после отметки).
    const columns = days.map((day) => {
      const numbers = new Map<number, string>();
      for (const lesson of day.lessons) {
        if (lesson.status !== 'cancelled' && !numbers.has(lesson.number)) {
          numbers.set(lesson.number, lesson.subject?.short ?? '');
        }
      }
      for (const mark of marks) {
        if (dayKey(mark.date) === day.date && !numbers.has(mark.number)) {
          numbers.set(mark.number, '');
        }
      }
      return {
        date: day.date,
        weekday: day.weekday,
        holiday: day.holiday,
        lessons: [...numbers.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([number, subject]) => ({ number, subject })),
      };
    });

    return {
      classId,
      className: className(schoolClass.number, schoolClass.letter),
      from: dayKey(from),
      to: dayKey(to),
      columns,
      students: roster.map((student) => ({
        id: student.id,
        fullName: `${student.lastName} ${student.firstName}`,
        group: student.group,
        marks: table[student.id],
        totals: totals[student.id],
      })),
    };
  }

  /** Своя посещаемость ученика: только пропуски, присутствие не интересно. */
  async mine(viewer: RequestAccount, fromValue?: string, toValue?: string, child?: string) {
    const learner = this.access.learner(viewer, child);
    const today = await this.school.today();
    const from = isValidDay(fromValue) ? parseDay(fromValue) : addDays(today, -30);
    const to = isValidDay(toValue) ? parseDay(toValue) : today;
    const memberships = await this.prisma.student.findMany({ where: { accountId: learner.accountId }, select: { id: true } });
    const marks = await this.prisma.attendance.findMany({
      where: {
        studentId: { in: memberships.map((item) => item.id) },
        date: { gte: from, lte: to },
        status: { not: 'PRESENT' },
      },
      orderBy: [{ date: 'desc' }, { number: 'asc' }],
      include: { subject: { select: { name: true } } },
    });
    const totals = emptyTotals();
    for (const mark of marks) {
      if (mark.status !== 'PRESENT') {
        totals[mark.status] += 1;
        totals.lessons += 1;
      }
    }
    return {
      from: dayKey(from),
      to: dayKey(to),
      totals,
      marks: marks.map((mark) => ({
        date: dayKey(mark.date),
        number: mark.number,
        subject: mark.subject?.name ?? '',
        status: mark.status,
        note: mark.note,
      })),
    };
  }

  /** Уроки учителя на день и отмечены ли они — для главной страницы. */
  async myLessons(viewer: RequestAccount, date?: string) {
    const day = isValidDay(date) ? parseDay(date) : await this.school.today();
    const [resolved] = await this.resolver.resolveTeacher(viewer.id, day, day);
    const lessons = (resolved?.lessons ?? []).filter((lesson) => lesson.status !== 'cancelled');
    const marked = await this.prisma.attendance.groupBy({
      by: ['classId', 'number'],
      where: { date: day, classId: { in: lessons.map((lesson) => lesson.classId) } },
    });
    const done = new Set(marked.map((row) => `${row.classId}|${row.number}`));
    return {
      date: dayKey(day),
      lessons: lessons.map((lesson) => ({ ...lesson, marked: done.has(`${lesson.classId}|${lesson.number}`) })),
    };
  }
}

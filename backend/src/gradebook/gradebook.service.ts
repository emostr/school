import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { AccessService } from '../school/access.service';
import { ScheduleResolver } from '../schedule/schedule.resolver';
import { addDays, dayKey, isValidDay, parseDay } from '../common/dates';
import { className } from '../common/text';
import { isHead, isHomeroomOf } from '../common/access';
import { RequestAccount } from '../common/types';
import { BulkGradesDto, DEFAULT_WEIGHTS, GradeDto, ImportAssignmentDto, UpdateGradeDto } from './gradebook.dto';

const GRADE_SELECT = {
  id: true,
  studentId: true,
  date: true,
  lessonNumber: true,
  value: true,
  kind: true,
  weight: true,
  comment: true,
  workId: true,
  subjectId: true,
  updatedAt: true,
  teacher: { select: { id: true, fullName: true } },
} satisfies Prisma.GradeSelect;

type GradeRow = Prisma.GradeGetPayload<{ select: typeof GRADE_SELECT }>;

function gradeView(row: GradeRow) {
  return {
    id: row.id,
    studentId: row.studentId,
    subjectId: row.subjectId,
    date: dayKey(row.date),
    lessonNumber: row.lessonNumber,
    value: row.value,
    kind: row.kind,
    weight: row.weight,
    comment: row.comment,
    fromTest: Boolean(row.workId),
    teacher: row.teacher,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Средневзвешенный балл: каждая оценка входит со своим весом. */
export function weightedAverage(grades: { value: number; weight: number }[]): number | null {
  const total = grades.reduce((sum, grade) => sum + grade.weight, 0);
  if (!total) {
    return null;
  }
  return Number((grades.reduce((sum, grade) => sum + grade.value * grade.weight, 0) / total).toFixed(2));
}

@Injectable()
export class GradebookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
    private readonly access: AccessService,
    private readonly resolver: ScheduleResolver,
  ) {}

  /**
   * Промежуток журнала. По умолчанию — текущий учебный период, если школа
   * их завела, иначе последний месяц.
   */
  private async range(fromValue?: string, toValue?: string): Promise<{ from: Date; to: Date }> {
    const today = await this.school.today();
    if (isValidDay(fromValue) && isValidDay(toValue)) {
      const from = parseDay(fromValue);
      const to = parseDay(toValue);
      if (to < from || to.getTime() - from.getTime() > 370 * 24 * 3600 * 1000) {
        throw new BadRequestException('Промежуток журнала — не больше учебного года');
      }
      return { from, to };
    }
    const key = dayKey(today);
    const period = (await this.school.get()).periods.find((item) => item.from <= key && key <= item.to);
    if (period) {
      return { from: parseDay(period.from), to: parseDay(period.to) };
    }
    return { from: addDays(today, -30), to: today };
  }

  /** Состав класса за промежуток: пришедшие позже и ушедшие раньше — тоже в журнале. */
  private roster(classId: string, from: Date, to: Date) {
    return this.prisma.student.findMany({
      where: {
        classId,
        createdAt: { lt: addDays(to, 1) },
        OR: [{ archivedAt: null }, { archivedAt: { gte: from } }],
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, lastName: true, firstName: true, group: true, archivedAt: true },
    });
  }

  async targets(viewer: RequestAccount) {
    const targets = await this.access.gradeTargets(viewer);
    // Классный руководитель смотрит журнал своего класса по всем предметам.
    const readable = new Set([...targets.map((t) => t.classId), ...(isHead(viewer) ? [] : viewer.homeroomClassIds)]);
    const classes = await this.prisma.schoolClass.findMany({
      where: { id: { in: [...readable] }, archivedAt: null },
      orderBy: [{ number: 'asc' }, { letter: 'asc' }],
      select: { id: true, number: true, letter: true },
    });
    const subjects = await this.prisma.subject.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } });
    return classes.map((item) => {
      const target = targets.find((t) => t.classId === item.id);
      const writable = target ? target.subjectIds : [];
      const homeroom = isHomeroomOf(viewer, item.id);
      return {
        classId: item.id,
        className: className(item.number, item.letter),
        homeroom,
        subjects: subjects
          .filter((subject) => homeroom || writable === null || writable.includes(subject.id))
          .map((subject) => ({
            id: subject.id,
            name: subject.name,
            short: subject.short || subject.name,
            canGrade: writable === null || writable.includes(subject.id),
          })),
      };
    });
  }

  /**
   * Страница журнала: ученики по строкам, уроки предмета по столбцам.
   * Столбцы берутся из расписания, плюс даты, где оценки есть, а урока в
   * сетке уже нет. В клетке — оценки и пропуск, если ученика не было.
   */
  async journal(viewer: RequestAccount, classId: string, subjectId: string, fromValue?: string, toValue?: string) {
    const schoolClass = await this.access.requireClass(classId);
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      throw new NotFoundException('Предмет не найден');
    }
    if (!(await this.access.canViewJournal(viewer, classId, subjectId))) {
      throw new ForbiddenException('Журнал по этому предмету ведёт его учитель');
    }
    const { from, to } = await this.range(fromValue, toValue);

    const [roster, grades, days] = await Promise.all([
      this.roster(classId, from, to),
      this.prisma.grade.findMany({
        where: { classId, subjectId, deletedAt: null, date: { gte: from, lte: to } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
        select: GRADE_SELECT,
      }),
      this.resolver.resolveClass(classId, from, to),
    ]);

    const columns = new Map<string, { date: string; lessonNumber: number | null; group: string; topic: string }>();
    for (const day of days) {
      for (const lesson of day.lessons) {
        if (lesson.subject?.id === subjectId && lesson.status !== 'cancelled') {
          columns.set(`${day.date}|${lesson.number}`, { date: day.date, lessonNumber: lesson.number, group: lesson.group, topic: '' });
        }
      }
    }
    for (const grade of grades) {
      const key = `${dayKey(grade.date)}|${grade.lessonNumber ?? ''}`;
      const scheduled = grade.lessonNumber === null && [...columns.values()].some((c) => c.date === dayKey(grade.date));
      if (!columns.has(key) && !scheduled) {
        columns.set(key, { date: dayKey(grade.date), lessonNumber: grade.lessonNumber, group: '', topic: '' });
      }
    }
    const sortedColumns = [...columns.values()].sort(
      (a, b) => a.date.localeCompare(b.date) || (a.lessonNumber ?? 0) - (b.lessonNumber ?? 0),
    );

    // Пропуски на этих уроках — чтобы «н» стояла рядом с оценками, как в бумажном журнале.
    const absences = await this.prisma.attendance.findMany({
      where: {
        classId,
        date: { gte: from, lte: to },
        status: { not: 'PRESENT' },
        number: { in: [...new Set(sortedColumns.map((c) => c.lessonNumber).filter((n): n is number => n !== null))] },
      },
      select: { studentId: true, date: true, number: true, status: true },
    });

    return {
      classId,
      className: className(schoolClass.number, schoolClass.letter),
      subject: { id: subject.id, name: subject.name },
      from: dayKey(from),
      to: dayKey(to),
      canEdit: await this.access.canGrade(viewer, classId, subjectId),
      columns: sortedColumns,
      students: roster.map((student) => {
        const own = grades.filter((grade) => grade.studentId === student.id);
        return {
          id: student.id,
          fullName: `${student.lastName} ${student.firstName}`,
          group: student.group,
          left: Boolean(student.archivedAt),
          grades: own.map(gradeView),
          absences: absences
            .filter((item) => item.studentId === student.id)
            .map((item) => ({ date: dayKey(item.date), number: item.number, status: item.status })),
          average: weightedAverage(own),
        };
      }),
    };
  }

  private async requireStudentIn(classId: string, studentId: string, date: Date) {
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        classId,
        createdAt: { lt: addDays(date, 1) },
        OR: [{ archivedAt: null }, { archivedAt: { gte: date } }],
      },
    });
    if (!student) {
      throw new BadRequestException('Ученик не числился в классе в этот день');
    }
    return student;
  }

  private async checkDate(date: Date): Promise<void> {
    if (date > (await this.school.today())) {
      throw new BadRequestException('Оценку наперёд не ставят');
    }
  }

  async create(viewer: RequestAccount, dto: GradeDto) {
    const date = parseDay(dto.date.slice(0, 10));
    await this.checkDate(date);
    await this.access.assertGrade(viewer, dto.classId, dto.subjectId, date);
    await this.requireStudentIn(dto.classId, dto.studentId, date);
    const kind = dto.kind ?? 'LESSON';
    const row = await this.prisma.grade.create({
      data: {
        classId: dto.classId,
        subjectId: dto.subjectId,
        studentId: dto.studentId,
        date,
        lessonNumber: dto.lessonNumber ?? null,
        value: dto.value,
        kind,
        weight: dto.weight ?? DEFAULT_WEIGHTS[kind],
        comment: (dto.comment ?? '').trim(),
        teacherId: viewer.id,
      },
      select: GRADE_SELECT,
    });
    return gradeView(row);
  }

  async bulk(viewer: RequestAccount, dto: BulkGradesDto) {
    const date = parseDay(dto.date.slice(0, 10));
    await this.checkDate(date);
    await this.access.assertGrade(viewer, dto.classId, dto.subjectId, date);
    const roster = new Set((await this.roster(dto.classId, date, date)).map((student) => student.id));
    if (dto.marks.some((mark) => !roster.has(mark.studentId))) {
      throw new BadRequestException('В списке ученик не из этого класса');
    }
    const weight = dto.weight ?? DEFAULT_WEIGHTS[dto.kind];
    await this.prisma.grade.createMany({
      data: dto.marks.map((mark) => ({
        classId: dto.classId,
        subjectId: dto.subjectId,
        studentId: mark.studentId,
        date,
        lessonNumber: dto.lessonNumber ?? null,
        value: mark.value,
        kind: dto.kind,
        weight,
        comment: (mark.comment ?? '').trim(),
        teacherId: viewer.id,
      })),
    });
    return { created: dto.marks.length };
  }

  private async requireEditable(viewer: RequestAccount, id: string) {
    const grade = await this.prisma.grade.findFirst({ where: { id, deletedAt: null } });
    if (!grade) {
      throw new NotFoundException('Оценка не найдена');
    }
    await this.access.assertGrade(viewer, grade.classId, grade.subjectId, grade.date);
    return grade;
  }

  async update(viewer: RequestAccount, id: string, dto: UpdateGradeDto) {
    const grade = await this.requireEditable(viewer, id);
    const kind = dto.kind ?? grade.kind;
    const row = await this.prisma.grade.update({
      where: { id },
      data: {
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        kind,
        // Сменили вид работы и вес не задали — берём вес нового вида.
        weight: dto.weight ?? (dto.kind && dto.kind !== grade.kind ? DEFAULT_WEIGHTS[dto.kind] : grade.weight),
        ...(dto.comment !== undefined ? { comment: dto.comment.trim() } : {}),
        teacherId: viewer.id,
      },
      select: GRADE_SELECT,
    });
    return gradeView(row);
  }

  async remove(viewer: RequestAccount, id: string) {
    await this.requireEditable(viewer, id);
    await this.prisma.grade.update({ where: { id }, data: { deletedAt: new Date(), teacherId: viewer.id } });
    return { ok: true };
  }

  /** Дневник ученика: оценки по предметам за период и средний балл по каждому. */
  async report(accountId: string, fromValue?: string, toValue?: string) {
    const { from, to } = await this.range(fromValue, toValue);
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: accountId }, select: { fullName: true } });
    const memberships = await this.prisma.student.findMany({ where: { accountId }, select: { id: true } });
    const grades = await this.prisma.grade.findMany({
      where: { studentId: { in: memberships.map((m) => m.id) }, deletedAt: null, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: { ...GRADE_SELECT, subject: { select: { id: true, name: true, short: true } } },
    });
    const subjects = new Map<string, { subject: { id: string; name: string; short: string }; grades: ReturnType<typeof gradeView>[]; raw: { value: number; weight: number }[] }>();
    for (const grade of grades) {
      const entry = subjects.get(grade.subjectId) ?? {
        subject: { ...grade.subject, short: grade.subject.short || grade.subject.name },
        grades: [],
        raw: [],
      };
      entry.grades.push(gradeView(grade));
      entry.raw.push(grade);
      subjects.set(grade.subjectId, entry);
    }
    const list = [...subjects.values()]
      .sort((a, b) => a.subject.name.localeCompare(b.subject.name, 'ru'))
      .map((entry) => ({ subject: entry.subject, grades: entry.grades, average: weightedAverage(entry.raw) }));
    return {
      student: { accountId, fullName: account.fullName },
      from: dayKey(from),
      to: dayKey(to),
      subjects: list,
      // Свежие оценки — для главной страницы и уведомлений в дневнике.
      recent: [...grades]
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 8)
        .map((grade) => ({ ...gradeView(grade), subject: grade.subject.short || grade.subject.name })),
    };
  }

  async mine(viewer: RequestAccount, child?: string, from?: string, to?: string) {
    const learner = this.access.learner(viewer, child);
    return this.report(learner.accountId, from, to);
  }

  /** Дневник конкретного ученика — завучу и классному руководителю. */
  async studentReport(viewer: RequestAccount, accountId: string, from?: string, to?: string) {
    const places = await this.prisma.student.findMany({ where: { accountId, archivedAt: null }, select: { classId: true } });
    if (!isHead(viewer) && !places.some((place) => isHomeroomOf(viewer, place.classId))) {
      throw new ForbiddenException('Дневник ученика смотрят завуч и классный руководитель');
    }
    return this.report(accountId, from, to);
  }

  /** Сводная ведомость: средние баллы класса по всем предметам. */
  async summary(viewer: RequestAccount, classId: string, fromValue?: string, toValue?: string) {
    const schoolClass = await this.access.requireClass(classId);
    if (!isHead(viewer) && !isHomeroomOf(viewer, classId)) {
      throw new ForbiddenException('Сводную ведомость видят завуч и классный руководитель');
    }
    const { from, to } = await this.range(fromValue, toValue);
    const [roster, grades] = await Promise.all([
      this.roster(classId, from, to),
      this.prisma.grade.findMany({
        where: { classId, deletedAt: null, date: { gte: from, lte: to } },
        select: { studentId: true, subjectId: true, value: true, weight: true, subject: { select: { id: true, name: true, short: true } } },
      }),
    ]);
    const subjects = [...new Map(grades.map((grade) => [grade.subjectId, grade.subject])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map((subject) => ({ id: subject.id, name: subject.name, short: subject.short || subject.name }));
    return {
      classId,
      className: className(schoolClass.number, schoolClass.letter),
      from: dayKey(from),
      to: dayKey(to),
      subjects,
      students: roster.map((student) => {
        const own = grades.filter((grade) => grade.studentId === student.id);
        return {
          id: student.id,
          fullName: `${student.lastName} ${student.firstName}`,
          averages: Object.fromEntries(
            subjects.map((subject) => [subject.id, weightedAverage(own.filter((grade) => grade.subjectId === subject.id))]),
          ),
          counts: Object.fromEntries(subjects.map((subject) => [subject.id, own.filter((g) => g.subjectId === subject.id).length])),
          average: weightedAverage(own),
        };
      }),
    };
  }

  /**
   * Перенос оценок проверенной работы теста в журнал. Работа знает своего
   * ученика и оценку, предмет и вид работы выбирает учитель. Повторный
   * перенос не задваивает: у оценки запомнена работа.
   */
  async importAssignment(viewer: RequestAccount, dto: ImportAssignmentDto) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: dto.assignmentId, schoolId: await this.school.id(), createdById: viewer.id },
      include: { works: { where: { status: 'CHECKED', grade: { not: null }, studentId: { not: null } } } },
    });
    if (!assignment) {
      throw new NotFoundException('Назначение не найдено');
    }
    await this.access.assertGrade(viewer, assignment.classId, dto.subjectId, assignment.date);
    const existing = new Set(
      (await this.prisma.grade.findMany({
        where: { workId: { in: assignment.works.map((work) => work.id) } },
        select: { workId: true },
      })).map((grade) => grade.workId),
    );
    const fresh = assignment.works.filter((work) => !existing.has(work.id));
    const weight = dto.weight ?? DEFAULT_WEIGHTS[dto.kind];
    if (fresh.length) {
      await this.prisma.grade.createMany({
        data: fresh.map((work) => ({
          classId: assignment.classId,
          subjectId: dto.subjectId,
          studentId: work.studentId!,
          date: assignment.date,
          value: work.grade!,
          kind: dto.kind,
          weight,
          comment: `тест: ${work.percent}%`,
          teacherId: viewer.id,
          workId: work.id,
        })),
      });
    }
    // Запасной бланк без фамилии в журнал не попадёт, пока его не подпишут.
    const unsigned = await this.prisma.work.count({
      where: { assignmentId: assignment.id, status: 'CHECKED', studentId: null },
    });
    return { created: fresh.length, skipped: assignment.works.length - fresh.length, unsigned };
  }
}

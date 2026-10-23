import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from './school.service';
import { RequestAccount } from '../common/types';
import { has, isHead, isHomeroomOf, isStaff } from '../common/access';

/**
 * Кто что может в учебной части. Правила собраны в одном месте, чтобы
 * задания, конспекты, расписание и посещаемость не расходились между собой:
 *
 *   смотреть класс         — сотрудники; ученик — только свой класс;
 *   править расписание     — завуч; классный руководитель — свой класс;
 *   публиковать задания    — завуч, классный руководитель своего класса,
 *   и конспекты              учитель по своим предметам, доверенный ученик
 *                            своего класса;
 *   отмечать посещаемость  — завуч, классный руководитель своего класса,
 *                            учитель по своим предметам.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
  ) {}

  async requireClass(classId: string) {
    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: { id: classId, schoolId: await this.school.id() },
    });
    if (!schoolClass) {
      throw new NotFoundException('Класс не найден');
    }
    return schoolClass;
  }

  canViewClass(account: RequestAccount, classId: string): boolean {
    return (
      isStaff(account) ||
      account.studentClassId === classId ||
      account.children.some((child) => child.classId === classId)
    );
  }

  /**
   * Чьи «мои» данные показывать: ученику — свои, родителю — выбранного
   * ребёнка (по умолчанию первого). Сотруднику-родителю — тоже ребёнка.
   */
  learner(account: RequestAccount, childAccountId?: string): { accountId: string; classId: string | null; studentId: string | null } {
    if (account.studentClassId || has(account, 'STUDENT')) {
      return { accountId: account.id, classId: account.studentClassId, studentId: account.studentId };
    }
    if (account.children.length) {
      const child = childAccountId
        ? account.children.find((item) => item.accountId === childAccountId)
        : account.children[0];
      if (!child) {
        throw new ForbiddenException('Это не ваш ребёнок');
      }
      return child;
    }
    throw new BadRequestException('Учётная запись не привязана ни к ученику, ни к классу');
  }

  async assertViewClass(account: RequestAccount, classId: string): Promise<void> {
    await this.requireClass(classId);
    if (!this.canViewClass(account, classId)) {
      throw new ForbiddenException('Это расписание другого класса');
    }
  }

  canEditSchedule(account: RequestAccount, classId: string): boolean {
    return isHead(account) || isHomeroomOf(account, classId);
  }

  assertEditSchedule(account: RequestAccount, classId: string): void {
    if (!this.canEditSchedule(account, classId)) {
      throw new ForbiddenException('Расписание класса правят завуч и классный руководитель');
    }
  }

  /**
   * Ведёт ли учитель предмет в классе. Смотрим действующую на дату версию
   * расписания и замены: учитель, вышедший на замену, тоже вправе задать
   * задание и отметить отсутствующих.
   */
  async teaches(accountId: string, classId: string, subjectId: string | null, date?: Date): Promise<boolean> {
    const at = date ?? (await this.school.today());
    const version = await this.prisma.scheduleVersion.findFirst({
      where: { classId, validFrom: { lte: at } },
      orderBy: { validFrom: 'desc' },
      select: { id: true },
    });
    if (version) {
      const lesson = await this.prisma.scheduleLesson.findFirst({
        where: { versionId: version.id, teacherId: accountId, ...(subjectId ? { subjectId } : {}) },
        select: { id: true },
      });
      if (lesson) {
        return true;
      }
    }
    const change = await this.prisma.scheduleChange.findFirst({
      where: {
        classId,
        teacherId: accountId,
        kind: { not: 'CANCEL' },
        ...(subjectId ? { subjectId } : {}),
        ...(date ? { date } : {}),
      },
      select: { id: true },
    });
    return Boolean(change);
  }

  async canPublish(account: RequestAccount, classId: string, subjectId: string, date?: Date): Promise<boolean> {
    if (isHead(account) || isHomeroomOf(account, classId)) {
      return true;
    }
    if (has(account, 'TRUSTED') && account.studentClassId === classId) {
      return true;
    }
    if (has(account, 'TEACHER')) {
      return this.teaches(account.id, classId, subjectId, date);
    }
    return false;
  }

  async assertPublish(account: RequestAccount, classId: string, subjectId: string, date?: Date): Promise<void> {
    await this.requireClass(classId);
    if (!(await this.canPublish(account, classId, subjectId, date))) {
      throw new ForbiddenException('Публиковать по этому предмету в этом классе вы не можете');
    }
  }

  async canMarkAttendance(
    account: RequestAccount,
    classId: string,
    subjectId: string | null,
    date: Date,
    lessonTeacherId: string | null,
  ): Promise<boolean> {
    if (isHead(account) || isHomeroomOf(account, classId)) {
      return true;
    }
    if (!has(account, 'TEACHER')) {
      return false;
    }
    if (lessonTeacherId === account.id) {
      return true;
    }
    return subjectId ? this.teaches(account.id, classId, subjectId, date) : false;
  }

  /**
   * Оценки ставит учитель предмета и завуч. Классный руководитель журнал
   * своего класса видит целиком, но чужим предметам оценок не ставит.
   */
  async canGrade(account: RequestAccount, classId: string, subjectId: string, date?: Date): Promise<boolean> {
    if (isHead(account)) {
      return true;
    }
    return has(account, 'TEACHER') && this.teaches(account.id, classId, subjectId, date);
  }

  async assertGrade(account: RequestAccount, classId: string, subjectId: string, date?: Date): Promise<void> {
    await this.requireClass(classId);
    if (!(await this.canGrade(account, classId, subjectId, date))) {
      throw new ForbiddenException('Оценки по этому предмету ставит его учитель');
    }
  }

  async canViewJournal(account: RequestAccount, classId: string, subjectId: string): Promise<boolean> {
    return isHead(account) || isHomeroomOf(account, classId) || this.canGrade(account, classId, subjectId);
  }

  /**
   * Куда учётная запись может публиковать: классы и предметы для формы
   * задания или конспекта. null у предметов — «любой предмет».
   */
  async publishTargets(account: RequestAccount): Promise<{ classId: string; subjectIds: string[] | null }[]> {
    const schoolId = await this.school.id();
    if (isHead(account)) {
      const classes = await this.prisma.schoolClass.findMany({
        where: { schoolId, archivedAt: null },
        select: { id: true },
      });
      return classes.map((item) => ({ classId: item.id, subjectIds: null }));
    }

    const targets = new Map<string, Set<string> | null>();
    for (const classId of account.homeroomClassIds) {
      targets.set(classId, null);
    }
    if (has(account, 'TRUSTED') && account.studentClassId) {
      targets.set(account.studentClassId, null);
    }

    if (has(account, 'TEACHER')) {
      for (const [classId, subjects] of await this.teacherSubjects(account.id)) {
        const existing = targets.get(classId);
        if (existing === null) {
          continue;
        }
        targets.set(classId, new Set([...(existing ?? []), ...subjects]));
      }
    }

    return [...targets.entries()].map(([classId, subjects]) => ({
      classId,
      subjectIds: subjects ? [...subjects] : null,
    }));
  }

  /**
   * Какие предметы в каких классах ведёт учитель — по действующей и
   * запланированным сеткам. В старой сетке учитель мог вести класс, который
   * давно отдал коллеге, — её не считаем.
   */
  async teacherSubjects(accountId: string): Promise<Map<string, Set<string>>> {
    const today = await this.school.today();
    const lessons = await this.prisma.scheduleLesson.findMany({
      where: { teacherId: accountId, version: { class: { archivedAt: null } } },
      select: { subjectId: true, version: { select: { id: true, classId: true, validFrom: true } } },
    });
    const versions = await this.prisma.scheduleVersion.findMany({
      where: { classId: { in: [...new Set(lessons.map((l) => l.version.classId))] }, validFrom: { lte: today } },
      orderBy: { validFrom: 'desc' },
      select: { id: true, classId: true },
    });
    const current = new Map<string, string>();
    for (const version of versions) {
      if (!current.has(version.classId)) {
        current.set(version.classId, version.id);
      }
    }
    const result = new Map<string, Set<string>>();
    for (const lesson of lessons) {
      const isCurrent = current.get(lesson.version.classId) === lesson.version.id;
      const isFuture = lesson.version.validFrom > today;
      if (!isCurrent && !isFuture) {
        continue;
      }
      const set = result.get(lesson.version.classId) ?? new Set<string>();
      set.add(lesson.subjectId);
      result.set(lesson.version.classId, set);
    }
    return result;
  }

  /** Куда ставить оценки: завучу — всё, учителю — его предметы. null — любой предмет. */
  async gradeTargets(account: RequestAccount): Promise<{ classId: string; subjectIds: string[] | null }[]> {
    if (isHead(account)) {
      const classes = await this.prisma.schoolClass.findMany({
        where: { schoolId: await this.school.id(), archivedAt: null },
        select: { id: true },
      });
      return classes.map((item) => ({ classId: item.id, subjectIds: null }));
    }
    if (!has(account, 'TEACHER')) {
      return [];
    }
    return [...(await this.teacherSubjects(account.id)).entries()].map(([classId, subjects]) => ({
      classId,
      subjectIds: [...subjects],
    }));
  }
}

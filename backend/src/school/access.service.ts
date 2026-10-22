import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    return isStaff(account) || account.studentClassId === classId;
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
      const today = await this.school.today();
      const lessons = await this.prisma.scheduleLesson.findMany({
        where: { teacherId: account.id, version: { class: { archivedAt: null } } },
        select: { subjectId: true, version: { select: { id: true, classId: true, validFrom: true } } },
      });
      // Учитываем только действующие версии: в старой сетке учитель мог вести
      // класс, который давно отдал коллеге.
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
      // Будущие версии тоже считаем: учитель готовит задания к новой сетке заранее.
      for (const lesson of lessons) {
        const isCurrent = current.get(lesson.version.classId) === lesson.version.id;
        const isFuture = lesson.version.validFrom > today;
        if (!isCurrent && !isFuture) {
          continue;
        }
        const existing = targets.get(lesson.version.classId);
        if (existing === null) {
          continue;
        }
        const set = existing ?? new Set<string>();
        set.add(lesson.subjectId);
        targets.set(lesson.version.classId, set);
      }
    }

    return [...targets.entries()].map(([classId, subjects]) => ({
      classId,
      subjectIds: subjects ? [...subjects] : null,
    }));
  }
}

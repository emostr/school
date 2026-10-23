import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { AccessService } from '../school/access.service';
import { className } from '../common/text';
import { isHead, isHomeroomOf, isStaff } from '../common/access';
import { RequestAccount } from '../common/types';
import { CreateClassDto } from './dto/classes.dto';

export interface ClassRow {
  id: string;
  number: number;
  letter: string;
  name: string;
  studentCount: number;
  assignmentCount: number;
  homeroom: { id: string; fullName: string } | null;
  archivedAt: string | null;
  createdAt: string;
}

const ROW_INCLUDE = {
  homeroom: { select: { id: true, fullName: true } },
  _count: { select: { students: { where: { archivedAt: null } }, assignments: true } },
} satisfies Prisma.SchoolClassInclude;

type ClassWithCounts = Prisma.SchoolClassGetPayload<{ include: typeof ROW_INCLUDE }>;

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
    private readonly access: AccessService,
  ) {}

  private toRow(row: ClassWithCounts): ClassRow {
    return {
      id: row.id,
      number: row.number,
      letter: row.letter,
      name: className(row.number, row.letter),
      studentCount: row._count.students,
      assignmentCount: row._count.assignments,
      homeroom: row.homeroom,
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Сотрудникам — все классы школы, ученику — только свой. */
  async list(viewer: RequestAccount, includeArchived = false): Promise<ClassRow[]> {
    const schoolId = await this.school.id();
    const rows = await this.prisma.schoolClass.findMany({
      where: {
        schoolId,
        ...(includeArchived ? {} : { archivedAt: null }),
        ...(isStaff(viewer)
          ? {}
          : { id: { in: [viewer.studentClassId, ...viewer.children.map((c) => c.classId)].filter((id): id is string => Boolean(id)) } }),
      },
      orderBy: [{ number: 'asc' }, { letter: 'asc' }, { archivedAt: 'desc' }],
      include: ROW_INCLUDE,
    });
    return rows.map((row) => this.toRow(row));
  }

  private async validateHomeroom(homeroomId: string | null | undefined): Promise<void> {
    if (!homeroomId) {
      return;
    }
    const teacher = await this.prisma.account.findFirst({
      where: { id: homeroomId, deletedAt: null, privileges: { hasSome: ['TEACHER', 'HEAD'] } },
    });
    if (!teacher) {
      throw new BadRequestException('Классным руководителем может быть только сотрудник');
    }
  }

  async create(dto: CreateClassDto, creatorId: string): Promise<ClassRow> {
    const schoolId = await this.school.id();
    const exists = await this.prisma.schoolClass.findFirst({
      where: { schoolId, number: dto.number, letter: dto.letter, archiveKey: '' },
    });
    if (exists) {
      throw new BadRequestException(`Класс ${className(dto.number, dto.letter)} уже заведён`);
    }
    await this.validateHomeroom(dto.homeroomId);
    const created = await this.prisma.schoolClass.create({
      data: {
        schoolId,
        number: dto.number,
        letter: dto.letter,
        createdById: creatorId,
        homeroomId: dto.homeroomId ?? null,
      },
      include: ROW_INCLUDE,
    });
    return this.toRow(created);
  }

  async detail(viewer: RequestAccount, id: string) {
    await this.access.assertViewClass(viewer, id);
    const row = await this.prisma.schoolClass.findFirstOrThrow({
      where: { id },
      include: {
        ...ROW_INCLUDE,
        students: {
          where: { archivedAt: null },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          include: {
            account: {
              select: {
                id: true,
                login: true,
                privileges: true,
                blockedAt: true,
                mustChangePassword: true,
                parents: {
                  where: { parent: { deletedAt: null } },
                  select: { parent: { select: { id: true, fullName: true, login: true, mustChangePassword: true } } },
                },
              },
            },
          },
        },
      },
    });
    // Логины видят только те, кто выдаёт пароли: завуч и классный руководитель.
    const manager = isHead(viewer) || isHomeroomOf(viewer, id);
    return {
      ...this.toRow(row),
      canManage: manager,
      canEditSchedule: this.access.canEditSchedule(viewer, id),
      students: row.students.map((s) => ({
        id: s.id,
        lastName: s.lastName,
        firstName: s.firstName,
        fullName: `${s.lastName} ${s.firstName}`,
        group: s.group,
        accountId: s.accountId,
        trusted: Boolean(s.account?.privileges.includes('TRUSTED')),
        ...(manager
          ? {
              login: s.account?.login ?? null,
              blocked: Boolean(s.account?.blockedAt),
              mustChangePassword: Boolean(s.account?.mustChangePassword),
              parents: (s.account?.parents ?? []).map((link) => link.parent),
            }
          : {}),
      })),
    };
  }

  async setHomeroom(id: string, homeroomId: string | null): Promise<ClassRow> {
    await this.access.requireClass(id);
    await this.validateHomeroom(homeroomId);
    const updated = await this.prisma.schoolClass.update({
      where: { id },
      data: { homeroomId },
      include: ROW_INCLUDE,
    });
    return this.toRow(updated);
  }

  /** Есть ли у класса прошлое, которое нельзя переписать переименованием. */
  private async hasHistory(classId: string): Promise<boolean> {
    const [assignments, versions, homework, notes, attendance] = await Promise.all([
      this.prisma.assignment.count({ where: { classId } }),
      this.prisma.scheduleVersion.count({ where: { classId } }),
      this.prisma.homework.count({ where: { classId } }),
      this.prisma.note.count({ where: { classId } }),
      this.prisma.attendance.count({ where: { classId } }),
    ]);
    return assignments + versions + homework + notes + attendance > 0;
  }

  /**
   * Перевод класса: 7Б → 8Б. Если у класса есть история, старая запись уходит
   * в архив вместе с ней — прошлогоднее расписание, задания и посещаемость 7Б
   * так и остаются у 7Б, — а ученики и классный руководитель переходят в
   * новую запись.
   */
  async promote(classId: string, number?: number, letter?: string) {
    const schoolId = await this.school.id();
    const source = await this.prisma.schoolClass.findFirst({ where: { id: classId, schoolId } });
    if (!source) {
      throw new NotFoundException('Класс не найден');
    }
    if (source.archivedAt) {
      throw new BadRequestException('Класс в архиве — переводить нечего');
    }

    const nextNumber = number ?? source.number + 1;
    const nextLetter = letter ?? source.letter;
    if (nextNumber > 11) {
      return this.archive(classId);
    }

    const occupied = await this.prisma.schoolClass.findFirst({
      where: { schoolId, number: nextNumber, letter: nextLetter, archiveKey: '' },
    });
    if (occupied && occupied.id !== classId) {
      throw new BadRequestException(`Класс ${className(nextNumber, nextLetter)} уже существует`);
    }

    if (!(await this.hasHistory(classId))) {
      // Истории нет — это просто переименование.
      await this.prisma.schoolClass.update({
        where: { id: classId },
        data: { number: nextNumber, letter: nextLetter },
      });
      return { moved: false };
    }

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.schoolClass.create({
        data: {
          schoolId,
          number: nextNumber,
          letter: nextLetter,
          createdById: source.createdById,
          homeroomId: source.homeroomId,
        },
      });
      const students = await tx.student.findMany({ where: { classId, archivedAt: null } });
      if (students.length) {
        await tx.student.createMany({
          data: students.map((student) => ({
            classId: created.id,
            accountId: student.accountId,
            lastName: student.lastName,
            firstName: student.firstName,
            searchKey: student.searchKey,
            group: student.group,
          })),
        });
      }
      await tx.student.updateMany({ where: { classId, archivedAt: null }, data: { archivedAt: new Date() } });
      await tx.schoolClass.update({
        where: { id: classId },
        data: { archivedAt: new Date(), archiveKey: String(Date.now()), homeroomId: null },
      });
    });
    return { moved: true };
  }

  /** Выпуск: класс уходит в архив, ученики остаются без класса до перевода. */
  async archive(classId: string) {
    await this.prisma.$transaction([
      this.prisma.schoolClass.update({
        where: { id: classId },
        data: { archivedAt: new Date(), archiveKey: String(Date.now()) },
      }),
      this.prisma.student.updateMany({ where: { classId, archivedAt: null }, data: { archivedAt: new Date() } }),
    ]);
    return { archived: true };
  }

  /** Одной кнопкой поднимаем всю школу на следующий учебный год. */
  async promoteAll() {
    const classes = await this.prisma.schoolClass.findMany({
      where: { schoolId: await this.school.id(), archivedAt: null },
      orderBy: { number: 'desc' },
    });
    let promoted = 0;
    let graduated = 0;
    for (const item of classes) {
      if (item.number >= 11) {
        await this.archive(item.id);
        graduated += 1;
      } else {
        await this.promote(item.id);
        promoted += 1;
      }
    }
    return { promoted, graduated };
  }

  async remove(classId: string) {
    await this.access.requireClass(classId);
    const students = await this.prisma.student.count({ where: { classId, archivedAt: null } });
    if (students > 0) {
      throw new ForbiddenException('В классе есть ученики — сначала переведите их или выпустите класс');
    }
    if (await this.hasHistory(classId)) {
      return this.archive(classId);
    }
    await this.prisma.schoolClass.delete({ where: { id: classId } });
    return { archived: false };
  }
}

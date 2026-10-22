import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { WorkStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TestsService } from '../tests/tests.service';
import { TestSnapshot, maxScoreFor } from '../tests/scoring';
import { generateWorkCode } from '../common/crypto/codes';
import { className } from '../common/text';
import { buildSheetLayout } from '../ocr/sheet';
import { CreateAssignmentDto } from './dto/assignments.dto';

export interface AssignmentRow {
  id: string;
  date: string;
  note: string;
  testId: string;
  testTitle: string;
  classId: string;
  className: string;
  createdByName: string;
  closedAt: string | null;
  total: number;
  checked: number;
  pending: number;
  maxScore: number;
  variantCount: number;
}

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tests: TestsService,
  ) {}

  private toRow(row: {
    id: string;
    date: Date;
    note: string;
    testId: string;
    classId: string;
    closedAt: Date | null;
    snapshot: unknown;
    test: { title: string };
    class: { number: number; letter: string };
    createdBy: { fullName: string };
    works: { status: WorkStatus }[];
  }): AssignmentRow {
    const snapshot = (row.snapshot ?? {}) as Partial<TestSnapshot>;
    const checked = row.works.filter((w) => w.status === 'CHECKED').length;
    return {
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      note: row.note,
      testId: row.testId,
      testTitle: row.test.title,
      classId: row.classId,
      className: className(row.class.number, row.class.letter),
      createdByName: row.createdBy.fullName,
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      total: row.works.length,
      checked,
      pending: row.works.length - checked,
      maxScore: snapshot.maxScore ?? 0,
      variantCount: snapshot.variantCount ?? 1,
    };
  }

  private readonly include = {
    test: { select: { title: true } },
    class: { select: { number: true, letter: true } },
    createdBy: { select: { fullName: true } },
    works: { select: { status: true } },
  } satisfies Prisma.AssignmentInclude;

  async list(
    schoolId: string,
    teacherId: string,
    filters: { classId?: string; testId?: string; from?: string; to?: string },
  ) {
    const where: Prisma.AssignmentWhereInput = {
      schoolId,
      // Работы класса — личное дело того, кто проводил: чужие назначения
      // в списке не появляются, даже если тест общий.
      createdById: teacherId,
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.testId ? { testId: filters.testId } : {}),
      ...(filters.from || filters.to
        ? {
            date: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.assignment.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: this.include,
    });
    return rows.map((row) => this.toRow(row));
  }

  /**
   * Назначение сразу превращается в пачку бланков: по бланку на ученика плюс
   * запасные. Снимок теста замораживается — правка теста задним числом
   * не должна менять уже написанную работу.
   */
  async create(schoolId: string, dto: CreateAssignmentDto, teacherId: string) {
    const test = await this.prisma.test.findFirst({
      where: {
        id: dto.testId,
        schoolId,
        deletedAt: null,
        OR: [{ ownerId: teacherId }, { shares: { some: { teacherId } } }],
      },
    });
    if (!test) {
      throw new NotFoundException('Тест не найден');
    }
    if (!test.isPublished) {
      throw new BadRequestException('Тест не опубликован — сначала завершите его в конструкторе');
    }

    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: { id: dto.classId, schoolId, archivedAt: null },
      include: {
        students: { where: { archivedAt: null }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] },
      },
    });
    if (!schoolClass) {
      throw new NotFoundException('Класс не найден');
    }
    if (!schoolClass.students.length) {
      throw new BadRequestException('В классе нет учеников — сначала вставьте список');
    }

    const date = new Date(dto.date);
    const duplicate = await this.prisma.assignment.findFirst({
      where: { testId: dto.testId, classId: dto.classId, date },
    });
    if (duplicate) {
      throw new BadRequestException('Этот тест уже назначен классу на эту дату');
    }

    const snapshot = await this.tests.snapshot(dto.testId, schoolId);
    const spare = dto.spare ?? 2;
    const variants = Math.max(1, snapshot.variantCount ?? 1);
    // Варианты раздаются по списку класса подряд: соседи по парте получают
    // разные, а печать идёт в том же порядке, в каком дети сидят в журнале.
    const variantOf = (index: number) => (index % variants) + 1;

    const assignment = await this.prisma.assignment.create({
      data: {
        schoolId,
        testId: dto.testId,
        classId: dto.classId,
        date,
        note: (dto.note ?? '').trim(),
        createdById: teacherId,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        works: {
          create: [
            ...schoolClass.students.map((student, index) => ({
              studentId: student.id,
              studentName: `${student.lastName} ${student.firstName}`,
              code: generateWorkCode(),
              variant: variantOf(index),
              maxScore: maxScoreFor(snapshot, variantOf(index)),
            })),
            ...Array.from({ length: spare }, (_, index) => ({
              studentName: '',
              code: generateWorkCode(),
              variant: variantOf(schoolClass.students.length + index),
              maxScore: maxScoreFor(snapshot, variantOf(schoolClass.students.length + index)),
            })),
          ],
        },
      },
      include: this.include,
    });

    return this.toRow(assignment);
  }

  async detail(id: string, schoolId: string, teacherId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id, schoolId, createdById: teacherId },
      include: {
        ...this.include,
        works: {
          orderBy: [{ studentName: 'asc' }, { code: 'asc' }],
          include: {
            student: { select: { id: true, lastName: true, firstName: true } },
            pages: { orderBy: { index: 'asc' } },
          },
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Назначение не найдено');
    }

    const snapshot = assignment.snapshot as unknown as TestSnapshot;
    return {
      id: assignment.id,
      date: assignment.date.toISOString().slice(0, 10),
      note: assignment.note,
      testId: assignment.testId,
      testTitle: assignment.test.title,
      classId: assignment.classId,
      className: className(assignment.class.number, assignment.class.letter),
      createdByName: assignment.createdBy.fullName,
      closedAt: assignment.closedAt ? assignment.closedAt.toISOString() : null,
      snapshot,
      works: assignment.works.map((work) => ({
        id: work.id,
        code: work.code,
        status: work.status,
        variant: work.variant,
        studentId: work.studentId,
        studentName: work.student
          ? `${work.student.lastName} ${work.student.firstName}`
          : work.studentName,
        autoScore: work.autoScore,
        manualScore: work.manualScore,
        maxScore: work.maxScore,
        percent: work.percent,
        grade: work.grade,
        pages: work.pages.length,
        scannedAt: work.scannedAt ? work.scannedAt.toISOString() : null,
        checkedAt: work.checkedAt ? work.checkedAt.toISOString() : null,
      })),
    };
  }

  /** Разметка бланков для печати: одна и та же геометрия у принтера и у OCR. */
  async sheets(id: string, schoolId: string, teacherId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id, schoolId, createdById: teacherId },
      include: {
        test: { select: { title: true } },
        class: { select: { number: true, letter: true } },
        works: {
          orderBy: [{ studentName: 'asc' }, { code: 'asc' }],
          include: { student: { select: { lastName: true, firstName: true } } },
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Назначение не найдено');
    }

    const snapshot = assignment.snapshot as unknown as TestSnapshot;
    const variantCount = Math.max(1, snapshot.variantCount ?? 1);
    // Разметка у каждого варианта своя — печатать нужно ту, что досталась
    // конкретному ученику.
    const layouts = Object.fromEntries(
      Array.from({ length: variantCount }, (_, index) => [index + 1, buildSheetLayout(snapshot, index + 1)]),
    );

    return {
      assignmentId: assignment.id,
      testTitle: assignment.test.title,
      className: className(assignment.class.number, assignment.class.letter),
      date: assignment.date.toISOString().slice(0, 10),
      instructions: snapshot.instructions ?? '',
      snapshot,
      variantCount,
      layouts,
      works: assignment.works.map((work) => ({
        id: work.id,
        code: work.code,
        variant: work.variant,
        studentName: work.student ? `${work.student.lastName} ${work.student.firstName}` : work.studentName,
      })),
    };
  }

  async update(id: string, schoolId: string, teacherId: string, data: { date?: string; note?: string }) {
    await this.mine(id, schoolId, teacherId);
    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        ...(data.date ? { date: new Date(data.date) } : {}),
        ...(data.note !== undefined ? { note: data.note.trim() } : {}),
      },
      include: this.include,
    });
    return this.toRow(updated);
  }

  /** Добавить бланк: пришёл новенький или лист испортили. */
  async addSpare(id: string, schoolId: string, teacherId: string, studentId?: string, variant?: number) {
    const assignment = await this.mine(id, schoolId, teacherId);
    const snapshot = assignment.snapshot as unknown as TestSnapshot;
    const student = studentId
      ? await this.prisma.student.findUnique({ where: { id: studentId } })
      : null;

    const variants = Math.max(1, snapshot.variantCount ?? 1);
    const issued = await this.prisma.work.count({ where: { assignmentId: id } });
    const chosen = Math.min(Math.max(variant ?? (issued % variants) + 1, 1), variants);

    const work = await this.prisma.work.create({
      data: {
        assignmentId: id,
        studentId: student?.id,
        studentName: student ? `${student.lastName} ${student.firstName}` : '',
        code: generateWorkCode(),
        variant: chosen,
        maxScore: maxScoreFor(snapshot, chosen),
      },
    });
    return { id: work.id, code: work.code, variant: chosen };
  }

  /** Сменить вариант у бланка: пригодится, если ученик сел не за свою парту. */
  async setVariant(id: string, schoolId: string, teacherId: string, workId: string, variant: number) {
    const assignment = await this.mine(id, schoolId, teacherId);
    const snapshot = assignment.snapshot as unknown as TestSnapshot;
    const variants = Math.max(1, snapshot.variantCount ?? 1);
    if (variant < 1 || variant > variants) {
      throw new BadRequestException(`У этой работы всего ${variants} вариант(а)`);
    }

    const work = await this.prisma.work.findFirst({ where: { id: workId, assignmentId: id } });
    if (!work) {
      throw new NotFoundException('Работа не найдена');
    }
    if (work.status !== 'PENDING') {
      throw new BadRequestException('Работу уже проверяли — сначала сбросьте её');
    }

    await this.prisma.work.update({
      where: { id: workId },
      data: { variant, maxScore: maxScoreFor(snapshot, variant) },
    });
    return { ok: true };
  }

  async setClosed(id: string, schoolId: string, teacherId: string, closed: boolean) {
    await this.mine(id, schoolId, teacherId);
    const assignment = await this.prisma.assignment.update({
      where: { id },
      data: { closedAt: closed ? new Date() : null },
      include: this.include,
    });
    return this.toRow(assignment);
  }

  async remove(id: string, schoolId: string, teacherId: string) {
    await this.mine(id, schoolId, teacherId);
    await this.prisma.assignment.delete({ where: { id } });
    return { ok: true };
  }

  /** Назначение существует, лежит в этой школе и принадлежит этому учителю. */
  private async mine(id: string, schoolId: string, teacherId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id, schoolId, createdById: teacherId },
    });
    if (!assignment) {
      throw new NotFoundException('Назначение не найдено');
    }
    return assignment;
  }
}

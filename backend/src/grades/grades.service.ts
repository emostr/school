import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { className } from '../common/text';

export interface GradeFilters {
  classId?: string;
  testId?: string;
  from?: string;
  to?: string;
  assignmentId?: string;
  onlyChecked?: boolean;
}

export interface GradeRow {
  workId: string;
  assignmentId: string;
  date: string;
  className: string;
  classId: string;
  testTitle: string;
  testId: string;
  studentId: string | null;
  studentName: string;
  score: number;
  maxScore: number;
  percent: number;
  grade: number | null;
  status: string;
  checkedAt: string | null;
}

@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}

  private where(schoolId: string, teacherId: string, filters: GradeFilters): Prisma.WorkWhereInput {
    return {
      ...(filters.onlyChecked === false ? {} : { status: 'CHECKED' }),
      ...(filters.assignmentId ? { assignmentId: filters.assignmentId } : {}),
      assignment: {
        schoolId,
        // Журнал у каждого учителя свой: он ведёт оценки только по тем
        // работам, которые сам и проводил.
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
      },
    };
  }

  /**
   * Журнал: все проверенные работы с сортировкой «дата → класс → тест».
   * Именно в таком порядке учитель ищет оценки за конкретную контрольную.
   */
  async journal(schoolId: string, teacherId: string, filters: GradeFilters): Promise<GradeRow[]> {
    const rows = await this.prisma.work.findMany({
      where: this.where(schoolId, teacherId, filters),
      orderBy: [
        { assignment: { date: 'desc' } },
        { assignment: { class: { number: 'asc' } } },
        { assignment: { class: { letter: 'asc' } } },
        { studentName: 'asc' },
      ],
      include: {
        student: { select: { id: true, lastName: true, firstName: true } },
        assignment: {
          include: {
            test: { select: { id: true, title: true } },
            class: { select: { id: true, number: true, letter: true } },
          },
        },
      },
    });

    return rows.map((work) => ({
      workId: work.id,
      assignmentId: work.assignmentId,
      date: work.assignment.date.toISOString().slice(0, 10),
      classId: work.assignment.class.id,
      className: className(work.assignment.class.number, work.assignment.class.letter),
      testId: work.assignment.test.id,
      testTitle: work.assignment.test.title,
      studentId: work.studentId,
      studentName: work.student
        ? `${work.student.lastName} ${work.student.firstName}`
        : work.studentName || 'Без фамилии',
      score: work.autoScore + work.manualScore,
      maxScore: work.maxScore,
      percent: work.percent,
      grade: work.grade,
      status: work.status,
      checkedAt: work.checkedAt ? work.checkedAt.toISOString() : null,
    }));
  }

  /** Сводка по выборке: сколько каких оценок и средний балл. */
  async summary(schoolId: string, teacherId: string, filters: GradeFilters) {
    const rows = await this.journal(schoolId, teacherId, filters);
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0 } as Record<number, number>;
    for (const row of rows) {
      if (row.grade) {
        distribution[row.grade] = (distribution[row.grade] ?? 0) + 1;
      }
    }
    const graded = rows.filter((r) => r.grade);
    const average = graded.length
      ? Number((graded.reduce((sum, r) => sum + (r.grade ?? 0), 0) / graded.length).toFixed(2))
      : 0;
    const percent = graded.length
      ? Math.round(graded.reduce((sum, r) => sum + r.percent, 0) / graded.length)
      : 0;
    // Качество знаний и успеваемость — то, что школа сдаёт в отчётах.
    const quality = graded.length
      ? Math.round(((distribution[5] + distribution[4]) / graded.length) * 100)
      : 0;
    const success = graded.length
      ? Math.round(((graded.length - distribution[2]) / graded.length) * 100)
      : 0;

    return { total: rows.length, graded: graded.length, distribution, average, percent, quality, success };
  }

  /** Выгрузка в CSV — для классного руководителя и для завуча. */
  async csv(schoolId: string, teacherId: string, filters: GradeFilters): Promise<string> {
    const rows = await this.journal(schoolId, teacherId, filters);
    const header = ['Дата', 'Класс', 'Тест', 'Ученик', 'Баллы', 'Максимум', 'Процент', 'Оценка'];
    const lines = rows.map((row) =>
      [
        row.date,
        row.className,
        row.testTitle,
        row.studentName,
        String(row.score),
        String(row.maxScore),
        String(row.percent),
        row.grade ? String(row.grade) : '',
      ]
        .map((value) => `"${value.replace(/"/g, '""')}"`)
        .join(';'),
    );
    // BOM — иначе Excel открывает кириллицу кракозябрами.
    return `﻿${[header.join(';'), ...lines].join('\r\n')}`;
  }
}

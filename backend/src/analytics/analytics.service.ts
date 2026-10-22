import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { className } from '../common/text';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Сводка для обзорной страницы: что у учителя происходит прямо сейчас. */
  async overview(schoolId: string, teacherId: string) {
    const since = new Date(Date.now() - 30 * DAY_MS);

    const [tests, classes, assignments, works, checkedWorks, recentAssignments] = await Promise.all([
      this.prisma.test.count({
        where: {
          schoolId,
          deletedAt: null,
          OR: [{ ownerId: teacherId }, { shares: { some: { teacherId } } }],
        },
      }),
      this.prisma.schoolClass.count({ where: { schoolId, archivedAt: null } }),
      this.prisma.assignment.count({ where: { schoolId, createdById: teacherId } }),
      this.prisma.work.count({ where: { assignment: { schoolId, createdById: teacherId } } }),
      this.prisma.work.findMany({
        where: { status: 'CHECKED', assignment: { schoolId, createdById: teacherId } },
        select: { grade: true, percent: true, checkedAt: true },
      }),
      this.prisma.assignment.findMany({
        where: { schoolId, createdById: teacherId },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        include: {
          test: { select: { title: true } },
          class: { select: { number: true, letter: true } },
          works: { select: { status: true } },
        },
      }),
    ]);

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0 } as Record<number, number>;
    for (const work of checkedWorks) {
      if (work.grade) {
        distribution[work.grade] = (distribution[work.grade] ?? 0) + 1;
      }
    }
    const average = checkedWorks.length
      ? Number(
          (checkedWorks.reduce((sum, w) => sum + (w.grade ?? 0), 0) / checkedWorks.length).toFixed(2),
        )
      : 0;

    // Активность: сколько работ проверено по дням за последний месяц.
    const activity: { date: string; checked: number }[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * DAY_MS);
      const key = day.toISOString().slice(0, 10);
      activity.push({
        date: key,
        checked: checkedWorks.filter((w) => w.checkedAt?.toISOString().slice(0, 10) === key).length,
      });
    }

    const pendingWorks = await this.prisma.work.count({
      where: {
        status: { in: ['RECOGNIZED', 'NEEDS_REVIEW'] },
        assignment: { schoolId, createdById: teacherId },
      },
    });

    return {
      tiles: {
        tests,
        classes,
        assignments,
        works,
        checked: checkedWorks.length,
        pending: pendingWorks,
        average,
        checkedLast30: checkedWorks.filter((w) => w.checkedAt && w.checkedAt >= since).length,
      },
      distribution,
      activity,
      recent: recentAssignments.map((assignment) => ({
        id: assignment.id,
        date: assignment.date.toISOString().slice(0, 10),
        testTitle: assignment.test.title,
        className: className(assignment.class.number, assignment.class.letter),
        total: assignment.works.length,
        checked: assignment.works.filter((w) => w.status === 'CHECKED').length,
        closedAt: assignment.closedAt ? assignment.closedAt.toISOString() : null,
      })),
    };
  }

  /** Разбор одного назначения: по заданиям видно, что класс не понял. */
  async assignmentReport(assignmentId: string, schoolId: string, teacherId: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, schoolId, createdById: teacherId },
      include: {
        test: { select: { title: true } },
        class: { select: { number: true, letter: true } },
        works: { where: { status: 'CHECKED' } },
      },
    });
    if (!assignment) {
      return null;
    }

    const snapshot = assignment.snapshot as unknown as {
      questions: { id: string; points: number }[];
      maxScore: number;
    };
    const answers = assignment.works.flatMap(
      (work) => (work.answers ?? []) as unknown as { questionId: string; score: number; correct: boolean | null }[],
    );

    const byQuestion = snapshot.questions.map((question, index) => {
      const rows = answers.filter((a) => a.questionId === question.id);
      const correct = rows.filter((a) => a.correct === true).length;
      return {
        questionId: question.id,
        number: index + 1,
        answered: rows.length,
        correct,
        // Доля справившихся — по ней сразу видно провальные задания.
        successPercent: rows.length ? Math.round((correct / rows.length) * 100) : 0,
        averageScore: rows.length
          ? Number((rows.reduce((sum, a) => sum + a.score, 0) / rows.length).toFixed(2))
          : 0,
        maxScore: question.points,
      };
    });

    return {
      assignmentId,
      testTitle: assignment.test.title,
      className: className(assignment.class.number, assignment.class.letter),
      date: assignment.date.toISOString().slice(0, 10),
      checked: assignment.works.length,
      questions: byQuestion,
    };
  }
}

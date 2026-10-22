import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { QuestionType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { htmlToText } from '../common/text';
import { sanitizeRich } from '../common/html';
import { AnswerKey, OPTION_LETTERS, SnapshotQuestion, TestSnapshot, cellsFor, maxScoreFor } from './scoring';
import { QuestionInput, SaveTestDto } from './dto/tests.dto';

export interface TestSummary {
  id: string;
  title: string;
  description: string;
  isPublished: boolean;
  variantCount: number;
  questionCount: number;
  maxScore: number;
  assignmentCount: number;
  ownerId: string;
  ownerName: string;
  mine: boolean;
  canEdit: boolean;
  sharedWith: number;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SCALE = { '5': 85, '4': 70, '3': 50 };

@Injectable()
export class TestsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Свои тесты плюс те, которыми поделились коллеги. Школа в условии стоит
   * всегда: даже случайно совпавший идентификатор не выведет за её границы.
   */
  private visibleWhere(schoolId: string, teacherId: string): Prisma.TestWhereInput {
    return {
      schoolId,
      deletedAt: null,
      OR: [{ ownerId: teacherId }, { shares: { some: { teacherId } } }],
    };
  }

  async list(schoolId: string, teacherId: string): Promise<TestSummary[]> {
    const rows = await this.prisma.test.findMany({
      where: this.visibleWhere(schoolId, teacherId),
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: { select: { id: true, fullName: true } },
        questions: { select: { points: true, variant: true } },
        shares: { select: { teacherId: true, canEdit: true } },
        _count: { select: { assignments: true } },
      },
    });

    return rows.map((row) => {
      const share = row.shares.find((s) => s.teacherId === teacherId);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        isPublished: row.isPublished,
        variantCount: row.variantCount,
        questionCount: row.questions.length,
        // В списке показываем максимум первого варианта: у остальных он такой же,
        // конструктор об этом предупреждает.
        maxScore: row.questions
          .filter((q) => !q.variant || q.variant === 1)
          .reduce((sum, q) => sum + q.points, 0),
        assignmentCount: row._count.assignments,
        ownerId: row.ownerId,
        ownerName: row.owner.fullName,
        mine: row.ownerId === teacherId,
        canEdit: row.ownerId === teacherId || Boolean(share?.canEdit),
        sharedWith: row.shares.length,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  private async load(id: string, schoolId: string, teacherId: string) {
    const test = await this.prisma.test.findFirst({
      where: { id, ...this.visibleWhere(schoolId, teacherId) },
      include: {
        owner: { select: { id: true, fullName: true, login: true } },
        questions: { orderBy: { order: 'asc' } },
        shares: { include: { teacher: { select: { id: true, fullName: true, login: true, subject: true } } } },
        _count: { select: { assignments: true } },
      },
    });
    if (!test) {
      throw new NotFoundException('Тест не найден');
    }
    return test;
  }

  async detail(id: string, schoolId: string, teacherId: string) {
    const test = await this.load(id, schoolId, teacherId);
    const share = test.shares.find((s) => s.teacherId === teacherId);
    const canEdit = test.ownerId === teacherId || Boolean(share?.canEdit);

    return {
      id: test.id,
      title: test.title,
      description: test.description,
      instructions: test.instructions,
      isPublished: test.isPublished,
      variantCount: test.variantCount,
      gradeScale: (test.gradeScale ?? DEFAULT_SCALE) as Record<string, number>,
      ownerId: test.ownerId,
      ownerName: test.owner.fullName,
      mine: test.ownerId === teacherId,
      canEdit,
      assignmentCount: test._count.assignments,
      createdAt: test.createdAt.toISOString(),
      updatedAt: test.updatedAt.toISOString(),
      questions: test.questions.map((q) => ({
        id: q.id,
        order: q.order,
        variant: q.variant,
        type: q.type,
        content: q.content,
        points: q.points,
        options: q.options as unknown as { id: string; content: string }[],
        answerKey: q.answerKey as unknown as AnswerKey,
      })),
      shares: test.shares.map((s) => ({
        teacherId: s.teacherId,
        fullName: s.teacher.fullName,
        login: s.teacher.login,
        subject: s.teacher.subject,
        canEdit: s.canEdit,
      })),
    };
  }

  private async requireEditable(id: string, schoolId: string, teacherId: string) {
    const test = await this.load(id, schoolId, teacherId);
    const share = test.shares.find((s) => s.teacherId === teacherId);
    if (test.ownerId !== teacherId && !share?.canEdit) {
      throw new ForbiddenException('Тест открыт только для чтения');
    }
    return test;
  }

  /**
   * Разметка приходит из редактора в браузере, то есть от того, кто мог его
   * и обойти. Чистим её один раз здесь — и в базу, и в снимки заданий
   * попадает уже проверенный HTML.
   */
  private clean(questions: QuestionInput[]): QuestionInput[] {
    return questions.map((question) => ({
      ...question,
      content: sanitizeRich(question.content),
      options: question.options.map((option) => ({
        ...option,
        content: sanitizeRich(option.content),
      })),
    }));
  }

  /** Ключи проверки приходят от клиента — сверяем их с вариантами. */
  private validate(questions: QuestionInput[], variantCount: number): void {
    if (!questions.length) {
      throw new BadRequestException('В тесте нет ни одного задания');
    }

    if (variantCount > 1) {
      // Пустой вариант — верный признак незаконченной работы: класс, которому
      // он достанется, получит бланк без заданий.
      const scores: number[] = [];
      for (let variant = 1; variant <= variantCount; variant += 1) {
        const own = questions.filter((q) => !q.variant || q.variant === variant);
        if (!own.length) {
          throw new BadRequestException(`В варианте ${variant} нет ни одного задания`);
        }
        scores.push(own.reduce((sum, q) => sum + q.points, 0));
      }
      // Шкала оценок одна на всех, поэтому и максимум должен совпадать.
      if (new Set(scores).size > 1) {
        throw new BadRequestException(
          `Варианты стоят разного числа баллов (${scores.join(', ')}) — оценка вышла бы несправедливой`,
        );
      }
    }

    questions.forEach((question, index) => {
      const number = index + 1;
      if (!htmlToText(question.content)) {
        throw new BadRequestException(`Задание ${number}: не заполнен текст`);
      }
      const key = question.answerKey as AnswerKey;

      if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
        if (question.options.length < 2) {
          throw new BadRequestException(`Задание ${number}: нужно хотя бы два варианта ответа`);
        }
        if (question.options.length > OPTION_LETTERS.length) {
          throw new BadRequestException(
            `Задание ${number}: вариантов не больше ${OPTION_LETTERS.length} — иначе они не влезают на бланк`,
          );
        }
        const ids = new Set(question.options.map((o) => o.id));
        const correct = key.correct ?? [];
        if (!correct.length) {
          throw new BadRequestException(`Задание ${number}: не отмечен правильный ответ`);
        }
        if (correct.some((id) => !ids.has(id))) {
          throw new BadRequestException(`Задание ${number}: правильный ответ ссылается на удалённый вариант`);
        }
        const blank = question.options.findIndex((option) => !htmlToText(option.content));
        if (blank >= 0) {
          throw new BadRequestException(
            `Задание ${number}: вариант ${OPTION_LETTERS[blank] ?? blank + 1} остался пустым`,
          );
        }
        if (question.type === 'SINGLE_CHOICE' && correct.length !== 1) {
          throw new BadRequestException(`Задание ${number}: у задания с одним ответом должен быть ровно один ключ`);
        }
      }

      if (question.type === 'SHORT_ANSWER') {
        const accepted = (key.accepted ?? []).filter((value) => value.trim());
        if (!accepted.length) {
          throw new BadRequestException(`Задание ${number}: не задан эталонный ответ`);
        }
        if (accepted.some((value) => value.length > 14)) {
          throw new BadRequestException(
            `Задание ${number}: ответ длиннее 14 символов не помещается в клетки бланка`,
          );
        }
      }
    });
  }

  async create(schoolId: string, teacherId: string, dto: SaveTestDto) {
    const variantCount = dto.variantCount ?? 1;
    const questions = this.clean(dto.questions);
    this.validate(questions, variantCount);
    const test = await this.prisma.test.create({
      data: {
        title: dto.title.trim(),
        description: (dto.description ?? '').trim(),
        instructions: (dto.instructions ?? '').trim(),
        variantCount,
        gradeScale: (dto.gradeScale ?? DEFAULT_SCALE) as Prisma.InputJsonValue,
        schoolId,
        ownerId: teacherId,
        questions: { create: this.questionData(questions, variantCount) },
      },
    });
    return this.detail(test.id, schoolId, teacherId);
  }

  private questionData(questions: QuestionInput[], variantCount: number) {
    return questions.map((question, index) => ({
      order: index + 1,
      // У теста без вариантов пометка не нужна: всё идёт всем.
      variant: variantCount > 1 ? Math.min(question.variant ?? 0, variantCount) : 0,
      type: question.type as QuestionType,
      content: question.content,
      points: question.points,
      options: question.options as unknown as Prisma.InputJsonValue,
      answerKey: question.answerKey as Prisma.InputJsonValue,
    }));
  }

  /**
   * Задания переписываются целиком: так проще и надёжнее, чем сводить правки
   * по одному. Уже выданные работы это не задевает — они держат снимок теста.
   */
  async update(id: string, schoolId: string, teacherId: string, dto: SaveTestDto) {
    await this.requireEditable(id, schoolId, teacherId);
    const variantCount = dto.variantCount ?? 1;
    const questions = this.clean(dto.questions);
    this.validate(questions, variantCount);

    await this.prisma.$transaction([
      this.prisma.question.deleteMany({ where: { testId: id } }),
      this.prisma.test.update({
        where: { id },
        data: {
          title: dto.title.trim(),
          description: (dto.description ?? '').trim(),
          instructions: (dto.instructions ?? '').trim(),
          variantCount,
          gradeScale: (dto.gradeScale ?? DEFAULT_SCALE) as Prisma.InputJsonValue,
          questions: { create: this.questionData(questions, variantCount) },
        },
      }),
    ]);
    return this.detail(id, schoolId, teacherId);
  }

  async setPublished(id: string, schoolId: string, teacherId: string, published: boolean) {
    const test = await this.requireEditable(id, schoolId, teacherId);
    if (published && test.questions.length === 0) {
      throw new BadRequestException('В тесте нет заданий — публиковать нечего');
    }
    await this.prisma.test.update({ where: { id }, data: { isPublished: published } });
    return this.detail(id, schoolId, teacherId);
  }

  async duplicate(id: string, schoolId: string, teacherId: string) {
    const source = await this.load(id, schoolId, teacherId);
    const copy = await this.prisma.test.create({
      data: {
        title: `${source.title} (копия)`,
        description: source.description,
        instructions: source.instructions,
        gradeScale: source.gradeScale as Prisma.InputJsonValue,
        variantCount: source.variantCount,
        schoolId,
        ownerId: teacherId,
        questions: {
          create: source.questions.map((q) => ({
            order: q.order,
            variant: q.variant,
            type: q.type,
            content: q.content,
            points: q.points,
            options: q.options as Prisma.InputJsonValue,
            answerKey: q.answerKey as Prisma.InputJsonValue,
          })),
        },
      },
    });
    return this.detail(copy.id, schoolId, teacherId);
  }

  async remove(id: string, schoolId: string, teacherId: string) {
    const test = await this.load(id, schoolId, teacherId);
    if (test.ownerId !== teacherId) {
      throw new ForbiddenException('Удалить тест может только его автор');
    }
    // Мягко: назначения и работы должны остаться читаемыми в журнале.
    await this.prisma.test.update({ where: { id }, data: { deletedAt: new Date(), isPublished: false } });
    return { ok: true };
  }

  async share(id: string, schoolId: string, teacherId: string, targetId: string, canEdit: boolean) {
    const test = await this.load(id, schoolId, teacherId);
    if (test.ownerId !== teacherId) {
      throw new ForbiddenException('Делиться тестом может только его автор');
    }
    if (targetId === teacherId) {
      throw new BadRequestException('Тест и так ваш');
    }
    // Делиться можно только с коллегой из своей школы.
    const target = await this.prisma.account.findFirst({
      where: { id: targetId, schoolId, deletedAt: null, privileges: { hasSome: ['TEACHER', 'HEAD'] } },
    });
    if (!target) {
      throw new NotFoundException('Учитель не найден');
    }
    await this.prisma.testShare.upsert({
      where: { testId_teacherId: { testId: id, teacherId: targetId } },
      create: { testId: id, teacherId: targetId, ownerId: teacherId, canEdit },
      update: { canEdit },
    });
    return this.detail(id, schoolId, teacherId);
  }

  async unshare(id: string, schoolId: string, teacherId: string, targetId: string) {
    const test = await this.load(id, schoolId, teacherId);
    if (test.ownerId !== teacherId) {
      throw new ForbiddenException('Управлять доступом может только автор теста');
    }
    await this.prisma.testShare.deleteMany({ where: { testId: id, teacherId: targetId } });
    return this.detail(id, schoolId, teacherId);
  }

  /**
   * Снимок для назначения: задания, ключи и пороги оценок замораживаются,
   * чтобы правка теста задним числом не переписала уже проверенные работы.
   */
  async snapshot(testId: string, schoolId: string): Promise<TestSnapshot> {
    const test = await this.prisma.test.findFirst({
      where: { id: testId, schoolId, deletedAt: null },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!test) {
      throw new NotFoundException('Тест не найден');
    }

    const questions: SnapshotQuestion[] = test.questions.map((q) => {
      const options = (q.options as unknown as { id: string; content: string }[]).map((option, index) => ({
        id: option.id,
        content: option.content,
        letter: OPTION_LETTERS[index] ?? String(index + 1),
      }));
      const answerKey = (q.answerKey ?? {}) as AnswerKey;
      return {
        id: q.id,
        order: q.order,
        variant: q.variant,
        type: q.type,
        content: q.content,
        points: q.points,
        options,
        answerKey,
        cells: cellsFor(q.type, options.length, answerKey),
      };
    });

    const snapshot: TestSnapshot = {
      testId: test.id,
      title: test.title,
      description: test.description,
      instructions: test.instructions,
      gradeScale: (test.gradeScale ?? DEFAULT_SCALE) as Record<string, number>,
      variantCount: test.variantCount,
      questions,
      maxScore: 0,
    };
    snapshot.maxScore = maxScoreFor(snapshot, 1);
    return snapshot;
  }
}

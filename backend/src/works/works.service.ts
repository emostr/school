import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { WorkStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OcrService, SheetNotAlignedError } from '../ocr/ocr.service';
import { TesseractMissingError } from '../ocr/tesseract';
import { buildSheetLayout } from '../ocr/sheet';
import {
  SnapshotQuestion,
  TestSnapshot,
  gradeFor,
  judge,
  maxScoreFor,
  questionsForVariant,
} from '../tests/scoring';
import { levenshtein } from '../common/text';
import { normalizeCode } from '../common/crypto/codes';
import { UpdateAnswerDto } from './dto/works.dto';

/** Ниже этой уверенности распознавания работу обязательно смотрит учитель. */
const REVIEW_CONFIDENCE = 0.75;

/**
 * Сколько ошибок в коде бланка прощаем. «5» и «S», «8» и «B» путаются даже
 * на хорошем скане, а кодов в назначении — десятки, поэтому ближайший из них
 * определяется однозначно. Если близких оказалось несколько, лист уходит
 * учителю на ручную привязку.
 */
const CODE_TOLERANCE = 2;

export interface WorkAnswer {
  questionId: string;
  number: number;
  type: SnapshotQuestion['type'];
  /** Что прочитали с бланка (или что ввёл учитель). */
  raw: string;
  correct: boolean | null;
  score: number;
  maxScore: number;
  /** false — оценку выставил человек, автопроверку она перебивает. */
  auto: boolean;
  comment: string;
  confidence: number;
}

export interface UploadOutcome {
  matched: { workId: string; code: string; studentName: string; pageIndex: number }[];
  unmatched: { file: string; url: string; reason: string }[];
}

@Injectable()
export class WorksService {
  private readonly logger = new Logger('Works');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ocr: OcrService,
  ) {}

  private async loadWork(id: string, schoolId: string, teacherId: string) {
    const work = await this.prisma.work.findFirst({
      // Работа принадлежит тому, кто проводил, и лежит в его школе: чужую
      // не откроешь даже по прямой ссылке.
      where: { id, assignment: { schoolId, createdById: teacherId } },
      include: {
        pages: { orderBy: { index: 'asc' } },
        student: { select: { id: true, lastName: true, firstName: true } },
        assignment: {
          include: {
            test: { select: { title: true } },
            class: { select: { number: true, letter: true } },
          },
        },
      },
    });
    if (!work) {
      throw new NotFoundException('Работа не найдена');
    }
    return work;
  }

  private snapshotOf(assignment: { snapshot: unknown }): TestSnapshot {
    const snapshot = assignment.snapshot as TestSnapshot;
    if (!snapshot?.questions?.length) {
      throw new BadRequestException('У назначения нет снимка теста — пересоздайте назначение');
    }
    return snapshot;
  }

  /** Задания того варианта, который достался этой работе. */
  private questionsOf(snapshot: TestSnapshot, variant: number): SnapshotQuestion[] {
    return questionsForVariant(snapshot, variant);
  }

  /** Ищет бланк по прочитанному коду, прощая одну-две ошибки распознавания. */
  private matchCode<T extends { code: string }>(works: T[], scanned: string): T | null {
    const normalized = normalizeCode(scanned);
    if (!normalized) {
      return null;
    }

    const exact = works.find((work) => work.code === normalized);
    if (exact) {
      return exact;
    }

    const ranked = works
      .map((work) => ({ work, distance: levenshtein(work.code, normalized) }))
      .filter((row) => row.distance <= CODE_TOLERANCE)
      .sort((a, b) => a.distance - b.distance);

    if (!ranked.length) {
      return null;
    }
    // Двусмысленность решаем в пользу учителя: пусть привяжет сам.
    if (ranked.length > 1 && ranked[0].distance === ranked[1].distance) {
      return null;
    }
    this.logger.log(`Код «${scanned}» прочитан с ошибкой, ближайший бланк: ${ranked[0].work.code}`);
    return ranked[0].work;
  }

  /**
   * Пачка сканов: каждый лист сам говорит, чей он — код в углу читается
   * первым. Что не прочиталось, возвращаем учителю на ручную привязку.
   */
  async upload(
    assignmentId: string,
    schoolId: string,
    teacherId: string,
    files: { buffer: Buffer; mimetype: string }[],
  ): Promise<UploadOutcome> {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id: assignmentId, schoolId, createdById: teacherId },
      include: { works: { select: { id: true, code: true, studentName: true, variant: true } } },
    });
    if (!assignment) {
      throw new NotFoundException('Назначение не найдено');
    }

    const snapshot = this.snapshotOf(assignment);
    // Разметка зависит от варианта, а вариант станет известен только после
    // чтения кода. Читаем первым вариантом — клетки кода у всех в одном месте,
    // а строки ответов перечитываем разметкой найденной работы.
    const layouts = new Map<number, ReturnType<typeof buildSheetLayout>>();
    const layoutFor = (variant: number) => {
      const cached = layouts.get(variant);
      if (cached) {
        return cached;
      }
      const built = buildSheetLayout(snapshot, variant);
      layouts.set(variant, built);
      return built;
    };

    const outcome: UploadOutcome = { matched: [], unmatched: [] };
    const touched = new Set<string>();

    for (const file of files) {
      const stored = await this.storage.saveScan(file.buffer, file.mimetype);
      const path = this.storage.resolve(stored.file);

      let recognized;
      try {
        recognized = await this.ocr.recognize(path, layoutFor(1));
      } catch (error) {
        const reason =
          error instanceof SheetNotAlignedError || error instanceof TesseractMissingError
            ? error.message
            : 'Не удалось распознать лист';
        if (!(error instanceof SheetNotAlignedError) && !(error instanceof TesseractMissingError)) {
          this.logger.error('Ошибка распознавания', error instanceof Error ? error.stack : String(error));
        }
        outcome.unmatched.push({ file: stored.file, url: `/api/files/${stored.file}`, reason });
        continue;
      }

      const work = this.matchCode(assignment.works, recognized.code);
      if (!work) {
        outcome.unmatched.push({
          file: stored.file,
          url: `/api/files/${stored.file}`,
          reason: recognized.code
            ? `Код «${recognized.code}» не найден среди бланков этого назначения`
            : 'Не удалось прочитать код бланка',
        });
        continue;
      }

      // Вариант известен — если он не первый, перечитываем лист его разметкой.
      if (work.variant !== 1) {
        try {
          recognized = await this.ocr.recognize(path, layoutFor(work.variant));
        } catch {
          // Лист прикрепим и так: ответы учитель впишет руками.
        }
      }

      await this.attachPage(work.id, stored, recognized.pageIndex);
      await this.storeRecognition(work.id, recognized.pageIndex, recognized.answers);
      touched.add(work.id);
      outcome.matched.push({
        workId: work.id,
        code: work.code,
        studentName: work.studentName,
        pageIndex: recognized.pageIndex,
      });
    }

    for (const workId of touched) {
      await this.rescore(workId);
    }
    return outcome;
  }

  private async attachPage(
    workId: string,
    stored: { file: string; width: number; height: number },
    index: number,
  ): Promise<void> {
    // Тот же лист сканируют повторно, когда первый скан вышел мятым:
    // старую страницу с тем же номером заменяем.
    const previous = await this.prisma.scanPage.findFirst({ where: { workId, index } });
    if (previous) {
      await this.storage.remove(previous.file);
      await this.prisma.scanPage.delete({ where: { id: previous.id } });
    }
    await this.prisma.scanPage.create({
      data: { workId, file: stored.file, index, width: stored.width, height: stored.height },
    });
  }

  /** Распознанное по странице кладём поверх уже накопленных ответов работы. */
  private async storeRecognition(
    workId: string,
    pageIndex: number,
    recognized: { questionId: string; raw: string; confidence: number }[],
  ): Promise<void> {
    const work = await this.prisma.work.findUniqueOrThrow({
      where: { id: workId },
      include: { assignment: true },
    });
    const snapshot = this.snapshotOf(work.assignment);
    const questions = this.questionsOf(snapshot, work.variant);
    const existing = (work.answers ?? []) as unknown as WorkAnswer[];
    const byQuestion = new Map(existing.map((a) => [a.questionId, a]));

    for (const item of recognized) {
      const previous = byQuestion.get(item.questionId);
      // Правку учителя автоматика не перетирает.
      if (previous && !previous.auto) {
        continue;
      }
      const question = questions.find((q) => q.id === item.questionId);
      if (!question) {
        continue;
      }
      const verdict = judge(question, item.raw);
      byQuestion.set(item.questionId, {
        questionId: item.questionId,
        number: questions.findIndex((q) => q.id === item.questionId) + 1,
        type: question.type,
        raw: item.raw,
        correct: verdict.correct,
        score: verdict.score,
        maxScore: question.points,
        auto: true,
        comment: '',
        confidence: item.confidence,
      });
    }

    await this.prisma.work.update({
      where: { id: workId },
      data: {
        answers: [...byQuestion.values()] as unknown as Prisma.InputJsonValue,
        scannedAt: new Date(),
      },
    });
    this.logger.log(`Работа ${workId}: страница ${pageIndex + 1} распознана`);
  }

  /**
   * Пересчёт баллов и оценки. Вызывается после распознавания и после каждой
   * правки — учитель всегда видит актуальный итог, ещё до завершения проверки.
   */
  async rescore(workId: string) {
    const work = await this.prisma.work.findUniqueOrThrow({
      where: { id: workId },
      include: { assignment: true },
    });
    const snapshot = this.snapshotOf(work.assignment);
    const answers = this.fill(work.answers as unknown as WorkAnswer[], snapshot, work.variant);

    const autoScore = answers.filter((a) => a.auto).reduce((sum, a) => sum + a.score, 0);
    const manualScore = answers.filter((a) => !a.auto).reduce((sum, a) => sum + a.score, 0);
    const maxScore = maxScoreFor(snapshot, work.variant);
    const total = autoScore + manualScore;
    const percent = maxScore ? Math.round((total / maxScore) * 100) : 0;

    const needsReview = answers.some(
      (a) => a.correct === null || (a.auto && a.confidence < REVIEW_CONFIDENCE && a.raw !== ''),
    );
    const hasScan = (await this.prisma.scanPage.count({ where: { workId } })) > 0;

    let status: WorkStatus = 'PENDING';
    if (work.status === 'CHECKED') {
      status = 'CHECKED';
    } else if (hasScan || answers.some((a) => a.raw)) {
      status = needsReview ? 'NEEDS_REVIEW' : 'RECOGNIZED';
    }

    return this.prisma.work.update({
      where: { id: workId },
      data: {
        answers: answers as unknown as Prisma.InputJsonValue,
        autoScore,
        manualScore,
        maxScore,
        percent,
        grade: status === 'CHECKED' ? gradeFor(percent, snapshot.gradeScale) : null,
        status,
      },
    });
  }

  /** Достраивает пропущенные задания: строк столько же, сколько в варианте. */
  private fill(answers: WorkAnswer[], snapshot: TestSnapshot, variant: number): WorkAnswer[] {
    const byQuestion = new Map((answers ?? []).map((a) => [a.questionId, a]));
    return this.questionsOf(snapshot, variant).map((question, index) => {
      const existing = byQuestion.get(question.id);
      if (existing) {
        return { ...existing, number: index + 1, maxScore: question.points, type: question.type };
      }
      return {
        questionId: question.id,
        number: index + 1,
        type: question.type,
        raw: '',
        correct: question.type === 'EXTENDED' ? null : false,
        score: 0,
        maxScore: question.points,
        auto: true,
        comment: '',
        confidence: 1,
      };
    });
  }

  async detail(id: string, schoolId: string, teacherId: string) {
    const work = await this.loadWork(id, schoolId, teacherId);
    const snapshot = this.snapshotOf(work.assignment);
    const questions = this.questionsOf(snapshot, work.variant);
    const answers = this.fill(work.answers as unknown as WorkAnswer[], snapshot, work.variant);

    return {
      id: work.id,
      code: work.code,
      status: work.status,
      variant: work.variant,
      variantCount: snapshot.variantCount ?? 1,
      studentId: work.studentId,
      studentName: work.student ? `${work.student.lastName} ${work.student.firstName}` : work.studentName,
      assignmentId: work.assignmentId,
      testTitle: work.assignment.test.title,
      className: `${work.assignment.class.number}${work.assignment.class.letter}`,
      date: work.assignment.date.toISOString().slice(0, 10),
      autoScore: work.autoScore,
      manualScore: work.manualScore,
      maxScore: work.maxScore,
      percent: work.percent,
      grade: work.grade,
      gradeScale: snapshot.gradeScale,
      scannedAt: work.scannedAt ? work.scannedAt.toISOString() : null,
      checkedAt: work.checkedAt ? work.checkedAt.toISOString() : null,
      pages: work.pages.map((page) => ({
        id: page.id,
        index: page.index,
        url: `/api/files/${page.file}`,
        width: page.width,
        height: page.height,
      })),
      questions: questions.map((question, index) => ({
        id: question.id,
        number: index + 1,
        type: question.type,
        content: question.content,
        points: question.points,
        options: question.options,
        answerKey: question.answerKey,
      })),
      answers,
    };
  }

  /** Правка одного ответа: и текст с бланка, и вердикт, и баллы. */
  async updateAnswer(id: string, schoolId: string, teacherId: string, dto: UpdateAnswerDto) {
    const work = await this.loadWork(id, schoolId, teacherId);
    const snapshot = this.snapshotOf(work.assignment);
    const question = this.questionsOf(snapshot, work.variant).find((q) => q.id === dto.questionId);
    if (!question) {
      throw new NotFoundException('Задание не найдено');
    }

    const answers = this.fill(work.answers as unknown as WorkAnswer[], snapshot, work.variant);
    const index = answers.findIndex((a) => a.questionId === dto.questionId);
    const current = answers[index];

    let next: WorkAnswer = { ...current };
    if (dto.raw !== undefined) {
      // Ответ переписали руками — пересчитываем его по ключу заново.
      const verdict = judge(question, dto.raw);
      next = { ...next, raw: dto.raw, correct: verdict.correct, score: verdict.score, auto: true, confidence: 1 };
    }
    if (dto.correct !== undefined) {
      next = {
        ...next,
        correct: dto.correct,
        score: dto.correct ? question.points : 0,
        auto: false,
      };
    }
    if (dto.score !== undefined) {
      const score = Math.min(dto.score, question.points);
      next = {
        ...next,
        score,
        correct: score >= question.points ? true : score > 0 ? null : false,
        auto: false,
      };
    }
    if (dto.comment !== undefined) {
      next = { ...next, comment: dto.comment };
    }

    answers[index] = next;
    await this.prisma.work.update({
      where: { id },
      data: { answers: answers as unknown as Prisma.InputJsonValue },
    });
    await this.rescore(id);
    return this.detail(id, schoolId, teacherId);
  }

  /** Завершение проверки: оценка уходит в журнал. */
  async finalize(id: string, schoolId: string, teacherId: string) {
    const work = await this.loadWork(id, schoolId, teacherId);
    const snapshot = this.snapshotOf(work.assignment);
    const answers = this.fill(work.answers as unknown as WorkAnswer[], snapshot, work.variant);

    const unresolved = answers.filter((a) => a.correct === null && a.score === 0 && a.type === 'EXTENDED');
    if (unresolved.length) {
      throw new BadRequestException(
        `Развёрнутые задания ещё не проверены: ${unresolved.map((a) => a.number).join(', ')}`,
      );
    }

    const total = answers.reduce((sum, a) => sum + a.score, 0);
    const maxScore = maxScoreFor(snapshot, work.variant);
    const percent = maxScore ? Math.round((total / maxScore) * 100) : 0;

    await this.prisma.work.update({
      where: { id },
      data: {
        status: 'CHECKED',
        percent,
        grade: gradeFor(percent, snapshot.gradeScale),
        checkedAt: new Date(),
        checkedById: teacherId,
      },
    });
    return this.detail(id, schoolId, teacherId);
  }

  async reopen(id: string, schoolId: string, teacherId: string) {
    await this.prisma.work.update({
      where: { id },
      data: { status: 'NEEDS_REVIEW', checkedAt: null, checkedById: null, grade: null },
    });
    return this.rescore(id).then(() => this.detail(id, schoolId, teacherId));
  }

  /** Привязать запасной бланк к ученику. */
  async assignStudent(id: string, schoolId: string, teacherId: string, studentId?: string, studentName?: string) {
    const work = await this.loadWork(id, schoolId, teacherId);
    if (studentId) {
      const student = await this.prisma.student.findFirst({
        where: { id: studentId, classId: work.assignment.classId },
      });
      if (!student) {
        throw new BadRequestException('Ученик не из этого класса');
      }
      await this.prisma.work.update({
        where: { id },
        data: { studentId, studentName: `${student.lastName} ${student.firstName}` },
      });
    } else {
      await this.prisma.work.update({
        where: { id },
        data: { studentId: null, studentName: (studentName ?? '').trim() },
      });
    }
    return this.detail(id, schoolId, teacherId);
  }

  /** Ручная привязка листа, у которого не прочитался код. */
  async attachExisting(id: string, schoolId: string, teacherId: string, file: string, pageIndex = 0) {
    const work = await this.loadWork(id, schoolId, teacherId);
    if (!(await this.storage.exists(file))) {
      throw new NotFoundException('Файл скана не найден');
    }
    const snapshot = this.snapshotOf(work.assignment);
    const layout = buildSheetLayout(snapshot, work.variant);

    await this.attachPage(id, { file, width: 0, height: 0 }, pageIndex);
    try {
      const recognized = await this.ocr.recognize(this.storage.resolve(file), layout);
      await this.storeRecognition(id, pageIndex, recognized.answers);
    } catch {
      // Лист не читается автоматически — учитель введёт ответы руками,
      // скан всё равно останется прикреплённым.
    }
    await this.rescore(id);
    return this.detail(id, schoolId, teacherId);
  }

  async removePage(id: string, schoolId: string, teacherId: string, pageId: string) {
    const page = await this.prisma.scanPage.findFirst({ where: { id: pageId, workId: id } });
    if (!page) {
      throw new NotFoundException('Страница не найдена');
    }
    await this.storage.remove(page.file);
    await this.prisma.scanPage.delete({ where: { id: pageId } });
    return this.detail(id, schoolId, teacherId);
  }

  /** Полный сброс работы: ученик писал не тот бланк или скан оказался чужим. */
  async reset(id: string, schoolId: string, teacherId: string) {
    await this.loadWork(id, schoolId, teacherId);
    const pages = await this.prisma.scanPage.findMany({ where: { workId: id } });
    for (const page of pages) {
      await this.storage.remove(page.file);
    }
    await this.prisma.$transaction([
      this.prisma.scanPage.deleteMany({ where: { workId: id } }),
      this.prisma.work.update({
        where: { id },
        data: {
          answers: [] as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
          autoScore: 0,
          manualScore: 0,
          percent: 0,
          grade: null,
          scannedAt: null,
          checkedAt: null,
          checkedById: null,
        },
      }),
    ]);
    return this.detail(id, schoolId, teacherId);
  }
}

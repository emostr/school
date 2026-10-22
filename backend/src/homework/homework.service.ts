import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { AccessService } from '../school/access.service';
import { AttachmentsService, attachmentView } from '../attachments/attachments.service';
import { addDays, dayKey, isValidDay, parseDay, startOfWeek } from '../common/dates';
import { isBlankContent, sanitizeContent } from '../common/content';
import { className } from '../common/text';
import { isStaff } from '../common/access';
import { RequestAccount } from '../common/types';
import { SaveHomeworkDto, TemplateDto } from './homework.dto';

const INCLUDE = {
  subject: { select: { id: true, name: true, short: true } },
  author: { select: { id: true, fullName: true } },
  class: { select: { id: true, number: true, letter: true } },
  attachments: { orderBy: { position: 'asc' } },
} satisfies Prisma.HomeworkInclude;

type HomeworkRow = Prisma.HomeworkGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class HomeworkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
    private readonly access: AccessService,
    private readonly attachments: AttachmentsService,
  ) {}

  private async view(viewer: RequestAccount, row: HomeworkRow) {
    return {
      id: row.id,
      classId: row.classId,
      className: className(row.class.number, row.class.letter),
      subject: { id: row.subject.id, name: row.subject.name, short: row.subject.short || row.subject.name },
      date: dayKey(row.date),
      lessonNumber: row.lessonNumber,
      group: row.group,
      content: row.content,
      author: row.author,
      attachments: row.attachments.map(attachmentView),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      canEdit: await this.canEdit(viewer, row),
    };
  }

  /** Доверенный ученик правит только своё, остальные — всё в пределах своих прав. */
  private async canEdit(viewer: RequestAccount, row: { classId: string; subjectId: string; date: Date; authorId: string | null }) {
    if (!isStaff(viewer)) {
      return row.authorId === viewer.id && (await this.access.canPublish(viewer, row.classId, row.subjectId, row.date));
    }
    return this.access.canPublish(viewer, row.classId, row.subjectId, row.date);
  }

  async list(viewer: RequestAccount, query: { classId?: string; from?: string; to?: string; subjectId?: string }) {
    const classId = query.classId || viewer.studentClassId;
    if (!classId) {
      throw new BadRequestException('Выберите класс');
    }
    await this.access.assertViewClass(viewer, classId);
    const today = await this.school.today();
    const from = isValidDay(query.from) ? parseDay(query.from) : startOfWeek(today);
    const to = isValidDay(query.to) ? parseDay(query.to) : addDays(from, 6);
    if (to < from || to.getTime() - from.getTime() > 400 * 24 * 3600 * 1000) {
      throw new BadRequestException('Слишком большой промежуток');
    }

    const rows = await this.prisma.homework.findMany({
      where: {
        classId,
        deletedAt: null,
        date: { gte: from, lte: to },
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      },
      orderBy: [{ date: 'asc' }, { lessonNumber: 'asc' }, { createdAt: 'asc' }],
      include: INCLUDE,
    });
    return {
      classId,
      from: dayKey(from),
      to: dayKey(to),
      items: await Promise.all(rows.map((row) => this.view(viewer, row))),
    };
  }

  /** Задания по одному предмету подряд — архив, листаемый назад от даты. */
  async archive(viewer: RequestAccount, query: { classId?: string; subjectId?: string; before?: string; search?: string }) {
    const classId = query.classId || viewer.studentClassId;
    if (!classId) {
      throw new BadRequestException('Выберите класс');
    }
    await this.access.assertViewClass(viewer, classId);
    const before = isValidDay(query.before) ? parseDay(query.before) : addDays(await this.school.today(), 1);
    const rows = await this.prisma.homework.findMany({
      where: {
        classId,
        deletedAt: null,
        date: { lt: before },
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.search?.trim() ? { content: { contains: query.search.trim(), mode: 'insensitive' } } : {}),
      },
      orderBy: [{ date: 'desc' }, { lessonNumber: 'asc' }],
      include: INCLUDE,
      take: 40,
    });
    return Promise.all(rows.map((row) => this.view(viewer, row)));
  }

  private async prepare(viewer: RequestAccount, dto: SaveHomeworkDto) {
    const date = parseDay(dto.date.slice(0, 10));
    await this.access.assertPublish(viewer, dto.classId, dto.subjectId, date);
    const subject = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, archivedAt: null } });
    if (!subject) {
      throw new BadRequestException('Предмет не найден');
    }
    const content = sanitizeContent(dto.content);
    if (isBlankContent(content) && !dto.attachmentIds?.length) {
      throw new BadRequestException('Задание пустое — напишите текст или приложите файл');
    }
    return { date, content };
  }

  async create(viewer: RequestAccount, dto: SaveHomeworkDto) {
    const { date, content } = await this.prepare(viewer, dto);
    const row = await this.prisma.homework.create({
      data: {
        classId: dto.classId,
        subjectId: dto.subjectId,
        date,
        lessonNumber: dto.lessonNumber ?? null,
        group: dto.group ?? '',
        content,
        authorId: viewer.id,
      },
    });
    await this.attachments.link(viewer.id, dto.attachmentIds ?? [], { homeworkId: row.id });
    return this.detail(viewer, row.id);
  }

  async detail(viewer: RequestAccount, id: string) {
    const row = await this.prisma.homework.findFirst({ where: { id, deletedAt: null }, include: INCLUDE });
    if (!row) {
      throw new NotFoundException('Задание не найдено');
    }
    await this.access.assertViewClass(viewer, row.classId);
    return this.view(viewer, row);
  }

  private async requireEditable(viewer: RequestAccount, id: string) {
    const row = await this.prisma.homework.findFirst({ where: { id, deletedAt: null } });
    if (!row) {
      throw new NotFoundException('Задание не найдено');
    }
    if (!(await this.canEdit(viewer, row))) {
      throw new ForbiddenException('Это задание правит его автор или учитель предмета');
    }
    return row;
  }

  async update(viewer: RequestAccount, id: string, dto: SaveHomeworkDto) {
    await this.requireEditable(viewer, id);
    const { date, content } = await this.prepare(viewer, dto);
    await this.prisma.homework.update({
      where: { id },
      data: {
        classId: dto.classId,
        subjectId: dto.subjectId,
        date,
        lessonNumber: dto.lessonNumber ?? null,
        group: dto.group ?? '',
        content,
      },
    });
    const keep = dto.attachmentIds ?? [];
    await this.attachments.prune({ homeworkId: id }, keep);
    await this.attachments.link(viewer.id, keep, { homeworkId: id });
    return this.detail(viewer, id);
  }

  /** Удаление мягкое: в архиве задание остаётся видно сотрудникам при разборе. */
  async remove(viewer: RequestAccount, id: string) {
    await this.requireEditable(viewer, id);
    await this.prisma.homework.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /** Классы и предметы, по которым можно публиковать. */
  async targets(viewer: RequestAccount) {
    const targets = await this.access.publishTargets(viewer);
    const classes = await this.prisma.schoolClass.findMany({
      where: { id: { in: targets.map((t) => t.classId) }, archivedAt: null },
      orderBy: [{ number: 'asc' }, { letter: 'asc' }],
      select: { id: true, number: true, letter: true },
    });
    const subjects = await this.prisma.subject.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } });
    return classes.map((item) => {
      const allowed = targets.find((t) => t.classId === item.id)?.subjectIds ?? null;
      return {
        classId: item.id,
        className: className(item.number, item.letter),
        subjects: subjects
          .filter((subject) => !allowed || allowed.includes(subject.id))
          .map((subject) => ({ id: subject.id, name: subject.name, short: subject.short || subject.name })),
      };
    });
  }

  async templates(ownerId: string) {
    const rows = await this.prisma.homeworkTemplate.findMany({ where: { ownerId }, orderBy: { createdAt: 'asc' } });
    return rows.map((row) => ({ id: row.id, title: row.title, content: row.content }));
  }

  async createTemplate(ownerId: string, dto: TemplateDto) {
    const count = await this.prisma.homeworkTemplate.count({ where: { ownerId } });
    if (count >= 50) {
      throw new BadRequestException('Заготовок не больше пятидесяти');
    }
    await this.prisma.homeworkTemplate.create({
      data: { ownerId, title: dto.title.trim(), content: sanitizeContent(dto.content) },
    });
    return this.templates(ownerId);
  }

  async removeTemplate(ownerId: string, id: string) {
    await this.prisma.homeworkTemplate.deleteMany({ where: { id, ownerId } });
    return this.templates(ownerId);
  }
}

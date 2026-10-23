import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../school/access.service';
import { AttachmentsService, attachmentView } from '../attachments/attachments.service';
import { dayKey, isValidDay, parseDay } from '../common/dates';
import { isBlankContent, sanitizeContent } from '../common/content';
import { className, htmlToText } from '../common/text';
import { isStaff } from '../common/access';
import { RequestAccount } from '../common/types';
import { SaveNoteDto } from './notes.dto';

const INCLUDE = {
  subject: { select: { id: true, name: true, short: true } },
  author: { select: { id: true, fullName: true } },
  class: { select: { id: true, number: true, letter: true } },
  attachments: { orderBy: { position: 'asc' } },
} satisfies Prisma.NoteInclude;

type NoteRow = Prisma.NoteGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly attachments: AttachmentsService,
  ) {}

  private async canEdit(viewer: RequestAccount, row: { classId: string; subjectId: string; date: Date; authorId: string | null }) {
    if (!isStaff(viewer)) {
      return row.authorId === viewer.id && (await this.access.canPublish(viewer, row.classId, row.subjectId, row.date));
    }
    return this.access.canPublish(viewer, row.classId, row.subjectId, row.date);
  }

  private async summary(viewer: RequestAccount, row: NoteRow) {
    return {
      id: row.id,
      classId: row.classId,
      className: className(row.class.number, row.class.letter),
      subject: { id: row.subject.id, name: row.subject.name, short: row.subject.short || row.subject.name },
      date: dayKey(row.date),
      lessonNumber: row.lessonNumber,
      title: row.title,
      kind: row.kind,
      // В списке — начало текста, чтобы конспект узнавался без открытия.
      excerpt: row.kind === 'RICH' ? htmlToText(row.content).slice(0, 220) : '',
      cover: row.attachments.find((item) => item.mime.startsWith('image/'))
        ? attachmentView(row.attachments.find((item) => item.mime.startsWith('image/'))!)
        : null,
      attachmentCount: row.attachments.length,
      author: row.author,
      updatedAt: row.updatedAt.toISOString(),
      canEdit: await this.canEdit(viewer, row),
    };
  }

  async list(
    viewer: RequestAccount,
    query: { classId?: string; subjectId?: string; from?: string; to?: string; search?: string },
  ) {
    const classId = query.classId || viewer.studentClassId || viewer.children[0]?.classId;
    if (!classId) {
      throw new BadRequestException('Выберите класс');
    }
    await this.access.assertViewClass(viewer, classId);
    const search = query.search?.trim();
    const rows = await this.prisma.note.findMany({
      where: {
        classId,
        deletedAt: null,
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(isValidDay(query.from) || isValidDay(query.to)
          ? {
              date: {
                ...(isValidDay(query.from) ? { gte: parseDay(query.from) } : {}),
                ...(isValidDay(query.to) ? { lte: parseDay(query.to) } : {}),
              },
            }
          : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: INCLUDE,
      take: 200,
    });
    return Promise.all(rows.map((row) => this.summary(viewer, row)));
  }

  async detail(viewer: RequestAccount, id: string) {
    const row = await this.prisma.note.findFirst({ where: { id, deletedAt: null }, include: INCLUDE });
    if (!row) {
      throw new NotFoundException('Конспект не найден');
    }
    await this.access.assertViewClass(viewer, row.classId);
    return {
      ...(await this.summary(viewer, row)),
      content: row.content,
      attachments: row.attachments.map(attachmentView),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async prepare(viewer: RequestAccount, dto: SaveNoteDto) {
    const date = parseDay(dto.date.slice(0, 10));
    await this.access.assertPublish(viewer, dto.classId, dto.subjectId, date);
    const subject = await this.prisma.subject.findFirst({ where: { id: dto.subjectId, archivedAt: null } });
    if (!subject) {
      throw new BadRequestException('Предмет не найден');
    }
    const content = dto.kind === 'RICH' ? sanitizeContent(dto.content ?? '') : '';
    if (dto.kind === 'RICH' && isBlankContent(content)) {
      throw new BadRequestException('Конспект пустой');
    }
    if (dto.kind === 'FILES' && !dto.attachmentIds?.length) {
      throw new BadRequestException('Приложите фотографии или PDF');
    }
    return { date, content };
  }

  async create(viewer: RequestAccount, dto: SaveNoteDto) {
    const { date, content } = await this.prepare(viewer, dto);
    const row = await this.prisma.note.create({
      data: {
        classId: dto.classId,
        subjectId: dto.subjectId,
        date,
        lessonNumber: dto.lessonNumber ?? null,
        title: dto.title.trim(),
        kind: dto.kind,
        content,
        authorId: viewer.id,
      },
    });
    await this.attachments.link(viewer.id, dto.attachmentIds ?? [], { noteId: row.id });
    return this.detail(viewer, row.id);
  }

  private async requireEditable(viewer: RequestAccount, id: string) {
    const row = await this.prisma.note.findFirst({ where: { id, deletedAt: null } });
    if (!row) {
      throw new NotFoundException('Конспект не найден');
    }
    if (!(await this.canEdit(viewer, row))) {
      throw new ForbiddenException('Этот конспект правит его автор или учитель предмета');
    }
    return row;
  }

  async update(viewer: RequestAccount, id: string, dto: SaveNoteDto) {
    await this.requireEditable(viewer, id);
    const { date, content } = await this.prepare(viewer, dto);
    await this.prisma.note.update({
      where: { id },
      data: {
        classId: dto.classId,
        subjectId: dto.subjectId,
        date,
        lessonNumber: dto.lessonNumber ?? null,
        title: dto.title.trim(),
        kind: dto.kind,
        content,
      },
    });
    const keep = dto.attachmentIds ?? [];
    await this.attachments.prune({ noteId: id }, keep);
    await this.attachments.link(viewer.id, keep, { noteId: id });
    return this.detail(viewer, id);
  }

  async remove(viewer: RequestAccount, id: string) {
    await this.requireEditable(viewer, id);
    await this.prisma.note.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
}

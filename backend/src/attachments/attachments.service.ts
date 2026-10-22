import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AccessService } from '../school/access.service';
import { RequestAccount } from '../common/types';

export interface AttachmentView {
  id: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  url: string;
}

export function attachmentView(row: {
  id: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
}): AttachmentView {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    url: `/api/attachments/${row.id}/file`,
  };
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: AccessService,
  ) {}

  async upload(owner: RequestAccount, files: { buffer: Buffer; mimetype: string; filename: string }[]) {
    const saved: AttachmentView[] = [];
    for (const file of files) {
      const stored = await this.storage.saveAttachment(file.buffer, file.mimetype);
      // Фото с телефона приходит как IMG_0412.HEIC, а лежит уже в WebP.
      const base = (file.filename || 'файл').replace(/\.[^.]+$/, '').slice(0, 120);
      const name = stored.mime === 'application/pdf' ? `${base}.pdf` : `${base}.webp`;
      const row = await this.prisma.attachment.create({
        data: {
          file: stored.file,
          name,
          mime: stored.mime,
          size: stored.size,
          width: stored.width,
          height: stored.height,
          ownerId: owner.id,
        },
      });
      saved.push(attachmentView(row));
    }
    return saved;
  }

  /**
   * Привязать загруженные файлы к заданию или конспекту. Чужие и уже
   * привязанные к другой записи файлы не берём.
   */
  async link(ownerId: string, ids: string[], target: { homeworkId?: string; noteId?: string }) {
    const unique = [...new Set(ids)];
    if (!unique.length) {
      return;
    }
    const rows = await this.prisma.attachment.findMany({ where: { id: { in: unique } } });
    for (const row of rows) {
      const foreign = row.ownerId !== ownerId && row.homeworkId !== target.homeworkId && row.noteId !== target.noteId;
      const elsewhere =
        (row.homeworkId && row.homeworkId !== target.homeworkId) || (row.noteId && row.noteId !== target.noteId);
      if (foreign || elsewhere) {
        throw new BadRequestException('Вложение принадлежит другой записи');
      }
    }
    await this.prisma.$transaction(
      unique.map((id, position) =>
        this.prisma.attachment.update({ where: { id }, data: { ...target, position } }),
      ),
    );
  }

  /** Вложения, которые убрали из записи при правке, отвязываются и стираются. */
  async prune(target: { homeworkId?: string; noteId?: string }, keep: string[]) {
    const stale = await this.prisma.attachment.findMany({ where: { ...target, id: { notIn: keep } } });
    for (const row of stale) {
      await this.storage.remove(row.file);
    }
    await this.prisma.attachment.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }

  async file(viewer: RequestAccount, id: string) {
    const row = await this.prisma.attachment.findUnique({
      where: { id },
      include: {
        homework: { select: { classId: true, deletedAt: true } },
        note: { select: { classId: true, deletedAt: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Файл не найден');
    }
    const classId = row.homework?.classId ?? row.note?.classId;
    const allowed = classId ? this.access.canViewClass(viewer, classId) : row.ownerId === viewer.id;
    if (!allowed) {
      throw new ForbiddenException('Нет доступа к файлу');
    }
    if (!(await this.storage.exists(row.file))) {
      throw new NotFoundException('Файл не найден на диске');
    }
    return { row, buffer: await this.storage.read(row.file) };
  }

  async remove(viewer: RequestAccount, id: string) {
    const row = await this.prisma.attachment.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Файл не найден');
    }
    if (row.ownerId !== viewer.id || row.homeworkId || row.noteId) {
      throw new ForbiddenException('Файл уже прикреплён — уберите его из записи');
    }
    await this.storage.remove(row.file);
    await this.prisma.attachment.delete({ where: { id } });
    return { ok: true };
  }
}

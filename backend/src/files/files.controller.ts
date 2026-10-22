import { BadRequestException, Controller, ForbiddenException, Get, Header, Param, Post, Query, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Access } from '../common/decorators/access.decorator';
import { RequestAccount } from '../common/types';
import { isStaff } from '../common/access';

@Controller('files')
@Roles('SCHOOL_ADMIN', 'TEACHER')
export class FilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Загрузка картинки из визуального редактора: чертежи, графики, схемы.
   * scope=content — картинка задания или конспекта, её увидит вся школа;
   * без него — картинка теста, она видна только сотрудникам.
   */
  @Post('images')
  @Access('TEACHER', 'HEAD', 'TRUSTED')
  async uploadImage(
    @Req() req: FastifyRequest,
    @CurrentAccount() account: RequestAccount,
    @Query('scope') scope?: string,
  ) {
    const isContent = scope === 'content';
    if (!isContent && !isStaff(account)) {
      throw new ForbiddenException('Картинки тестов загружают учителя');
    }
    const part = await req.file();
    if (!part) {
      throw new BadRequestException('Файл не передан');
    }
    const buffer = await part.toBuffer();
    const stored = await this.storage.saveImage(buffer, part.mimetype);
    await this.prisma.mediaFile.create({
      data: {
        file: stored.file,
        mime: stored.mime,
        width: stored.width,
        height: stored.height,
        size: stored.size,
        schoolId: account.school?.id ?? null,
        ownerId: account.id,
        scope: isContent ? 'CONTENT' : 'TEST',
      },
    });
    return { url: `/api/files/${stored.file}`, width: stored.width, height: stored.height };
  }

  /**
   * Отдаём файлы сами, а не статикой: каталог загрузок лежит в приватном
   * томе, и смотреть его вправе только та школа, которой файл принадлежит.
   * Имя файла — случайный идентификатор, но полагаться на его секретность
   * нельзя: границу школы проверяем явно.
   */
  @Get('images/:name')
  @Access('MEMBER')
  @Header('Cache-Control', 'private, max-age=86400')
  async image(
    @Param('name') name: string,
    @CurrentAccount() account: RequestAccount,
    @Res() reply: FastifyReply,
  ) {
    const file = `images/${name}`;
    const media = await this.prisma.mediaFile.findUnique({ where: { file } });
    // Картинки, загруженные до появления школ, привязки не имеют — их
    // отдаём только владельцу.
    const sameSchool = media
      ? media.schoolId
        ? media.schoolId === account.school?.id
        : media.ownerId === account.id
      : false;
    // Чертёж из контрольной ученик не должен увидеть раньше самой контрольной.
    const allowed = sameSchool && (media?.scope === 'CONTENT' || isStaff(account) || media?.ownerId === account.id);
    if (!allowed) {
      throw new ForbiddenException('Нет доступа к файлу');
    }
    return this.send(file, reply);
  }

  @Get('scans/:name')
  @Header('Cache-Control', 'private, max-age=3600')
  async scan(
    @Param('name') name: string,
    @CurrentAccount() account: RequestAccount,
    @Res() reply: FastifyReply,
  ) {
    const file = `scans/${name}`;
    const page = await this.prisma.scanPage.findFirst({
      where: {
        file,
        work: { assignment: { schoolId: account.school?.id ?? '', createdById: account.id } },
      },
      select: { id: true },
    });

    if (!page) {
      // Только что загруженный лист, который не удалось привязать к работе,
      // ещё не имеет страницы: его показываем тому, кто его и загрузил.
      const orphan = await this.prisma.scanPage.count({ where: { file } });
      if (orphan > 0) {
        throw new ForbiddenException('Скан принадлежит другой работе');
      }
    }
    return this.send(file, reply);
  }

  private async send(file: string, reply: FastifyReply) {
    if (!(await this.storage.exists(file))) {
      return reply.status(404).send({ statusCode: 404, error: 'NotFound', message: 'Файл не найден' });
    }
    const buffer = await this.storage.read(file);
    return reply
      .type(this.storage.extension(file) === '.webp' ? 'image/webp' : 'application/octet-stream')
      .header('ETag', this.storage.etag(file, buffer.length))
      .send(buffer);
  }
}

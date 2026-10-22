import { BadRequestException, Controller, Delete, Get, Param, Post, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount } from '../common/types';
import { AttachmentsService } from './attachments.service';

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Access('TRUSTED', 'TEACHER', 'HEAD')
  @Post()
  async upload(@CurrentAccount() account: RequestAccount, @Req() req: FastifyRequest) {
    const files: { buffer: Buffer; mimetype: string; filename: string }[] = [];
    for await (const part of req.files()) {
      files.push({ buffer: await part.toBuffer(), mimetype: part.mimetype, filename: part.filename });
    }
    if (!files.length) {
      throw new BadRequestException('Не передано ни одного файла');
    }
    if (files.length > 20) {
      throw new BadRequestException('Не больше 20 файлов за раз');
    }
    return this.attachments.upload(account, files);
  }

  @Get(':id/file')
  async file(@CurrentAccount() account: RequestAccount, @Param('id') id: string, @Res() reply: FastifyReply) {
    const { row, buffer } = await this.attachments.file(account, id);
    return reply
      .type(row.mime)
      .header('Cache-Control', 'private, max-age=86400')
      .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`)
      .header('X-Content-Type-Options', 'nosniff')
      .send(buffer);
  }

  @Access('TRUSTED', 'TEACHER', 'HEAD')
  @Delete(':id')
  remove(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.attachments.remove(account, id);
  }
}

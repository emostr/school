import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { WorksService } from './works.service';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestAccount } from '../common/types';
import { AssignStudentDto, AttachPageDto, UpdateAnswerDto } from './dto/works.dto';

@Controller()
@Roles('SCHOOL_ADMIN', 'TEACHER')
export class WorksController {
  constructor(private readonly works: WorksService) {}

  private school(account: RequestAccount): string {
    return account.school?.id ?? '';
  }

  /** Пачка сканов одного назначения: листы сами разбираются по ученикам. */
  @Post('assignments/:id/scans')
  async upload(
    @Param('id') id: string,
    @CurrentAccount() account: RequestAccount,
    @Req() req: FastifyRequest,
  ) {
    const parts = req.files();
    const files: { buffer: Buffer; mimetype: string }[] = [];
    for await (const part of parts) {
      files.push({ buffer: await part.toBuffer(), mimetype: part.mimetype });
    }
    if (!files.length) {
      throw new BadRequestException('Не передано ни одного файла');
    }
    return this.works.upload(id, this.school(account), account.id, files);
  }

  @Get('works/:id')
  detail(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.works.detail(id, this.school(account), account.id);
  }

  @Patch('works/:id/answers')
  updateAnswer(
    @Param('id') id: string,
    @CurrentAccount() account: RequestAccount,
    @Body() dto: UpdateAnswerDto,
  ) {
    return this.works.updateAnswer(id, this.school(account), account.id, dto);
  }

  @Post('works/:id/finalize')
  finalize(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.works.finalize(id, this.school(account), account.id);
  }

  @Post('works/:id/reopen')
  reopen(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.works.reopen(id, this.school(account), account.id);
  }

  @Patch('works/:id/student')
  assignStudent(
    @Param('id') id: string,
    @CurrentAccount() account: RequestAccount,
    @Body() dto: AssignStudentDto,
  ) {
    return this.works.assignStudent(id, this.school(account), account.id, dto.studentId, dto.studentName);
  }

  @Post('works/:id/pages')
  attach(
    @Param('id') id: string,
    @CurrentAccount() account: RequestAccount,
    @Body() dto: AttachPageDto,
  ) {
    return this.works.attachExisting(id, this.school(account), account.id, dto.file, dto.pageIndex ?? 0);
  }

  @Delete('works/:id/pages/:pageId')
  removePage(
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @CurrentAccount() account: RequestAccount,
  ) {
    return this.works.removePage(id, this.school(account), account.id, pageId);
  }

  @Post('works/:id/reset')
  reset(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.works.reset(id, this.school(account), account.id);
  }
}

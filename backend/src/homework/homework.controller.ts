import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount } from '../common/types';
import { HomeworkService } from './homework.service';
import { SaveHomeworkDto, TemplateDto } from './homework.dto';

const PUBLISHERS = ['TRUSTED', 'TEACHER', 'HEAD'] as const;

@Controller('homework')
export class HomeworkController {
  constructor(private readonly homework: HomeworkService) {}

  @Get()
  list(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('subjectId') subjectId?: string,
  ) {
    return this.homework.list(account, { classId, from, to, subjectId });
  }

  @Get('archive')
  archive(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('before') before?: string,
    @Query('search') search?: string,
  ) {
    return this.homework.archive(account, { classId, subjectId, before, search });
  }

  @Access(...PUBLISHERS)
  @Get('targets')
  targets(@CurrentAccount() account: RequestAccount) {
    return this.homework.targets(account);
  }

  @Access(...PUBLISHERS)
  @Get('templates')
  templates(@CurrentAccount() account: RequestAccount) {
    return this.homework.templates(account.id);
  }

  @Access(...PUBLISHERS)
  @Post('templates')
  createTemplate(@CurrentAccount() account: RequestAccount, @Body() dto: TemplateDto) {
    return this.homework.createTemplate(account.id, dto);
  }

  @Access(...PUBLISHERS)
  @Delete('templates/:id')
  removeTemplate(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.homework.removeTemplate(account.id, id);
  }

  @Get(':id')
  detail(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.homework.detail(account, id);
  }

  @Access(...PUBLISHERS)
  @Post()
  create(@CurrentAccount() account: RequestAccount, @Body() dto: SaveHomeworkDto) {
    return this.homework.create(account, dto);
  }

  @Access(...PUBLISHERS)
  @Put(':id')
  update(@CurrentAccount() account: RequestAccount, @Param('id') id: string, @Body() dto: SaveHomeworkDto) {
    return this.homework.update(account, id, dto);
  }

  @Access(...PUBLISHERS)
  @Delete(':id')
  remove(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.homework.remove(account, id);
  }
}

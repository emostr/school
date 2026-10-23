import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount } from '../common/types';
import { ScheduleService } from './schedule.service';
import { SaveChangeDto, SaveVersionDto } from './schedule.dto';

@Controller('schedule')
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get('me')
  me(@CurrentAccount() account: RequestAccount, @Query('date') date?: string, @Query('child') child?: string) {
    return this.schedule.myWeek(account, date, child);
  }

  @Get('classes/:classId')
  classWeek(@CurrentAccount() account: RequestAccount, @Param('classId') classId: string, @Query('date') date?: string) {
    return this.schedule.classWeek(account, classId, date);
  }

  @Get('classes/:classId/day')
  day(@CurrentAccount() account: RequestAccount, @Param('classId') classId: string, @Query('date') date: string) {
    return this.schedule.day(account, classId, date);
  }

  @Get('classes/:classId/next')
  next(
    @CurrentAccount() account: RequestAccount,
    @Param('classId') classId: string,
    @Query('subjectId') subjectId: string,
    @Query('after') after?: string,
    @Query('group') group?: string,
  ) {
    return this.schedule.nextLesson(account, classId, subjectId, after, group);
  }

  @Access('TEACHER', 'HEAD')
  @Get('teachers/:teacherId')
  teacherWeek(
    @CurrentAccount() account: RequestAccount,
    @Param('teacherId') teacherId: string,
    @Query('date') date?: string,
  ) {
    return this.schedule.teacherWeek(account, teacherId, date);
  }

  @Get('classes/:classId/versions')
  versions(@CurrentAccount() account: RequestAccount, @Param('classId') classId: string) {
    return this.schedule.versions(account, classId);
  }

  @Access('TEACHER', 'HEAD')
  @Post('classes/:classId/versions')
  saveVersion(@CurrentAccount() account: RequestAccount, @Param('classId') classId: string, @Body() dto: SaveVersionDto) {
    return this.schedule.saveVersion(account, classId, dto);
  }

  @Get('versions/:id')
  version(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.schedule.version(account, id);
  }

  @Access('TEACHER', 'HEAD')
  @Delete('versions/:id')
  removeVersion(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.schedule.removeVersion(account, id);
  }

  @Get('classes/:classId/changes')
  changes(
    @CurrentAccount() account: RequestAccount,
    @Param('classId') classId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.schedule.changes(account, classId, from, to);
  }

  @Access('TEACHER', 'HEAD')
  @Get('changes')
  changesOn(@Query('date') date?: string) {
    return this.schedule.changesOn(date);
  }

  @Access('TEACHER', 'HEAD')
  @Put('classes/:classId/changes')
  saveChange(@CurrentAccount() account: RequestAccount, @Param('classId') classId: string, @Body() dto: SaveChangeDto) {
    return this.schedule.saveChange(account, classId, dto);
  }

  @Access('TEACHER', 'HEAD')
  @Delete('changes/:id')
  removeChange(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.schedule.removeChange(account, id);
  }
}

import { Body, Controller, Get, ParseIntPipe, Put, Query } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount } from '../common/types';
import { AttendanceService } from './attendance.service';
import { SaveLessonDto } from './attendance.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Access('TEACHER', 'HEAD')
  @Get('lesson')
  lesson(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId: string,
    @Query('date') date: string,
    @Query('number', ParseIntPipe) number: number,
  ) {
    return this.attendance.lesson(account, classId, date, number);
  }

  @Access('TEACHER', 'HEAD')
  @Put('lesson')
  save(@CurrentAccount() account: RequestAccount, @Body() dto: SaveLessonDto) {
    return this.attendance.saveLesson(account, dto);
  }

  @Access('TEACHER', 'HEAD')
  @Get('sheet')
  sheet(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.attendance.sheet(account, classId, from, to);
  }

  @Access('TEACHER', 'HEAD')
  @Get('my-lessons')
  myLessons(@CurrentAccount() account: RequestAccount, @Query('date') date?: string) {
    return this.attendance.myLessons(account, date);
  }

  @Access('STUDENT', 'PARENT')
  @Get('me')
  mine(
    @CurrentAccount() account: RequestAccount,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('child') child?: string,
  ) {
    return this.attendance.mine(account, from, to, child);
  }
}

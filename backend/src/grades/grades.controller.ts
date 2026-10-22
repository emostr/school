import { Controller, Get, Header, Query } from '@nestjs/common';
import { GradesService } from './grades.service';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestAccount } from '../common/types';

@Controller('grades')
@Roles('SCHOOL_ADMIN', 'TEACHER')
export class GradesController {
  constructor(private readonly grades: GradesService) {}

  private school(account: RequestAccount): string {
    return account.school?.id ?? '';
  }

  @Get()
  journal(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId?: string,
    @Query('testId') testId?: string,
    @Query('assignmentId') assignmentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.grades.journal(this.school(account), account.id, { classId, testId, assignmentId, from, to });
  }

  @Get('summary')
  summary(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId?: string,
    @Query('testId') testId?: string,
    @Query('assignmentId') assignmentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.grades.summary(this.school(account), account.id, { classId, testId, assignmentId, from, to });
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="edway-grades.csv"')
  export(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId?: string,
    @Query('testId') testId?: string,
    @Query('assignmentId') assignmentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.grades.csv(this.school(account), account.id, { classId, testId, assignmentId, from, to });
  }
}

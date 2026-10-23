import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount } from '../common/types';
import { GradebookService } from './gradebook.service';
import { BulkGradesDto, GradeDto, ImportAssignmentDto, UpdateGradeDto } from './gradebook.dto';

@Controller('gradebook')
export class GradebookController {
  constructor(private readonly gradebook: GradebookService) {}

  @Access('TEACHER', 'HEAD')
  @Get('targets')
  targets(@CurrentAccount() account: RequestAccount) {
    return this.gradebook.targets(account);
  }

  @Access('TEACHER', 'HEAD')
  @Get('journal')
  journal(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId: string,
    @Query('subjectId') subjectId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.gradebook.journal(account, classId, subjectId, from, to);
  }

  @Access('TEACHER', 'HEAD')
  @Get('summary')
  summary(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.gradebook.summary(account, classId, from, to);
  }

  @Access('STUDENT', 'PARENT')
  @Get('me')
  mine(
    @CurrentAccount() account: RequestAccount,
    @Query('child') child?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.gradebook.mine(account, child, from, to);
  }

  @Access('TEACHER', 'HEAD')
  @Get('students/:accountId')
  student(
    @CurrentAccount() account: RequestAccount,
    @Param('accountId') accountId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.gradebook.studentReport(account, accountId, from, to);
  }

  @Access('TEACHER', 'HEAD')
  @Post('grades')
  create(@CurrentAccount() account: RequestAccount, @Body() dto: GradeDto) {
    return this.gradebook.create(account, dto);
  }

  @Access('TEACHER', 'HEAD')
  @Post('grades/bulk')
  bulk(@CurrentAccount() account: RequestAccount, @Body() dto: BulkGradesDto) {
    return this.gradebook.bulk(account, dto);
  }

  @Access('TEACHER', 'HEAD')
  @Patch('grades/:id')
  update(@CurrentAccount() account: RequestAccount, @Param('id') id: string, @Body() dto: UpdateGradeDto) {
    return this.gradebook.update(account, id, dto);
  }

  @Access('TEACHER', 'HEAD')
  @Delete('grades/:id')
  remove(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.gradebook.remove(account, id);
  }

  @Access('TEACHER', 'HEAD')
  @Post('import-assignment')
  @HttpCode(200)
  importAssignment(@CurrentAccount() account: RequestAccount, @Body() dto: ImportAssignmentDto) {
    return this.gradebook.importAssignment(account, dto);
  }
}

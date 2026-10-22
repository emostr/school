import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestAccount } from '../common/types';
import { CreateAssignmentDto, UpdateAssignmentDto } from './dto/assignments.dto';

@Controller('assignments')
@Roles('SCHOOL_ADMIN', 'TEACHER')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  private school(account: RequestAccount): string {
    return account.school?.id ?? '';
  }

  @Get()
  list(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId?: string,
    @Query('testId') testId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.assignments.list(this.school(account), account.id, { classId, testId, from, to });
  }

  @Post()
  create(@Body() dto: CreateAssignmentDto, @CurrentAccount() account: RequestAccount) {
    return this.assignments.create(this.school(account), dto, account.id);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.assignments.detail(id, this.school(account), account.id);
  }

  @Get(':id/sheets')
  sheets(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.assignments.sheets(id, this.school(account), account.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentAccount() account: RequestAccount,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignments.update(id, this.school(account), account.id, dto);
  }

  @Post(':id/works')
  addSpare(
    @Param('id') id: string,
    @CurrentAccount() account: RequestAccount,
    @Body('studentId') studentId?: string,
    @Body('variant') variant?: number,
  ) {
    return this.assignments.addSpare(id, this.school(account), account.id, studentId, variant);
  }

  @Patch(':id/works/:workId/variant')
  setVariant(
    @Param('id') id: string,
    @Param('workId') workId: string,
    @CurrentAccount() account: RequestAccount,
    @Body('variant') variant: number,
  ) {
    return this.assignments.setVariant(id, this.school(account), account.id, workId, variant);
  }

  @Post(':id/close')
  close(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.assignments.setClosed(id, this.school(account), account.id, true);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.assignments.setClosed(id, this.school(account), account.id, false);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.assignments.remove(id, this.school(account), account.id);
  }
}

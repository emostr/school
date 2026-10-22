import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount } from '../common/types';
import { AccountsService } from './accounts.service';
import {
  CreateAccountDto,
  GroupDto,
  ImportStudentsDto,
  ListAccountsQuery,
  MoveStudentDto,
  TrustedDto,
  UpdateAccountDto,
} from './dto/accounts.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Завуч видит всех, классный руководитель — своих учеников. */
  @Access('TEACHER', 'HEAD')
  @Get()
  list(@CurrentAccount() account: RequestAccount, @Query() query: ListAccountsQuery) {
    return this.accounts.list(account, query);
  }

  @Access('TEACHER', 'HEAD')
  @Get('staff')
  staff() {
    return this.accounts.staff();
  }

  @Access('HEAD')
  @Post()
  create(@CurrentAccount() account: RequestAccount, @Body() dto: CreateAccountDto) {
    return this.accounts.create(dto, account.id);
  }

  @Access('HEAD')
  @Post('import')
  import(@CurrentAccount() account: RequestAccount, @Body() dto: ImportStudentsDto) {
    return this.accounts.importStudents(dto.classId, dto.lines, account.id);
  }

  @Access('HEAD')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.accounts.detail(id);
  }

  @Access('HEAD')
  @Patch(':id')
  update(@CurrentAccount() account: RequestAccount, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(account, id, dto);
  }

  @Access('TEACHER', 'HEAD')
  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.accounts.resetPassword(account, id);
  }

  @Access('HEAD')
  @Post(':id/reset-totp')
  @HttpCode(200)
  resetTotp(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.accounts.resetTotpBy(account, id);
  }

  @Access('HEAD')
  @Post(':id/block')
  @HttpCode(200)
  block(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.accounts.setBlocked(account, id, true);
  }

  @Access('HEAD')
  @Post(':id/unblock')
  @HttpCode(200)
  unblock(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.accounts.setBlocked(account, id, false);
  }

  @Access('TEACHER', 'HEAD')
  @Patch(':id/trusted')
  trusted(@CurrentAccount() account: RequestAccount, @Param('id') id: string, @Body() dto: TrustedDto) {
    return this.accounts.setTrusted(account, id, dto.trusted);
  }

  @Access('TEACHER', 'HEAD')
  @Patch(':id/group')
  group(@CurrentAccount() account: RequestAccount, @Param('id') id: string, @Body() dto: GroupDto) {
    return this.accounts.setGroup(account, id, dto.group);
  }

  @Access('HEAD')
  @Post(':id/move')
  @HttpCode(200)
  move(@CurrentAccount() account: RequestAccount, @Param('id') id: string, @Body() dto: MoveStudentDto) {
    return this.accounts.moveStudent(account, id, dto.classId);
  }

  @Access('HEAD')
  @Delete(':id')
  remove(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.accounts.remove(account, id);
  }
}

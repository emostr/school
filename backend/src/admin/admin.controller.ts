import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount } from '../common/types';
import { SchoolService } from '../school/school.service';
import { AdminService } from './admin.service';
import { CreateHeadDto, HeadPrivilegeDto, UpdateSchoolDto } from './dto/admin.dto';

@Controller('admin')
@Access('ADMIN')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly school: SchoolService,
  ) {}

  @Get('school')
  getSchool() {
    return this.school.get();
  }

  @Patch('school')
  updateSchool(@Body() dto: UpdateSchoolDto) {
    return this.admin.updateSchool(dto);
  }

  @Get('accounts')
  accounts(@Query('search') search?: string) {
    return this.admin.accounts(search);
  }

  @Post('heads')
  createHead(@CurrentAccount() account: RequestAccount, @Body() dto: CreateHeadDto) {
    return this.admin.createHead(dto, account.id);
  }

  @Patch('accounts/:id/head')
  setHead(@Param('id') id: string, @Body() dto: HeadPrivilegeDto) {
    return this.admin.setHead(id, dto.head);
  }

  @Post('accounts/:id/reset-password')
  @HttpCode(200)
  resetPassword(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.admin.resetPassword(id, account.id);
  }

  @Post('accounts/:id/reset-totp')
  @HttpCode(200)
  resetTotp(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.admin.resetTotp(id, account.id);
  }

  @Post('accounts/:id/block')
  @HttpCode(200)
  block(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.admin.setBlocked(id, account.id, true);
  }

  @Post('accounts/:id/unblock')
  @HttpCode(200)
  unblock(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.admin.setBlocked(id, account.id, false);
  }

  @Get('system')
  system() {
    return this.admin.system();
  }
}

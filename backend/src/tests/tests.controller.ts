import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { TestsService } from './tests.service';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestAccount } from '../common/types';
import { SaveTestDto, ShareDto } from './dto/tests.dto';

@Controller('tests')
@Roles('SCHOOL_ADMIN', 'TEACHER')
export class TestsController {
  constructor(private readonly tests: TestsService) {}

  private school(account: RequestAccount): string {
    return account.school?.id ?? '';
  }

  @Get()
  list(@CurrentAccount() account: RequestAccount) {
    return this.tests.list(this.school(account), account.id);
  }

  @Post()
  create(@CurrentAccount() account: RequestAccount, @Body() dto: SaveTestDto) {
    return this.tests.create(this.school(account), account.id, dto);
  }

  @Get(':id')
  detail(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.tests.detail(id, this.school(account), account.id);
  }

  @Put(':id')
  update(@Param('id') id: string, @CurrentAccount() account: RequestAccount, @Body() dto: SaveTestDto) {
    return this.tests.update(id, this.school(account), account.id, dto);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.tests.setPublished(id, this.school(account), account.id, true);
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.tests.setPublished(id, this.school(account), account.id, false);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.tests.duplicate(id, this.school(account), account.id);
  }

  @Post(':id/share')
  share(@Param('id') id: string, @CurrentAccount() account: RequestAccount, @Body() dto: ShareDto) {
    return this.tests.share(id, this.school(account), account.id, dto.teacherId, dto.canEdit ?? false);
  }

  @Delete(':id/share/:teacherId')
  unshare(
    @Param('id') id: string,
    @Param('teacherId') targetId: string,
    @CurrentAccount() account: RequestAccount,
  ) {
    return this.tests.unshare(id, this.school(account), account.id, targetId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.tests.remove(id, this.school(account), account.id);
  }
}

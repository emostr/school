import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount } from '../common/types';
import { ClassesService } from './classes.service';
import { CreateClassDto, HomeroomDto, PromoteClassDto } from './dto/classes.dto';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  list(@CurrentAccount() account: RequestAccount, @Query('archived') archived?: string) {
    return this.classes.list(account, archived === 'true');
  }

  @Access('HEAD')
  @Post()
  create(@CurrentAccount() account: RequestAccount, @Body() dto: CreateClassDto) {
    return this.classes.create(dto, account.id);
  }

  @Access('HEAD')
  @Post('promote-all')
  promoteAll() {
    return this.classes.promoteAll();
  }

  @Get(':id')
  detail(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.classes.detail(account, id);
  }

  @Access('HEAD')
  @Patch(':id/homeroom')
  homeroom(@Param('id') id: string, @Body() dto: HomeroomDto) {
    return this.classes.setHomeroom(id, dto.homeroomId);
  }

  @Access('HEAD')
  @Post(':id/promote')
  promote(@Param('id') id: string, @Body() dto: PromoteClassDto) {
    return this.classes.promote(id, dto.number, dto.letter);
  }

  @Access('HEAD')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.classes.remove(id);
  }
}

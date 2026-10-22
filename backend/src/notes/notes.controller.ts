import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount } from '../common/types';
import { NotesService } from './notes.service';
import { SaveNoteDto } from './notes.dto';

@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(
    @CurrentAccount() account: RequestAccount,
    @Query('classId') classId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.notes.list(account, { classId, subjectId, from, to, search });
  }

  @Get(':id')
  detail(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.notes.detail(account, id);
  }

  @Access('TRUSTED', 'TEACHER', 'HEAD')
  @Post()
  create(@CurrentAccount() account: RequestAccount, @Body() dto: SaveNoteDto) {
    return this.notes.create(account, dto);
  }

  @Access('TRUSTED', 'TEACHER', 'HEAD')
  @Put(':id')
  update(@CurrentAccount() account: RequestAccount, @Param('id') id: string, @Body() dto: SaveNoteDto) {
    return this.notes.update(account, id, dto);
  }

  @Access('TRUSTED', 'TEACHER', 'HEAD')
  @Delete(':id')
  remove(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    return this.notes.remove(account, id);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { CatalogService } from './catalog.service';
import { HolidayDto, RoomDto, SubjectDto } from './catalog.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('subjects')
  subjects(@Query('archived') archived?: string) {
    return this.catalog.subjects(archived === 'true');
  }

  @Access('HEAD')
  @Post('subjects')
  createSubject(@Body() dto: SubjectDto) {
    return this.catalog.createSubject(dto);
  }

  @Access('HEAD')
  @Post('subjects/defaults')
  seedSubjects() {
    return this.catalog.seedSubjects();
  }

  @Access('HEAD')
  @Patch('subjects/:id')
  updateSubject(@Param('id') id: string, @Body() dto: SubjectDto) {
    return this.catalog.updateSubject(id, dto);
  }

  @Access('HEAD')
  @Delete('subjects/:id')
  archiveSubject(@Param('id') id: string) {
    return this.catalog.archiveSubject(id);
  }

  @Get('rooms')
  rooms() {
    return this.catalog.rooms();
  }

  @Access('HEAD')
  @Post('rooms')
  createRoom(@Body() dto: RoomDto) {
    return this.catalog.createRoom(dto);
  }

  @Access('HEAD')
  @Patch('rooms/:id')
  updateRoom(@Param('id') id: string, @Body() dto: RoomDto) {
    return this.catalog.updateRoom(id, dto);
  }

  @Access('HEAD')
  @Delete('rooms/:id')
  archiveRoom(@Param('id') id: string) {
    return this.catalog.archiveRoom(id);
  }

  @Get('holidays')
  holidays() {
    return this.catalog.holidays();
  }

  @Access('HEAD')
  @Post('holidays')
  createHoliday(@Body() dto: HolidayDto) {
    return this.catalog.createHoliday(dto);
  }

  @Access('HEAD')
  @Delete('holidays/:id')
  removeHoliday(@Param('id') id: string) {
    return this.catalog.removeHoliday(id);
  }
}

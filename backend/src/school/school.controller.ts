import { Controller, Get } from '@nestjs/common';
import { Access } from '../common/decorators/access.decorator';
import { SchoolService } from './school.service';

@Controller('school')
@Access('ANY')
export class SchoolController {
  constructor(private readonly school: SchoolService) {}

  /** Название, звонки и учебная неделя нужны каждому экрану расписания. */
  @Get()
  async info() {
    const school = await this.school.get();
    return { ...school, today: (await this.school.today()).toISOString().slice(0, 10) };
  }
}

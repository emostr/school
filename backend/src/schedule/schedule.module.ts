import { Global, Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { ScheduleResolver } from './schedule.resolver';

@Global()
@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService, ScheduleResolver],
  exports: [ScheduleResolver],
})
export class ScheduleModule {}

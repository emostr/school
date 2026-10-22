import { Controller, Get, Param } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RequestAccount } from '../common/types';

@Controller('analytics')
@Roles('SCHOOL_ADMIN', 'TEACHER')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(@CurrentAccount() account: RequestAccount) {
    return this.analytics.overview(account.school?.id ?? '', account.id);
  }

  @Get('assignments/:id')
  assignment(@Param('id') id: string, @CurrentAccount() account: RequestAccount) {
    return this.analytics.assignmentReport(id, account.school?.id ?? '', account.id);
  }
}

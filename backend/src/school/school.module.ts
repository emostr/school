import { Global, Module } from '@nestjs/common';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';
import { AccessService } from './access.service';

@Global()
@Module({
  controllers: [SchoolController],
  providers: [SchoolService, AccessService],
  exports: [SchoolService, AccessService],
})
export class SchoolModule {}

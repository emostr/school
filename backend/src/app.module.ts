import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { SchoolModule } from './school/school.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { AdminModule } from './admin/admin.module';
import { ClassesModule } from './classes/classes.module';
import { CatalogModule } from './catalog/catalog.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { HomeworkModule } from './homework/homework.module';
import { NotesModule } from './notes/notes.module';
import { AttendanceModule } from './attendance/attendance.module';
import { GradebookModule } from './gradebook/gradebook.module';
import { TestsModule } from './tests/tests.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { WorksModule } from './works/works.module';
import { GradesModule } from './grades/grades.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FilesModule } from './files/files.module';
import { OcrModule } from './ocr/ocr.module';
import { HealthController } from './health/health.controller';
import { BootstrapService } from './common/bootstrap.service';
import { AuthGuard } from './common/guards/auth.guard';
import { AccessGuard } from './common/guards/access.guard';
import { SetupGuard } from './common/guards/setup.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    StorageModule,
    SchoolModule,
    AuthModule,
    AccountsModule,
    AdminModule,
    ClassesModule,
    CatalogModule,
    ScheduleModule,
    AttachmentsModule,
    HomeworkModule,
    NotesModule,
    AttendanceModule,
    GradebookModule,
    TestsModule,
    AssignmentsModule,
    WorksModule,
    GradesModule,
    AnalyticsModule,
    FilesModule,
    OcrModule,
  ],
  controllers: [HealthController],
  providers: [
    BootstrapService,
    // Порядок важен: сначала выясняем, кто пришёл, затем его привилегии,
    // затем — прошёл ли он обязательную настройку входа.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useClass: SetupGuard },
  ],
})
export class AppModule {}

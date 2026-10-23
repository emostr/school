import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { StorageService } from '../storage/storage.service';
import { AccountsService, ROW_INCLUDE } from '../accounts/accounts.service';
import { normalizePrivileges } from '../common/access';
import { tesseractAvailable } from '../ocr/tesseract';
import { CreateHeadDto, UpdateSchoolDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
    private readonly storage: StorageService,
    private readonly people: AccountsService,
  ) {}

  async updateSchool(dto: UpdateSchoolDto) {
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat('ru', { timeZone: dto.timezone });
      } catch {
        throw new BadRequestException('Неизвестный часовой пояс');
      }
    }
    if (dto.bells) {
      const numbers = dto.bells.map((bell) => bell.number);
      if (new Set(numbers).size !== numbers.length) {
        throw new BadRequestException('Номера уроков в расписании звонков повторяются');
      }
      for (const bell of dto.bells) {
        if (bell.start >= bell.end) {
          throw new BadRequestException(`Урок ${bell.number}: звонок с урока раньше звонка на урок`);
        }
      }
    }
    for (const period of dto.periods ?? []) {
      if (period.to < period.from) {
        throw new BadRequestException(`Период «${period.title}» заканчивается раньше, чем начинается`);
      }
    }
    return this.school.update(dto);
  }

  /** Администратору видны все учётные записи — чтобы вернуть доступ, а не чтобы читать журнал. */
  async accounts(search?: string) {
    const rows = await this.prisma.account.findMany({
      where: {
        deletedAt: null,
        ...(search?.trim()
          ? {
              OR: [
                { fullName: { contains: search.trim(), mode: 'insensitive' } },
                { login: { contains: search.trim().toLowerCase() } },
              ],
            }
          : {}),
      },
      orderBy: [{ isAdmin: 'desc' }, { fullName: 'asc' }],
      include: ROW_INCLUDE,
      take: 500,
    });
    return rows.map((row) => this.people.toRow(row));
  }

  createHead(dto: CreateHeadDto, adminId: string) {
    return this.people.create(
      {
        lastName: dto.lastName,
        firstName: dto.firstName,
        middleName: dto.middleName,
        subject: dto.subject,
        privileges: dto.teaches ? ['HEAD', 'TEACHER'] : ['HEAD'],
      },
      adminId,
    );
  }

  private async requireMember(id: string) {
    const account = await this.prisma.account.findFirst({ where: { id, deletedAt: null } });
    if (!account) {
      throw new NotFoundException('Учётная запись не найдена');
    }
    return account;
  }

  async setHead(id: string, head: boolean) {
    const account = await this.requireMember(id);
    if (account.isAdmin) {
      throw new BadRequestException('Администратор не бывает завучем');
    }
    if (account.privileges.includes('STUDENT')) {
      throw new BadRequestException('Ученик не может быть завучем');
    }
    const privileges = normalizePrivileges(
      head ? [...account.privileges, 'HEAD'] : account.privileges.filter((p) => p !== 'HEAD'),
    );
    if (!privileges.length) {
      privileges.push('TEACHER');
    }
    await this.prisma.account.update({ where: { id }, data: { privileges } });
    return this.people.detail(id);
  }

  async resetPassword(id: string, adminId: string) {
    const account = await this.requireMember(id);
    if (account.id === adminId) {
      throw new BadRequestException('Свой пароль меняйте в настройках');
    }
    return this.people.issueTemporaryPassword(id);
  }

  async resetTotp(id: string, adminId: string) {
    const account = await this.requireMember(id);
    if (account.id === adminId) {
      throw new BadRequestException('Свой второй фактор сбросить нельзя — для этого есть admin:reset на сервере');
    }
    return this.people.resetTotp(id);
  }

  async setBlocked(id: string, adminId: string, blocked: boolean) {
    const account = await this.requireMember(id);
    if (account.id === adminId || account.isAdmin) {
      throw new BadRequestException('Администратора заблокировать нельзя');
    }
    await this.people.block(id, blocked);
    return this.people.detail(id);
  }

  /** Сводка о сервере: всё ли живо и сколько места занимают загрузки. */
  async system() {
    let database = 'ok';
    let databaseSize = 0;
    try {
      const rows = await this.prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
      databaseSize = Number(rows[0]?.size ?? 0);
    } catch {
      database = 'down';
    }

    const [accounts, students, staff, classes, tests, homework, notes] = await Promise.all([
      this.prisma.account.count({ where: { deletedAt: null, isAdmin: false } }),
      this.prisma.account.count({ where: { deletedAt: null, privileges: { has: 'STUDENT' } } }),
      this.prisma.account.count({ where: { deletedAt: null, privileges: { hasSome: ['TEACHER', 'HEAD'] } } }),
      this.prisma.schoolClass.count({ where: { archivedAt: null } }),
      this.prisma.test.count({ where: { deletedAt: null } }),
      this.prisma.homework.count({ where: { deletedAt: null } }),
      this.prisma.note.count({ where: { deletedAt: null } }),
    ]);

    return {
      version: process.env.APP_VERSION ?? 'dev',
      node: process.version,
      uptime: Math.round(process.uptime()),
      database,
      databaseSize,
      uploadsSize: await this.directorySize(this.storage.root),
      ocr: (await tesseractAvailable()) ? 'ok' : 'unavailable',
      counts: { accounts, students, staff, classes, tests, homework, notes },
    };
  }

  private async directorySize(dir: string): Promise<number> {
    let total = 0;
    let entries: import('node:fs').Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await this.directorySize(path);
      } else if (entry.isFile()) {
        total += (await fs.stat(path)).size;
      }
    }
    return total;
  }
}

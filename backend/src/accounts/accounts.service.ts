import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { Privilege } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolService } from '../school/school.service';
import { hashSecret } from '../common/crypto/password';
import { generatePassword } from '../common/crypto/codes';
import { buildSearchKey, className, titleCase, transliterate } from '../common/text';
import { isHead, isHomeroomOf, normalizePrivileges } from '../common/access';
import { RequestAccount } from '../common/types';
import { CreateAccountDto, ListAccountsQuery, UpdateAccountDto } from './dto/accounts.dto';

export interface AccountRow {
  id: string;
  login: string;
  fullName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  subject: string;
  isAdmin: boolean;
  privileges: Privilege[];
  totpEnabled: boolean;
  mustChangePassword: boolean;
  blocked: boolean;
  studentClass: { id: string; name: string; group: string; studentId: string } | null;
  homeroomClasses: { id: string; name: string }[];
  lastSeenAt: string | null;
  createdAt: string;
}

/** Учётные данные показываются один раз — тому, кто завёл запись. */
export interface IssuedCredentials {
  id: string;
  fullName: string;
  login: string;
  password: string;
  className?: string;
}

const ROW_INCLUDE = {
  memberships: {
    where: { archivedAt: null, class: { archivedAt: null } },
    include: { class: { select: { id: true, number: true, letter: true } } },
    take: 1,
  },
  homeroomClasses: {
    where: { archivedAt: null },
    select: { id: true, number: true, letter: true },
  },
  sessions: {
    where: { revokedAt: null },
    orderBy: { lastSeenAt: 'desc' },
    select: { lastSeenAt: true },
    take: 1,
  },
} satisfies Prisma.AccountInclude;

type AccountWithRelations = Prisma.AccountGetPayload<{ include: typeof ROW_INCLUDE }>;

export function composeFullName(lastName: string, firstName: string, middleName = ''): string {
  return [lastName, firstName, middleName].map((part) => part.trim()).filter(Boolean).join(' ');
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly school: SchoolService,
  ) {}

  toRow(account: AccountWithRelations): AccountRow {
    const membership = account.memberships[0];
    return {
      id: account.id,
      login: account.login,
      fullName: account.fullName,
      lastName: account.lastName,
      firstName: account.firstName,
      middleName: account.middleName,
      subject: account.subject,
      isAdmin: account.isAdmin,
      privileges: account.privileges,
      totpEnabled: account.totpEnabled,
      mustChangePassword: account.mustChangePassword,
      blocked: Boolean(account.blockedAt),
      studentClass: membership
        ? {
            id: membership.class.id,
            name: className(membership.class.number, membership.class.letter),
            group: membership.group,
            studentId: membership.id,
          }
        : null,
      homeroomClasses: account.homeroomClasses.map((item) => ({
        id: item.id,
        name: className(item.number, item.letter),
      })),
      lastSeenAt: account.sessions[0]?.lastSeenAt.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
    };
  }

  /**
   * Логин — транслит фамилии и инициалы: «Иванова Мария Петровна» →
   * ivanova.mp. Однофамильцам с теми же инициалами достаётся номер.
   */
  async generateLogin(lastName: string, firstName: string, middleName = ''): Promise<string> {
    const last = transliterate(lastName).slice(0, 24);
    // Транслитерируем первую букву имени, а не первую букву транслита:
    // «Юлия» должна дать «yu», а не «y».
    const initials = transliterate(firstName.trim().charAt(0)) + transliterate(middleName.trim().charAt(0));
    let base = initials ? `${last}.${initials}` : last;
    if (base.length < 3) {
      base = `user.${base}`.replace(/\.$/, '');
    }
    const taken = await this.prisma.account.findMany({
      where: { login: { startsWith: base } },
      select: { login: true },
    });
    const logins = new Set(taken.map((row) => row.login));
    if (!logins.has(base)) {
      return base;
    }
    for (let suffix = 2; ; suffix += 1) {
      if (!logins.has(`${base}${suffix}`)) {
        return `${base}${suffix}`;
      }
    }
  }

  async list(viewer: RequestAccount, query: ListAccountsQuery): Promise<AccountRow[]> {
    const schoolId = await this.school.id();
    const where: Prisma.AccountWhereInput = { schoolId, deletedAt: null, isAdmin: false };

    if (!isHead(viewer)) {
      // Классный руководитель видит только своих учеников.
      const classIds = query.classId
        ? viewer.homeroomClassIds.filter((id) => id === query.classId)
        : viewer.homeroomClassIds;
      if (!classIds.length) {
        throw new ForbiddenException('Список учётных записей ведут завучи');
      }
      where.memberships = { some: { classId: { in: classIds }, archivedAt: null } };
    } else if (query.classId) {
      where.memberships = { some: { classId: query.classId, archivedAt: null } };
    }

    if (query.privilege === 'STAFF') {
      where.privileges = { hasSome: ['TEACHER', 'HEAD'] };
    } else if (query.privilege) {
      where.privileges = { has: query.privilege };
    }
    if (query.blocked === 'true') {
      where.blockedAt = { not: null };
    } else if (query.blocked === 'false') {
      where.blockedAt = null;
    }
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { login: { contains: search.toLowerCase() } },
      ];
    }

    const rows = await this.prisma.account.findMany({
      where,
      orderBy: { fullName: 'asc' },
      include: ROW_INCLUDE,
      take: 1000,
    });
    return rows.map((row) => this.toRow(row));
  }

  async detail(id: string): Promise<AccountRow> {
    const account = await this.prisma.account.findFirst({
      where: { id, deletedAt: null },
      include: ROW_INCLUDE,
    });
    if (!account) {
      throw new NotFoundException('Учётная запись не найдена');
    }
    return this.toRow(account);
  }

  /** Сотрудники для выпадающих списков расписания и классного руководства. */
  async staff() {
    const rows = await this.prisma.account.findMany({
      where: {
        schoolId: await this.school.id(),
        deletedAt: null,
        isAdmin: false,
        privileges: { hasSome: ['TEACHER', 'HEAD'] },
      },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, subject: true, privileges: true, blockedAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      subject: row.subject,
      privileges: row.privileges,
      blocked: Boolean(row.blockedAt),
    }));
  }

  private async requireActiveClass(classId: string) {
    const schoolClass = await this.prisma.schoolClass.findFirst({
      where: { id: classId, schoolId: await this.school.id(), archivedAt: null },
    });
    if (!schoolClass) {
      throw new BadRequestException('Класс не найден или уже в архиве');
    }
    return schoolClass;
  }

  async create(dto: CreateAccountDto, creatorId: string, options: { isAdmin?: boolean } = {}): Promise<IssuedCredentials> {
    const privileges = normalizePrivileges(dto.privileges as Privilege[]);
    if (!options.isAdmin && !privileges.length) {
      throw new BadRequestException('Отметьте хотя бы одну привилегию');
    }
    const lastName = titleCase(dto.lastName);
    const firstName = titleCase(dto.firstName);
    const middleName = titleCase(dto.middleName ?? '');
    const fullName = composeFullName(lastName, firstName, middleName);

    const isStudent = privileges.includes('STUDENT');
    const schoolClass = isStudent
      ? dto.classId
        ? await this.requireActiveClass(dto.classId)
        : null
      : null;
    if (isStudent && !schoolClass) {
      throw new BadRequestException('Для ученика выберите класс');
    }

    const login = await this.generateLogin(lastName, firstName, middleName);
    const password = generatePassword(10);
    const schoolId = await this.school.id();

    const account = await this.prisma.account.create({
      data: {
        login,
        fullName,
        lastName,
        firstName,
        middleName,
        subject: (dto.subject ?? '').trim(),
        isAdmin: options.isAdmin ?? false,
        privileges,
        schoolId: options.isAdmin ? null : schoolId,
        passwordHash: await hashSecret(password),
        mustChangePassword: true,
        createdById: creatorId,
        ...(schoolClass
          ? {
              memberships: {
                create: {
                  classId: schoolClass.id,
                  lastName,
                  firstName,
                  searchKey: buildSearchKey(lastName, firstName),
                  group: dto.group ?? '',
                },
              },
            }
          : {}),
      },
    });

    return {
      id: account.id,
      fullName,
      login,
      password,
      ...(schoolClass ? { className: className(schoolClass.number, schoolClass.letter) } : {}),
    };
  }

  /**
   * Список класса вставляется колонкой из журнала. Уже заведённых учеников
   * (сверяем по фамилии и имени) пропускаем, остальным заводим учётные записи.
   */
  async importStudents(classId: string, lines: string[], creatorId: string) {
    const schoolClass = await this.requireActiveClass(classId);
    const existing = await this.prisma.student.findMany({
      where: { classId, archivedAt: null },
      select: { searchKey: true },
    });
    const known = new Set(existing.map((row) => row.searchKey));

    const created: IssuedCredentials[] = [];
    const skipped: string[] = [];
    for (const line of lines) {
      // Номер по журналу и точка после него («1. Иванов Иван») не нужны.
      const parts = line.replace(/^\s*\d+[.)]?\s*/, '').trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        if (parts.length) {
          skipped.push(line.trim());
        }
        continue;
      }
      const [lastName, firstName, ...rest] = parts;
      const key = buildSearchKey(titleCase(lastName), titleCase(firstName));
      if (known.has(key)) {
        skipped.push(line.trim());
        continue;
      }
      known.add(key);
      created.push(
        await this.create(
          { lastName, firstName, middleName: rest.join(' '), privileges: ['STUDENT'], classId: schoolClass.id },
          creatorId,
        ),
      );
    }
    return { created, skipped };
  }

  /** Править чужую запись: завуч — любую, кроме администратора; классный — своих учеников. */
  private async requireManageable(viewer: RequestAccount, id: string, headOnly = false) {
    const account = await this.prisma.account.findFirst({
      where: { id, deletedAt: null, isAdmin: false },
      include: { memberships: { where: { archivedAt: null }, select: { id: true, classId: true } } },
    });
    if (!account) {
      throw new NotFoundException('Учётная запись не найдена');
    }
    if (isHead(viewer)) {
      return account;
    }
    const homeroomStudent =
      account.privileges.includes('STUDENT') &&
      account.memberships.some((membership) => isHomeroomOf(viewer, membership.classId));
    if (headOnly || !homeroomStudent) {
      throw new ForbiddenException('Эту учётную запись правит завуч');
    }
    return account;
  }

  async update(viewer: RequestAccount, id: string, dto: UpdateAccountDto): Promise<AccountRow> {
    const account = await this.requireManageable(viewer, id, true);
    const lastName = dto.lastName !== undefined ? titleCase(dto.lastName) : account.lastName;
    const firstName = dto.firstName !== undefined ? titleCase(dto.firstName) : account.firstName;
    const middleName = dto.middleName !== undefined ? titleCase(dto.middleName) : account.middleName;

    let privileges = account.privileges;
    if (dto.privileges) {
      privileges = normalizePrivileges(dto.privileges as Privilege[]);
      if (!privileges.length) {
        throw new BadRequestException('Отметьте хотя бы одну привилегию');
      }
      const wasStudent = account.privileges.includes('STUDENT');
      if (wasStudent !== privileges.includes('STUDENT')) {
        throw new BadRequestException('Ученика нельзя сделать сотрудником и наоборот — заведите новую запись');
      }
      if (id === viewer.id && !privileges.includes('HEAD')) {
        throw new BadRequestException('Снять с себя привилегию завуча нельзя — попросите коллегу');
      }
    }

    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id },
        data: {
          lastName,
          firstName,
          middleName,
          fullName: composeFullName(lastName, firstName, middleName),
          privileges,
          ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
        },
      }),
      // Фамилия в составе класса нужна бланкам тестов — держим её в согласии.
      this.prisma.student.updateMany({
        where: { accountId: id, archivedAt: null },
        data: { lastName, firstName, searchKey: buildSearchKey(lastName, firstName) },
      }),
    ]);
    return this.detail(id);
  }

  async resetPassword(viewer: RequestAccount, id: string): Promise<IssuedCredentials> {
    const account = await this.requireManageable(viewer, id);
    return this.issueTemporaryPassword(account.id);
  }

  /** Новый временный пароль и выход со всех устройств. */
  async issueTemporaryPassword(id: string): Promise<IssuedCredentials> {
    const account = await this.prisma.account.findUniqueOrThrow({ where: { id } });
    const password = generatePassword(10);
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id },
        data: { passwordHash: await hashSecret(password), mustChangePassword: true },
      }),
      this.prisma.authSession.updateMany({ where: { accountId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { id, fullName: account.fullName, login: account.login, password };
  }

  /** Потерянный телефон: второй фактор снимается, завучу его придётся подключить заново. */
  async resetTotp(id: string): Promise<{ ok: true }> {
    await this.prisma.$transaction([
      this.prisma.account.update({ where: { id }, data: { totpEnabled: false, totpSecret: null } }),
      this.prisma.backupCode.deleteMany({ where: { accountId: id } }),
      this.prisma.authSession.updateMany({ where: { accountId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  async resetTotpBy(viewer: RequestAccount, id: string) {
    await this.requireManageable(viewer, id, true);
    return this.resetTotp(id);
  }

  async setBlocked(viewer: RequestAccount, id: string, blocked: boolean): Promise<AccountRow> {
    await this.requireManageable(viewer, id, true);
    if (id === viewer.id) {
      throw new BadRequestException('Заблокировать самого себя нельзя');
    }
    await this.block(id, blocked);
    return this.detail(id);
  }

  async block(id: string, blocked: boolean): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.account.update({ where: { id }, data: { blockedAt: blocked ? new Date() : null } }),
      ...(blocked
        ? [
            this.prisma.authSession.updateMany({
              where: { accountId: id, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
    ]);
  }

  /**
   * Удаление мягкое: оценки, посещаемость и авторство заданий остаются в
   * архиве, а логин освобождается для нового человека.
   */
  async remove(viewer: RequestAccount, id: string): Promise<{ ok: true }> {
    const account = await this.requireManageable(viewer, id, true);
    if (id === viewer.id) {
      throw new BadRequestException('Удалить самого себя нельзя');
    }
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id },
        data: { deletedAt: new Date(), login: `${account.login}~${Date.now().toString(36)}` },
      }),
      this.prisma.student.updateMany({ where: { accountId: id, archivedAt: null }, data: { archivedAt: new Date() } }),
      this.prisma.schoolClass.updateMany({ where: { homeroomId: id }, data: { homeroomId: null } }),
      this.prisma.authSession.updateMany({ where: { accountId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  async setTrusted(viewer: RequestAccount, id: string, trusted: boolean): Promise<AccountRow> {
    const account = await this.requireManageable(viewer, id);
    if (!account.privileges.includes('STUDENT')) {
      throw new BadRequestException('Доверенным бывает только ученик');
    }
    const privileges = normalizePrivileges(
      trusted ? [...account.privileges, 'TRUSTED'] : account.privileges.filter((p) => p !== 'TRUSTED'),
    );
    await this.prisma.account.update({ where: { id }, data: { privileges } });
    return this.detail(id);
  }

  async setGroup(viewer: RequestAccount, id: string, group: string): Promise<AccountRow> {
    await this.requireManageable(viewer, id);
    await this.prisma.student.updateMany({ where: { accountId: id, archivedAt: null }, data: { group } });
    return this.detail(id);
  }

  /**
   * Перевод в другой класс: прежнее место уходит в архив вместе с работами и
   * посещаемостью, в новом классе заводится новое.
   */
  async moveStudent(viewer: RequestAccount, id: string, classId: string): Promise<AccountRow> {
    const account = await this.requireManageable(viewer, id, true);
    if (!account.privileges.includes('STUDENT')) {
      throw new BadRequestException('Переводить можно только ученика');
    }
    const target = await this.requireActiveClass(classId);
    if (account.memberships.some((membership) => membership.classId === classId)) {
      return this.detail(id);
    }
    await this.prisma.$transaction([
      this.prisma.student.updateMany({ where: { accountId: id, archivedAt: null }, data: { archivedAt: new Date() } }),
      this.prisma.student.create({
        data: {
          classId: target.id,
          accountId: id,
          lastName: account.lastName,
          firstName: account.firstName,
          searchKey: buildSearchKey(account.lastName, account.firstName),
        },
      }),
    ]);
    return this.detail(id);
  }
}

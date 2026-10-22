import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '../generated/prisma/client';
import { Privilege } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { hashSecret, verifySecret } from '../common/crypto/password';
import { buildOtpauthUrl, generateTotpSecret, verifyTotp } from '../common/crypto/totp';
import { formatBackupCode, generateBackupCode, hashLookupCode, normalizeCode } from '../common/crypto/codes';
import { className } from '../common/text';
import { setupStep, totpRequired } from '../common/access';
import { RequestAccount, SessionPayload, SetupStep } from '../common/types';

export interface Preferences {
  theme: 'dark' | 'light';
  notify: 'toast' | 'popup';
}

const DEFAULT_PREFERENCES: Preferences = { theme: 'dark', notify: 'toast' };

export interface Profile {
  id: string;
  login: string;
  fullName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  subject: string;
  isAdmin: boolean;
  privileges: Privilege[];
  mustChangePassword: boolean;
  totpEnabled: boolean;
  totpRequired: boolean;
  setupStep: SetupStep;
  unusedBackupCodes: number;
  preferences: Preferences;
  school: { id: string; name: string; shortName: string } | null;
  homeroomClasses: { id: string; name: string }[];
  studentClass: { id: string; name: string; group: string } | null;
  createdAt: string;
}

export interface SessionIssued {
  stage: 'session';
  token: string;
  expiresAt: Date;
  profile: Profile;
}

export interface TotpRequired {
  stage: 'totp';
  ticket: string;
}

export type LoginResult = SessionIssued | TotpRequired;

export interface LoginContext {
  ip: string;
  userAgent: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private sessionDays(): number {
    return Number(this.config.get('SESSION_DAYS', 30));
  }

  private issuerName(): string {
    return this.config.get<string>('TOTP_ISSUER', 'edway.space');
  }

  async login(login: string, password: string, ctx: LoginContext): Promise<LoginResult> {
    const account = await this.prisma.account.findFirst({
      where: { login: login.trim().toLowerCase(), deletedAt: null },
    });
    // Пароль сверяем даже для несуществующего логина: иначе по времени ответа
    // можно перебрать список пользователей.
    const stored = account?.passwordHash ?? (await this.dummyHash());
    const valid = await verifySecret(password, stored);
    if (!account || !valid) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    if (account.blockedAt) {
      throw new UnauthorizedException('Учётная запись заблокирована — обратитесь к завучу');
    }

    if (account.totpEnabled && account.totpSecret) {
      const ticket = await this.jwt.signAsync({ sub: account.id, purpose: 'totp' }, { expiresIn: '5m' });
      return { stage: 'totp', ticket };
    }

    return this.issueSession(account.id, ctx);
  }

  private dummyHashCache: string | null = null;

  private async dummyHash(): Promise<string> {
    if (!this.dummyHashCache) {
      this.dummyHashCache = await hashSecret('пароль-которого-нет');
    }
    return this.dummyHashCache;
  }

  async completeTotpLogin(ticket: string, code: string, ctx: LoginContext): Promise<SessionIssued> {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwt.verifyAsync(ticket);
    } catch {
      throw new UnauthorizedException('Срок подтверждения истёк, войдите заново');
    }
    if (payload.purpose !== 'totp') {
      throw new UnauthorizedException('Некорректный запрос');
    }

    const account = await this.prisma.account.findFirst({
      where: { id: payload.sub, deletedAt: null, blockedAt: null },
    });
    if (!account?.totpSecret) {
      throw new UnauthorizedException('Учётная запись недоступна');
    }

    const clean = code.trim();
    const isTotp = /^\d{6}$/.test(clean) && verifyTotp(account.totpSecret, clean);
    if (!isTotp && !(await this.consumeBackupCode(account.id, clean))) {
      throw new UnauthorizedException('Неверный код подтверждения');
    }

    return this.issueSession(account.id, ctx);
  }

  private async consumeBackupCode(accountId: string, input: string): Promise<boolean> {
    const normalized = normalizeCode(input);
    if (normalized.length !== 10) {
      return false;
    }
    const record = await this.prisma.backupCode.findFirst({
      where: { accountId, codeHash: hashLookupCode(normalized), usedAt: null },
    });
    if (!record) {
      return false;
    }
    await this.prisma.backupCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return true;
  }

  async issueSession(accountId: string, ctx: LoginContext): Promise<SessionIssued> {
    const expiresAt = new Date(Date.now() + this.sessionDays() * 24 * 60 * 60 * 1000);
    const session = await this.prisma.authSession.create({
      data: { accountId, expiresAt, ip: ctx.ip, userAgent: ctx.userAgent },
    });
    const payload: SessionPayload = { sid: session.id, sub: accountId };
    const token = await this.jwt.signAsync(payload, { expiresIn: `${this.sessionDays()}d` });
    return { stage: 'session', token, expiresAt, profile: await this.profile(accountId) };
  }

  async profile(accountId: string): Promise<Profile> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, deletedAt: null },
      include: {
        school: { select: { id: true, name: true, shortName: true } },
        backupCodes: { where: { usedAt: null }, select: { id: true } },
        homeroomClasses: {
          where: { archivedAt: null },
          orderBy: [{ number: 'asc' }, { letter: 'asc' }],
          select: { id: true, number: true, letter: true },
        },
        memberships: {
          where: { archivedAt: null, class: { archivedAt: null } },
          include: { class: { select: { id: true, number: true, letter: true } } },
          take: 1,
        },
      },
    });
    if (!account) {
      throw new UnauthorizedException();
    }

    const membership = account.privileges.includes('STUDENT') ? account.memberships[0] : undefined;
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
      mustChangePassword: account.mustChangePassword,
      totpEnabled: account.totpEnabled,
      totpRequired: totpRequired(account),
      setupStep: setupStep(account),
      unusedBackupCodes: account.backupCodes.length,
      preferences: { ...DEFAULT_PREFERENCES, ...((account.preferences ?? {}) as Partial<Preferences>) },
      school: account.school,
      homeroomClasses: account.homeroomClasses.map((item) => ({
        id: item.id,
        name: className(item.number, item.letter),
      })),
      studentClass: membership
        ? {
            id: membership.class.id,
            name: className(membership.class.number, membership.class.letter),
            group: membership.group,
          }
        : null,
      createdAt: account.createdAt.toISOString(),
    };
  }

  async updateProfile(accountId: string, subject?: string): Promise<Profile> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { ...(subject !== undefined ? { subject: subject.trim() } : {}) },
    });
    return this.profile(accountId);
  }

  /** Настройки сливаются с сохранёнными: клиент присылает только то, что поменял. */
  async updatePreferences(accountId: string, patch: Partial<Preferences>): Promise<Profile> {
    const account = await this.prisma.account.findFirstOrThrow({ where: { id: accountId } });
    const current = (account.preferences ?? {}) as Partial<Preferences>;
    const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
    await this.prisma.account.update({
      where: { id: accountId },
      data: { preferences: next as Prisma.InputJsonValue },
    });
    return this.profile(accountId);
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId: string,
  ): Promise<Profile> {
    const account = await this.prisma.account.findFirstOrThrow({ where: { id: accountId, deletedAt: null } });
    if (!(await verifySecret(currentPassword, account.passwordHash))) {
      throw new BadRequestException('Текущий пароль указан неверно');
    }
    if (await verifySecret(newPassword, account.passwordHash)) {
      throw new BadRequestException('Новый пароль должен отличаться от текущего');
    }
    if (newPassword.toLowerCase().includes(account.login.toLowerCase())) {
      throw new BadRequestException('Пароль не должен содержать логин');
    }
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: accountId },
        data: { passwordHash: await hashSecret(newPassword), mustChangePassword: false },
      }),
      // Пароль меняют, когда подозревают утечку: остальные устройства выходят.
      this.prisma.authSession.updateMany({
        where: { accountId, revokedAt: null, id: { not: keepSessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    return this.profile(accountId);
  }

  /** Готовит секрет и ссылку для приложения-аутентификатора. */
  async startTotpSetup(accountId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const account = await this.prisma.account.findFirstOrThrow({ where: { id: accountId, deletedAt: null } });
    if (account.totpEnabled) {
      throw new BadRequestException('Двухфакторная аутентификация уже подключена');
    }
    const secret = generateTotpSecret();
    await this.prisma.account.update({ where: { id: accountId }, data: { totpSecret: secret } });
    return { secret, otpauthUrl: buildOtpauthUrl(secret, account.login, this.issuerName()) };
  }

  /** Подтверждает подключение и выдаёт резервные коды — они видны один раз. */
  async confirmTotpSetup(accountId: string, code: string): Promise<{ backupCodes: string[] }> {
    const account = await this.prisma.account.findFirstOrThrow({ where: { id: accountId, deletedAt: null } });
    if (account.totpEnabled) {
      throw new BadRequestException('Двухфакторная аутентификация уже подключена');
    }
    if (!account.totpSecret) {
      throw new BadRequestException('Сначала запросите секретный ключ');
    }
    if (!verifyTotp(account.totpSecret, code)) {
      throw new BadRequestException('Код неверный. Проверьте время на телефоне и попробуйте снова');
    }

    const codes = Array.from({ length: 10 }, () => generateBackupCode());
    await this.prisma.$transaction([
      this.prisma.account.update({ where: { id: accountId }, data: { totpEnabled: true } }),
      this.prisma.backupCode.deleteMany({ where: { accountId } }),
      this.prisma.backupCode.createMany({
        data: codes.map((c) => ({ accountId, codeHash: hashLookupCode(c) })),
      }),
    ]);
    return { backupCodes: codes.map(formatBackupCode) };
  }

  async regenerateBackupCodes(accountId: string): Promise<{ backupCodes: string[] }> {
    const account = await this.prisma.account.findFirstOrThrow({ where: { id: accountId, deletedAt: null } });
    if (!account.totpEnabled) {
      throw new BadRequestException('Двухфакторная аутентификация не подключена');
    }
    const codes = Array.from({ length: 10 }, () => generateBackupCode());
    await this.prisma.$transaction([
      this.prisma.backupCode.deleteMany({ where: { accountId } }),
      this.prisma.backupCode.createMany({
        data: codes.map((c) => ({ accountId, codeHash: hashLookupCode(c) })),
      }),
    ]);
    return { backupCodes: codes.map(formatBackupCode) };
  }

  /** Отключить второй фактор можно всем, кроме администратора и завучей. */
  async disableTotp(account: RequestAccount, password: string): Promise<Profile> {
    if (totpRequired(account)) {
      throw new BadRequestException('Для вашей учётной записи второй фактор обязателен');
    }
    const record = await this.prisma.account.findFirstOrThrow({ where: { id: account.id, deletedAt: null } });
    if (!(await verifySecret(password, record.passwordHash))) {
      throw new BadRequestException('Пароль указан неверно');
    }
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: account.id },
        data: { totpEnabled: false, totpSecret: null },
      }),
      this.prisma.backupCode.deleteMany({ where: { accountId: account.id } }),
    ]);
    return this.profile(account.id);
  }

  async listSessions(accountId: string, currentSessionId: string) {
    const sessions = await this.prisma.authSession.findMany({
      where: { accountId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      current: s.id === currentSessionId,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      ip: s.ip,
      userAgent: s.userAgent,
    }));
  }

  async revokeSession(accountId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.authSession.updateMany({
      where: { id: sessionId, accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Сессия не найдена');
    }
  }

  async revokeOtherSessions(accountId: string, keepSessionId: string): Promise<{ revoked: number }> {
    const result = await this.prisma.authSession.updateMany({
      where: { accountId, revokedAt: null, id: { not: keepSessionId } },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
  }

  /** Коллеги по школе — из этого списка выбирают, с кем поделиться тестом. */
  async colleagues(account: RequestAccount) {
    if (!account.school) {
      return [];
    }
    return this.prisma.account.findMany({
      where: {
        schoolId: account.school.id,
        deletedAt: null,
        blockedAt: null,
        id: { not: account.id },
        privileges: { hasSome: ['TEACHER', 'HEAD'] },
      },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, login: true, subject: true },
    });
  }
}

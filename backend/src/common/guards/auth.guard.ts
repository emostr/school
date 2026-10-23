import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestAccount, SESSION_COOKIE, SessionPayload } from '../types';

// lastSeenAt пишем не чаще раза в минуту — иначе каждый запрос дашборда
// превращается в UPDATE.
const TOUCH_INTERVAL_MS = 60_000;

type AuthedRequest = FastifyRequest & { account?: RequestAccount };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Требуется вход в систему');
    }

    let payload: SessionPayload;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      throw new UnauthorizedException('Сессия недействительна');
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: {
        account: {
          include: {
            school: { select: { id: true, name: true } },
            homeroomClasses: { where: { archivedAt: null }, select: { id: true } },
            memberships: {
              where: { archivedAt: null, class: { archivedAt: null } },
              select: { id: true, classId: true },
              take: 1,
            },
            children: {
              where: { child: { deletedAt: null } },
              select: {
                childId: true,
                child: {
                  select: {
                    memberships: {
                      where: { archivedAt: null, class: { archivedAt: null } },
                      select: { id: true, classId: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < now ||
      session.account.deletedAt ||
      session.account.blockedAt ||
      session.accountId !== payload.sub
    ) {
      throw new UnauthorizedException('Сессия завершена');
    }

    const account = session.account;
    const membership = account.privileges.includes('STUDENT') ? account.memberships[0] : undefined;

    request.account = {
      id: account.id,
      login: account.login,
      fullName: account.fullName,
      isAdmin: account.isAdmin,
      privileges: account.privileges,
      sessionId: session.id,
      mustChangePassword: account.mustChangePassword,
      totpEnabled: account.totpEnabled,
      school: account.school,
      homeroomClassIds: account.homeroomClasses.map((item) => item.id),
      studentClassId: membership?.classId ?? null,
      studentId: membership?.id ?? null,
      children: account.privileges.includes('PARENT')
        ? account.children.map((link) => ({
            accountId: link.childId,
            classId: link.child.memberships[0]?.classId ?? null,
            studentId: link.child.memberships[0]?.id ?? null,
          }))
        : [],
    };

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt: now,
          ip: request.ip ?? '',
          userAgent: String(request.headers['user-agent'] ?? '').slice(0, 250),
        },
      });
    }

    return true;
  }
}

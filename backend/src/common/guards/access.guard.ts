import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_KEY, AccessGrant } from '../decorators/access.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestAccount } from '../types';

/**
 * Проверка привилегий. Администратор — отдельный мир: учебные маршруты для
 * него закрыты, даже если пометки на маршруте нет. Так новый контроллер,
 * которому забыли поставить @Access, не откроет данные школы админке.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const grants = this.reflector.getAllAndOverride<AccessGrant[]>(ACCESS_KEY, targets) ?? ['MEMBER'];
    const account = context.switchToHttp().getRequest<{ account?: RequestAccount }>().account;
    if (!account) {
      throw new ForbiddenException('Недостаточно прав');
    }

    const allowed = grants.some((grant) => {
      if (grant === 'ANY') {
        return true;
      }
      if (grant === 'ADMIN') {
        return account.isAdmin;
      }
      if (account.isAdmin || !account.school) {
        return false;
      }
      if (grant === 'MEMBER') {
        return true;
      }
      return account.privileges.includes(grant);
    });

    if (!allowed) {
      throw new ForbiddenException('Недостаточно прав');
    }
    return true;
  }
}

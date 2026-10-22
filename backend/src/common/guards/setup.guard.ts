import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_SETUP_KEY } from '../decorators/allow-setup.decorator';
import { RequestAccount } from '../types';
import { SetupRequiredException } from '../exceptions';
import { setupStep } from '../access';

/**
 * Пока временный пароль не сменён, а у администратора или завуча не подключён
 * второй фактор, работать с данными нельзя: доступны только маршруты самой
 * настройки, помеченные @AllowSetup.
 */
@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = [IS_PUBLIC_KEY, ALLOW_SETUP_KEY].some((key) =>
      this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]),
    );
    if (skip) {
      return true;
    }

    const account = context.switchToHttp().getRequest<{ account?: RequestAccount }>().account;
    if (!account) {
      return true;
    }

    const step = setupStep(account);
    if (step === 'password') {
      throw new SetupRequiredException('Сначала смените временный пароль');
    }
    if (step === 'totp') {
      throw new SetupRequiredException('Сначала подключите двухфакторную аутентификацию');
    }
    return true;
  }
}

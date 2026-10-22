import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestAccount } from '../types';

export const CurrentAccount = createParamDecorator(
  (field: keyof RequestAccount | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ account?: RequestAccount }>();
    const account = request.account;
    if (!account) {
      return undefined;
    }
    return field ? account[field] : account;
  },
);

/**
 * Школа текущего пользователя. У администратора платформы её нет — маршруты,
 * которым школа обязательна, закрыты для него ролями.
 */
export const CurrentSchool = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ account?: RequestAccount }>();
  return request.account?.school ?? null;
});

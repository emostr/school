import { SetMetadata } from '@nestjs/common';
import { Privilege } from '../../generated/prisma/enums';

export const ACCESS_KEY = 'access';

/**
 * Кто может вызвать маршрут:
 *   ADMIN   — системный администратор;
 *   MEMBER  — любой участник школы (так считается и без пометки);
 *   ANY     — кто угодно после входа, в том числе администратор;
 *   STUDENT, TRUSTED, TEACHER, HEAD — обладатель привилегии.
 * Достаточно совпасть с одним из перечисленных.
 */
export type AccessGrant = Privilege | 'ADMIN' | 'MEMBER' | 'ANY';

export const Access = (...grants: AccessGrant[]) => SetMetadata(ACCESS_KEY, grants);

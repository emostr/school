import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Маршрут доступен без входа: регистрация, вход, проверка здоровья. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

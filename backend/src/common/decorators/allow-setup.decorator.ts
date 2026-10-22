import { SetMetadata } from '@nestjs/common';

export const ALLOW_SETUP_KEY = 'allowSetup';

/**
 * Маршрут работает, пока учётная запись ещё настраивается: смена временного
 * пароля, подключение второго фактора, чтение своего профиля и выход.
 */
export const AllowSetup = () => SetMetadata(ALLOW_SETUP_KEY, true);

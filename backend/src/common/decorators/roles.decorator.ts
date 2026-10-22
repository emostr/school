import { Access } from './access.decorator';

/**
 * Модуль тестов писался под роли «учитель» и «администратор школы». Здесь
 * ролей нет, а работать с тестами вправе учителя и завучи — так их и пускаем,
 * не трогая контроллеры модуля.
 */
export const Roles = (..._roles: ('SCHOOL_ADMIN' | 'TEACHER')[]) => Access('TEACHER', 'HEAD');

/*
 * Создание системного администратора при первом развёртывании.
 *
 * deploy.sh вызывает эту команду после каждого запуска стека и печатает
 * её вывод. Поведение:
 *   — администратора нет: создаём и показываем логин с временным паролем;
 *   — есть, но ни разу не входил (временный пароль не сменён): выдаём новый
 *     временный пароль — прежний мог потеряться вместе с прошлым выводом;
 *   — уже настроен: ничего не трогаем.
 *
 * Вывод в последней строке — JSON, его разбирает deploy.sh.
 */
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { hashSecret } = require('../dist/common/crypto/password');
const { generatePassword } = require('../dist/common/crypto/codes');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const login = (process.env.ADMIN_LOGIN || 'admin').trim().toLowerCase();
const existing = await prisma.account.findFirst({
  where: { isAdmin: true, deletedAt: null },
  orderBy: { createdAt: 'asc' },
});

let result;
if (existing && !existing.mustChangePassword) {
  result = { status: 'exists', login: existing.login };
} else {
  const password = generatePassword(14);
  const passwordHash = await hashSecret(password);
  if (existing) {
    await prisma.account.update({ where: { id: existing.id }, data: { passwordHash } });
    result = { status: 'reissued', login: existing.login, password };
  } else {
    await prisma.account.create({
      data: {
        login,
        isAdmin: true,
        privileges: [],
        fullName: 'Системный администратор',
        passwordHash,
        mustChangePassword: true,
      },
    });
    result = { status: 'created', login, password };
  }
}

await prisma.$disconnect();
console.log(JSON.stringify(result));

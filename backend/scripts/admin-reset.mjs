/*
 * Восстановление доступа системного администратора.
 *
 * Завучам пароль сбрасывает администратор из админки, а самому
 * администратору сбрасывать некому. Скрипт выдаёт новый временный пароль,
 * снимает второй фактор и закрывает все сессии — то есть возвращает учётную
 * запись в состояние первого запуска. Запускается на сервере:
 *
 *   cd /opt/edway && sudo docker compose exec backend npm run admin:reset
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

const admin = await prisma.account.findFirst({
  where: { isAdmin: true, deletedAt: null },
  orderBy: { createdAt: 'asc' },
});

if (!admin) {
  console.error('Администратора в базе нет — создайте его: npm run admin:init');
  await prisma.$disconnect();
  process.exit(1);
}

const password = generatePassword(14);
await prisma.$transaction([
  prisma.account.update({
    where: { id: admin.id },
    data: {
      passwordHash: await hashSecret(password),
      mustChangePassword: true,
      totpEnabled: false,
      totpSecret: null,
      blockedAt: null,
    },
  }),
  prisma.backupCode.deleteMany({ where: { accountId: admin.id } }),
  prisma.authSession.updateMany({
    where: { accountId: admin.id, revokedAt: null },
    data: { revokedAt: new Date() },
  }),
]);

console.log('');
console.log('  Доступ администратора восстановлен');
console.log(`  Логин:  ${admin.login}`);
console.log(`  Пароль: ${password}`);
console.log('  При входе платформа попросит сменить пароль и подключить второй фактор.');
console.log('');

await prisma.$disconnect();

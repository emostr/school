import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Начиная с Prisma 7 адрес базы живёт не в schema.prisma, а здесь: клиент
// ходит в базу через драйверный адаптер, а CLI берёт url отсюда. Автозагрузки
// .env в Prisma 7 тоже больше нет — подключаем её сами.
const url =
  process.env.DATABASE_URL ?? 'postgresql://edway:edway@localhost:5432/edway?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url },
});

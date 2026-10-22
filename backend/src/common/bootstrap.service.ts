import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Служебные дела при старте. Администратора здесь не заводим: его создаёт
 * deploy.sh командой admin:init и сразу показывает логин с паролем.
 */
@Injectable()
export class BootstrapService implements OnModuleInit {
  private readonly logger = new Logger('Bootstrap');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.cleanupSessions();
    const admins = await this.prisma.account.count({ where: { isAdmin: true, deletedAt: null } });
    if (!admins) {
      this.logger.warn('Администратора ещё нет — создайте его: npm run admin:init');
    }
  }

  /** Просроченные и отозванные сессии копятся годами — подчищаем на старте. */
  private async cleanupSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.authSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }] },
    });
    if (result.count > 0) {
      this.logger.log(`Удалено просроченных сессий: ${result.count}`);
    }
  }
}

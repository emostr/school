import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { tesseractAvailable } from '../ocr/tesseract';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    // Поле app — метка платформы: по ней deploy.sh убеждается, что на порту
    // отвечаем именно мы, а не чужое приложение, занявшее его раньше.
    return {
      app: 'edway',
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      ocr: (await tesseractAvailable()) ? 'ok' : 'unavailable',
      time: new Date().toISOString(),
    };
  }
}

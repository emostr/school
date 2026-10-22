import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { extname, isAbsolute, join, normalize, resolve } from 'node:path';
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/tiff']);

export interface StoredImage {
  file: string;
  width: number;
  height: number;
  size: number;
  mime: string;
}

/**
 * Файлы (сканы работ и картинки заданий) лежат на диске в UPLOAD_DIR, в базе
 * остаются только имена. Так дамп базы не раздувается до гигабайтов, а том
 * с загрузками копируется отдельно.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  readonly root: string;

  constructor(private readonly config: ConfigService) {
    // Путь приводим к абсолютному: относительный UPLOAD_DIR (удобный в
    // разработке) иначе не проходил бы собственную проверку на выход за
    // пределы каталога.
    const configured = this.config.get<string>('UPLOAD_DIR') ?? '/data/uploads';
    this.root = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  }

  async onModuleInit(): Promise<void> {
    for (const dir of ['scans', 'images', 'files']) {
      await fs.mkdir(join(this.root, dir), { recursive: true });
    }
    this.logger.log(`Каталог загрузок: ${this.root}`);
  }

  /** Путь к файлу с защитой от «../»: имена приходят из базы, но проверяем всё равно. */
  resolve(file: string): string {
    const clean = normalize(file).replace(/^(\.\.[/\\])+/, '');
    const path = join(this.root, clean);
    if (!path.startsWith(this.root)) {
      throw new BadRequestException('Некорректный путь к файлу');
    }
    return path;
  }

  /** Скан работы: приводим к разумному размеру, но сохраняем читаемость почерка. */
  async saveScan(buffer: Buffer, mime: string): Promise<StoredImage> {
    this.assertImage(mime, buffer.length, 25 * 1024 * 1024);
    const name = `scans/${randomUUID()}.webp`;
    const output = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 2200, height: 3200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });

    await fs.writeFile(this.resolve(name), output.data);
    return {
      file: name,
      width: output.info.width,
      height: output.info.height,
      size: output.data.length,
      mime: 'image/webp',
    };
  }

  /** Картинка в тексте задания: чертёж, график, фотография опыта. */
  async saveImage(buffer: Buffer, mime: string): Promise<StoredImage> {
    this.assertImage(mime, buffer.length, 12 * 1024 * 1024);
    const name = `images/${randomUUID()}.webp`;
    const output = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });

    await fs.writeFile(this.resolve(name), output.data);
    return {
      file: name,
      width: output.info.width,
      height: output.info.height,
      size: output.data.length,
      mime: 'image/webp',
    };
  }

  /**
   * Вложение к заданию или конспекту. Фотография доски ужимается до
   * разумного размера, PDF кладётся как есть — его листают в браузере.
   */
  async saveAttachment(buffer: Buffer, mime: string): Promise<StoredImage> {
    if (mime === 'application/pdf') {
      if (buffer.length > 30 * 1024 * 1024) {
        throw new BadRequestException('PDF больше 30 МБ');
      }
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new BadRequestException('Файл не похож на PDF');
      }
      const name = `files/${randomUUID()}.pdf`;
      await fs.writeFile(this.resolve(name), buffer);
      return { file: name, width: 0, height: 0, size: buffer.length, mime };
    }

    this.assertImage(mime, buffer.length, 25 * 1024 * 1024);
    const name = `files/${randomUUID()}.webp`;
    const output = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true });
    await fs.writeFile(this.resolve(name), output.data);
    return {
      file: name,
      width: output.info.width,
      height: output.info.height,
      size: output.data.length,
      mime: 'image/webp',
    };
  }

  private assertImage(mime: string, size: number, limit: number): void {
    if (!IMAGE_MIME.has(mime)) {
      throw new BadRequestException('Поддерживаются только изображения: JPEG, PNG, WebP, HEIC, TIFF');
    }
    if (size > limit) {
      throw new BadRequestException(`Файл больше ${Math.round(limit / 1024 / 1024)} МБ`);
    }
    if (size === 0) {
      throw new BadRequestException('Пустой файл');
    }
  }

  async remove(file: string): Promise<void> {
    await fs.rm(this.resolve(file), { force: true });
  }

  async read(file: string): Promise<Buffer> {
    return fs.readFile(this.resolve(file));
  }

  async exists(file: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(file));
      return true;
    } catch {
      return false;
    }
  }

  /** Слабый ETag по содержимому — картинки заданий кэшируются надолго. */
  etag(file: string, size: number): string {
    return `"${createHash('sha1').update(`${file}:${size}`).digest('hex').slice(0, 16)}"`;
  }

  extension(file: string): string {
    return extname(file).toLowerCase();
  }
}

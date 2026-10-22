import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Разделитель страниц в пакетном выводе: свой, чтобы не спутать с переводом страницы. */
const PAGE_SEPARATOR = '@@@PAGE@@@';

export class TesseractMissingError extends Error {
  constructor() {
    super(
      'На сервере не установлен tesseract-ocr — автоматическая проверка недоступна. ' +
        'Ответы можно ввести вручную.',
    );
  }
}

export interface OcrOptions {
  /** Допустимые символы: чем уже список, тем меньше ошибок. */
  whitelist?: string;
  /** 10 — одиночный знак в клетке, 7 — строка, 6 — блок текста. */
  psm?: number;
  lang?: string;
}

async function tesseract(args: string[]): Promise<string> {
  try {
    const { stdout } = await run('tesseract', args, {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 120_000,
    });
    return stdout;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new TesseractMissingError();
    }
    throw error;
  }
}

/**
 * Распознаёт пачку картинок одним запуском: список файлов уходит в tesseract
 * как batch, ответы возвращаются в том же порядке. Один процесс на страницу
 * вместо сотни — иначе проверка класса растянулась бы на минуты.
 */
export async function recognizeBatch(files: string[], dir: string, options: OcrOptions = {}): Promise<string[]> {
  if (!files.length) {
    return [];
  }

  const listFile = join(dir, `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  await fs.writeFile(listFile, files.join('\n'), 'utf8');

  const args = [
    listFile,
    'stdout',
    '--psm',
    String(options.psm ?? 10),
    '-l',
    options.lang ?? 'rus+eng',
    '-c',
    `page_separator=${PAGE_SEPARATOR}`,
  ];
  if (options.whitelist) {
    args.push('-c', `tessedit_char_whitelist=${options.whitelist}`);
  }

  try {
    const stdout = await tesseract(args);
    const pages = stdout.split(PAGE_SEPARATOR).map((page) => page.trim());
    // Последний фрагмент после разделителя пустой — отбрасываем хвост.
    const result = pages.slice(0, files.length);
    while (result.length < files.length) {
      result.push('');
    }
    return result;
  } finally {
    await fs.rm(listFile, { force: true });
  }
}

export async function recognizeOne(file: string, dir: string, options: OcrOptions = {}): Promise<string> {
  const [text] = await recognizeBatch([file], dir, options);
  return text ?? '';
}

export async function tesseractAvailable(): Promise<boolean> {
  try {
    await run('tesseract', ['--version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

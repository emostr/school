import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { SnapshotQuestion } from '../tests/scoring';
import { GreyImage, Point, createMapper, findMarkers, inkRatio, loadGrey, otsuThreshold } from './image';
import { SHEET, SheetLayout, SheetPage } from './sheet';
import { recognizeBatch, recognizeOne } from './tesseract';

/** Пустая клетка почти не содержит тёмного: всё, что ниже порога, не распознаём. */
const INK_EMPTY = 0.02;

type Alphabet = 'letters' | 'digits' | 'text';

/**
 * Ограничение алфавита (tessedit_char_whitelist) в LSTM-движке помогает
 * только латинице и цифрам: со списком кириллицы распознавание кириллицы
 * же и ломается — печатная «Б» приходит пустой строкой. Поэтому буквы и
 * свободный текст читаем без ограничений, а лишнее отбрасываем сами.
 */
const WHITELIST: Record<Alphabet, string> = {
  letters: '',
  digits: '0123456789.,-/',
  text: '',
};

const LANG: Record<Alphabet, string> = {
  letters: 'rus',
  digits: 'eng',
  text: 'rus+eng',
};

/** Что оставляем от прочитанного: всё остальное — шум от краёв клетки. */
const ALLOWED: Record<Alphabet, RegExp> = {
  letters: /[А-ЯЁA-Z]/,
  digits: /[0-9.,\-/]/,
  text: /[А-ЯЁA-Za-z0-9.,+\-/()=<>]/,
};

const CODE_WHITELIST = '0123456789ABCDEFGHJKMNPQRSTVWXYZ-/';

/**
 * Режимы разбора клетки, в порядке применения. Сборки tesseract расходятся в
 * том, какой из них справляется: на одной машине знак читает psm 10 («один
 * знак»), на другой — только psm 13 («строка как есть»). Поэтому клетку,
 * которую предыдущий режим не осилил, переспрашиваем следующим.
 */
const CELL_MODES = [10, 13, 8] as const;

export interface RecognizedAnswer {
  questionId: string;
  raw: string;
  /** Доля клеток, в которых что-то написано: по ней видно, отвечал ли ученик. */
  filled: number;
  /** 0..1 — насколько уверенно прочитаны непустые клетки. */
  confidence: number;
}

export interface RecognizedSheet {
  /** Код бланка, прочитанный из угла листа. */
  code: string;
  /** Номер страницы бланка, 0 — первая. */
  pageIndex: number;
  answers: RecognizedAnswer[];
  /** Наклон листа в градусах — попадает в отчёт учителю. */
  skewDeg: number;
}

export class SheetNotAlignedError extends Error {
  constructor() {
    super(
      'Не удалось найти на скане угловые метки бланка. Проверьте, что лист попал в кадр целиком, ' +
        'без обрезанных углов и сильного наклона.',
    );
  }
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger('Ocr');

  /**
   * Читает страницу скана: выравнивает лист по угловым меткам, узнаёт по коду
   * в углу, чей это бланк и какая это страница, режет клетки по той же
   * разметке, по которой бланк печатался, и распознаёт их пачками —
   * отдельно буквы вариантов, отдельно свободный текст.
   */
  async recognize(file: string, layout: SheetLayout): Promise<RecognizedSheet> {
    // OCR_DEBUG_DIR оставляет нарезанные клетки на диске: когда лист читается
    // плохо, посмотреть на сами вырезки быстрее, чем гадать по результату.
    const debugDir = process.env.OCR_DEBUG_DIR;
    const workDir = debugDir
      ? join(debugDir, `sheet-${Date.now()}`)
      : await fs.mkdtemp(join(tmpdir(), 'edway-ocr-'));
    if (debugDir) {
      await fs.mkdir(workDir, { recursive: true });
    }
    try {
      let image = await loadGrey(file);
      let threshold = otsuThreshold(image);
      let markers = findMarkers(image, threshold);

      // Заметный перекос выправляем и ищем метки заново: дальше вырезаем
      // клетки прямоугольниками, а на косом листе они бы поехали.
      if (markers && Math.abs(markers.skewDeg) > 0.4) {
        image = await loadGrey(file, -markers.skewDeg);
        threshold = otsuThreshold(image);
        const second = findMarkers(image, threshold);
        this.logger.log(`Лист повёрнут на ${markers.skewDeg.toFixed(1)}° — выравниваем`);
        markers = second ?? markers;
      }

      if (!markers) {
        throw new SheetNotAlignedError();
      }

      const mapper = createMapper(
        markers,
        { inset: SHEET.markerInset, size: SHEET.markerSize },
        SHEET.width,
        SHEET.height,
      );

      const flat = await this.flatten(image, workDir);
      const { code, pageIndex } = await this.readCode(flat, mapper, workDir);
      const page = layout.pages[pageIndex] ?? layout.pages[0];
      const answers = page
        ? await this.readRows(image, flat, threshold, mapper, page, workDir)
        : [];

      return { code, pageIndex, answers, skewDeg: markers.skewDeg };
    } finally {
      if (!debugDir) {
        await fs.rm(workDir, { recursive: true, force: true });
      }
    }
  }

  /** Выровненное изображение кладём на диск: из него вырезаем клетки. */
  private async flatten(image: GreyImage, dir: string): Promise<string> {
    const file = join(dir, 'page.png');
    await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 1 } })
      .png()
      .toFile(file);
    return file;
  }

  private box(
    mapper: (x: number, y: number) => Point,
    rect: { x: number; y: number; width: number; height: number },
    padding = 0,
  ) {
    const corners = [
      mapper(rect.x + padding, rect.y + padding),
      mapper(rect.x + rect.width - padding, rect.y + padding),
      mapper(rect.x + padding, rect.y + rect.height - padding),
      mapper(rect.x + rect.width - padding, rect.y + rect.height - padding),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const left = Math.round(Math.min(...xs));
    const top = Math.round(Math.min(...ys));
    return {
      left,
      top,
      width: Math.max(1, Math.round(Math.max(...xs) - left)),
      height: Math.max(1, Math.round(Math.max(...ys) - top)),
    };
  }

  /** В углу бланка напечатано «XXXX-XXXX/1»: код работы и номер страницы. */
  /**
   * Готовит клетку к распознаванию. Порядок важен: сначала обрезаем пустое
   * поле вокруг знака, и только потом масштабируем. Знак, прижатый к своему
   * кадру, движок читает уверенно, а тот же знак посреди белого поля —
   * почти никогда.
   */
  private async writeCell(
    flat: string,
    area: { left: number; top: number; width: number; height: number },
    file: string,
  ): Promise<void> {
    // Белая рамка перед обрезкой обязательна: trim ориентируется на цвет
    // углового пикселя, а в углу клетки может оказаться штрих знака —
    // тогда обрезано будет ровно наоборот, до самого знака.
    const framed = await sharp(flat)
      .extract(area)
      .normalise()
      .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#ffffff' })
      .png()
      .toBuffer();

    let prepared: Buffer;
    try {
      prepared = await sharp(framed).trim({ threshold: 40 }).png().toBuffer();
    } catch {
      // Однотонной картинке обрезать нечего — trim на ней падает.
      prepared = framed;
    }

    await sharp(prepared)
      .resize({ height: 64, fit: 'inside', kernel: 'lanczos3', withoutEnlargement: false })
      // Поля вокруг знака: без них движок принимает знак за обрезанный.
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#ffffff' })
      // Плотность важна: без неё tesseract ругается на 25 dpi и теряет точность.
      .withMetadata({ density: 300 })
      .png()
      .toFile(file);
  }

  private async readCode(
    flat: string,
    mapper: (x: number, y: number) => Point,
    dir: string,
  ): Promise<{ code: string; pageIndex: number }> {
    const area = this.box(mapper, SHEET.code, 0.6);
    const file = join(dir, 'code.png');
    await sharp(flat)
      .extract(area)
      .normalise()
      .resize({ height: 90, fit: 'inside', kernel: 'lanczos3', withoutEnlargement: false })
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#ffffff' })
      .withMetadata({ density: 300 })
      .png()
      .toFile(file);

    const text = await recognizeOne(file, dir, { psm: 7, lang: 'eng', whitelist: CODE_WHITELIST });
    const clean = text.replace(/[^0-9A-Za-z/]/g, '').toUpperCase();
    const [codePart, pagePart] = clean.split('/');
    const page = Number(pagePart);
    return {
      code: (codePart ?? '').slice(0, 8),
      pageIndex: Number.isFinite(page) && page > 0 ? page - 1 : 0,
    };
  }

  private async readRows(
    image: GreyImage,
    flat: string,
    threshold: number,
    mapper: (x: number, y: number) => Point,
    page: SheetPage,
    dir: string,
  ): Promise<RecognizedAnswer[]> {
    interface Slot {
      questionId: string;
      cellIndex: number;
      file: string;
      alphabet: Alphabet;
    }

    const byQuestion = new Map<string, { filled: number; total: number; chars: string[] }>();
    const slots: Slot[] = [];

    for (const row of page.rows) {
      byQuestion.set(row.questionId, {
        filled: 0,
        total: row.cells.length,
        chars: new Array<string>(row.cells.length).fill(''),
      });

      for (const cell of row.cells) {
        // Отступ внутрь клетки: рамка не должна попасть в распознавание.
        const area = this.box(mapper, cell, 0.9);
        const ink = inkRatio(image, threshold, {
          x: area.left,
          y: area.top,
          width: area.width,
          height: area.height,
        });
        if (ink < INK_EMPTY) {
          continue;
        }

        const file = join(dir, `c-${row.number}-${cell.index}.png`);
        await this.writeCell(flat, area, file);

        slots.push({
          questionId: row.questionId,
          cellIndex: cell.index,
          file,
          alphabet: row.alphabet ?? 'text',
        });
        const state = byQuestion.get(row.questionId);
        if (state) {
          state.filled += 1;
        }
      }
    }

    // По батчу на алфавит: один процесс tesseract вместо вызова на клетку.
    const groups = (['letters', 'digits', 'text'] as const).map((alphabet) => ({
      alphabet,
      slots: slots.filter((slot) => slot.alphabet === alphabet),
    }));

    const recognized = await Promise.all(
      groups.map((group) =>
        this.readCells(
          group.slots.map((slot) => slot.file),
          dir,
          group.alphabet,
        ),
      ),
    );

    const confidence = new Map<string, { read: number; total: number }>();
    const apply = (slot: Slot, value: string) => {
      const state = byQuestion.get(slot.questionId);
      if (!state) {
        return;
      }
      const clean = pickChar(value, slot.alphabet);
      state.chars[slot.cellIndex] = clean;
      const score = confidence.get(slot.questionId) ?? { read: 0, total: 0 };
      score.total += 1;
      if (clean) {
        score.read += 1;
      }
      confidence.set(slot.questionId, score);
    };

    groups.forEach((group, groupIndex) => {
      group.slots.forEach((slot, index) => apply(slot, recognized[groupIndex][index] ?? ''));
    });

    return page.rows.map((row) => {
      const state = byQuestion.get(row.questionId);
      const score = confidence.get(row.questionId);
      const chars = state?.chars ?? [];
      const raw =
        row.type === 'SHORT_ANSWER'
          ? chars.join('').trim()
          : chars.filter(Boolean).join('');
      return {
        questionId: row.questionId,
        raw,
        filled: state && state.total ? state.filled / state.total : 0,
        confidence: score && score.total ? score.read / score.total : 1,
      };
    });
  }

  /**
   * Читает пачку клеток каскадом режимов: каждый следующий получает только те
   * клетки, в которых предыдущий не увидел ни одного допустимого знака. На
   * чистом скане хватает первого прохода, поэтому цена каскада — почти ноль.
   */
  private async readCells(files: string[], dir: string, alphabet: Alphabet): Promise<string[]> {
    const result = new Array<string>(files.length).fill('');
    let pending = files.map((_, index) => index);

    for (const psm of CELL_MODES) {
      if (!pending.length) {
        break;
      }
      const texts = await recognizeBatch(
        pending.map((index) => files[index]),
        dir,
        {
          psm,
          lang: LANG[alphabet],
          // Ограничение алфавита помогает только первому проходу и только
          // цифрам: с кириллицей оно заставляет движок молчать.
          whitelist: psm === CELL_MODES[0] ? WHITELIST[alphabet] || undefined : undefined,
        },
      );

      const next: number[] = [];
      pending.forEach((index, order) => {
        const char = pickChar(texts[order] ?? '', alphabet);
        if (char) {
          result[index] = char;
        } else {
          next.push(index);
        }
      });
      pending = next;
    }

    return result;
  }

  /** Подсказка для журнала: какие задания OCR трогать не станет. */
  manualOnly(questions: SnapshotQuestion[]): string[] {
    return questions.filter((q) => q.type === 'EXTENDED').map((q) => q.id);
  }
}

/**
 * Из прочитанного берёт первый допустимый знак: движок нередко дописывает к
 * ответу мусор, подхваченный с краёв клетки.
 */
function pickChar(value: string, alphabet: Alphabet): string {
  const found = [...(value ?? '').replace(/\s+/g, '')]
    .map((char) => char.toUpperCase())
    .find((char) => ALLOWED[alphabet].test(char));
  return found ?? '';
}

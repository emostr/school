/**
 * Геометрия бланка ответов — единственный источник истины и для печати,
 * и для распознавания. Фронтенд получает эту разметку с сервера и печатает
 * лист миллиметр в миллиметр, поэтому нарезка скана попадает ровно в клетки.
 *
 * Система координат: миллиметры от левого верхнего угла листа A4.
 */
import { SnapshotQuestion, TestSnapshot, questionsForVariant } from '../tests/scoring';

export const SHEET = {
  width: 210,
  height: 297,
  /** Реперные квадраты по углам: по ним скан выравнивается. */
  markerSize: 8,
  markerInset: 10,
  /** Рабочее поле внутри маркеров. */
  left: 22,
  right: 188,
  /** Первая строка ответов на листе с шапкой и на продолжении. */
  firstRowY: 68,
  contRowY: 34,
  lastRowY: 268,
  rowHeight: 13.5,
  numberWidth: 9,
  cellWidth: 8,
  cellHeight: 10,
  cellGap: 1.6,
  /** Окно с кодом работы: печатается моноширинно и читается первым. */
  code: { x: 132, y: 13.5, width: 56, height: 9 },
  /** Разлиновка на листе для развёрнутых ответов. */
  ruleStep: 9,
  extendedTop: 30,
} as const;

export const MAX_CELLS = Math.floor(
  (SHEET.right - (SHEET.left + SHEET.numberWidth + 3) + SHEET.cellGap) / (SHEET.cellWidth + SHEET.cellGap),
);

export interface CellBox {
  /** Порядковый номер клетки в ответе — по нему собирается строка. */
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SheetRow {
  questionId: string;
  /** Номер задания, как он напечатан на бланке. */
  number: number;
  type: SnapshotQuestion['type'];
  points: number;
  /**
   * Что ученик пишет в клетках. Чем уже алфавит, тем меньше ошибок при
   * распознавании: букву «З» и цифру «3» иначе не различить.
   */
  alphabet: 'letters' | 'digits' | 'text';
  /** Подпись под клетками: «буква варианта», «до 3 букв», «ответ словом». */
  hint: string;
  y: number;
  cells: CellBox[];
}

/** Место под развёрнутый ответ: заголовок задания и разлинованное поле. */
export interface EssayBlock {
  questionId: string;
  number: number;
  points: number;
  /** Подсказка из ключа: что засчитывать. Печатается серым под номером. */
  guideline: string;
  y: number;
  height: number;
  /** Ординаты линеек внутри блока. */
  rules: number[];
}

export interface SheetPage {
  index: number;
  /** answers — клетки под ответы, essay — поле для развёрнутых. */
  kind: 'answers' | 'essay';
  /** Шапка печатается только на первой странице. */
  header: boolean;
  rows: SheetRow[];
  blocks: EssayBlock[];
}

export interface SheetLayout {
  pages: SheetPage[];
  /** Задания, которые пишутся не в клетках, а на отдельных листах. */
  extended: { questionId: string; number: number; points: number }[];
  variant: number;
  sheet: typeof SHEET;
}

/**
 * Сколько места отвести развёрнутому ответу. Задание на пять баллов требует
 * заметно больше места, чем на два, но целый лист под каждое — расточительство.
 */
function essayHeight(points: number): number {
  return Math.min(200, Math.max(54, 36 + points * 12));
}

function alphabetFor(question: SnapshotQuestion): SheetRow['alphabet'] {
  if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') {
    return 'letters';
  }
  return question.answerKey?.numeric ? 'digits' : 'text';
}

function hintFor(question: SnapshotQuestion, cells: number): string {
  if (question.type === 'SINGLE_CHOICE') {
    const letters = question.options.map((o) => o.letter).join(', ');
    return `одна буква: ${letters}`;
  }
  if (question.type === 'MULTIPLE_CHOICE') {
    return `буквы верных вариантов, по одной в клетке (до ${cells})`;
  }
  return 'ответ печатными буквами, по одному знаку в клетке';
}

function rowCells(count: number, y: number): CellBox[] {
  const startX = SHEET.left + SHEET.numberWidth + 3;
  return Array.from({ length: count }, (_, index) => ({
    index,
    x: startX + index * (SHEET.cellWidth + SHEET.cellGap),
    y,
    width: SHEET.cellWidth,
    height: SHEET.cellHeight,
  }));
}

/**
 * Раскладывает задания одного варианта по страницам: сначала бланк с клетками,
 * затем листы под развёрнутые ответы. Нумерация страниц сквозная — её же
 * печатает код в углу, по ней скан и находит своё место.
 */
export function buildSheetLayout(snapshot: TestSnapshot, variant = 1): SheetLayout {
  const questions = questionsForVariant(snapshot, variant);
  const pages: SheetPage[] = [];
  const extended: SheetLayout['extended'] = [];
  const essays: SnapshotQuestion[] = [];

  let page: SheetPage = { index: 0, kind: 'answers', header: true, rows: [], blocks: [] };
  let y: number = SHEET.firstRowY;

  questions.forEach((question, index) => {
    const number = index + 1;
    if (question.type === 'EXTENDED' || question.cells === 0) {
      extended.push({ questionId: question.id, number, points: question.points });
      essays.push({ ...question, order: number });
      return;
    }

    if (y + SHEET.rowHeight > SHEET.lastRowY) {
      pages.push(page);
      page = { index: pages.length, kind: 'answers', header: false, rows: [], blocks: [] };
      y = SHEET.contRowY;
    }

    const cells = Math.min(question.cells, MAX_CELLS);
    page.rows.push({
      questionId: question.id,
      number,
      type: question.type,
      points: question.points,
      alphabet: alphabetFor(question),
      hint: hintFor(question, cells),
      y,
      cells: rowCells(cells, y),
    });
    y += SHEET.rowHeight;
  });

  if (page.rows.length || !pages.length) {
    pages.push(page);
  }

  // Листы под развёрнутые ответы: у них те же угловые метки и тот же код,
  // поэтому отсканированный лист сам находит свою работу.
  let essayPage: SheetPage | null = null;
  let essayY = SHEET.extendedTop;

  const closeEssayPage = () => {
    if (!essayPage) {
      return;
    }
    stretchEssayBlocks(essayPage.blocks);
    pages.push(essayPage);
    essayPage = null;
  };

  for (const question of essays) {
    const height = essayHeight(question.points);
    if (!essayPage || essayY + height > SHEET.lastRowY) {
      closeEssayPage();
      essayPage = { index: pages.length, kind: 'essay', header: false, rows: [], blocks: [] };
      essayY = SHEET.extendedTop;
    }

    essayPage.blocks.push({
      questionId: question.id,
      number: question.order,
      points: question.points,
      guideline: String(question.answerKey?.guideline ?? ''),
      y: essayY,
      height,
      rules: [],
    });
    essayY += height + 6;
  }

  closeEssayPage();

  return { pages, extended, variant, sheet: SHEET };
}

/**
 * Свободное место на листе делится между блоками пропорционально их весу:
 * пустой низ страницы ученику не нужен, а лишние две строки под ответ —
 * очень даже. Линейки рисуются уже по итоговой высоте.
 */
function stretchEssayBlocks(blocks: EssayBlock[]): void {
  if (!blocks.length) {
    return;
  }

  const used = blocks.reduce((sum, block) => sum + block.height, 0) + (blocks.length - 1) * 6;
  const free = SHEET.lastRowY - SHEET.extendedTop - used;
  const totalPoints = blocks.reduce((sum, block) => sum + block.points, 0) || blocks.length;

  let y = SHEET.extendedTop;
  for (const block of blocks) {
    const share = free > 0 ? (free * block.points) / totalPoints : 0;
    block.y = y;
    block.height += share;
    block.rules = [];
    for (let line = block.y + 14; line < block.y + block.height - 4; line += SHEET.ruleStep) {
      block.rules.push(Number(line.toFixed(2)));
    }
    y += block.height + 6;
  }
}

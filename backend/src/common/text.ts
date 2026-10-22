const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function transliterate(input: string): string {
  let out = '';
  for (const char of input.toLowerCase()) {
    if (TRANSLIT[char] !== undefined) {
      out += TRANSLIT[char];
    } else if (/[a-z0-9]/.test(char)) {
      out += char;
    }
  }
  return out;
}

/** Логин учителя: «Наземнова Наталья» → nazemnova.n (транслит фамилии + инициал). */
export function buildLoginBase(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const last = transliterate(parts[0] ?? '');
  // Транслитерируем именно первую букву имени, а не первую букву транслита:
  // «Юлия» должна дать «yu», а не «y».
  const initial = transliterate((parts[1] ?? '').charAt(0));
  const base = initial ? `${last}.${initial}` : last;
  return base.length >= 3 ? base : 'teacher';
}

/** «Иванов» и «иванoв» с латинской o должны совпасть — режем всё лишнее. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я]/gi, '');
}

export function buildSearchKey(lastName: string, firstName: string): string {
  return `${normalizeName(lastName)}|${normalizeName(firstName)}`;
}

/** Каждое слово с прописной: «иванов иван» → «Иванов Иван». */
export function titleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
        .join('-'),
    )
    .join(' ');
}

/** Расстояние Левенштейна: им сверяют коды бланков, прочитанные с ошибкой. */
export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      current.push(Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + cost));
    }
    previous = current;
  }
  return previous[b.length];
}

export const CLASS_LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('');

export function className(number: number, letter: string): string {
  return `${number}${letter}`;
}

/**
 * Текст задания приходит из визуального редактора в HTML. В печать, в OCR-отчёты
 * и в сравнение ответов идёт только его текстовая часть, поэтому теги снимаем,
 * а формулы разворачиваем в исходный LaTeX.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<span[^>]*data-formula="([^"]*)"[^>]*>.*?<\/span>/gi, (_, formula: string) => ` ${formula} `)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

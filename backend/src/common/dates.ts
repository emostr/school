/**
 * Учебные даты хранятся колонками DATE и ходят по API строками «ГГГГ-ММ-ДД».
 * В JS такая дата — полночь UTC; все вычисления ниже ведутся в UTC, чтобы
 * часовой пояс сервера не сдвигал день недели.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseDay(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) {
    return new Date(NaN);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function isValidDay(value: string | undefined): value is string {
  return typeof value === 'string' && !Number.isNaN(parseDay(value).getTime());
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** 1 — понедельник … 7 — воскресенье. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfWeek(date: Date): Date {
  return addDays(date, 1 - isoWeekday(date));
}

/** Сегодняшняя дата в часовом поясе школы, а не сервера. */
export function todayIn(timezone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parseDay(parts);
}

export function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

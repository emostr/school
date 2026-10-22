/** Учебные даты ходят строками «ГГГГ-ММ-ДД»; считаем их в UTC, как сервер. */

export const WEEKDAYS = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export const WEEKDAYS_SHORT = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOMINATIVE = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  return dayKey(new Date(parseDay(key).getTime() + days * 86_400_000));
}

export function weekday(key: string): number {
  const day = parseDay(key).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekStart(key: string): string {
  return addDays(key, 1 - weekday(key));
}

export function localToday(): string {
  const now = new Date();
  return dayKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** «22 октября» */
export function formatDay(key: string): string {
  const date = parseDay(key);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** «четверг, 22 октября» */
export function formatDayLong(key: string): string {
  return `${WEEKDAYS[weekday(key)]}, ${formatDay(key)}`;
}

/** «пн, 22.10» */
export function formatDayShort(key: string): string {
  const date = parseDay(key);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${WEEKDAYS_SHORT[weekday(key)]}, ${dd}.${mm}`;
}

/** «19–25 октября» или «28 октября – 3 ноября» */
export function formatRange(from: string, to: string): string {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
  }
  return `${formatDay(from)} – ${formatDay(to)}`;
}

export function monthName(key: string): string {
  return MONTHS_NOMINATIVE[parseDay(key).getUTCMonth()];
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/** Человеческое «когда»: «сегодня», «завтра», «в пятницу», «22 октября». */
export function relativeDay(key: string, today: string): string {
  const diff = Math.round((parseDay(key).getTime() - parseDay(today).getTime()) / 86_400_000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff === -1) return 'вчера';
  if (diff === 2) return 'послезавтра';
  return formatDayLong(key);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
  return `${(bytes / 1024 ** 3).toFixed(2)} ГБ`;
}

/** Склонение: plural(5, 'урок', 'урока', 'уроков') → «уроков». */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

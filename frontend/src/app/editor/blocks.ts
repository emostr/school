/**
 * Заготовки целых блоков для конспекта: определение, теорема с
 * доказательством, задача с решением, таблицы. Вставляются туда, где стоит
 * курсор, и сразу правятся.
 */
export interface BlockTemplate {
  label: string;
  hint: string;
  html: string;
}

export const NOTE_BLOCKS: BlockTemplate[] = [
  {
    label: 'План конспекта',
    hint: 'тема, понятия, примеры, вывод',
    html: '<h1>Тема урока</h1><h2>Основные понятия</h2><ul><li><p>…</p></li></ul><h2>Примеры</h2><p>…</p><h2>Вывод</h2><p>…</p>',
  },
  {
    label: 'Определение',
    hint: 'выделенный абзац',
    html: '<blockquote><p><strong>Определение.</strong> …</p></blockquote>',
  },
  {
    label: 'Теорема и доказательство',
    hint: 'формулировка, дано, доказать',
    html: '<blockquote><p><strong>Теорема.</strong> …</p></blockquote><p><strong>Дано:</strong> …</p><p><strong>Доказать:</strong> …</p><p><strong>Доказательство.</strong> …</p>',
  },
  {
    label: 'Задача — решение — ответ',
    hint: 'разбор задачи',
    html: '<p><strong>Задача.</strong> …</p><p><strong>Решение.</strong></p><div class="ng-formula-block" data-formula="x = \\frac{a}{b}" data-display="true"></div><p><strong>Ответ:</strong> …</p>',
  },
  {
    label: 'Формула с пояснением',
    hint: 'формула и «где …»',
    html: '<div class="ng-formula-block" data-formula="F = ma" data-display="true"></div><p>где <span class="ng-formula" data-formula="F"></span> — сила, <span class="ng-formula" data-formula="m"></span> — масса, <span class="ng-formula" data-formula="a"></span> — ускорение.</p>',
  },
  {
    label: 'Правило и примеры',
    hint: 'русский, иностранный',
    html: '<blockquote><p><strong>Правило.</strong> …</p></blockquote><p><strong>Примеры:</strong></p><ol><li><p>…</p></li><li><p>…</p></li></ol><p><strong>Исключения:</strong> …</p>',
  },
  {
    label: 'Лабораторная работа',
    hint: 'цель, оборудование, ход, вывод',
    html: '<h2>Лабораторная работа №</h2><p><strong>Цель:</strong> …</p><p><strong>Оборудование:</strong> …</p><h3>Ход работы</h3><ol><li><p>…</p></li></ol><table><tbody><tr><th><p>№ опыта</p></th><th><p>Величина</p></th><th><p>Результат</p></th></tr><tr><td><p>1</p></td><td><p></p></td><td><p></p></td></tr><tr><td><p>2</p></td><td><p></p></td><td><p></p></td></tr></tbody></table><p><strong>Вывод:</strong> …</p>',
  },
  {
    label: 'Хронология',
    hint: 'дата — событие',
    html: '<table><tbody><tr><th><p>Дата</p></th><th><p>Событие</p></th><th><p>Значение</p></th></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table>',
  },
  {
    label: 'Словарь',
    hint: 'слово — перевод — пример',
    html: '<table><tbody><tr><th><p>Слово</p></th><th><p>Перевод</p></th><th><p>Пример</p></th></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr><tr><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table>',
  },
  {
    label: 'Таблица значений функции',
    hint: 'x и y',
    html: '<table><tbody><tr><th><p><span class="ng-formula" data-formula="x"></span></p></th><td><p>-2</p></td><td><p>-1</p></td><td><p>0</p></td><td><p>1</p></td><td><p>2</p></td></tr><tr><th><p><span class="ng-formula" data-formula="y"></span></p></th><td><p></p></td><td><p></p></td><td><p></p></td><td><p></p></td><td><p></p></td></tr></tbody></table>',
  },
];

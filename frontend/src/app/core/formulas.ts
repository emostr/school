/**
 * Заготовки формул для визуального редактора. Набор школьный: то, что реально
 * встречается в контрольных с первого по одиннадцатый класс — от обыкновенных
 * дробей до пределов, векторов и химических формул.
 *
 * Плейсхолдеры внутри намеренно однобуквенные (a, b, x, n): их проще заменить,
 * чем стирать длинные слова.
 */
export interface FormulaSnippet {
  label: string;
  latex: string;
}

export interface FormulaGroup {
  title: string;
  items: FormulaSnippet[];
}

export const FORMULA_GROUPS: FormulaGroup[] = [
  {
    title: 'Дроби и степени',
    items: [
      { label: 'Дробь', latex: '\\frac{a}{b}' },
      { label: 'Смешанное число', latex: '2\\frac{3}{4}' },
      { label: 'Многоэтажная дробь', latex: '\\dfrac{\\frac{a}{b}}{\\frac{c}{d}}' },
      { label: 'Степень', latex: 'x^{2}' },
      { label: 'Индекс', latex: 'x_{1}' },
      { label: 'Степень с индексом', latex: 'a_{n}^{2}' },
      { label: 'Корень', latex: '\\sqrt{x}' },
      { label: 'Корень n-й степени', latex: '\\sqrt[n]{x}' },
      { label: 'Дробная степень', latex: 'x^{\\frac{1}{2}}' },
      { label: 'Отрицательная степень', latex: 'x^{-1}' },
      { label: 'Проценты', latex: '15\\%' },
      { label: 'Периодическая дробь', latex: '0{,}(3)' },
    ],
  },
  {
    title: 'Действия и сравнения',
    items: [
      { label: 'Умножение', latex: 'a \\cdot b' },
      { label: 'Умножение крестом', latex: 'a \\times b' },
      { label: 'Деление', latex: 'a : b' },
      { label: 'Деление двоеточием', latex: 'a \\div b' },
      { label: 'Плюс-минус', latex: 'a \\pm b' },
      { label: 'Не равно', latex: 'a \\neq b' },
      { label: 'Меньше или равно', latex: 'a \\leqslant b' },
      { label: 'Больше или равно', latex: 'a \\geqslant b' },
      { label: 'Приблизительно', latex: 'a \\approx b' },
      { label: 'Тождественно равно', latex: 'a \\equiv b' },
      { label: 'Двойное неравенство', latex: '-2 < x \\leqslant 5' },
      { label: 'Модуль', latex: '|x|' },
      { label: 'Бесконечность', latex: '\\infty' },
      { label: 'Многоточие', latex: 'a_1, a_2, \\ldots, a_n' },
    ],
  },
  {
    title: 'Алгебра',
    items: [
      { label: 'Квадратное уравнение', latex: 'ax^{2} + bx + c = 0' },
      { label: 'Дискриминант', latex: 'D = b^{2} - 4ac' },
      { label: 'Корни уравнения', latex: 'x_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}' },
      { label: 'Теорема Виета', latex: 'x_1 + x_2 = -\\frac{b}{a}' },
      { label: 'Разность квадратов', latex: 'a^{2} - b^{2} = (a-b)(a+b)' },
      { label: 'Квадрат суммы', latex: '(a + b)^{2} = a^{2} + 2ab + b^{2}' },
      { label: 'Куб суммы', latex: '(a + b)^{3}' },
      { label: 'Система', latex: '\\begin{cases} x + y = 2 \\\\ x - y = 0 \\end{cases}' },
      { label: 'Совокупность', latex: '\\left[\\begin{array}{l} x = 1 \\\\ x = 2 \\end{array}\\right.' },
      { label: 'Сумма ряда', latex: '\\sum_{i=1}^{n} a_i' },
      { label: 'Произведение', latex: '\\prod_{i=1}^{n} a_i' },
      { label: 'Логарифм', latex: '\\log_{a} b' },
      { label: 'Десятичный логарифм', latex: '\\lg x' },
      { label: 'Натуральный логарифм', latex: '\\ln x' },
      { label: 'Функция', latex: 'f(x)' },
      { label: 'Матрица 2×2', latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
      { label: 'Определитель', latex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}' },
      { label: 'Факториал', latex: 'n!' },
      { label: 'Сочетания', latex: 'C_{n}^{k} = \\frac{n!}{k!(n-k)!}' },
    ],
  },
  {
    title: 'Геометрия',
    items: [
      { label: 'Треугольник', latex: '\\triangle ABC' },
      { label: 'Угол', latex: '\\angle ABC' },
      { label: 'Градусы', latex: '90^{\\circ}' },
      { label: 'Параллельность', latex: 'AB \\parallel CD' },
      { label: 'Перпендикулярность', latex: 'AB \\perp CD' },
      { label: 'Подобие', latex: '\\triangle ABC \\sim \\triangle A_1B_1C_1' },
      { label: 'Отрезок', latex: '\\overline{AB}' },
      { label: 'Дуга', latex: '\\overset{\\frown}{AB}' },
      { label: 'Площадь круга', latex: 'S = \\pi R^{2}' },
      { label: 'Теорема Пифагора', latex: 'c^{2} = a^{2} + b^{2}' },
      { label: 'Площадь треугольника', latex: 'S = \\frac{1}{2}ah' },
      { label: 'Объём', latex: 'V = \\frac{1}{3}S_{\\text{осн}}h' },
    ],
  },
  {
    title: 'Тригонометрия',
    items: [
      { label: 'Синус', latex: '\\sin \\alpha' },
      { label: 'Косинус', latex: '\\cos \\alpha' },
      { label: 'Тангенс', latex: '\\tg \\alpha' },
      { label: 'Котангенс', latex: '\\ctg \\alpha' },
      { label: 'Основное тождество', latex: '\\sin^{2}\\alpha + \\cos^{2}\\alpha = 1' },
      { label: 'Синус суммы', latex: '\\sin(\\alpha + \\beta)' },
      { label: 'Двойной угол', latex: '\\sin 2\\alpha = 2\\sin\\alpha\\cos\\alpha' },
      { label: 'Арксинус', latex: '\\arcsin x' },
      { label: 'Радианы', latex: '\\frac{\\pi}{6}' },
      { label: 'Теорема синусов', latex: '\\frac{a}{\\sin \\alpha} = 2R' },
      { label: 'Теорема косинусов', latex: 'c^{2} = a^{2} + b^{2} - 2ab\\cos\\gamma' },
    ],
  },
  {
    title: 'Начала анализа',
    items: [
      { label: 'Предел', latex: '\\lim_{x \\to 0} f(x)' },
      { label: 'Предел на бесконечности', latex: '\\lim_{n \\to \\infty} a_n' },
      { label: 'Производная', latex: "f'(x)" },
      { label: 'Производная по x', latex: '\\frac{dy}{dx}' },
      { label: 'Вторая производная', latex: "f''(x)" },
      { label: 'Неопределённый интеграл', latex: '\\int f(x)\\,dx' },
      { label: 'Определённый интеграл', latex: '\\int_{a}^{b} f(x)\\,dx' },
      { label: 'Приращение', latex: '\\Delta x' },
      { label: 'Стремится', latex: 'x \\to a' },
    ],
  },
  {
    title: 'Множества и логика',
    items: [
      { label: 'Принадлежит', latex: 'x \\in A' },
      { label: 'Не принадлежит', latex: 'x \\notin A' },
      { label: 'Подмножество', latex: 'A \\subset B' },
      { label: 'Объединение', latex: 'A \\cup B' },
      { label: 'Пересечение', latex: 'A \\cap B' },
      { label: 'Пустое множество', latex: '\\varnothing' },
      { label: 'Промежуток', latex: '[-2; 5)' },
      { label: 'Множество чисел', latex: '\\mathbb{R}' },
      { label: 'Следует', latex: 'A \\Rightarrow B' },
      { label: 'Равносильно', latex: 'A \\Leftrightarrow B' },
      { label: 'Для любого', latex: '\\forall x' },
      { label: 'Существует', latex: '\\exists x' },
    ],
  },
  {
    title: 'Физика и химия',
    items: [
      { label: 'Вектор', latex: '\\vec{v}' },
      { label: 'Вектор двумя точками', latex: '\\overrightarrow{AB}' },
      { label: 'Единицы измерения', latex: '5\\ \\text{м/с}' },
      { label: 'Степень десяти', latex: '3 \\cdot 10^{8}' },
      { label: 'Скорость', latex: 'v = \\frac{s}{t}' },
      { label: 'Плотность', latex: '\\rho = \\frac{m}{V}' },
      { label: 'Второй закон Ньютона', latex: 'F = ma' },
      { label: 'Температура', latex: '20\\ ^{\\circ}\\text{C}' },
      { label: 'Химическая формула', latex: '\\text{H}_2\\text{SO}_4' },
      { label: 'Реакция', latex: '2\\text{H}_2 + \\text{O}_2 \\rightarrow 2\\text{H}_2\\text{O}' },
      { label: 'Обратимая реакция', latex: '\\text{N}_2 + 3\\text{H}_2 \\rightleftarrows 2\\text{NH}_3' },
      { label: 'Ион', latex: '\\text{SO}_4^{2-}' },
    ],
  },
  {
    title: 'Буквы и знаки',
    items: [
      { label: 'α', latex: '\\alpha' },
      { label: 'β', latex: '\\beta' },
      { label: 'γ', latex: '\\gamma' },
      { label: 'Δ', latex: '\\Delta' },
      { label: 'π', latex: '\\pi' },
      { label: 'ρ', latex: '\\rho' },
      { label: 'φ', latex: '\\varphi' },
      { label: 'ω', latex: '\\omega' },
      { label: 'Σ', latex: '\\Sigma' },
      { label: 'Стрелка вправо', latex: '\\rightarrow' },
      { label: 'Текст в формуле', latex: '\\text{ответ}' },
      { label: 'Пробел', latex: '\\ ' },
    ],
  },
];

/** Плоский список — для поиска и для проверки, что всё это вообще рисуется. */
export const ALL_SNIPPETS: FormulaSnippet[] = FORMULA_GROUPS.flatMap((group) => group.items);

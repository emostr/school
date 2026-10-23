/*
 * Показательные данные: классы, сотрудники, ученики, сетка расписания,
 * задания и конспект. Для знакомства с платформой и для разработки —
 * не для боевого сервера с настоящей школой.
 *
 *   npm run demo:seed -- --password=пароль-для-всех
 *
 * Всем заведённым записям ставится один пароль без требования смены.
 * Завучу второй фактор обязателен, поэтому ему подключается TOTP с ключом,
 * который скрипт печатает в конце.
 */
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { hashSecret } = require('../dist/common/crypto/password');
const { generateTotpSecret } = require('../dist/common/crypto/totp');
const { buildSearchKey } = require('../dist/common/text');

const argument = process.argv.find((value) => value.startsWith('--password='));
const password = argument ? argument.slice('--password='.length) : 'demo-password-2026';
if (password.length < 10) {
  console.error('Пароль должен быть не короче 10 символов');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const passwordHash = await hashSecret(password);

let school = await prisma.school.findFirst({ orderBy: { createdAt: 'asc' } });
if (!school) {
  school = await prisma.school.create({ data: { name: 'Школа' } });
}
await prisma.school.update({
  where: { id: school.id },
  data: {
    name: school.name === 'Школа' ? 'МБОУ «Средняя общеобразовательная школа № 7»' : school.name,
    shortName: school.shortName || 'Школа № 7',
    bells: [
      { number: 1, start: '08:30', end: '09:15' },
      { number: 2, start: '09:25', end: '10:10' },
      { number: 3, start: '10:30', end: '11:15' },
      { number: 4, start: '11:35', end: '12:20' },
      { number: 5, start: '12:30', end: '13:15' },
      { number: 6, start: '13:25', end: '14:10' },
      { number: 7, start: '14:20', end: '15:05' },
    ],
  },
});

const SUBJECTS = [
  ['Алгебра', 'Алгебра'], ['Геометрия', 'Геом.'], ['Русский язык', 'Рус. яз.'], ['Литература', 'Лит-ра'],
  ['Физика', 'Физика'], ['Химия', 'Химия'], ['Биология', 'Биол.'], ['История', 'История'],
  ['Английский язык', 'Англ. яз.'], ['Информатика', 'Информ.'], ['Физическая культура', 'Физ-ра'], ['География', 'Геогр.'],
];
const subject = {};
for (const [name, short] of SUBJECTS) {
  subject[name] = await prisma.subject.upsert({ where: { name }, create: { name, short }, update: {} });
}
const room = {};
for (const name of ['101', '204', '205', '301', '312', 'спортзал', 'кабинет информатики']) {
  room[name] = await prisma.room.upsert({ where: { name }, create: { name }, update: {} });
}

async function person(login, lastName, firstName, middleName, privileges, extra = {}) {
  const fullName = [lastName, firstName, middleName].filter(Boolean).join(' ');
  return prisma.account.upsert({
    where: { login },
    create: {
      login, lastName, firstName, middleName, fullName, privileges, schoolId: school.id,
      passwordHash, mustChangePassword: false, ...extra,
    },
    update: { passwordHash, mustChangePassword: false, privileges, blockedAt: null, deletedAt: null, ...extra },
  });
}

const totpSecret = generateTotpSecret();
const head = await person('zavuch', 'Петрова', 'Анна', 'Сергеевна', ['HEAD', 'TEACHER'], {
  subject: 'математика', totpSecret, totpEnabled: true,
});
const teachers = {
  math: head,
  russian: await person('smirnova.ev', 'Смирнова', 'Елена', 'Викторовна', ['TEACHER'], { subject: 'русский язык и литература' }),
  physics: await person('kuznecov.ai', 'Кузнецов', 'Андрей', 'Игоревич', ['TEACHER'], { subject: 'физика' }),
  english: await person('volkova.mn', 'Волкова', 'Мария', 'Николаевна', ['TEACHER'], { subject: 'английский язык' }),
  history: await person('orlov.dp', 'Орлов', 'Дмитрий', 'Павлович', ['TEACHER'], { subject: 'история' }),
  science: await person('sokolova.tv', 'Соколова', 'Татьяна', 'Владимировна', ['TEACHER'], { subject: 'химия и биология' }),
  pe: await person('morozov.sa', 'Морозов', 'Сергей', 'Александрович', ['TEACHER'], { subject: 'физическая культура' }),
};

async function schoolClass(number, letter, homeroomId) {
  const existing = await prisma.schoolClass.findFirst({ where: { schoolId: school.id, number, letter, archiveKey: '' } });
  if (existing) {
    return prisma.schoolClass.update({ where: { id: existing.id }, data: { homeroomId } });
  }
  return prisma.schoolClass.create({ data: { schoolId: school.id, number, letter, homeroomId } });
}

const class8 = await schoolClass(8, 'А', teachers.russian.id);
const class9 = await schoolClass(9, 'Б', teachers.physics.id);

const PUPILS_8 = [
  ['Алексеев', 'Максим'], ['Белова', 'Дарья'], ['Васильев', 'Артём'], ['Григорьева', 'Полина'],
  ['Денисов', 'Кирилл'], ['Егорова', 'Виктория'], ['Жуков', 'Матвей'], ['Захарова', 'София'],
  ['Ильин', 'Тимофей'], ['Козлова', 'Анастасия'], ['Лебедев', 'Иван'], ['Миронова', 'Алиса'],
  ['Никитин', 'Егор'], ['Павлова', 'Вероника'], ['Романов', 'Лев'], ['Степанова', 'Ева'],
];
const PUPILS_9 = [
  ['Абрамов', 'Никита'], ['Борисова', 'Ксения'], ['Гусев', 'Роман'], ['Давыдова', 'Мария'],
  ['Ершов', 'Глеб'], ['Зайцева', 'Ульяна'], ['Карпов', 'Михаил'], ['Комарова', 'Варвара'],
  ['Медведев', 'Фёдор'], ['Новикова', 'Злата'], ['Осипов', 'Даниил'], ['Тарасова', 'Милана'],
];

const translit = (value) => {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  return [...value.toLowerCase()].map((c) => map[c] ?? c).join('');
};

async function pupils(cls, list, trustedIndex) {
  const result = [];
  for (const [index, [lastName, firstName]] of list.entries()) {
    const login = `${translit(lastName)}.${translit(firstName[0])}${cls.number}`;
    const privileges = index === trustedIndex ? ['STUDENT', 'TRUSTED'] : ['STUDENT'];
    const account = await person(login, lastName, firstName, '', privileges);
    const membership = await prisma.student.findFirst({ where: { accountId: account.id, archivedAt: null } });
    if (!membership) {
      await prisma.student.create({
        data: {
          classId: cls.id, accountId: account.id, lastName, firstName,
          searchKey: buildSearchKey(lastName, firstName), group: index % 2 ? '2' : '1',
        },
      });
    }
    result.push(account);
  }
  return result;
}

const pupils8 = await pupils(class8, PUPILS_8, 0);
await pupils(class9, PUPILS_9, 2);

// Сетка: с первого сентября текущего учебного года.
const now = new Date();
const year = now.getMonth() < 8 ? now.getFullYear() - 1 : now.getFullYear();
const validFrom = new Date(Date.UTC(year, 8, 1));

const S = (name, teacher, roomName, group = '') => ({ subject: subject[name], teacher, room: room[roomName], group });
const GRID_8 = {
  1: [S('Алгебра', teachers.math, '204'), S('Русский язык', teachers.russian, '301'), S('Физика', teachers.physics, '312'), S('История', teachers.history, '205'), S('Физическая культура', teachers.pe, 'спортзал'), S('Литература', teachers.russian, '301')],
  2: [S('Геометрия', teachers.math, '204'), S('Английский язык', teachers.english, '101', '1'), S('Химия', teachers.science, '205'), S('Русский язык', teachers.russian, '301'), S('Биология', teachers.science, '205'), S('Алгебра', teachers.math, '204')],
  3: [S('Русский язык', teachers.russian, '301'), S('Алгебра', teachers.math, '204'), S('История', teachers.history, '205'), S('Английский язык', teachers.english, '101'), S('Информатика', teachers.math, 'кабинет информатики'), S('География', teachers.history, '205')],
  4: [S('Физика', teachers.physics, '312'), S('Литература', teachers.russian, '301'), S('Геометрия', teachers.math, '204'), S('Химия', teachers.science, '205'), S('Физическая культура', teachers.pe, 'спортзал')],
  5: [S('Алгебра', teachers.math, '204'), S('Биология', teachers.science, '205'), S('Русский язык', teachers.russian, '301'), S('Английский язык', teachers.english, '101'), S('История', teachers.history, '205'), S('Литература', teachers.russian, '301')],
};

async function grid(cls, layout) {
  const version = await prisma.scheduleVersion.upsert({
    where: { classId_validFrom: { classId: cls.id, validFrom } },
    create: { classId: cls.id, validFrom, note: 'первое полугодие', createdById: head.id },
    update: {},
  });
  await prisma.scheduleLesson.deleteMany({ where: { versionId: version.id } });
  const data = [];
  for (const [weekday, lessons] of Object.entries(layout)) {
    lessons.forEach((lesson, index) => {
      data.push({
        versionId: version.id, weekday: Number(weekday), number: index + 1, group: lesson.group,
        subjectId: lesson.subject.id, teacherId: lesson.teacher.id, roomId: lesson.room.id,
      });
      // Английский делится на группы: вторая группа — у второго учителя в соседнем кабинете.
      if (lesson.group === '1') {
        data.push({
          versionId: version.id, weekday: Number(weekday), number: index + 1, group: '2',
          subjectId: lesson.subject.id, teacherId: teachers.english.id, roomId: room['205'].id,
        });
      }
    });
  }
  await prisma.scheduleLesson.createMany({ data });
}

await grid(class8, GRID_8);
// 9Б — та же сетка, сдвинутая на урок, чтобы учителя не встречались в одной клетке.
await grid(class9, Object.fromEntries(Object.entries(GRID_8).map(([wd, list]) => [wd, [...list.slice(1), list[0]]])));

// Задания на ближайшие дни.
const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
const day = (offset) => new Date(today.getTime() + offset * 86400000);
const existingHomework = await prisma.homework.count({ where: { classId: class8.id } });
if (!existingHomework) {
  await prisma.homework.createMany({
    data: [
      { classId: class8.id, subjectId: subject['Алгебра'].id, date: day(1), content: '<p>§ 14, № 312, 315, 318. Повторить формулы сокращённого умножения: <span class="ng-formula" data-formula="(a+b)^2 = a^2 + 2ab + b^2"></span></p>', authorId: head.id },
      { classId: class8.id, subjectId: subject['Русский язык'].id, date: day(1), content: '<p>Упр. 245 (с. 112). Выучить правило о правописании <strong>-н-</strong> и <strong>-нн-</strong> в причастиях.</p>', authorId: teachers.russian.id },
      { classId: class8.id, subjectId: subject['Физика'].id, date: day(2), content: '<p>§ 23, вопросы 1–4 устно. Задача: тело массой <span class="ng-formula" data-formula="m = 2\\,\\text{кг}"></span> движется с ускорением <span class="ng-formula" data-formula="a = 3\\,\\text{м/с}^2"></span>. Найти силу.</p>', authorId: teachers.physics.id },
      { classId: class8.id, subjectId: subject['История'].id, date: day(3), content: '<p>Подготовить сообщение «Реформы Петра I» (до 3 минут).</p>', authorId: teachers.history.id },
      { classId: class8.id, subjectId: subject['Литература'].id, date: day(-2), content: '<p>Прочитать «Капитанская дочка», главы 1–5.</p>', authorId: teachers.russian.id },
    ],
  });
}

const existingNotes = await prisma.note.count({ where: { classId: class8.id } });
if (!existingNotes) {
  await prisma.note.create({
    data: {
      classId: class8.id, subjectId: subject['Алгебра'].id, date: day(-1), title: 'Квадратные уравнения', kind: 'RICH', authorId: pupils8[0].id,
      content: '<h1>Квадратные уравнения</h1><blockquote><p><strong>Определение.</strong> Квадратным называется уравнение вида <span class="ng-formula" data-formula="ax^2 + bx + c = 0"></span>, где <span class="ng-formula" data-formula="a \\neq 0"></span>.</p></blockquote><h2>Дискриминант</h2><div class="ng-formula-block" data-formula="D = b^2 - 4ac" data-display="true"></div><ul><li><p>если <span class="ng-formula" data-formula="D > 0"></span> — два корня;</p></li><li><p>если <span class="ng-formula" data-formula="D = 0"></span> — один корень;</p></li><li><p>если <span class="ng-formula" data-formula="D < 0"></span> — корней нет.</p></li></ul><h2>Формула корней</h2><div class="ng-formula-block" data-formula="x_{1,2} = \\frac{-b \\pm \\sqrt{D}}{2a}" data-display="true"></div><table><tbody><tr><th><p>Уравнение</p></th><th><p>D</p></th><th><p>Корни</p></th></tr><tr><td><p><span class="ng-formula" data-formula="x^2 - 5x + 6 = 0"></span></p></td><td><p>1</p></td><td><p>2; 3</p></td></tr><tr><td><p><span class="ng-formula" data-formula="x^2 - 4x + 4 = 0"></span></p></td><td><p>0</p></td><td><p>2</p></td></tr></tbody></table>',
    },
  });
}

// Учебные периоды — четверти текущего учебного года.
const y = year;
const periods = [
  { title: '1 четверть', from: `${y}-09-01`, to: `${y}-10-24` },
  { title: '2 четверть', from: `${y}-11-05`, to: `${y}-12-28` },
  { title: '3 четверть', from: `${y + 1}-01-12`, to: `${y + 1}-03-20` },
  { title: '4 четверть', from: `${y + 1}-03-30`, to: `${y + 1}-05-26` },
];
const currentSchool = await prisma.school.findUniqueOrThrow({ where: { id: school.id } });
await prisma.school.update({
  where: { id: school.id },
  data: { settings: { ...(currentSchool.settings ?? {}), periods } },
});

// Родитель первого ученика 8А.
const parent = await person('alekseeva.ev', 'Алексеева', 'Елена', 'Викторовна', ['PARENT']);
await prisma.parentLink.upsert({
  where: { parentId_childId: { parentId: parent.id, childId: pupils8[0].id } },
  create: { parentId: parent.id, childId: pupils8[0].id },
  update: {},
});

// Оценки за последние три недели по расписанию 8А.
if (!(await prisma.grade.count({ where: { classId: class8.id } }))) {
  const roster = await prisma.student.findMany({ where: { classId: class8.id, archivedAt: null } });
  const kinds = ['LESSON', 'ORAL', 'HOMEWORK', 'LESSON', 'INDEPENDENT'];
  const weights = { LESSON: 1, ORAL: 1, HOMEWORK: 1, INDEPENDENT: 2, TEST: 3 };
  const data = [];
  let seed = 7;
  const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let offset = -21; offset <= 0; offset += 1) {
    const date = day(offset);
    const weekday = date.getUTCDay() || 7;
    const lessons = GRID_8[weekday] ?? [];
    lessons.forEach((lesson, index) => {
      if (lesson.group) return;
      const isTest = offset === -7 && index === 0;
      for (const student of roster) {
        if (!isTest && random() > 0.18) continue;
        const kind = isTest ? 'TEST' : kinds[Math.floor(random() * kinds.length)];
        const value = Math.min(5, Math.max(2, Math.round(3.9 + (random() - 0.4) * 2.4)));
        data.push({
          classId: class8.id, studentId: student.id, subjectId: lesson.subject.id, date, lessonNumber: index + 1,
          value, kind, weight: weights[kind], teacherId: lesson.teacher.id,
        });
      }
    });
  }
  await prisma.grade.createMany({ data });
}

await prisma.$disconnect();
console.log('');
console.log('  Показательные данные готовы');
console.log(`  Пароль у всех: ${password}`);
console.log('  Завуч:          zavuch (второй фактор — ключ ниже)');
console.log(`  Ключ TOTP:      ${totpSecret}`);
console.log('  Учитель:        smirnova.ev (классный руководитель 8А)');
console.log(`  Ученик:         ${pupils8[0].login} (доверенный, 8А)`);
console.log('  Родитель:       alekseeva.ev (мама ученика выше)');
console.log('');

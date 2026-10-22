import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dayKey, parseDay } from '../common/dates';
import { HolidayDto, RoomDto, SubjectDto } from './catalog.dto';

/** Стандартный набор предметов — чтобы школа не набирала его руками. */
const DEFAULT_SUBJECTS: [string, string][] = [
  ['Русский язык', 'Рус. яз.'],
  ['Литература', 'Лит-ра'],
  ['Литературное чтение', 'Лит. чт.'],
  ['Математика', 'Матем.'],
  ['Алгебра', 'Алгебра'],
  ['Геометрия', 'Геом.'],
  ['Вероятность и статистика', 'Вер. и стат.'],
  ['Информатика', 'Информ.'],
  ['Физика', 'Физика'],
  ['Химия', 'Химия'],
  ['Биология', 'Биол.'],
  ['География', 'Геогр.'],
  ['История', 'История'],
  ['Обществознание', 'Общ.'],
  ['Английский язык', 'Англ. яз.'],
  ['Окружающий мир', 'Окр. мир'],
  ['Изобразительное искусство', 'ИЗО'],
  ['Музыка', 'Музыка'],
  ['Труд (технология)', 'Труд'],
  ['Физическая культура', 'Физ-ра'],
  ['Основы безопасности и защиты Родины', 'ОБЗР'],
];

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async subjects(includeArchived = false) {
    const rows = await this.prisma.subject.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      short: row.short || row.name,
      archived: Boolean(row.archivedAt),
    }));
  }

  async createSubject(dto: SubjectDto) {
    const name = dto.name.trim();
    const existing = await this.prisma.subject.findUnique({ where: { name } });
    if (existing && !existing.archivedAt) {
      throw new BadRequestException('Такой предмет уже есть');
    }
    if (existing) {
      await this.prisma.subject.update({ where: { id: existing.id }, data: { archivedAt: null, short: dto.short?.trim() ?? existing.short } });
    } else {
      await this.prisma.subject.create({ data: { name, short: dto.short?.trim() ?? '' } });
    }
    return this.subjects();
  }

  async updateSubject(id: string, dto: SubjectDto) {
    await this.prisma.subject.update({ where: { id }, data: { name: dto.name.trim(), short: dto.short?.trim() ?? '' } });
    return this.subjects();
  }

  /** Предмет с историей не удаляется — он уходит в архив вместе с заданиями. */
  async archiveSubject(id: string) {
    await this.prisma.subject.update({ where: { id }, data: { archivedAt: new Date() } });
    return this.subjects();
  }

  async seedSubjects() {
    for (const [name, short] of DEFAULT_SUBJECTS) {
      await this.prisma.subject.upsert({ where: { name }, create: { name, short }, update: {} });
    }
    return this.subjects();
  }

  async rooms() {
    const rows = await this.prisma.room.findMany({ where: { archivedAt: null } });
    // Кабинеты сортируем по-человечески: «2» раньше «10», «спортзал» в конце.
    return rows
      .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))
      .map((row) => ({ id: row.id, name: row.name, note: row.note }));
  }

  async createRoom(dto: RoomDto) {
    const name = dto.name.trim();
    const existing = await this.prisma.room.findUnique({ where: { name } });
    if (existing && !existing.archivedAt) {
      throw new BadRequestException('Такой кабинет уже есть');
    }
    if (existing) {
      await this.prisma.room.update({ where: { id: existing.id }, data: { archivedAt: null, note: dto.note?.trim() ?? '' } });
    } else {
      await this.prisma.room.create({ data: { name, note: dto.note?.trim() ?? '' } });
    }
    return this.rooms();
  }

  async updateRoom(id: string, dto: RoomDto) {
    await this.prisma.room.update({ where: { id }, data: { name: dto.name.trim(), note: dto.note?.trim() ?? '' } });
    return this.rooms();
  }

  async archiveRoom(id: string) {
    await this.prisma.room.update({ where: { id }, data: { archivedAt: new Date() } });
    return this.rooms();
  }

  async holidays() {
    const rows = await this.prisma.holiday.findMany({ orderBy: { from: 'desc' } });
    return rows.map((row) => ({ id: row.id, title: row.title, from: dayKey(row.from), to: dayKey(row.to) }));
  }

  async createHoliday(dto: HolidayDto) {
    const from = parseDay(dto.from.slice(0, 10));
    const to = parseDay(dto.to.slice(0, 10));
    if (to < from) {
      throw new BadRequestException('Каникулы заканчиваются раньше, чем начинаются');
    }
    await this.prisma.holiday.create({ data: { title: dto.title.trim(), from, to } });
    return this.holidays();
  }

  async removeHoliday(id: string) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) {
      throw new NotFoundException('Каникулы не найдены');
    }
    await this.prisma.holiday.delete({ where: { id } });
    return this.holidays();
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { todayIn } from '../common/dates';

export interface Bell {
  number: number;
  start: string;
  end: string;
}

export interface SchoolInfo {
  id: string;
  name: string;
  shortName: string;
  address: string;
  timezone: string;
  weekDays: number;
  bells: Bell[];
}

/** Звонки по умолчанию: восемь уроков по 45 минут. */
export const DEFAULT_BELLS: Bell[] = [
  { number: 1, start: '08:30', end: '09:15' },
  { number: 2, start: '09:25', end: '10:10' },
  { number: 3, start: '10:30', end: '11:15' },
  { number: 4, start: '11:35', end: '12:20' },
  { number: 5, start: '12:30', end: '13:15' },
  { number: 6, start: '13:25', end: '14:10' },
  { number: 7, start: '14:20', end: '15:05' },
  { number: 8, start: '15:15', end: '16:00' },
];

/**
 * Школа на сервере одна. Её строка заводится при первом старте и дальше
 * только правится из админки; здесь же держим её в памяти, чтобы не ходить
 * в базу за часовым поясом на каждый запрос.
 */
@Injectable()
export class SchoolService implements OnModuleInit {
  private cached: SchoolInfo | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.get();
  }

  async get(): Promise<SchoolInfo> {
    if (this.cached) {
      return this.cached;
    }
    let row = await this.prisma.school.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!row) {
      row = await this.prisma.school.create({
        data: { name: 'Школа', bells: DEFAULT_BELLS as unknown as Prisma.InputJsonValue },
      });
    }
    this.cached = this.toInfo(row);
    return this.cached;
  }

  async id(): Promise<string> {
    return (await this.get()).id;
  }

  async today(): Promise<Date> {
    return todayIn((await this.get()).timezone);
  }

  async update(data: Partial<Omit<SchoolInfo, 'id'>>): Promise<SchoolInfo> {
    const id = await this.id();
    const row = await this.prisma.school.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.shortName !== undefined ? { shortName: data.shortName.trim() } : {}),
        ...(data.address !== undefined ? { address: data.address.trim() } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
        ...(data.weekDays !== undefined ? { weekDays: data.weekDays } : {}),
        ...(data.bells !== undefined
          ? { bells: [...data.bells].sort((a, b) => a.number - b.number) as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    this.cached = this.toInfo(row);
    return this.cached;
  }

  private toInfo(row: {
    id: string;
    name: string;
    shortName: string;
    address: string;
    timezone: string;
    weekDays: number;
    bells: unknown;
  }): SchoolInfo {
    return {
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      address: row.address,
      timezone: row.timezone,
      weekDays: row.weekDays,
      bells: (Array.isArray(row.bells) ? row.bells : []) as Bell[],
    };
  }
}

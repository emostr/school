import { Privilege } from '../generated/prisma/enums';

export interface SessionPayload {
  /** id строки AuthSession — по нему сессию можно отозвать */
  sid: string;
  sub: string;
}

export interface RequestSchool {
  id: string;
  name: string;
}

export interface RequestAccount {
  id: string;
  login: string;
  fullName: string;
  /** Системный администратор: только админка, учебных данных не видит. */
  isAdmin: boolean;
  privileges: Privilege[];
  sessionId: string;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  /** У администратора школы нет: он настраивает её, но не учится в ней. */
  school: RequestSchool | null;
  /** Классы, где учётная запись — классный руководитель. */
  homeroomClassIds: string[];
  /** Действующий класс ученика и его место в нём. */
  studentClassId: string | null;
  studentId: string | null;
}

export const SESSION_COOKIE = 'edway_session';

/** Что осталось сделать учётной записи до полноценной работы. */
export type SetupStep = 'password' | 'totp' | 'done';

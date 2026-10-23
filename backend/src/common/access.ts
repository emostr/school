import { Privilege } from '../generated/prisma/enums';
import { RequestAccount, SetupStep } from './types';

/** Привилегии, которые сочетаются в одной учётной записи. */
export const STAFF: Privilege[] = ['TEACHER', 'HEAD'];

export function has(account: Pick<RequestAccount, 'privileges'>, privilege: Privilege): boolean {
  return account.privileges.includes(privilege);
}

export function isHead(account: Pick<RequestAccount, 'privileges'>): boolean {
  return has(account, 'HEAD');
}

export function isStaff(account: Pick<RequestAccount, 'privileges'>): boolean {
  return STAFF.some((privilege) => has(account, privilege));
}

export function isParent(account: Pick<RequestAccount, 'privileges'>): boolean {
  return has(account, 'PARENT');
}

export function isHomeroomOf(account: Pick<RequestAccount, 'homeroomClassIds'>, classId: string): boolean {
  return account.homeroomClassIds.includes(classId);
}

/** Второй фактор обязателен тем, у кого власти больше всех: администратору и завучам. */
export function totpRequired(account: { isAdmin: boolean; privileges: Privilege[] }): boolean {
  return account.isAdmin || account.privileges.includes('HEAD');
}

export function setupStep(account: {
  isAdmin: boolean;
  privileges: Privilege[];
  mustChangePassword: boolean;
  totpEnabled: boolean;
}): SetupStep {
  if (account.mustChangePassword) {
    return 'password';
  }
  if (totpRequired(account) && !account.totpEnabled) {
    return 'totp';
  }
  return 'done';
}

/**
 * Привилегии приходят из формы завуча — приводим их к допустимому набору:
 * ученик не бывает учителем, а доверенным бывает только ученик.
 */
export function normalizePrivileges(input: Privilege[]): Privilege[] {
  const set = new Set(input);
  if (set.has('STUDENT')) {
    // Ученик не бывает ни сотрудником, ни родителем.
    set.delete('TEACHER');
    set.delete('HEAD');
    set.delete('PARENT');
  } else {
    set.delete('TRUSTED');
  }
  const order: Privilege[] = ['STUDENT', 'TRUSTED', 'TEACHER', 'HEAD', 'PARENT'];
  return order.filter((privilege) => set.has(privilege));
}

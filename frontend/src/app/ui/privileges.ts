import { Privilege } from '../core/types';

export const PRIVILEGE_LABELS: Record<Privilege, string> = {
  STUDENT: 'ученик',
  TRUSTED: 'доверенный',
  TEACHER: 'учитель',
  HEAD: 'завуч',
  PARENT: 'родитель',
};

export const PRIVILEGE_TONES: Record<Privilege, string> = {
  STUDENT: '',
  TRUSTED: 'es-badge-info',
  TEACHER: 'es-badge-accent',
  HEAD: 'es-badge-warning',
  PARENT: 'es-badge-sick',
};

const ORDER: Privilege[] = ['STUDENT', 'TRUSTED', 'TEACHER', 'HEAD', 'PARENT'];

export function sortPrivileges(list: Privilege[]): Privilege[] {
  return [...list].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
}

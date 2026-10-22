/** Типы учебной части платформы — в том виде, в каком их отдаёт API. */

export type Privilege = 'STUDENT' | 'TRUSTED' | 'TEACHER' | 'HEAD';
export type SetupStep = 'password' | 'totp' | 'done';
export type Theme = 'dark' | 'light';
export type NotifyMode = 'toast' | 'popup';

export interface Preferences {
  theme: Theme;
  notify: NotifyMode;
}

export interface Profile {
  id: string;
  login: string;
  fullName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  subject: string;
  isAdmin: boolean;
  privileges: Privilege[];
  mustChangePassword: boolean;
  totpEnabled: boolean;
  totpRequired: boolean;
  setupStep: SetupStep;
  unusedBackupCodes: number;
  preferences: Preferences;
  school: { id: string; name: string; shortName: string } | null;
  homeroomClasses: { id: string; name: string }[];
  studentClass: { id: string; name: string; group: string } | null;
  createdAt: string;
}

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
  today: string;
}

export interface Subject {
  id: string;
  name: string;
  short: string;
  archived?: boolean;
}

export interface Room {
  id: string;
  name: string;
  note: string;
}

export interface Holiday {
  id: string;
  title: string;
  from: string;
  to: string;
}

export interface StaffMember {
  id: string;
  fullName: string;
  subject: string;
  privileges: Privilege[];
  blocked: boolean;
}

export interface ClassRow {
  id: string;
  number: number;
  letter: string;
  name: string;
  studentCount: number;
  assignmentCount: number;
  homeroom: { id: string; fullName: string } | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface ClassStudent {
  id: string;
  lastName: string;
  firstName: string;
  fullName: string;
  group: string;
  accountId: string | null;
  trusted: boolean;
  login?: string | null;
  blocked?: boolean;
  mustChangePassword?: boolean;
}

export interface ClassDetail extends ClassRow {
  canManage: boolean;
  canEditSchedule: boolean;
  students: ClassStudent[];
}

export interface AccountRow {
  id: string;
  login: string;
  fullName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  subject: string;
  isAdmin: boolean;
  privileges: Privilege[];
  totpEnabled: boolean;
  mustChangePassword: boolean;
  blocked: boolean;
  studentClass: { id: string; name: string; group: string; studentId: string } | null;
  homeroomClasses: { id: string; name: string }[];
  lastSeenAt: string | null;
  createdAt: string;
}

export interface IssuedCredentials {
  id: string;
  fullName: string;
  login: string;
  password: string;
  className?: string;
}

export interface Session {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string;
  userAgent: string;
}

// ─── Расписание ────────────────────────────────────────────────────────────

export type LessonStatus = 'regular' | 'replaced' | 'cancelled' | 'added';

export interface Lesson {
  classId: string;
  className: string;
  number: number;
  group: string;
  start: string;
  end: string;
  subject: { id: string; name: string; short: string } | null;
  teacher: { id: string; fullName: string } | null;
  room: { id: string; name: string } | null;
  originalTeacherId: string | null;
  status: LessonStatus;
  changeId: string | null;
  note: string;
  marked?: boolean;
}

export interface ScheduleDay {
  date: string;
  weekday: number;
  holiday: string | null;
  lessons: Lesson[];
}

export interface ScheduleWeek {
  kind: 'class' | 'teacher';
  classId?: string;
  teacherId?: string;
  title: string;
  from: string;
  to: string;
  version: { id: string; validFrom: string; note: string } | null;
  canEdit: boolean;
  days: ScheduleDay[];
}

export interface VersionRow {
  id: string;
  validFrom: string;
  note: string;
  createdBy: string | null;
  createdAt: string;
  lessonCount: number;
  state: 'current' | 'planned' | 'archived';
}

export interface GridLesson {
  weekday: number;
  number: number;
  group: string;
  subjectId: string;
  teacherId: string | null;
  roomId: string | null;
}

export interface VersionDetail {
  id: string;
  classId: string;
  validFrom: string;
  note: string;
  lessons: GridLesson[];
}

export type ChangeKind = 'REPLACE' | 'CANCEL' | 'ADD';

export interface ScheduleChange {
  id: string;
  classId: string;
  className?: string;
  date: string;
  number: number;
  group: string;
  kind: ChangeKind;
  note: string;
  subject: { id: string; name: string } | null;
  teacher: { id: string; fullName: string } | null;
  room: { id: string; name: string } | null;
  createdBy: string | null;
}

// ─── Задания и конспекты ───────────────────────────────────────────────────

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  url: string;
}

export interface PublishTarget {
  classId: string;
  className: string;
  subjects: Subject[];
}

export interface Homework {
  id: string;
  classId: string;
  className: string;
  subject: Subject;
  date: string;
  lessonNumber: number | null;
  group: string;
  content: string;
  author: { id: string; fullName: string } | null;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

export interface HomeworkTemplate {
  id: string;
  title: string;
  content: string;
}

export interface NoteSummary {
  id: string;
  classId: string;
  className: string;
  subject: Subject;
  date: string;
  lessonNumber: number | null;
  title: string;
  kind: 'FILES' | 'RICH';
  excerpt: string;
  cover: Attachment | null;
  attachmentCount: number;
  author: { id: string; fullName: string } | null;
  updatedAt: string;
  canEdit: boolean;
}

export interface NoteDetail extends NoteSummary {
  content: string;
  attachments: Attachment[];
  createdAt: string;
}

// ─── Посещаемость ──────────────────────────────────────────────────────────

export type AttendanceStatus = 'PRESENT' | 'SICK' | 'EXCUSED' | 'UNEXCUSED';

export interface LessonAttendance {
  classId: string;
  className: string;
  date: string;
  number: number;
  lesson: Lesson | null;
  marked: boolean;
  canEdit: boolean;
  students: {
    id: string;
    fullName: string;
    group: string;
    status: AttendanceStatus | null;
    note: string;
    markedBy: string | null;
    updatedAt: string | null;
  }[];
}

export interface AttendanceTotals {
  SICK: number;
  EXCUSED: number;
  UNEXCUSED: number;
  lessons: number;
  days: number;
}

export interface AttendanceSheet {
  classId: string;
  className: string;
  from: string;
  to: string;
  columns: { date: string; weekday: number; holiday: string | null; lessons: { number: number; subject: string }[] }[];
  students: {
    id: string;
    fullName: string;
    group: string;
    marks: Record<string, { status: AttendanceStatus; note: string }>;
    totals: AttendanceTotals;
  }[];
}

export interface MyAttendance {
  from: string;
  to: string;
  totals: AttendanceTotals;
  marks: { date: string; number: number; subject: string; status: AttendanceStatus; note: string }[];
}

// ─── Админка ───────────────────────────────────────────────────────────────

export interface SystemInfo {
  version: string;
  node: string;
  uptime: number;
  database: string;
  databaseSize: number;
  uploadsSize: number;
  ocr: string;
  counts: Record<'accounts' | 'students' | 'staff' | 'classes' | 'tests' | 'homework' | 'notes', number>;
}

import { Routes } from '@angular/router';
import { adminGuard, guestGuard, memberGuard, privilegeGuard, setupGuard } from './core/guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage) },
  { path: 'setup', canActivate: [setupGuard], loadComponent: () => import('./pages/setup/setup').then((m) => m.SetupPage) },
  {
    path: 'print/:id',
    canActivate: [memberGuard, privilegeGuard(['TEACHER', 'HEAD'])],
    loadComponent: () => import('./tests/print/print').then((m) => m.PrintPage),
  },
  {
    path: 'admin',
    component: Shell,
    canActivate: [adminGuard],
    data: { area: 'admin' },
    children: [
      { path: '', loadComponent: () => import('./admin/school/admin-school').then((m) => m.AdminSchoolPage) },
      { path: 'people', loadComponent: () => import('./admin/people/admin-people').then((m) => m.AdminPeoplePage) },
      { path: 'system', loadComponent: () => import('./admin/system/admin-system').then((m) => m.AdminSystemPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.SettingsPage) },
    ],
  },
  {
    path: '',
    component: Shell,
    canActivate: [memberGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage) },
      { path: 'schedule', loadComponent: () => import('./schedule/schedule-page').then((m) => m.SchedulePage) },
      {
        path: 'schedule/edit/:classId',
        canActivate: [privilegeGuard(['HEAD'], true)],
        loadComponent: () => import('./schedule/grid-editor').then((m) => m.GridEditorPage),
      },
      {
        path: 'schedule/changes',
        canActivate: [privilegeGuard(['TEACHER', 'HEAD'])],
        loadComponent: () => import('./schedule/changes-page').then((m) => m.ChangesPage),
      },
      { path: 'homework', loadComponent: () => import('./homework/homework-page').then((m) => m.HomeworkPage) },
      { path: 'notes', loadComponent: () => import('./notes/notes-page').then((m) => m.NotesPage) },
      {
        path: 'notes/new',
        canActivate: [privilegeGuard(['TRUSTED', 'TEACHER', 'HEAD'], true)],
        loadComponent: () => import('./notes/note-editor').then((m) => m.NoteEditorPage),
      },
      { path: 'notes/:id', loadComponent: () => import('./notes/note-view').then((m) => m.NoteViewPage) },
      {
        path: 'notes/:id/edit',
        canActivate: [privilegeGuard(['TRUSTED', 'TEACHER', 'HEAD'], true)],
        loadComponent: () => import('./notes/note-editor').then((m) => m.NoteEditorPage),
      },
      {
        path: 'journal',
        canActivate: [privilegeGuard(['TEACHER', 'HEAD'])],
        loadComponent: () => import('./gradebook/journal-page').then((m) => m.JournalPage),
      },
      {
        path: 'diary',
        canActivate: [privilegeGuard(['STUDENT', 'PARENT'])],
        loadComponent: () => import('./gradebook/diary-page').then((m) => m.DiaryPage),
      },
      { path: 'attendance', loadComponent: () => import('./attendance/attendance-page').then((m) => m.AttendancePage) },
      {
        path: 'classes',
        canActivate: [privilegeGuard(['HEAD'], true)],
        loadComponent: () => import('./people/classes-page').then((m) => m.ClassesPage),
      },
      {
        path: 'classes/:id',
        canActivate: [privilegeGuard(['TEACHER', 'HEAD'], true)],
        loadComponent: () => import('./people/class-page').then((m) => m.ClassPage),
      },
      {
        path: 'people',
        canActivate: [privilegeGuard(['HEAD'])],
        loadComponent: () => import('./people/people-page').then((m) => m.PeoplePage),
      },
      {
        path: 'catalog',
        canActivate: [privilegeGuard(['HEAD'])],
        loadComponent: () => import('./people/catalog-page').then((m) => m.CatalogPage),
      },
      {
        path: 'tests',
        canActivate: [privilegeGuard(['TEACHER', 'HEAD'])],
        children: [
          { path: '', loadComponent: () => import('./tests/tests-list').then((m) => m.TestsListPage) },
          { path: 'new', loadComponent: () => import('./tests/test-edit').then((m) => m.TestEditPage) },
          { path: 'assignments', loadComponent: () => import('./tests/assignments-list').then((m) => m.AssignmentsListPage) },
          { path: 'assignments/:id', loadComponent: () => import('./tests/assignment-page').then((m) => m.AssignmentPage) },
          { path: 'works/:id', loadComponent: () => import('./tests/work-page').then((m) => m.WorkPage) },
          { path: 'grades', loadComponent: () => import('./tests/grades-page').then((m) => m.GradesPage) },
          { path: ':id', loadComponent: () => import('./tests/test-view').then((m) => m.TestViewPage) },
          { path: ':id/edit', loadComponent: () => import('./tests/test-edit').then((m) => m.TestEditPage) },
        ],
      },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.SettingsPage) },
    ],
  },
  { path: '**', loadComponent: () => import('./pages/not-found').then((m) => m.NotFoundPage) },
];

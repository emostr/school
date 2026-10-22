import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { Privilege } from './types';

async function ensureLoaded(auth: Auth) {
  if (!auth.ready()) {
    try {
      await auth.load();
    } catch {
      return null;
    }
  }
  return auth.profile();
}

/** Учебная часть: вошёл, настроен и не администратор. */
export const memberGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const profile = await ensureLoaded(auth);
  if (!profile) return router.parseUrl('/login');
  if (profile.setupStep !== 'done') return router.parseUrl('/setup');
  if (profile.isAdmin) return router.parseUrl('/admin');
  return true;
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const profile = await ensureLoaded(auth);
  if (!profile) return router.parseUrl('/login');
  if (profile.setupStep !== 'done') return router.parseUrl('/setup');
  if (!profile.isAdmin) return router.parseUrl('/');
  return true;
};

export const setupGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const profile = await ensureLoaded(auth);
  if (!profile) return router.parseUrl('/login');
  if (profile.setupStep === 'done') return router.parseUrl(auth.home());
  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  const profile = await ensureLoaded(auth);
  return profile ? router.parseUrl(auth.home()) : true;
};

/** Экран для обладателей одной из привилегий (или классных руководителей). */
export function privilegeGuard(privileges: Privilege[], allowHomeroom = false): CanActivateFn {
  return async () => {
    const auth = inject(Auth);
    const router = inject(Router);
    // Guard'ы одного маршрута идут параллельно: профиль мог ещё не загрузиться.
    await ensureLoaded(auth);
    const ok = privileges.some((privilege) => auth.has(privilege)) || (allowHomeroom && auth.isHomeroom());
    return ok || router.parseUrl('/');
  };
}

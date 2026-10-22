import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Auth } from './auth';

/**
 * Сессия кончилась (401) — на вход; учётная запись не настроена (423) —
 * на экран настройки. Запросы самого входа не трогаем: там 401 — это
 * просто неверный пароль.
 */
export const sessionInterceptor: HttpInterceptorFn = (request, next) => {
  const router = inject(Router);
  const auth = inject(Auth);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && !request.url.includes('/api/auth/login')) {
        if (error.status === 401 && !request.url.endsWith('/api/auth/me')) {
          auth.profile.set(null);
          void router.navigateByUrl('/login');
        }
        if (error.status === 423) {
          void auth.load().then(() => router.navigateByUrl('/setup'));
        }
      }
      return throwError(() => error);
    }),
  );
};

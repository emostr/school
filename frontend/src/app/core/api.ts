import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

type Params = Record<string, string | number | boolean | null | undefined>;

function toParams(params?: Params): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      result = result.set(key, String(value));
    }
  }
  return result;
}

/**
 * Обёртка над HttpClient: все запросы идут на /api того же домена с cookie
 * сессии и возвращают Promise — со строгими сигналами в компонентах так
 * короче, чем подписки.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  get<T>(path: string, params?: Params): Promise<T> {
    return firstValueFrom(this.http.get<T>(`/api${path}`, { params: toParams(params), withCredentials: true }));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(`/api${path}`, body, { withCredentials: true }));
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.put<T>(`/api${path}`, body, { withCredentials: true }));
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(`/api${path}`, body, { withCredentials: true }));
  }

  delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(`/api${path}`, { withCredentials: true }));
  }

  upload<T>(path: string, files: File[] | FileList, field = 'files'): Promise<T> {
    const form = new FormData();
    for (const file of Array.from(files)) {
      form.append(field, file, file.name);
    }
    return firstValueFrom(this.http.post<T>(`/api${path}`, form, { withCredentials: true }));
  }

  text(path: string, params?: Params): Promise<string> {
    return firstValueFrom(
      this.http.get(`/api${path}`, { params: toParams(params), withCredentials: true, responseType: 'text' }),
    );
  }
}

/** Человеческий текст ошибки: сервер всегда кладёт его в message. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Нет связи с сервером. Проверьте интернет';
    }
    const message = (error.error as { message?: unknown } | null)?.message;
    if (typeof message === 'string' && message) {
      return message;
    }
    if (error.status >= 500) {
      return 'Сервер не смог выполнить запрос. Попробуйте ещё раз';
    }
    return error.statusText || 'Запрос не выполнен';
  }
  return error instanceof Error ? error.message : 'Что-то пошло не так';
}

export function errorStatus(error: unknown): number {
  return error instanceof HttpErrorResponse ? error.status : 0;
}

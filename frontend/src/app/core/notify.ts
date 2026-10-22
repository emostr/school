import { Injectable, inject, signal } from '@angular/core';
import { Auth } from './auth';
import { errorMessage } from './api';

export type Tone = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  tone: Tone;
  title: string;
  message: string;
}

export interface Dialog {
  id: number;
  tone: Tone;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string | null;
  danger: boolean;
  /** Поле ввода — у окна-вопроса «введите…». */
  input: { value: string; placeholder: string; type: 'text' | 'password' | 'url' } | null;
  resolve: (value: boolean) => void;
}

const TITLES: Record<Tone, string> = {
  info: 'К сведению',
  success: 'Готово',
  warning: 'Внимание',
  error: 'Не получилось',
};

/**
 * Уведомления двух видов на выбор пользователя: тосты в правом верхнем углу
 * (по умолчанию) или всплывающее окно-полоса посреди экрана, как сообщения
 * Windows 8. Подтверждения действий всегда идут окном.
 */
@Injectable({ providedIn: 'root' })
export class Notify {
  private readonly auth = inject(Auth);
  private counter = 0;

  readonly toasts = signal<Toast[]>([]);
  readonly dialogs = signal<Dialog[]>([]);

  show(tone: Tone, message: string, title = TITLES[tone], mode = this.auth.notifyMode()): void {
    if (mode === 'popup') {
      void this.open({ tone, title, message, confirmText: 'OK', cancelText: null });
      return;
    }
    const toast: Toast = { id: ++this.counter, tone, title, message };
    this.toasts.update((list) => [...list.slice(-3), toast]);
    setTimeout(() => this.dismiss(toast.id), tone === 'error' ? 8000 : 5000);
  }

  success(message: string, title?: string): void {
    this.show('success', message, title);
  }

  info(message: string, title?: string): void {
    this.show('info', message, title);
  }

  warning(message: string, title?: string): void {
    this.show('warning', message, title);
  }

  error(error: unknown, title?: string): void {
    this.show('error', typeof error === 'string' ? error : errorMessage(error), title);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  confirm(options: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  }): Promise<boolean> {
    return this.open({
      tone: options.danger ? 'warning' : 'info',
      title: options.title,
      message: options.message ?? '',
      confirmText: options.confirmText ?? 'Да',
      cancelText: options.cancelText ?? 'Отмена',
      danger: options.danger ?? false,
    });
  }

  /** Окно с полем ввода. null — человек передумал. */
  async prompt(options: {
    title: string;
    message?: string;
    value?: string;
    placeholder?: string;
    type?: 'text' | 'password' | 'url';
    confirmText?: string;
  }): Promise<string | null> {
    const input = { value: options.value ?? '', placeholder: options.placeholder ?? '', type: options.type ?? 'text' };
    const ok = await this.open({
      tone: 'info',
      title: options.title,
      message: options.message ?? '',
      confirmText: options.confirmText ?? 'OK',
      cancelText: 'Отмена',
      input,
    });
    return ok ? input.value : null;
  }

  private open(options: Omit<Dialog, 'id' | 'resolve' | 'danger' | 'input'> & { danger?: boolean; input?: Dialog['input'] }): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog: Dialog = { id: ++this.counter, danger: false, input: null, ...options, resolve };
      this.dialogs.update((list) => [...list, dialog]);
    });
  }

  close(dialog: Dialog, value: boolean): void {
    this.dialogs.update((list) => list.filter((item) => item.id !== dialog.id));
    dialog.resolve(value);
  }
}

import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Api, errorStatus } from './api';
import { Preferences, Privilege, Profile, Theme } from './types';

const THEME_KEY = 'es-theme';
const NOTIFY_KEY = 'es-notify';

export type LoginResult = { stage: 'session'; profile: Profile } | { stage: 'totp'; ticket: string };

/**
 * Кто вошёл и что ему можно. Права здесь — только для того, чтобы не
 * показывать лишние кнопки; решает всё равно сервер.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly api = inject(Api);

  readonly profile = signal<Profile | null>(null);
  readonly ready = signal(false);

  /** Тема и уведомления действуют и до входа — из прошлого визита. */
  readonly theme = signal<Theme>(readLocal(THEME_KEY) === 'light' ? 'light' : 'dark');
  readonly notifyMode = signal<Preferences['notify']>(readLocal(NOTIFY_KEY) === 'popup' ? 'popup' : 'toast');

  readonly isAdmin = computed(() => Boolean(this.profile()?.isAdmin));
  readonly isHead = computed(() => this.has('HEAD'));
  readonly isTeacher = computed(() => this.has('TEACHER'));
  readonly isStaff = computed(() => this.has('TEACHER') || this.has('HEAD'));
  readonly isStudent = computed(() => this.has('STUDENT'));
  readonly isTrusted = computed(() => this.has('TRUSTED'));
  readonly canPublish = computed(() => this.isStaff() || this.isTrusted() || this.homeroomIds().length > 0);
  readonly homeroomIds = computed(() => this.profile()?.homeroomClasses.map((item) => item.id) ?? []);
  readonly isHomeroom = computed(() => this.homeroomIds().length > 0);
  readonly setupStep = computed(() => this.profile()?.setupStep ?? 'done');

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.setAttribute('data-theme', theme);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121212' : '#f0f0f0');
      writeLocal(THEME_KEY, theme);
    });
    effect(() => writeLocal(NOTIFY_KEY, this.notifyMode()));
  }

  has(privilege: Privilege): boolean {
    return Boolean(this.profile()?.privileges.includes(privilege));
  }

  async load(): Promise<Profile | null> {
    try {
      this.setProfile(await this.api.get<Profile>('/auth/me'));
    } catch (error) {
      if (errorStatus(error) === 401) {
        this.profile.set(null);
      } else {
        throw error;
      }
    } finally {
      this.ready.set(true);
    }
    return this.profile();
  }

  setProfile(profile: Profile | null): void {
    this.profile.set(profile);
    if (profile) {
      this.theme.set(profile.preferences.theme);
      this.notifyMode.set(profile.preferences.notify);
    }
  }

  async login(login: string, password: string): Promise<LoginResult> {
    const result = await this.api.post<LoginResult>('/auth/login', { login, password });
    if (result.stage === 'session') {
      this.setProfile(result.profile);
    }
    return result;
  }

  async loginTotp(ticket: string, code: string): Promise<Profile> {
    const result = await this.api.post<{ profile: Profile }>('/auth/login/totp', { ticket, code });
    this.setProfile(result.profile);
    return result.profile;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } finally {
      this.profile.set(null);
    }
  }

  /** Тема и уведомления меняются сразу, а на сервер уходят следом. */
  async savePreferences(patch: Partial<Preferences>): Promise<void> {
    if (patch.theme) this.theme.set(patch.theme);
    if (patch.notify) this.notifyMode.set(patch.notify);
    if (this.profile()) {
      this.setProfile(await this.api.patch<Profile>('/auth/preferences', patch));
    }
  }

  /** Куда вести после входа. */
  home(): string {
    const profile = this.profile();
    if (!profile) return '/login';
    if (profile.setupStep !== 'done') return '/setup';
    return profile.isAdmin ? '/admin' : '/';
  }
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Приватный режим: тема просто не запомнится между визитами.
  }
}

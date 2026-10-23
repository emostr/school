import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../core/auth';
import { School } from '../core/school';
import { Notify } from '../core/notify';
import { formatDayLong } from '../core/dates';
import { Icon } from '../ui/icon';
import { Avatar } from '../ui/avatar';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  exact?: boolean;
}

/**
 * Оболочка: тёмный рельс слева (на телефоне — выезжающее меню) и рабочее
 * поле. Пункты меню собираются из привилегий: завуч, который ещё и ведёт
 * уроки, видит и то, и другое.
 */
@Component({
  selector: 'es-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh">
      <!-- Рельс навигации -->
      <aside
        class="es-no-print fixed inset-y-0 left-0 z-50 flex w-[240px] flex-col bg-rail text-white transition-transform duration-200 lg:translate-x-0"
        [class.-translate-x-full]="!menuOpen()"
      >
        <a [routerLink]="isAdmin() ? '/admin' : '/'" class="flex items-center gap-3 px-5 pt-6 pb-5" (click)="menuOpen.set(false)">
          <span class="grid h-9 w-9 shrink-0 grid-cols-2 gap-[3px] bg-accent p-[7px]">
            <span class="bg-white"></span><span class="bg-white/70"></span><span class="bg-white/70"></span><span class="bg-white/45"></span>
          </span>
          <span class="min-w-0">
            <span class="block text-[17px] leading-tight font-semibold">edway.space</span>
            <span class="block truncate text-xs text-white/55">{{ schoolName() }}</span>
          </span>
        </a>

        @if (auth.isParent()) {
          <div class="mx-4 mb-2 border border-white/15 p-2">
            <label class="block px-1 text-[11px] font-semibold text-white/50" for="child-switch">смотрю за</label>
            @if (auth.children().length > 1) {
              <select id="child-switch" class="mt-1 w-full border-0 bg-transparent px-1 py-0.5 text-sm text-white outline-none [&>option]:text-black" [value]="auth.child()?.accountId" (change)="switchChild($event)">
                @for (child of auth.children(); track child.accountId) {
                  <option [value]="child.accountId">{{ child.firstName }}{{ child.className ? ', ' + child.className : '' }}</option>
                }
              </select>
            } @else {
              <p id="child-switch" class="mt-0.5 px-1 text-sm">{{ auth.child()?.fullName }}{{ auth.child()?.className ? ', ' + auth.child()?.className : '' }}</p>
            }
          </div>
        }

        <nav class="flex-1 overflow-y-auto py-2">
          @for (item of nav(); track item.link) {
            <a
              [routerLink]="item.link"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
              class="nav-item"
              (click)="menuOpen.set(false)"
            >
              <es-icon [name]="item.icon" [size]="20" [stroke]="1.8" />
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="border-t border-white/10 p-3">
          <a [routerLink]="isAdmin() ? '/admin/settings' : '/settings'" class="flex items-center gap-3 p-2 hover:bg-white/8" (click)="menuOpen.set(false)">
            <es-avatar [name]="profile()?.fullName ?? ''" [size]="36" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold">{{ shortName() }}</span>
              <span class="block truncate text-xs text-white/55">{{ roleLabel() }}</span>
            </span>
          </a>
          <button type="button" class="mt-1 flex w-full items-center gap-3 px-2 py-2 text-sm text-white/70 hover:bg-white/8 hover:text-white" (click)="logout()">
            <es-icon name="logout" [size]="18" />
            выйти
          </button>
        </div>
      </aside>

      @if (menuOpen()) {
        <div class="animate-fade-in fixed inset-0 z-40 bg-black/60 lg:hidden" (click)="menuOpen.set(false)"></div>
      }

      <!-- Рабочее поле -->
      <div class="flex min-w-0 flex-1 flex-col lg:pl-[240px] print:!pl-0">
        <header class="es-no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/95 px-4 backdrop-blur lg:hidden">
          <button type="button" class="es-btn es-btn-ghost es-btn-icon -ml-2" aria-label="Меню" (click)="menuOpen.set(true)">
            <es-icon name="menu" />
          </button>
          <span class="text-lg font-light">edway.space</span>
        </header>
        <div class="es-no-print hidden h-10 items-center justify-end px-10 pt-4 text-sm text-faint lg:flex">
          {{ todayLabel() }}
        </div>
        <main class="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-4 pb-16 sm:px-6 lg:px-10 lg:pt-2">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: `
    .nav-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 22px;
      color: rgb(255 255 255 / 0.7);
      font-size: 15px;
      transition: background-color 0.12s, color 0.12s;
    }
    .nav-item:hover {
      background: rgb(255 255 255 / 0.07);
      color: #fff;
    }
    .nav-item.is-active {
      color: #fff;
      background: rgb(255 255 255 / 0.06);
    }
    .nav-item.is-active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: var(--es-accent);
    }
  `,
})
export class Shell {
  protected readonly auth = inject(Auth);
  private readonly school = inject(School);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly profile = this.auth.profile;
  protected readonly isAdmin = this.auth.isAdmin;

  protected readonly schoolName = computed(
    () => this.school.info()?.shortName || this.school.info()?.name || (this.isAdmin() ? 'администрирование' : ''),
  );
  protected readonly todayLabel = computed(() => formatDayLong(this.school.today()));
  protected readonly shortName = computed(() => {
    const p = this.profile();
    return p ? [p.lastName, p.firstName].filter(Boolean).join(' ') || p.fullName : '';
  });

  protected readonly roleLabel = computed(() => {
    const p = this.profile();
    if (!p) return '';
    if (p.isAdmin) return 'системный администратор';
    const parts: string[] = [];
    if (p.privileges.includes('HEAD')) parts.push('завуч');
    if (p.privileges.includes('TEACHER')) parts.push('учитель');
    if (p.homeroomClasses.length) parts.push(`классный руководитель ${p.homeroomClasses.map((c) => c.name).join(', ')}`);
    if (p.privileges.includes('STUDENT')) {
      parts.push(`${p.privileges.includes('TRUSTED') ? 'доверенный ученик' : 'ученик'}${p.studentClass ? ` ${p.studentClass.name}` : ''}`);
    }
    if (p.privileges.includes('PARENT')) {
      parts.push('родитель');
    }
    return parts.join(' · ');
  });

  protected readonly nav = computed<NavItem[]>(() => {
    if (this.isAdmin()) {
      return [
        { label: 'школа', icon: 'school', link: '/admin', exact: true },
        { label: 'завучи и доступ', icon: 'shield', link: '/admin/people' },
        { label: 'система', icon: 'monitor', link: '/admin/system' },
      ];
    }
    const items: NavItem[] = [
      { label: 'главная', icon: 'home', link: '/', exact: true },
      { label: 'расписание', icon: 'calendar', link: '/schedule' },
      { label: 'задания', icon: 'clipboard', link: '/homework' },
      { label: 'конспекты', icon: 'book', link: '/notes' },
    ];
    if (this.auth.isStaff() || this.auth.isLearner()) {
      items.push({ label: 'посещаемость', icon: 'userCheck', link: '/attendance' });
    }
    if (this.auth.isLearner()) {
      items.push({ label: 'оценки', icon: 'award', link: '/diary' });
    }
    if (this.auth.isStaff()) {
      items.push({ label: 'журнал', icon: 'table', link: '/journal' });
    }
    if (this.auth.isStaff()) {
      items.push({ label: 'тесты', icon: 'clipboardCheck', link: '/tests' });
    }
    if (this.auth.isHead() || this.auth.isHomeroom()) {
      items.push({ label: 'классы', icon: 'graduation', link: '/classes' });
    }
    if (this.auth.isHead()) {
      items.push({ label: 'люди', icon: 'users', link: '/people' });
      items.push({ label: 'справочники', icon: 'layers', link: '/catalog' });
    }
    return items;
  });

  constructor() {
    void this.school.loadInfo().catch(() => undefined);
  }

  protected switchChild(event: Event): void {
    this.auth.selectChild((event.target as HTMLSelectElement).value);
    // Страница перечитает данные уже за другого ребёнка.
    void this.router.navigateByUrl(this.router.url.split('?')[0] === '/' ? '/' : this.router.url.split('?')[0]);
  }

  protected async logout(): Promise<void> {
    const ok = await this.notify.confirm({ title: 'Выйти из edway.space?', confirmText: 'Выйти' });
    if (!ok) return;
    await this.auth.logout().catch(() => undefined);
    this.school.reset();
    await this.router.navigateByUrl('/login');
  }
}

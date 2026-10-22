import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { formatDay } from '../core/dates';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { Flyout } from '../ui/flyout';
import { TestsNav } from './tests-nav';
import { Colleague, TestDetail, TestSummary } from './test-types';

type Tab = 'all' | 'mine' | 'shared' | 'drafts';

@Component({
  selector: 'es-tests-list',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, Empty, Flyout, TestsNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="тесты" subtitle="Ваши проверочные работы и то, чем поделились коллеги">
      <ng-container page-actions>
        <a routerLink="/tests/new" class="es-btn es-btn-primary"><es-icon name="plus" [size]="18" /> создать тест</a>
      </ng-container>
      <es-tests-nav />

      <div class="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div class="flex gap-1">
          @for (item of tabs(); track item.value) {
            <button type="button" class="es-btn es-btn-sm" [class.es-btn-primary]="tab() === item.value" (click)="tab.set(item.value)">{{ item.label }} · {{ item.count }}</button>
          }
        </div>
        <div class="relative min-w-[220px] flex-1 sm:max-w-sm">
          <es-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input class="es-input pl-9" placeholder="поиск по названию" [ngModel]="search()" (ngModelChange)="search.set($event)" />
        </div>
      </div>

      @if (loading()) {
        <es-dots class="my-10" />
      } @else if (!visible().length) {
        <es-empty icon="clipboard" title="Тестов нет" text="Соберите работу в конструкторе: задания с формулами и картинками, ключи проверки и шкала оценок.">
          <a routerLink="/tests/new" class="es-btn es-btn-primary">создать тест</a>
        </es-empty>
      } @else {
        <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          @for (test of visible(); track test.id) {
            <article class="flex flex-col bg-surface" [class.border-l-4]="!test.isPublished" [class.border-line-strong]="!test.isPublished">
              <div class="flex-1 p-5">
                <div class="mb-3 flex flex-wrap gap-1.5">
                  @if (!test.mine) {
                    <span class="es-badge es-badge-info">от {{ test.ownerName.split(' ')[0] }}</span>
                  }
                  <span class="es-badge" [class.es-badge-success]="test.isPublished">{{ test.isPublished ? 'опубликован' : 'черновик' }}</span>
                  @if (test.sharedWith > 0 && test.mine) {
                    <span class="es-badge es-badge-accent">общий · {{ test.sharedWith }}</span>
                  }
                  @if (test.variantCount > 1) {
                    <span class="es-badge">{{ test.variantCount }} вар.</span>
                  }
                </div>
                <a [routerLink]="['/tests', test.id]" class="group block">
                  <h3 class="text-lg leading-snug font-light group-hover:text-accent-hover">{{ test.title }}</h3>
                </a>
                @if (test.description) {
                  <p class="mt-2 line-clamp-3 text-sm text-muted">{{ test.description }}</p>
                }
              </div>
              <div class="flex flex-wrap items-center gap-1 border-t border-line px-3 py-2">
                <span class="mr-auto flex items-center gap-3 px-2 text-xs text-faint">
                  <span class="flex items-center gap-1" title="Заданий"><es-icon name="list" [size]="13" /> {{ test.questionCount }}</span>
                  <span class="flex items-center gap-1" title="Баллов"><es-icon name="target" [size]="13" /> {{ test.maxScore }}</span>
                  <span class="flex items-center gap-1" title="Назначений"><es-icon name="calendar" [size]="13" /> {{ test.assignmentCount }}</span>
                  <span>{{ day(test.updatedAt) }}</span>
                </span>
                @if (test.canEdit) {
                  <a [routerLink]="['/tests', test.id, 'edit']" class="es-btn es-btn-ghost es-btn-sm es-btn-icon" title="Редактировать"><es-icon name="edit" [size]="16" /></a>
                }
                <button type="button" class="es-btn es-btn-ghost es-btn-sm es-btn-icon" title="Сделать копию" (click)="duplicate(test)"><es-icon name="copy" [size]="16" /></button>
                @if (test.canEdit) {
                  <button type="button" class="es-btn es-btn-ghost es-btn-sm es-btn-icon" [title]="test.isPublished ? 'Снять с публикации' : 'Опубликовать'" (click)="togglePublish(test)">
                    <es-icon [name]="test.isPublished ? 'slash' : 'send'" [size]="16" />
                  </button>
                }
                @if (test.mine) {
                  <button type="button" class="es-btn es-btn-ghost es-btn-sm es-btn-icon" title="Поделиться" (click)="openShare(test)"><es-icon name="users" [size]="16" /></button>
                  <button type="button" class="es-btn es-btn-ghost es-btn-sm es-btn-icon hover:!text-danger" title="Удалить" (click)="remove(test)"><es-icon name="trash" [size]="16" /></button>
                }
                @if (test.isPublished) {
                  <a routerLink="/tests/assignments" [queryParams]="{ testId: test.id }" class="es-btn es-btn-sm ml-1">назначить</a>
                }
              </div>
            </article>
          }
        </div>
      }
    </es-page>

    <es-flyout [open]="!!shareTest()" title="доступ коллегам" [subtitle]="shareTest()?.title ?? ''" [width]="560" (closed)="shareTest.set(null)">
      @if (shareTest(); as t) {
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div class="flex-1">
            <label class="es-label" for="share-target">учитель</label>
            <select id="share-target" class="es-select" [(ngModel)]="shareTarget">
              <option [ngValue]="''" disabled>{{ free().length ? 'выберите коллегу' : 'все коллеги уже добавлены' }}</option>
              @for (colleague of free(); track colleague.id) {
                <option [ngValue]="colleague.id">{{ colleague.fullName }}{{ colleague.subject ? ' · ' + colleague.subject : '' }}</option>
              }
            </select>
          </div>
          <button type="button" class="es-btn es-btn-primary" (click)="addShare()"><es-icon name="plus" [size]="18" /> добавить</button>
        </div>
        <label class="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" class="es-check" [(ngModel)]="shareEdit" /> разрешить править тест</label>

        <div class="mt-6 border-t border-line pt-4">
          <p class="es-label">уже открыт</p>
          @for (share of t.shares; track share.teacherId) {
            <div class="flex items-center justify-between gap-3 border-b border-line py-2.5">
              <div class="min-w-0">
                <p class="truncate font-semibold">{{ share.fullName }}</p>
                <p class="text-xs text-muted">{{ share.login }}{{ share.subject ? ' · ' + share.subject : '' }}</p>
              </div>
              <span class="es-badge" [class.es-badge-accent]="share.canEdit">{{ share.canEdit ? 'может править' : 'только смотрит' }}</span>
              <button type="button" class="es-btn es-btn-ghost es-btn-sm es-btn-icon hover:!text-danger" title="Закрыть доступ" (click)="revokeShare(share.teacherId)"><es-icon name="close" [size]="16" /></button>
            </div>
          } @empty {
            <p class="text-sm text-muted">Пока тест виден только вам.</p>
          }
          <p class="es-hint mt-3">Оценки по тесту видит лишь тот, кто проводил работу.</p>
        </div>
      }
    </es-flyout>
  `,
})
export class TestsListPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);

  protected readonly rows = signal<TestSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly tab = signal<Tab>('all');
  protected readonly search = signal('');
  protected readonly shareTest = signal<TestDetail | null>(null);
  protected readonly colleagues = signal<Colleague[]>([]);
  protected shareTarget = '';
  protected shareEdit = false;

  protected readonly tabs = computed(() => {
    const rows = this.rows();
    return [
      { value: 'all' as Tab, label: 'все', count: rows.length },
      { value: 'mine' as Tab, label: 'мои', count: rows.filter((row) => row.mine).length },
      { value: 'shared' as Tab, label: 'общие', count: rows.filter((row) => !row.mine).length },
      { value: 'drafts' as Tab, label: 'черновики', count: rows.filter((row) => !row.isPublished).length },
    ];
  });

  protected readonly visible = computed(() => {
    let list = this.rows();
    const tab = this.tab();
    if (tab === 'mine') list = list.filter((row) => row.mine);
    if (tab === 'shared') list = list.filter((row) => !row.mine);
    if (tab === 'drafts') list = list.filter((row) => !row.isPublished);
    const needle = this.search().trim().toLowerCase();
    return needle ? list.filter((row) => row.title.toLowerCase().includes(needle)) : list;
  });

  protected readonly free = computed(() =>
    this.colleagues().filter((colleague) => !this.shareTest()?.shares.some((share) => share.teacherId === colleague.id)),
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.rows.set(await this.api.get<TestSummary[]>('/tests'));
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось загрузить тесты');
    } finally {
      this.loading.set(false);
    }
  }

  protected day(iso: string): string {
    return formatDay(iso.slice(0, 10));
  }

  protected async duplicate(test: TestSummary): Promise<void> {
    try {
      const copy = await this.api.post<TestSummary>(`/tests/${test.id}/duplicate`, {});
      this.notify.success('Копия создана');
      await this.router.navigate(['/tests', copy.id, 'edit']);
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось скопировать');
    }
  }

  protected async togglePublish(test: TestSummary): Promise<void> {
    try {
      await this.api.post(`/tests/${test.id}/${test.isPublished ? 'unpublish' : 'publish'}`);
      await this.load();
      this.notify.success(test.isPublished ? 'Тест снят с публикации' : 'Тест опубликован');
    } catch (error) {
      this.notify.error(errorMessage(error));
    }
  }

  protected async remove(test: TestSummary): Promise<void> {
    const ok = await this.notify.confirm({
      title: `Удалить «${test.title}»?`,
      message: test.assignmentCount
        ? 'По тесту есть назначения — оценки в журнале останутся, но назначить его снова будет нельзя.'
        : 'Тест исчезнет из списка.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/tests/${test.id}`);
      await this.load();
      this.notify.success('Тест удалён');
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось удалить');
    }
  }

  protected async openShare(test: TestSummary): Promise<void> {
    try {
      const [detail, list] = await Promise.all([
        this.api.get<TestDetail>(`/tests/${test.id}`),
        this.api.get<Colleague[]>('/auth/colleagues'),
      ]);
      this.colleagues.set(list);
      this.shareTarget = '';
      this.shareEdit = false;
      this.shareTest.set(detail);
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось открыть доступ');
    }
  }

  protected async addShare(): Promise<void> {
    const test = this.shareTest();
    if (!test || !this.shareTarget) {
      this.notify.warning('Выберите коллегу из списка');
      return;
    }
    try {
      this.shareTest.set(await this.api.post<TestDetail>(`/tests/${test.id}/share`, { teacherId: this.shareTarget, canEdit: this.shareEdit }));
      this.shareTarget = '';
      await this.load();
      this.notify.success('Доступ открыт');
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось поделиться');
    }
  }

  protected async revokeShare(teacherId: string): Promise<void> {
    const test = this.shareTest();
    if (!test) return;
    try {
      this.shareTest.set(await this.api.delete<TestDetail>(`/tests/${test.id}/share/${teacherId}`));
      await this.load();
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось закрыть доступ');
    }
  }
}

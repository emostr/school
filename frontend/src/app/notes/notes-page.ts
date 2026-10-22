import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { formatDay } from '../core/dates';
import { NoteSummary } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';

@Component({
  selector: 'es-notes-page',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, Empty],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="конспекты" [subtitle]="className()">
      @if (auth.canPublish()) {
        <ng-container page-actions>
          <a routerLink="/notes/new" [queryParams]="{ class: classId() }" class="es-btn es-btn-primary"><es-icon name="plus" [size]="18" /> новый конспект</a>
        </ng-container>
      }

      <div class="mb-6 flex flex-wrap items-center gap-3">
        @if (auth.isStaff()) {
          <select class="es-select w-auto min-w-[120px]" [ngModel]="classId()" (ngModelChange)="navigate({ class: $event })" aria-label="Класс">
            <option [ngValue]="''" disabled>класс</option>
            @for (item of school.classes(); track item.id) {
              <option [ngValue]="item.id">{{ item.name }}</option>
            }
          </select>
        }
        <select class="es-select w-auto min-w-[200px]" [ngModel]="subjectId()" (ngModelChange)="navigate({ subject: $event })" aria-label="Предмет">
          <option [ngValue]="''">все предметы</option>
          @for (subject of school.subjects(); track subject.id) {
            <option [ngValue]="subject.id">{{ subject.name }}</option>
          }
        </select>
        <div class="relative min-w-[220px] flex-1 sm:max-w-sm">
          <es-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input class="es-input pl-9" placeholder="поиск по названию и тексту" [ngModel]="search()" (ngModelChange)="search.set($event)" (keyup.enter)="navigate({ q: search() })" />
        </div>
      </div>

      @if (!classId()) {
        <es-empty icon="book" title="Выберите класс" />
      } @else if (loading()) {
        <es-dots class="my-10" />
      } @else {
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          @for (note of notes(); track note.id) {
            <a [routerLink]="['/notes', note.id]" class="group flex min-h-[180px] flex-col bg-surface transition-colors hover:bg-surface-2">
              @if (note.cover) {
                <img [src]="note.cover.url" alt="" class="h-36 w-full object-cover" loading="lazy" />
              } @else {
                <div class="h-1.5 bg-accent"></div>
              }
              <div class="flex flex-1 flex-col p-4">
                <p class="text-xs font-semibold text-accent-hover">{{ note.subject.name }} · {{ day(note.date) }}</p>
                <h2 class="mt-1 text-lg leading-snug font-light group-hover:text-accent-hover">{{ note.title }}</h2>
                @if (note.excerpt) {
                  <p class="mt-2 line-clamp-3 text-sm text-muted">{{ note.excerpt }}</p>
                }
                <p class="mt-auto flex items-center gap-3 pt-3 text-xs text-faint">
                  <span class="truncate">{{ note.author?.fullName }}</span>
                  @if (note.attachmentCount) {
                    <span class="ml-auto flex shrink-0 items-center gap-1"><es-icon name="paperclip" [size]="13" />{{ note.attachmentCount }}</span>
                  }
                </p>
              </div>
            </a>
          } @empty {
            <div class="col-span-full">
              <es-empty icon="book" title="Конспектов пока нет" text="Конспект можно набрать в редакторе с формулами или просто приложить фото доски и PDF." />
            </div>
          }
        </div>
      }
    </es-page>
  `,
})
export class NotesPage {
  protected readonly auth = inject(Auth);
  protected readonly school = inject(School);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly query = signal<Record<string, string>>({});
  protected readonly notes = signal<NoteSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly search = signal('');

  protected readonly classId = computed(
    () => this.query()['class'] || this.auth.profile()?.studentClass?.id || this.auth.homeroomIds()[0] || '',
  );
  protected readonly subjectId = computed(() => this.query()['subject'] ?? '');
  protected readonly className = computed(() => this.school.classes().find((item) => item.id === this.classId())?.name ?? '');

  constructor() {
    void this.school.loadClasses().catch(() => undefined);
    void this.school.loadSubjects().catch(() => undefined);
    this.route.queryParamMap.subscribe((params) => {
      this.query.set(Object.fromEntries(params.keys.map((key) => [key, params.get(key) ?? ''])));
      this.search.set(params.get('q') ?? '');
    });
    effect(() => {
      const query = this.query();
      const classId = this.classId();
      untracked(() => void this.load(classId, query['subject'] ?? '', query['q'] ?? ''));
    });
  }

  protected navigate(params: Record<string, string>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  private async load(classId: string, subjectId: string, search: string): Promise<void> {
    if (!classId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      this.notes.set(await this.api.get<NoteSummary[]>('/notes', { classId, subjectId, search }));
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.loading.set(false);
    }
  }

  protected day(date: string): string {
    return formatDay(date);
  }
}

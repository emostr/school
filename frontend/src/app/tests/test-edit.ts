import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { BuilderState, TestBuilder, emptyState, toPayload } from './test-builder';
import { TestDetail } from './test-types';

/** Создание и правка теста — одна страница с конструктором. */
@Component({
  selector: 'es-test-edit',
  imports: [RouterLink, Page, Icon, Dots, TestBuilder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page [title]="id() ? 'правка теста' : 'новый тест'" [subtitle]="subtitle()">
      <ng-container page-actions>
        <a [routerLink]="id() ? ['/tests', id()] : ['/tests']" class="es-btn es-btn-ghost"><es-icon name="arrowLeft" [size]="18" /> {{ id() ? 'отмена' : 'к списку' }}</a>
        @if (id()) {
          <button type="button" class="es-btn es-btn-primary" [disabled]="saving()" (click)="save(false)"><es-icon name="save" [size]="18" /> сохранить</button>
        } @else {
          <button type="button" class="es-btn" [disabled]="saving()" (click)="save(false)"><es-icon name="save" [size]="18" /> сохранить черновик</button>
          <button type="button" class="es-btn es-btn-primary" [disabled]="saving()" (click)="save(true)"><es-icon name="send" [size]="18" /> опубликовать</button>
        }
      </ng-container>
      @if (state(); as s) {
        <es-test-builder [state]="s" (stateChange)="state.set($event)" />
      } @else {
        <es-dots class="my-10" />
      }
    </es-page>
  `,
})
export class TestEditPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);

  readonly id = input<string>();
  protected readonly state = signal<BuilderState | null>(null);
  protected readonly saving = signal(false);
  protected readonly subtitle = signal('Задания, ключи проверки и шкала оценок');

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string | undefined): Promise<void> {
    if (!id) {
      this.state.set(emptyState());
      return;
    }
    try {
      const data = await this.api.get<TestDetail>(`/tests/${id}`);
      if (data.assignmentCount > 0) {
        this.subtitle.set('У теста есть назначения: уже выданные работы правка не затронет — они держат снимок теста');
      }
      this.state.set({
        title: data.title,
        description: data.description,
        instructions: data.instructions,
        gradeScale: data.gradeScale,
        variantCount: data.variantCount,
        questions: data.questions,
      });
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось открыть тест');
      await this.router.navigateByUrl('/tests');
    }
  }

  protected async save(publish: boolean): Promise<void> {
    const state = this.state();
    if (!state) return;
    if (!state.title.trim()) {
      this.notify.warning('Дайте тесту название');
      return;
    }
    this.saving.set(true);
    try {
      const id = this.id();
      if (id) {
        await this.api.put(`/tests/${id}`, toPayload(state));
        this.notify.success('Изменения сохранены');
        await this.router.navigate(['/tests', id]);
      } else {
        const created = await this.api.post<TestDetail>('/tests', toPayload(state));
        if (publish) {
          await this.api.post(`/tests/${created.id}/publish`);
        }
        this.notify.success(publish ? 'Тест опубликован' : 'Черновик сохранён');
        await this.router.navigate(['/tests', created.id]);
      }
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось сохранить');
    } finally {
      this.saving.set(false);
    }
  }
}

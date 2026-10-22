import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { Notify } from '../core/notify';
import { formatDateTime, formatDayLong } from '../core/dates';
import { NoteDetail } from '../core/types';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Rich } from '../ui/rich';
import { AttachmentsView } from '../ui/attachments';

@Component({
  selector: 'es-note-view',
  imports: [RouterLink, Icon, Dots, Rich, AttachmentsView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (note(); as n) {
      <article class="animate-turnstile mx-auto max-w-4xl origin-left">
        <div class="es-no-print mb-6 flex flex-wrap items-center gap-2">
          <a routerLink="/notes" [queryParams]="{ class: n.classId }" class="es-btn es-btn-ghost es-btn-sm -ml-2"><es-icon name="arrowLeft" [size]="16" /> все конспекты</a>
          <span class="flex-1"></span>
          <button type="button" class="es-btn es-btn-sm" (click)="print()"><es-icon name="printer" [size]="16" /> печать</button>
          @if (n.canEdit) {
            <a [routerLink]="['/notes', n.id, 'edit']" class="es-btn es-btn-sm"><es-icon name="edit" [size]="16" /> править</a>
            <button type="button" class="es-btn es-btn-sm es-btn-danger" (click)="remove(n)"><es-icon name="trash" [size]="16" /> удалить</button>
          }
        </div>

        <p class="text-sm font-semibold text-accent-hover">{{ n.subject.name }} · {{ n.className }} · {{ day(n.date) }}{{ n.lessonNumber ? ', ' + n.lessonNumber + '-й урок' : '' }}</p>
        <h1 class="es-title mt-2">{{ n.title }}</h1>
        <p class="mt-3 text-sm text-faint">{{ n.author?.fullName }} · обновлён {{ when(n.updatedAt) }}</p>

        @if (n.kind === 'RICH' && n.content) {
          <div class="mt-8 text-[16px]" [esRich]="n.content"></div>
        }
        @if (n.attachments.length) {
          <es-attachments-view class="mt-8" [items]="n.attachments" [large]="n.kind === 'FILES'" />
        }
      </article>
    } @else {
      <es-dots class="my-16" />
    }
  `,
})
export class NoteViewPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly note = signal<NoteDetail | null>(null);

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    try {
      this.note.set(await this.api.get<NoteDetail>(`/notes/${id}`));
    } catch (error) {
      this.notify.error(error);
      await this.router.navigateByUrl('/notes');
    }
  }

  protected async remove(note: NoteDetail): Promise<void> {
    const ok = await this.notify.confirm({ title: 'Удалить конспект?', message: note.title, confirmText: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await this.api.delete(`/notes/${note.id}`);
      this.notify.success('Конспект удалён');
      await this.router.navigate(['/notes'], { queryParams: { class: note.classId } });
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected print(): void {
    window.print();
  }

  protected day(date: string): string {
    return formatDayLong(date);
  }

  protected when(iso: string): string {
    return formatDateTime(iso);
  }
}

import { ChangeDetectionStrategy, Component, HostListener, computed, inject, input, model, signal } from '@angular/core';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { formatBytes } from '../core/dates';
import { Attachment } from '../core/types';
import { Icon } from './icon';
import { Dots } from './dots';

/** Загрузка фото и PDF: кнопкой или перетаскиванием на поле. */
@Component({
  selector: 'es-attachments-input',
  imports: [Icon, Dots],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="border-2 border-dashed p-3 transition-colors"
      [class]="dragging() ? 'border-accent bg-accent-soft' : 'border-line'"
      (dragover)="$event.preventDefault(); dragging.set(true)"
      (dragleave)="dragging.set(false)"
      (drop)="drop($event)"
    >
      @if (value().length) {
        <ul class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          @for (item of value(); track item.id; let i = $index) {
            <li class="group relative bg-surface-2">
              @if (isImage(item)) {
                <img [src]="item.url" [alt]="item.name" class="aspect-[4/3] w-full object-cover" loading="lazy" />
              } @else {
                <div class="grid aspect-[4/3] place-items-center text-danger"><es-icon name="pdf" [size]="40" [stroke]="1.4" /></div>
              }
              <p class="truncate px-2 py-1 text-xs" [title]="item.name">{{ item.name }}</p>
              <div class="absolute top-1 right-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                @if (i > 0) {
                  <button type="button" class="grid h-7 w-7 place-items-center bg-black/70 text-white" title="Левее" (click)="move(i, -1)"><es-icon name="chevronLeft" [size]="14" /></button>
                }
                <button type="button" class="grid h-7 w-7 place-items-center bg-danger text-white" title="Убрать" (click)="remove(i)"><es-icon name="close" [size]="14" /></button>
              </div>
            </li>
          }
        </ul>
      }
      <div class="flex flex-wrap items-center gap-3">
        <label class="es-btn es-btn-sm cursor-pointer">
          <es-icon name="paperclip" [size]="16" /> {{ label() }}
          <input type="file" class="hidden" multiple [accept]="accept" (change)="pick($event)" />
        </label>
        <span class="text-xs text-faint">фото или PDF, можно перетащить сюда</span>
        @if (busy()) {
          <es-dots [inline]="true" />
        }
      </div>
    </div>
  `,
})
export class AttachmentsInput {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  readonly value = model<Attachment[]>([]);
  readonly label = input('приложить файлы');
  protected readonly accept = 'image/*,application/pdf';
  protected readonly busy = signal(false);
  protected readonly dragging = signal(false);

  protected isImage(item: Attachment): boolean {
    return item.mime.startsWith('image/');
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) void this.upload(Array.from(input.files));
    input.value = '';
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []).filter(
      (file) => file.type.startsWith('image/') || file.type === 'application/pdf',
    );
    if (files.length) void this.upload(files);
  }

  private async upload(files: File[]): Promise<void> {
    this.busy.set(true);
    try {
      const saved = await this.api.upload<Attachment[]>('/attachments', files);
      this.value.update((list) => [...list, ...saved]);
    } catch (error) {
      this.notify.error(errorMessage(error), 'Файл не загрузился');
    } finally {
      this.busy.set(false);
    }
  }

  protected remove(index: number): void {
    this.value.update((list) => list.filter((_, i) => i !== index));
  }

  protected move(index: number, delta: number): void {
    this.value.update((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  }
}

/** Вложения на просмотр: фото плиткой с полноэкранным просмотром, PDF — ссылкой. */
@Component({
  selector: 'es-attachments-view',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (images().length) {
      <div class="grid gap-1.5" [class]="large() ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-3 sm:grid-cols-5'">
        @for (item of images(); track item.id; let i = $index) {
          <button type="button" class="block overflow-hidden bg-surface-2" (click)="open.set(i)">
            <img [src]="item.url" [alt]="item.name" class="w-full object-cover transition-transform hover:scale-[1.02]" [class]="large() ? '' : 'aspect-square'" loading="lazy" />
          </button>
        }
      </div>
    }
    @if (files().length) {
      <div class="mt-2 flex flex-wrap gap-2">
        @for (item of files(); track item.id) {
          <a [href]="item.url" target="_blank" rel="noopener" class="flex items-center gap-2 bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
            <es-icon name="pdf" [size]="22" [stroke]="1.5" class="text-danger" />
            <span class="max-w-[260px] truncate">{{ item.name }}</span>
            <span class="text-xs text-faint">{{ size(item.size) }}</span>
          </a>
        }
      </div>
    }

    @if (open() !== null && images()[open()!]; as item) {
      <div class="animate-fade-in fixed inset-0 z-[85] flex flex-col bg-black/95 text-white" role="dialog" aria-label="Просмотр фото">
        <div class="flex items-center gap-3 px-4 py-3">
          <span class="flex-1 truncate text-sm">{{ item.name }} · {{ open()! + 1 }} из {{ images().length }}</span>
          <a [href]="item.url" target="_blank" rel="noopener" class="es-btn es-btn-sm border-white/40 text-white">оригинал</a>
          <button type="button" class="es-btn es-btn-icon es-btn-ghost text-white" aria-label="Закрыть" (click)="open.set(null)"><es-icon name="close" /></button>
        </div>
        <div class="relative flex min-h-0 flex-1 items-center justify-center p-2">
          <img [src]="item.url" [alt]="item.name" class="max-h-full max-w-full object-contain" />
          @if (images().length > 1) {
            <button type="button" class="absolute top-1/2 left-2 grid h-12 w-12 -translate-y-1/2 place-items-center bg-white/10 hover:bg-white/20" aria-label="Предыдущее" (click)="step(-1)"><es-icon name="chevronLeft" /></button>
            <button type="button" class="absolute top-1/2 right-2 grid h-12 w-12 -translate-y-1/2 place-items-center bg-white/10 hover:bg-white/20" aria-label="Следующее" (click)="step(1)"><es-icon name="chevronRight" /></button>
          }
        </div>
      </div>
    }
  `,
})
export class AttachmentsView {
  readonly items = input<Attachment[]>([]);
  readonly large = input(false);
  protected readonly open = signal<number | null>(null);
  protected readonly images = computed(() => this.items().filter((item) => item.mime.startsWith('image/')));
  protected readonly files = computed(() => this.items().filter((item) => !item.mime.startsWith('image/')));

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected step(delta: number): void {
    const count = this.images().length;
    this.open.update((index) => (index === null ? null : (index + delta + count) % count));
  }

  @HostListener('document:keydown', ['$event'])
  protected key(event: KeyboardEvent): void {
    if (this.open() === null) return;
    if (event.key === 'Escape') this.open.set(null);
    if (event.key === 'ArrowLeft') this.step(-1);
    if (event.key === 'ArrowRight') this.step(1);
  }
}

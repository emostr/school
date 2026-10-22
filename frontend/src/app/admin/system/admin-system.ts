import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Api } from '../../core/api';
import { Notify } from '../../core/notify';
import { formatBytes } from '../../core/dates';
import { SystemInfo } from '../../core/types';
import { Page } from '../../ui/page';
import { Icon } from '../../ui/icon';
import { Dots } from '../../ui/dots';

@Component({
  selector: 'es-admin-system',
  imports: [Page, Icon, Dots],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="система" subtitle="Состояние сервера и объём данных">
      <ng-container page-actions>
        <button type="button" class="es-btn" (click)="load()"><es-icon name="refresh" [size]="18" /> обновить</button>
      </ng-container>
      @if (info(); as i) {
        <div class="grid auto-rows-[120px] grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
          <div class="flex flex-col justify-between p-4 text-white" [class]="i.database === 'ok' ? 'bg-success' : 'bg-danger'">
            <es-icon name="layers" [size]="24" />
            <div><p class="text-sm">база данных</p><p class="text-lg font-light">{{ i.database === 'ok' ? 'работает' : 'недоступна' }} · {{ size(i.databaseSize) }}</p></div>
          </div>
          <div class="flex flex-col justify-between p-4 text-white" [class]="i.ocr === 'ok' ? 'bg-success' : 'bg-warning'">
            <es-icon name="scan" [size]="24" />
            <div><p class="text-sm">распознавание бланков</p><p class="text-lg font-light">{{ i.ocr === 'ok' ? 'tesseract готов' : 'недоступно' }}</p></div>
          </div>
          <div class="flex flex-col justify-between bg-steel p-4 text-white">
            <es-icon name="archive" [size]="24" />
            <div><p class="text-sm">загруженные файлы</p><p class="text-lg font-light">{{ size(i.uploadsSize) }}</p></div>
          </div>
          <div class="flex flex-col justify-between bg-surface-2 p-4">
            <es-icon name="clock" [size]="24" />
            <div><p class="text-sm text-muted">работает без перезапуска</p><p class="text-lg font-light">{{ uptime(i.uptime) }}</p></div>
          </div>
          <div class="flex flex-col justify-between bg-surface-2 p-4">
            <es-icon name="monitor" [size]="24" />
            <div><p class="text-sm text-muted">версия · Node</p><p class="text-lg font-light">{{ i.version }} · {{ i.node }}</p></div>
          </div>
        </div>

        <h2 class="es-subtitle mt-10 mb-4">данные школы</h2>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          @for (item of counts(i); track item.label) {
            <div class="bg-surface p-4"><p class="text-4xl font-light">{{ item.value }}</p><p class="mt-1 text-sm text-muted">{{ item.label }}</p></div>
          }
        </div>

        <h2 class="es-subtitle mt-10 mb-3">обслуживание</h2>
        <div class="max-w-3xl space-y-3 text-sm text-muted">
          <p>Обновление и резервные копии делает <code class="bg-surface-3 px-1">deploy.sh</code>: перед каждым развёртыванием он снимает дамп базы и архив загрузок в каталог <code class="bg-surface-3 px-1">backups</code>.</p>
          <p>Потеряли доступ к этой учётной записи — восстановить его можно только на сервере: <code class="bg-surface-3 px-1">sudo docker compose exec backend npm run admin:reset</code>.</p>
        </div>
      } @else {
        <es-dots class="my-10" />
      }
    </es-page>
  `,
})
export class AdminSystemPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly info = signal<SystemInfo | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    try {
      this.info.set(await this.api.get<SystemInfo>('/admin/system'));
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  protected uptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days ? `${days} д ${hours} ч` : hours ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
  }

  protected counts(info: SystemInfo) {
    return [
      { label: 'учётных записей', value: info.counts.accounts },
      { label: 'учеников', value: info.counts.students },
      { label: 'сотрудников', value: info.counts.staff },
      { label: 'классов', value: info.counts.classes },
      { label: 'заданий', value: info.counts.homework },
      { label: 'конспектов', value: info.counts.notes },
      { label: 'тестов', value: info.counts.tests },
    ];
  }
}

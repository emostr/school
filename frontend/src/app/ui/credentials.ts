import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { IssuedCredentials } from '../core/types';
import { Flyout } from './flyout';
import { Icon } from './icon';

/**
 * Выданные логины и временные пароли. Показываются один раз — дальше
 * пароль можно только сбросить, — поэтому рядом печать карточек: по
 * карточке на человека, разрезать и раздать.
 */
@Component({
  selector: 'es-credentials',
  imports: [Flyout, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-flyout [open]="items().length > 0" [title]="title()" subtitle="Пароли видны только сейчас. При первом входе их потребуется сменить." [width]="640" (closed)="closed.emit()">
      <table class="es-table">
        <thead>
          <tr><th>имя</th><th>логин</th><th>пароль</th></tr>
        </thead>
        <tbody>
          @for (item of items(); track item.id) {
            <tr>
              <td>{{ item.fullName }}@if (item.className) {<span class="text-xs text-faint"> · {{ item.className }}</span>}</td>
              <td class="font-mono select-all">{{ item.login }}</td>
              <td class="font-mono select-all">{{ item.password }}</td>
            </tr>
          }
        </tbody>
      </table>
      <ng-container flyout-actions>
        <button type="button" class="es-btn" (click)="copy()"><es-icon name="copy" [size]="18" /> скопировать</button>
        <button type="button" class="es-btn es-btn-primary" (click)="print()"><es-icon name="printer" [size]="18" /> напечатать карточки</button>
      </ng-container>
    </es-flyout>
  `,
})
export class Credentials {
  private readonly notify = inject(Notify);
  private readonly school = inject(School);
  readonly items = input<IssuedCredentials[]>([]);
  readonly title = input('учётные данные');
  readonly closed = output<void>();

  protected async copy(): Promise<void> {
    const text = this.items()
      .map((item) => `${item.fullName}\t${item.login}\t${item.password}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.notify.success('Скопировано — можно вставить в таблицу');
    } catch {
      this.notify.error('Браузер не дал доступ к буферу обмена');
    }
  }

  protected print(): void {
    const popup = window.open('', '_blank');
    if (!popup) {
      this.notify.error('Браузер заблокировал окно печати');
      return;
    }
    const address = location.origin;
    const school = this.school.info()?.shortName || this.school.info()?.name || '';
    const escape = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const cards = this.items()
      .map(
        (item) => `<div class="card">
          <div class="brand">edway.space${school ? ` · ${escape(school)}` : ''}</div>
          <div class="name">${escape(item.fullName)}${item.className ? ` · ${escape(item.className)}` : ''}</div>
          <div class="row"><span>Адрес</span><b>${escape(address)}</b></div>
          <div class="row"><span>Логин</span><b>${escape(item.login)}</b></div>
          <div class="row"><span>Пароль</span><b>${escape(item.password)}</b></div>
          <div class="hint">Пароль временный: при первом входе придумайте свой.</div>
        </div>`,
      )
      .join('');
    popup.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Учётные данные</title><style>
      body{font-family:'Open Sans',Arial,sans-serif;margin:10mm;color:#000}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:0}
      .card{border:1px dashed #999;padding:5mm 6mm;break-inside:avoid}
      .brand{font-size:9pt;color:#0067c0;font-weight:700}
      .name{font-size:13pt;margin:2mm 0 3mm}
      .row{display:flex;justify-content:space-between;font-size:10.5pt;padding:1mm 0;border-bottom:1px solid #eee}
      .row b{font-family:monospace;font-size:11.5pt}
      .hint{font-size:8pt;color:#555;margin-top:2mm}
    </style></head><body><div class="grid">${cards}</div></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  }
}

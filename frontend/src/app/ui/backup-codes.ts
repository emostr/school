import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Notify } from '../core/notify';
import { Icon } from './icon';

/** Резервные коды второго фактора — сеткой, с копированием и печатью. */
@Component({
  selector: 'es-backup-codes',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
      @for (code of codes(); track code) {
        <code class="bg-surface px-3 py-2 text-center font-mono text-[15px] tracking-wider">{{ code }}</code>
      }
    </div>
    <div class="mt-3 flex gap-2">
      <button type="button" class="es-btn es-btn-sm" (click)="copy()"><es-icon name="copy" [size]="16" /> скопировать</button>
      <button type="button" class="es-btn es-btn-sm" (click)="print()"><es-icon name="printer" [size]="16" /> распечатать</button>
    </div>
  `,
})
export class BackupCodes {
  private readonly notify = inject(Notify);
  readonly codes = input.required<string[]>();

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.codes().join('\n'));
      this.notify.success('Коды скопированы');
    } catch {
      this.notify.error('Браузер не дал доступ к буферу обмена');
    }
  }

  protected print(): void {
    const popup = window.open('', '_blank', 'width=480,height=640');
    if (!popup) return;
    popup.document.write(
      `<title>Резервные коды edway.space</title><pre style="font:16px monospace;line-height:2">Резервные коды edway.space\n\n${this.codes().join('\n')}</pre>`,
    );
    popup.document.close();
    popup.print();
  }
}

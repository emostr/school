import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'es-empty',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col items-center px-6 py-14 text-center">
      <es-icon [name]="icon()" [size]="40" [stroke]="1.4" class="text-faint" />
      <p class="mt-4 text-xl font-light">{{ title() }}</p>
      @if (text()) {
        <p class="mt-2 max-w-md text-sm text-muted">{{ text() }}</p>
      }
      <div class="mt-5 flex gap-2 empty:hidden"><ng-content /></div>
    </div>
  `,
})
export class Empty {
  readonly title = input.required<string>();
  readonly text = input('');
  readonly icon = input('layers');
}

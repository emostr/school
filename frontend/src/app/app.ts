import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotifyHost } from './ui/notify-host';

@Component({
  selector: 'es-root',
  imports: [RouterOutlet, NotifyHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><es-notify-host />`,
})
export class App {}

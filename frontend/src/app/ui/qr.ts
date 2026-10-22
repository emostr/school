import { ChangeDetectionStrategy, Component, ElementRef, effect, input, viewChild } from '@angular/core';
import QRCode from 'qrcode';

/** QR-код для приложения-аутентификатора. Белый фон обязателен — иначе не сканируется. */
@Component({
  selector: 'es-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas class="block bg-white p-3"></canvas>`,
})
export class Qr {
  readonly value = input.required<string>();
  readonly size = input(200);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    effect(() => {
      void QRCode.toCanvas(this.canvas().nativeElement, this.value(), {
        width: this.size(),
        margin: 0,
        color: { dark: '#000000', light: '#ffffff' },
      });
    });
  }
}

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'es-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh flex-col justify-center bg-accent px-8 text-white sm:px-20">
      <p class="text-[96px] leading-none font-light">:(</p>
      <h1 class="mt-6 text-[34px] font-light">Такой страницы нет.</h1>
      <p class="mt-2 max-w-lg text-white/80">Возможно, ссылка устарела или в адресе опечатка.</p>
      <a routerLink="/" class="es-btn mt-8 w-fit border-white text-white hover:!bg-white/15">на главную</a>
    </div>
  `,
})
export class NotFoundPage {}

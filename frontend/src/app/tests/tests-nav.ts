import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Разделы модуля тестов: сами тесты, выданные классам работы и журнал оценок. */
@Component({
  selector: 'es-tests-nav',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="es-pivot es-no-print mb-6">
      <a routerLink="/tests" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }">тесты</a>
      <a routerLink="/tests/assignments" routerLinkActive="is-active">выдачи и проверка</a>
      <a routerLink="/tests/grades" routerLinkActive="is-active">оценки за тесты</a>
    </nav>
  `,
})
export class TestsNav {}

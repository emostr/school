import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { School } from '../core/school';
import { formatDay } from '../core/dates';
import { ClassRow } from '../core/types';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { Flyout } from '../ui/flyout';
import { TestsNav } from './tests-nav';
import { AssignmentRow, TestSummary } from './test-types';

/** Назначения: тест, класс и дата — платформа готовит бланки на весь список. */
@Component({
  selector: 'es-assignments-list',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, Empty, Flyout, TestsNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="выдачи и проверка" subtitle="Тест, класс и дата — платформа готовит бланки на весь список">
      <ng-container page-actions>
        <button type="button" class="es-btn es-btn-primary" (click)="openCreate()"><es-icon name="plus" [size]="18" /> назначить тест</button>
      </ng-container>
      <es-tests-nav />

      <div class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label class="es-label" for="f-class">класс</label>
          <select id="f-class" class="es-select" [ngModel]="filterClass()" (ngModelChange)="filterClass.set($event)">
            <option [ngValue]="''">все классы</option>
            @for (item of classes(); track item.id) {
              <option [ngValue]="item.id">{{ item.name }}</option>
            }
          </select>
        </div>
        <div>
          <label class="es-label" for="f-test">тест</label>
          <select id="f-test" class="es-select" [ngModel]="filterTest()" (ngModelChange)="filterTest.set($event)">
            <option [ngValue]="''">все тесты</option>
            @for (item of tests(); track item.id) {
              <option [ngValue]="item.id">{{ item.title }}</option>
            }
          </select>
        </div>
      </div>

      @if (loading()) {
        <es-dots class="my-10" />
      } @else if (!rows().length) {
        <es-empty icon="calendar" title="Назначений нет" text="Выберите опубликованный тест, класс и дату — платформа заведёт по бланку на каждого ученика.">
          <button type="button" class="es-btn es-btn-primary" (click)="openCreate()">назначить тест</button>
        </es-empty>
      } @else {
        <div class="overflow-x-auto">
          <table class="es-table">
            <thead>
              <tr><th>дата</th><th>класс</th><th>тест</th><th class="!text-right">проверено</th><th></th></tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.id) {
                <tr>
                  <td class="whitespace-nowrap text-muted">{{ day(row.date) }}</td>
                  <td><span class="es-badge">{{ row.className }}</span></td>
                  <td>
                    <a [routerLink]="['/tests/assignments', row.id]" class="font-semibold hover:text-accent-hover">{{ row.testTitle }}</a>
                    @if (row.note) {
                      <span class="block text-xs text-faint">{{ row.note }}</span>
                    }
                  </td>
                  <td class="text-right">
                    <span class="es-badge" [class]="row.checked === row.total ? 'es-badge-success' : row.checked ? 'es-badge-warning' : ''">{{ row.checked }} / {{ row.total }}</span>
                  </td>
                  <td class="text-right">
                    <a [routerLink]="['/tests/assignments', row.id]" class="es-btn es-btn-ghost es-btn-sm">открыть <es-icon name="chevronRight" [size]="16" /></a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </es-page>

    <es-flyout [open]="open()" title="назначить тест" subtitle="Бланки заведутся на каждого ученика класса" (closed)="open.set(false)">
      <div class="space-y-4">
        <div>
          <label class="es-label" for="a-test">тест</label>
          <select id="a-test" class="es-select" [(ngModel)]="testId">
            <option [ngValue]="''" disabled>{{ published().length ? 'выберите тест' : 'нет опубликованных тестов' }}</option>
            @for (test of published(); track test.id) {
              <option [ngValue]="test.id">{{ test.title }}</option>
            }
          </select>
        </div>
        <div>
          <label class="es-label" for="a-class">класс</label>
          <select id="a-class" class="es-select" [(ngModel)]="classId">
            <option [ngValue]="''" disabled>выберите класс</option>
            @for (item of classes(); track item.id) {
              <option [ngValue]="item.id" [disabled]="item.studentCount === 0">{{ item.name }} · {{ item.studentCount }} чел.</option>
            }
          </select>
          <p class="es-hint">Классы без учеников недоступны</p>
        </div>
        <div>
          <label class="es-label" for="a-date">дата работы</label>
          <input id="a-date" type="date" class="es-input" [(ngModel)]="date" />
        </div>
        <div>
          <label class="es-label" for="a-spare">запасных бланков</label>
          <input id="a-spare" type="number" min="0" max="10" class="es-input" [(ngModel)]="spare" />
          <p class="es-hint">Пригодятся новеньким и вместо испорченного листа</p>
        </div>
        <div>
          <label class="es-label" for="a-note">пометка</label>
          <input id="a-note" class="es-input" placeholder="Например: 2 урок, кабинет 12" [(ngModel)]="note" />
        </div>
      </div>
      <ng-container flyout-actions>
        <button type="button" class="es-btn" (click)="open.set(false)">отмена</button>
        <button type="button" class="es-btn es-btn-primary" [disabled]="saving()" (click)="create()">назначить</button>
      </ng-container>
    </es-flyout>
  `,
})
export class AssignmentsListPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly school = inject(School);

  protected readonly rows = signal<AssignmentRow[]>([]);
  protected readonly classes = signal<ClassRow[]>([]);
  protected readonly tests = signal<TestSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly filterClass = signal('');
  protected readonly filterTest = signal('');
  protected readonly open = signal(false);
  protected readonly saving = signal(false);
  protected testId = '';
  protected classId = '';
  protected date = '';
  protected spare = 2;
  protected note = '';

  protected readonly published = computed(() => this.tests().filter((test) => test.isPublished));

  constructor() {
    effect(() => {
      const classId = this.filterClass();
      const testId = this.filterTest();
      untracked(() => void this.load(classId, testId));
    });
    // Со страницы теста приходят с уже выбранным тестом — сразу открываем форму.
    const preset = this.route.snapshot.queryParamMap.get('testId');
    if (preset) {
      this.testId = preset;
      this.openCreate(false);
    }
  }

  private async load(classId: string, testId: string): Promise<void> {
    try {
      const [list, classList, testList] = await Promise.all([
        this.api.get<AssignmentRow[]>('/assignments', { classId, testId }),
        this.api.get<ClassRow[]>('/classes'),
        this.api.get<TestSummary[]>('/tests'),
      ]);
      this.rows.set(list);
      this.classes.set(classList);
      this.tests.set(testList);
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось загрузить назначения');
    } finally {
      this.loading.set(false);
    }
  }

  protected openCreate(reset = true): void {
    if (reset) this.testId = '';
    this.date = this.school.today();
    this.open.set(true);
  }

  protected async create(): Promise<void> {
    if (!this.testId || !this.classId || !this.date) {
      this.notify.warning('Выберите тест, класс и дату');
      return;
    }
    this.saving.set(true);
    try {
      const created = await this.api.post<AssignmentRow>('/assignments', {
        testId: this.testId,
        classId: this.classId,
        date: this.date,
        note: this.note,
        spare: Number(this.spare) || 0,
      });
      this.open.set(false);
      this.notify.success('Назначение создано. Теперь можно распечатать бланки');
      await this.router.navigate(['/tests/assignments', created.id]);
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось назначить');
    } finally {
      this.saving.set(false);
    }
  }

  protected day(date: string): string {
    return formatDay(date);
  }
}

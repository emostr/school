import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../../core/api';
import { Notify } from '../../core/notify';
import { School } from '../../core/school';
import { Bell, SchoolInfo } from '../../core/types';
import { Page } from '../../ui/page';
import { Icon } from '../../ui/icon';

const TIMEZONES = [
  'Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk',
  'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka',
  'Europe/Minsk', 'Asia/Almaty', 'Asia/Tashkent', 'Europe/Kyiv',
];

/** Настройки школы: название, часовой пояс, учебная неделя и звонки. */
@Component({
  selector: 'es-admin-school',
  imports: [FormsModule, Page, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-page title="школа" subtitle="Общие настройки для всех учётных записей">
      <ng-container page-actions>
        <button type="button" class="es-btn es-btn-primary" [disabled]="busy()" (click)="save()"><es-icon name="save" [size]="18" /> сохранить</button>
      </ng-container>
      @if (form(); as f) {
        <div class="grid max-w-5xl gap-10 lg:grid-cols-2">
          <section class="space-y-4">
            <h2 class="es-subtitle">о школе</h2>
            <div>
              <label class="es-label" for="sc-name">полное название</label>
              <input id="sc-name" class="es-input" [(ngModel)]="f.name" />
            </div>
            <div>
              <label class="es-label" for="sc-short">коротко</label>
              <input id="sc-short" class="es-input" placeholder="Школа № 7" [(ngModel)]="f.shortName" />
            </div>
            <div>
              <label class="es-label" for="sc-address">адрес</label>
              <input id="sc-address" class="es-input" [(ngModel)]="f.address" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="es-label" for="sc-tz">часовой пояс</label>
                <select id="sc-tz" class="es-select" [(ngModel)]="f.timezone">
                  @for (zone of timezones; track zone) {
                    <option [value]="zone">{{ zone }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="es-label" for="sc-week">учебная неделя</label>
                <select id="sc-week" class="es-select" [(ngModel)]="f.weekDays">
                  <option [ngValue]="5">пятидневка</option>
                  <option [ngValue]="6">шестидневка</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <h2 class="es-subtitle mb-4">звонки</h2>
            <table class="w-full">
              <thead>
                <tr class="text-left text-xs text-muted"><th class="pb-2 font-semibold">урок</th><th class="pb-2 font-semibold">начало</th><th class="pb-2 font-semibold">конец</th><th></th></tr>
              </thead>
              <tbody>
                @for (bell of f.bells; track $index; let i = $index) {
                  <tr>
                    <td class="py-1 pr-2"><input type="number" min="0" max="12" class="es-input w-16" [(ngModel)]="bell.number" [attr.aria-label]="'Номер урока ' + (i + 1)" /></td>
                    <td class="py-1 pr-2"><input type="time" class="es-input" [(ngModel)]="bell.start" aria-label="Начало" /></td>
                    <td class="py-1 pr-2"><input type="time" class="es-input" [(ngModel)]="bell.end" aria-label="Конец" /></td>
                    <td class="py-1"><button type="button" class="es-btn es-btn-ghost es-btn-icon hover:!text-danger" title="Убрать" (click)="removeBell(i)"><es-icon name="close" [size]="16" /></button></td>
                  </tr>
                }
              </tbody>
            </table>
            <button type="button" class="es-btn es-btn-sm mt-3" (click)="addBell()"><es-icon name="plus" [size]="16" /> урок</button>
            <p class="es-hint mt-3">Нулевой урок — номер 0. Время уроков подставляется в расписание всех классов.</p>
          </section>
        </div>
      }
    </es-page>
  `,
})
export class AdminSchoolPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly school = inject(School);

  protected readonly timezones = TIMEZONES;
  protected readonly form = signal<Omit<SchoolInfo, 'id' | 'today'> | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    void this.api
      .get<SchoolInfo>('/admin/school')
      .then((info) => this.form.set({ ...info, bells: info.bells.map((bell) => ({ ...bell })) }))
      .catch((error) => this.notify.error(error));
  }

  protected addBell(): void {
    const form = this.form();
    if (!form) return;
    const last: Bell | undefined = form.bells.at(-1);
    const shift = (time: string, minutes: number) => {
      const [h, m] = time.split(':').map(Number);
      const total = h * 60 + m + minutes;
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    };
    form.bells.push(
      last
        ? { number: last.number + 1, start: shift(last.end, 10), end: shift(last.end, 55) }
        : { number: 1, start: '08:30', end: '09:15' },
    );
  }

  protected removeBell(index: number): void {
    this.form()?.bells.splice(index, 1);
  }

  protected async save(): Promise<void> {
    const form = this.form();
    if (!form) return;
    this.busy.set(true);
    try {
      await this.api.patch('/admin/school', { ...form, bells: form.bells.map((b) => ({ ...b, number: Number(b.number) })) });
      await this.school.loadInfo(true);
      this.notify.success('Настройки школы сохранены');
    } catch (error) {
      this.notify.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

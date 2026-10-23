import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { formatDay } from '../core/dates';
import { Page } from '../ui/page';
import { Icon } from '../ui/icon';
import { Dots } from '../ui/dots';
import { Empty } from '../ui/empty';
import { Flyout } from '../ui/flyout';
import { Progress } from '../ui/progress';
import { TestsNav } from './tests-nav';
import { GRADE_TONES, WORK_STATUS_LABELS, WORK_STATUS_TONES } from './catalog';
import { AssignmentDetail, AssignmentReport, UploadOutcome, WorkStatus } from './test-types';
import { GradeKind, GradeTarget, Subject } from '../core/types';
import { defaultWeight, GRADE_KINDS } from '../gradebook/kinds';

const TONE_BADGE: Record<string, string> = {
  neutral: '',
  info: 'es-badge-info',
  warning: 'es-badge-warning',
  success: 'es-badge-success',
  danger: 'es-badge-danger',
};

@Component({
  selector: 'es-assignment-page',
  imports: [FormsModule, RouterLink, Page, Icon, Dots, Empty, Flyout, Progress, TestsNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data(); as d) {
      <es-page [title]="d.testTitle" [subtitle]="d.className + ' · ' + day(d.date) + (d.note ? ' · ' + d.note : '')">
        <ng-container page-actions>
          <a routerLink="/tests/assignments" class="es-btn es-btn-ghost"><es-icon name="arrowLeft" [size]="18" /> к списку</a>
          <a [routerLink]="['/print', d.id]" target="_blank" class="es-btn"><es-icon name="printer" [size]="18" /> печать бланков</a>
          <label class="es-btn es-btn-primary cursor-pointer" [class.opacity-50]="uploading()">
            <es-icon name="upload" [size]="18" /> {{ uploading() ? 'распознаём…' : 'загрузить сканы' }}
            <input type="file" accept="image/*" multiple class="hidden" [disabled]="uploading()" (change)="upload($event)" />
          </label>
        </ng-container>
        <es-tests-nav />

        @if (uploading()) {
          <es-dots class="mb-6" label="Листы распознаются — это занимает несколько секунд на страницу" />
        }

        <div class="mb-6 grid gap-2 lg:grid-cols-3">
          <section class="es-panel">
            <h2 class="es-subtitle">готовность</h2>
            <p class="mb-4 text-sm text-muted">Сдано {{ scanned() }} из {{ d.works.length }}</p>
            <es-progress [value]="d.works.length ? (checked() / d.works.length) * 100 : 0" [showValue]="true" [label]="'Проверено ' + checked()" [tone]="checked() === d.works.length ? 'success' : 'accent'" />
            <div class="mt-4 flex flex-wrap gap-2">
              <button type="button" class="es-btn es-btn-sm" [disabled]="!checked()" (click)="openImport(d)"><es-icon name="table" [size]="16" /> в журнал</button>
              <button type="button" class="es-btn es-btn-sm" (click)="toggleClosed(d)"><es-icon [name]="d.closedAt ? 'unlock' : 'check'" [size]="16" /> {{ d.closedAt ? 'возобновить' : 'завершить проверку' }}</button>
              <button type="button" class="es-btn es-btn-ghost es-btn-sm hover:!text-danger" (click)="remove()"><es-icon name="trash" [size]="16" /> удалить</button>
            </div>
          </section>
          <section class="es-panel lg:col-span-2">
            <h2 class="es-subtitle mb-3">как проверять</h2>
            <ol class="list-decimal space-y-1.5 pl-5 text-sm text-muted">
              <li>Распечатайте бланки — на каждом уже стоит фамилия, код работы{{ d.snapshot.variantCount > 1 ? ' и номер варианта' : '' }}.</li>
              <li>Ученики пишут ответы <span class="font-semibold text-ink">печатными</span> буквами и цифрами, по одному знаку в клетке.</li>
              <li>Отсканируйте листы и загрузите их пачкой: платформа сама разложит по ученикам.</li>
              <li>Закрытые задания проверятся автоматически, развёрнутые останутся вам.</li>
            </ol>
          </section>
        </div>

        @if (outcome()?.unmatched?.length) {
          <section class="mb-6 border-l-4 border-warning bg-warning/10 p-4">
            <p class="font-semibold">Не удалось разобрать листы</p>
            <ul class="mt-2 space-y-2">
              @for (item of outcome()!.unmatched; track item.file) {
                <li class="flex flex-wrap items-center gap-3">
                  <a [href]="item.url" target="_blank" rel="noreferrer" class="text-xs text-accent-hover hover:underline">посмотреть скан</a>
                  <span class="min-w-[200px] flex-1 text-xs text-muted">{{ item.reason }}</span>
                  <button type="button" class="es-btn es-btn-sm" (click)="attachFile.set(item.file)">привязать вручную</button>
                </li>
              }
            </ul>
          </section>
        }

        @if (report(); as r) {
          @if (r.checked > 0) {
            <section class="mb-6 bg-surface">
              <div class="p-5 pb-2">
                <h2 class="es-subtitle">разбор заданий</h2>
                <p class="text-sm text-muted">По {{ r.checked }} проверенным работам — видно, что класс не понял</p>
              </div>
              <table class="es-table">
                <thead><tr><th class="w-16">№</th><th>справились</th><th class="!text-right">ответили</th><th class="!text-right">средний балл</th></tr></thead>
                <tbody>
                  @for (row of r.questions; track row.questionId) {
                    <tr>
                      <td><span class="grid h-7 w-7 place-items-center bg-surface-3 text-xs font-semibold">{{ row.number }}</span></td>
                      <td class="w-[260px]"><es-progress [value]="row.successPercent" [showValue]="true" [tone]="row.successPercent >= 70 ? 'success' : row.successPercent >= 40 ? 'warning' : 'danger'" /></td>
                      <td class="text-right text-xs text-muted">{{ row.correct }} из {{ row.answered }}</td>
                      <td class="text-right tabular-nums">{{ row.averageScore }} / {{ row.maxScore }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
          }
        }

        @if (d.works.length) {
          <div class="overflow-x-auto">
            <table class="es-table">
              <thead>
                <tr>
                  <th>ученик</th>
                  @if (d.snapshot.variantCount > 1) {
                    <th>вариант</th>
                  }
                  <th class="hidden md:table-cell">код бланка</th>
                  <th>статус</th>
                  <th class="!text-right">баллы</th>
                  <th class="!text-right">оценка</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (row of d.works; track row.id) {
                  <tr>
                    <td>
                      <a [routerLink]="['/tests/works', row.id]" class="font-semibold hover:text-accent-hover">{{ row.studentName || 'Запасной бланк' }}</a>
                      @if (row.pages > 0) {
                        <span class="ml-2 text-xs text-faint"><es-icon name="image" [size]="12" class="align-[-1px]" /> {{ row.pages }}</span>
                      }
                    </td>
                    @if (d.snapshot.variantCount > 1) {
                      <td>
                        @if (row.status === 'PENDING') {
                          <select class="es-select !min-h-8 w-32 !py-0 text-sm" [ngModel]="row.variant" (ngModelChange)="changeVariant(row.id, +$event)" aria-label="Вариант">
                            @for (n of variants(); track n) {
                              <option [ngValue]="n">вариант {{ n }}</option>
                            }
                          </select>
                        } @else {
                          <span class="es-badge">вариант {{ row.variant }}</span>
                        }
                      </td>
                    }
                    <td class="hidden md:table-cell"><code class="text-xs tracking-wider text-muted">{{ row.code.slice(0, 4) }}-{{ row.code.slice(4) }}</code></td>
                    <td><span class="es-badge {{ statusTone(row.status) }}">{{ statusLabel(row.status) }}</span></td>
                    <td class="text-right tabular-nums">{{ row.status === 'PENDING' ? '—' : row.autoScore + row.manualScore + ' / ' + row.maxScore }}</td>
                    <td class="text-right">
                      @if (row.grade) {
                        <span class="es-badge {{ gradeTone(row.grade) }}">{{ row.grade }}</span>
                      } @else {
                        <span class="text-xs text-faint">—</span>
                      }
                    </td>
                    <td class="text-right">
                      <a [routerLink]="['/tests/works', row.id]" class="es-btn es-btn-ghost es-btn-sm">{{ row.status === 'CHECKED' ? 'открыть' : 'проверить' }} <es-icon name="chevronRight" [size]="16" /></a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <es-empty icon="users" title="В назначении нет работ" />
        }
      </es-page>

      <es-flyout [open]="importOpen()" title="оценки в журнал" [subtitle]="d.className + ' · ' + day(d.date)" (closed)="importOpen.set(false)">
        <p class="mb-4 text-sm text-muted">Оценки проверенных работ встанут в журнал на дату работы. Повторный перенос не задвоит уже перенесённые.</p>
        <div class="space-y-4">
          <div>
            <label class="es-label" for="imp-subject">предмет</label>
            <select id="imp-subject" class="es-select" [(ngModel)]="importSubject">
              <option [ngValue]="''" disabled>{{ importSubjects().length ? 'выберите' : 'вы не ведёте предметов в этом классе' }}</option>
              @for (subject of importSubjects(); track subject.id) {
                <option [ngValue]="subject.id">{{ subject.name }}</option>
              }
            </select>
          </div>
          <div class="grid grid-cols-[1fr_90px] gap-3">
            <div>
              <label class="es-label" for="imp-kind">вид работы</label>
              <select id="imp-kind" class="es-select" [(ngModel)]="importKind" (ngModelChange)="importWeight = weightOf($event)">
                @for (item of kinds; track item.value) {
                  <option [ngValue]="item.value">{{ item.label }}</option>
                }
              </select>
            </div>
            <div>
              <label class="es-label" for="imp-weight">вес</label>
              <input id="imp-weight" type="number" min="1" max="10" class="es-input" [(ngModel)]="importWeight" />
            </div>
          </div>
        </div>
        <ng-container flyout-actions>
          <button type="button" class="es-btn" (click)="importOpen.set(false)">отмена</button>
          <button type="button" class="es-btn es-btn-primary" [disabled]="!importSubject" (click)="runImport(d)">перенести {{ checked() }}</button>
        </ng-container>
      </es-flyout>

      <es-flyout [open]="!!attachFile()" title="чей это лист?" subtitle="Код не прочитался — выберите ученика вручную" (closed)="attachFile.set(null)">
        @if (attachFile(); as file) {
          <img [src]="'/api/files/' + file" alt="Скан работы" class="mb-4 max-h-[360px] w-full border border-line bg-surface-2 object-contain" />
        }
        <label class="es-label" for="attach-to">работа</label>
        <select id="attach-to" class="es-select" [(ngModel)]="attachTo">
          <option [ngValue]="''" disabled>выберите работу</option>
          @for (work of d.works; track work.id) {
            <option [ngValue]="work.id">{{ work.studentName || 'Запасной бланк' }} · {{ work.code }}</option>
          }
        </select>
        <ng-container flyout-actions>
          <button type="button" class="es-btn" (click)="attachFile.set(null)">отмена</button>
          <button type="button" class="es-btn es-btn-primary" (click)="attach()">привязать</button>
        </ng-container>
      </es-flyout>
    } @else {
      <es-dots class="my-16" />
    }
  `,
})
export class AssignmentPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  protected readonly data = signal<AssignmentDetail | null>(null);
  protected readonly report = signal<AssignmentReport | null>(null);
  protected readonly outcome = signal<UploadOutcome | null>(null);
  protected readonly uploading = signal(false);
  protected readonly attachFile = signal<string | null>(null);
  protected attachTo = '';
  protected readonly kinds = GRADE_KINDS;
  protected readonly importOpen = signal(false);
  protected readonly importSubjects = signal<Subject[]>([]);
  protected importSubject = '';
  protected importKind: GradeKind = 'TEST';
  protected importWeight = 3;

  protected readonly checked = computed(() => this.data()?.works.filter((work) => work.status === 'CHECKED').length ?? 0);
  protected readonly scanned = computed(() => this.data()?.works.filter((work) => work.status !== 'PENDING').length ?? 0);
  protected readonly variants = computed(() => Array.from({ length: this.data()?.snapshot.variantCount ?? 1 }, (_, i) => i + 1));

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id = this.id()): Promise<void> {
    try {
      const [detail, analysis] = await Promise.all([
        this.api.get<AssignmentDetail>(`/assignments/${id}`),
        // Разбор по заданиям считается только по проверенным работам.
        this.api.get<AssignmentReport | null>(`/analytics/assignments/${id}`).catch(() => null),
      ]);
      this.data.set(detail);
      this.report.set(analysis);
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось открыть назначение');
    }
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files?.length) return;
    this.uploading.set(true);
    try {
      const result = await this.api.upload<UploadOutcome>(`/assignments/${this.id()}/scans`, files);
      this.outcome.set(result);
      await this.load();
      if (result.matched.length) {
        this.notify.success(`Распознано листов: ${result.matched.length}`);
      }
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось загрузить сканы');
    } finally {
      this.uploading.set(false);
      input.value = '';
    }
  }

  protected async attach(): Promise<void> {
    const file = this.attachFile();
    if (!file || !this.attachTo) {
      this.notify.warning('Выберите работу, к которой отнести лист');
      return;
    }
    try {
      await this.api.post(`/works/${this.attachTo}/pages`, { file });
      this.outcome.update((current) => (current ? { ...current, unmatched: current.unmatched.filter((item) => item.file !== file) } : current));
      this.attachFile.set(null);
      this.attachTo = '';
      await this.load();
      this.notify.success('Лист привязан');
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось привязать лист');
    }
  }

  /** Ученик сел не за свою парту — вариант меняется, пока работа не сдана. */
  protected async changeVariant(workId: string, variant: number): Promise<void> {
    try {
      await this.api.patch(`/assignments/${this.id()}/works/${workId}/variant`, { variant });
      await this.load();
      this.notify.success(`Вариант ${variant}`);
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось сменить вариант');
    }
  }

  protected async toggleClosed(data: AssignmentDetail): Promise<void> {
    try {
      await this.api.post(`/assignments/${data.id}/${data.closedAt ? 'reopen' : 'close'}`, {});
      await this.load();
      this.notify.success(data.closedAt ? 'Проверка возобновлена' : 'Проверка завершена');
    } catch (error) {
      this.notify.error(errorMessage(error));
    }
  }

  protected async openImport(data: AssignmentDetail): Promise<void> {
    try {
      const targets = await this.api.get<GradeTarget[]>('/gradebook/targets');
      const target = targets.find((t) => t.classId === data.classId);
      this.importSubjects.set((target?.subjects ?? []).filter((subject) => subject.canGrade));
      this.importSubject = this.importSubjects().length === 1 ? this.importSubjects()[0].id : '';
      this.importOpen.set(true);
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected weightOf(kind: GradeKind): number {
    return defaultWeight(kind);
  }

  protected async runImport(data: AssignmentDetail): Promise<void> {
    try {
      const result = await this.api.post<{ created: number; skipped: number; unsigned: number }>('/gradebook/import-assignment', {
        assignmentId: data.id,
        subjectId: this.importSubject,
        kind: this.importKind,
        weight: Number(this.importWeight) || 1,
      });
      this.importOpen.set(false);
      const parts = [`Перенесено оценок: ${result.created}`];
      if (result.skipped) parts.push(`уже были в журнале: ${result.skipped}`);
      if (result.unsigned) parts.push(`запасных бланков без ученика: ${result.unsigned} — подпишите их на странице работы`);
      this.notify.show(result.created ? 'success' : 'warning', parts.join('; '));
    } catch (error) {
      this.notify.error(errorMessage(error));
    }
  }

  protected async remove(): Promise<void> {
    const ok = await this.notify.confirm({
      title: 'Удалить назначение?',
      message: 'Вместе с ним пропадут все работы, сканы и выставленные оценки.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/assignments/${this.id()}`);
      this.notify.success('Назначение удалено');
      await this.router.navigateByUrl('/tests/assignments');
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось удалить');
    }
  }

  protected day(date: string): string {
    return formatDay(date);
  }

  protected statusLabel(status: WorkStatus): string {
    return WORK_STATUS_LABELS[status];
  }

  protected statusTone(status: WorkStatus): string {
    return TONE_BADGE[WORK_STATUS_TONES[status]] ?? '';
  }

  protected gradeTone(grade: number): string {
    return TONE_BADGE[GRADE_TONES[grade]] ?? '';
  }
}

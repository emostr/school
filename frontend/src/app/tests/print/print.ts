import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../../core/api';
import { Notify } from '../../core/notify';
import { formatDay } from '../../core/dates';
import { Icon } from '../../ui/icon';
import { Dots } from '../../ui/dots';
import { Rich } from '../../ui/rich';
import { QUESTION_TYPE_LABELS } from '../catalog';
import { QuestionType, SheetLayout, SheetPage, SheetsResponse, SnapshotQuestion } from '../test-types';

type Mode = 'both' | 'questions' | 'sheets' | 'samples';

interface SheetWork {
  id: string;
  code: string;
  variant: number;
  studentName: string;
}

/**
 * Печать комплектов. Все координаты бланка берутся из разметки, которую
 * отдал сервер, — той же самой, по которой потом режется скан. Печатать
 * нужно в масштабе 100%: иначе клетки съедут относительно сетки распознавания.
 */
@Component({
  selector: 'es-print',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, Icon, Dots, Rich],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data(); as d) {
      <div class="min-h-dvh bg-bg">
        <div class="es-no-print sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
          <div class="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
            <a [routerLink]="['/tests/assignments', id()]" class="es-btn es-btn-ghost"><es-icon name="arrowLeft" [size]="18" /> к назначению</a>
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold">{{ d.testTitle }}</p>
              <p class="text-xs text-muted">{{ d.className }} · {{ day(d.date) }} · листов к печати: {{ totalPages() }}{{ d.variantCount > 1 ? ' · вариантов: ' + d.variantCount : '' }}</p>
            </div>
            <select class="es-select w-64" [ngModel]="mode()" (ngModelChange)="mode.set($event)" aria-label="Что печатать">
              <option value="both">комплект на ученика</option>
              <option value="questions">только задания</option>
              <option value="sheets">только бланки</option>
              <option value="samples">образцы заданий по вариантам</option>
            </select>
            <button type="button" class="es-btn es-btn-primary" (click)="print()"><es-icon name="printer" [size]="18" /> печать</button>
          </div>
          <p class="mx-auto max-w-5xl px-4 pb-3 text-xs text-faint">
            Печатайте в масштабе 100% без «вписать в страницу»: разметка бланка совпадает с сеткой, по которой платформа режет скан.
            Углы с чёрными квадратами обрезать нельзя. Комплекты идут подряд — распечатанную пачку остаётся разложить по партам.
          </p>
        </div>

        <div class="flex flex-col items-center gap-6 py-6 print:block print:gap-0 print:py-0">
          @if (mode() === 'samples') {
            <!-- Образцы: по одному листу заданий на вариант — для себя и для завуча. -->
            @for (variant of variants(); track variant) {
              <ng-container *ngTemplateOutlet="questionSheet; context: { variant: variant, student: '' }" />
            }
          } @else {
            <!--
              Остальные режимы идут комплектами: у каждого ученика сначала свои
              задания, следом его бланк и лист под развёрнутый ответ.
            -->
            @for (work of d.works; track work.id) {
              @if (layoutOf(work.variant); as layout) {
                @if (mode() !== 'sheets') {
                  <ng-container *ngTemplateOutlet="questionSheet; context: { variant: work.variant, student: work.studentName }" />
                }
                @if (mode() !== 'questions') {
                  @for (page of layout.pages; track page.index) {
                    <ng-container *ngTemplateOutlet="answerSheet; context: { layout: layout, work: work, page: page }" />
                  }
                }
              }
            }
          }
        </div>
      </div>

      <!-- Лист с самими заданиями: тексты, формулы и картинки. -->
      <ng-template #questionSheet let-variant="variant" let-student="student">
        <section class="sheet-page shadow-2xl" style="padding: 16mm 14mm">
          <div style="border-bottom: 0.5mm solid #000; padding-bottom: 4mm; margin-bottom: 6mm">
            <div style="font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em">
              {{ d.className }} · {{ day(d.date) }}{{ d.variantCount > 1 ? ' · вариант ' + variant : '' }}
            </div>
            <h1 style="font-size: 16pt; font-weight: 800; margin: 2mm 0 0">{{ d.testTitle }}</h1>
            @if (student) {
              <div style="font-size: 11pt; font-weight: 700; margin-top: 2mm">{{ student }}</div>
            }
            @if (d.instructions) {
              <p style="font-size: 9pt; margin-top: 3mm; line-height: 1.4">{{ d.instructions }}</p>
            }
          </div>
          <ol style="list-style: none; margin: 0; padding: 0; font-size: 10pt">
            @for (question of questionsOf(variant); track question.id; let index = $index) {
              <li style="margin-bottom: 5mm; break-inside: avoid">
                <div style="display: flex; gap: 3mm">
                  <span style="font-weight: 800; min-width: 6mm">{{ index + 1 }}.</span>
                  <div style="flex: 1">
                    <div [esRich]="question.content"></div>
                    @if (question.options.length) {
                      <div style="margin-top: 2mm; display: flex; flex-wrap: wrap; gap: 2mm 6mm">
                        @for (option of question.options; track option.id) {
                          <span style="display: flex; gap: 1.5mm">
                            <b>{{ option.letter }})</b>
                            <span [esRich]="option.content"></span>
                          </span>
                        }
                      </div>
                    }
                    <div style="font-size: 8pt; margin-top: 1.5mm; color: #555">
                      {{ typeLabel(question.type) }} · {{ question.points }} б.{{ question.type === 'EXTENDED' ? ' · ответ на отдельном листе' : '' }}
                    </div>
                  </div>
                </div>
              </li>
            }
          </ol>
        </section>
      </ng-template>

      <!-- Лист работы: бланк с клетками или поле под развёрнутый ответ. -->
      <ng-template #answerSheet let-layout="layout" let-work="work" let-page="page">
        @let sheet = layout.sheet;
        <section class="sheet-page shadow-2xl">
          @for (marker of markers(layout); track $index) {
            <svg class="sheet-marker" [style.left]="mm(marker.left)" [style.top]="mm(marker.top)" [attr.width]="mm(sheet.markerSize)" [attr.height]="mm(sheet.markerSize)" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="0" y="0" width="10" height="10" fill="#000" />
            </svg>
          }

          <div class="sheet-code" [style.left]="mm(sheet.code.x)" [style.top]="mm(sheet.code.y)" [style.width]="mm(sheet.code.width)" [style.height]="mm(sheet.code.height)" style="font-size: 13pt">
            {{ work.code.slice(0, 4) }}-{{ work.code.slice(4) }}/{{ page.index + 1 }}
          </div>

          @if (page.header) {
            <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(22)" style="font-size: 8pt; letter-spacing: 0.08em">EDWAY.SPACE · БЛАНК ОТВЕТОВ</div>
            <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(27)" [style.width]="mm(110)" style="font-size: 13pt; font-weight: 800">{{ d.testTitle }}</div>
            <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(36)" style="font-size: 10pt">{{ d.className }} · {{ day(d.date) }}{{ variantLabel(work) }}</div>
            <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(43)" style="font-size: 11pt; font-weight: 700">{{ work.studentName || 'Фамилия, имя: ______________________________' }}</div>
            <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(50)" [style.width]="mm(sheet.right - sheet.left)" style="font-size: 8pt; line-height: 1.35">
              Пишите печатными буквами и цифрами, по одному знаку в клетке. Не выходите за границы клеток и не обрезайте углы листа с чёрными квадратами.
            </div>
            <div class="sheet-rule" [style.left]="mm(sheet.left)" [style.top]="mm(62)" [style.width]="mm(sheet.right - sheet.left)" style="border-top-width: 0.4mm"></div>
          } @else {
            <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(20)" [style.width]="mm(150)" style="font-size: 9pt; font-weight: 700">
              {{ d.testTitle }} · {{ work.studentName || 'без фамилии' }}{{ variantLabel(work) }} · {{ page.kind === 'essay' ? 'развёрнутые ответы' : 'страница ' + (page.index + 1) }}
            </div>
          }

          @for (row of page.rows; track row.questionId) {
            <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(row.y + 2)" [style.width]="mm(sheet.numberWidth)" style="font-size: 11pt; font-weight: 800; text-align: right">{{ row.number }}</div>
            @for (cell of row.cells; track cell.index) {
              <span class="sheet-cell" [style.left]="mm(cell.x)" [style.top]="mm(cell.y)" [style.width]="mm(cell.width)" [style.height]="mm(cell.height)"></span>
            }
            <div class="sheet-text" [style.left]="mm(hintX(row, sheet))" [style.top]="mm(row.y + 3.5)" [style.width]="mm(60)" style="font-size: 7pt; color: #666">{{ row.hint }}</div>
          }

          <!-- Поле под развёрнутый ответ: заголовок задания и разлиновка. -->
          @for (block of page.blocks; track block.questionId) {
            <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(block.y)" [style.width]="mm(sheet.right - sheet.left)" style="font-size: 10pt; font-weight: 800">Задание {{ block.number }} · {{ block.points }} б.</div>
            @if (block.guideline) {
              <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(block.y + 5)" [style.width]="mm(sheet.right - sheet.left)" style="font-size: 7.5pt; color: #666">{{ block.guideline }}</div>
            }
            @for (line of block.rules; track line) {
              <div class="sheet-rule" [style.left]="mm(sheet.left)" [style.top]="mm(line)" [style.width]="mm(sheet.right - sheet.left)" style="border-top-width: 0.2mm; border-top-color: #999"></div>
            }
          }

          @if (isLastAnswers(layout, page) && layout.extended.length) {
            <div class="sheet-text" [style.left]="mm(sheet.left)" [style.top]="mm(sheet.lastRowY + 4)" [style.width]="mm(sheet.right - sheet.left)" style="font-size: 8.5pt; line-height: 1.4">
              <b>На отдельном листе:</b> {{ extendedList(layout) }}. Он идёт следом за этим бланком, с тем же кодом в углу.
            </div>
          }
        </section>
      </ng-template>
    } @else {
      <es-dots class="my-24" label="Готовим бланки" />
    }
  `,
})
export class PrintPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  readonly id = input.required<string>();
  protected readonly data = signal<SheetsResponse | null>(null);
  protected readonly mode = signal<Mode>('both');

  protected readonly variants = computed(() => Array.from({ length: this.data()?.variantCount ?? 1 }, (_, i) => i + 1));
  protected readonly totalPages = computed(() => {
    const data = this.data();
    if (!data) return 0;
    const blanks = data.works.reduce((sum, work) => sum + (data.layouts[String(work.variant)]?.pages.length ?? 0), 0);
    const mode = this.mode();
    if (mode === 'samples') return data.variantCount;
    if (mode === 'questions') return data.works.length;
    if (mode === 'sheets') return blanks;
    // Комплект на ученика: лист с заданиями плюс его бланки.
    return blanks + data.works.length;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    try {
      this.data.set(await this.api.get<SheetsResponse>(`/assignments/${id}/sheets`));
    } catch (error) {
      this.notify.error(errorMessage(error), 'Не удалось подготовить бланки');
    }
  }

  protected layoutOf(variant: number): SheetLayout | undefined {
    return this.data()?.layouts[String(variant)];
  }

  protected questionsOf(variant: number): SnapshotQuestion[] {
    const data = this.data();
    if (!data) return [];
    return data.variantCount > 1
      ? data.snapshot.questions.filter((question) => !question.variant || question.variant === variant)
      : data.snapshot.questions;
  }

  protected markers(layout: SheetLayout) {
    const sheet = layout.sheet;
    const right = sheet.width - sheet.markerInset - sheet.markerSize;
    const bottom = sheet.height - sheet.markerInset - sheet.markerSize;
    return [
      { left: sheet.markerInset, top: sheet.markerInset },
      { left: right, top: sheet.markerInset },
      { left: sheet.markerInset, top: bottom },
      { left: right, top: bottom },
    ];
  }

  protected hintX(row: { cells: { x: number }[] }, sheet: SheetLayout['sheet']): number {
    return (row.cells.at(-1)?.x ?? sheet.left) + sheet.cellWidth + 3;
  }

  protected isLastAnswers(layout: SheetLayout, page: SheetPage): boolean {
    return page.kind === 'answers' && page.index === layout.pages.filter((p) => p.kind === 'answers').length - 1;
  }

  protected extendedList(layout: SheetLayout): string {
    return layout.extended.map((item) => `задание ${item.number} (${item.points} б.)`).join(', ');
  }

  protected variantLabel(work: SheetWork): string {
    return (this.data()?.variantCount ?? 1) > 1 ? ` · вариант ${work.variant}` : '';
  }

  protected mm(value: number): string {
    return `${value}mm`;
  }

  protected day(date: string): string {
    return formatDay(date);
  }

  protected typeLabel(type: QuestionType): string {
    return QUESTION_TYPE_LABELS[type];
  }

  protected print(): void {
    window.print();
  }
}

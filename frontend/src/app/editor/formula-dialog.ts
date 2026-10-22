import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import katex from 'katex';
import { FORMULA_GROUPS } from '../core/formulas';
import { Flyout } from '../ui/flyout';
import { Icon } from '../ui/icon';

export interface FormulaRequest {
  latex: string;
  display: boolean;
  editing: boolean;
  /** Можно ли ставить формулу отдельной строкой (в тестах — нельзя). */
  allowDisplay: boolean;
}

/**
 * Набор формулы: поле LaTeX, предпросмотр и больше сотни заготовок по
 * разделам — от дробей до пределов и химии. Заготовка встаёт туда, где
 * стоит курсор, а не в конец.
 */
@Component({
  selector: 'es-formula-dialog',
  imports: [FormsModule, Flyout, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-flyout [open]="!!request()" [title]="request()?.editing ? 'правка формулы' : 'формула'" subtitle="Синтаксис LaTeX — как в учебнике" [width]="980" (closed)="closed.emit()">
      <div class="grid gap-6 lg:grid-cols-2">
        <div>
          <label class="es-label" for="latex">формула</label>
          <textarea #field id="latex" class="es-textarea font-mono" rows="4" placeholder="\\frac{1}{2} + \\sqrt{x}" [ngModel]="latex()" (ngModelChange)="latex.set($event)"></textarea>
          @if (request()?.allowDisplay) {
            <label class="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" class="es-switch" [checked]="display()" (change)="display.set(!display())" />
              отдельной строкой по центру
            </label>
          }
          <span class="es-label mt-5">предпросмотр</span>
          <div class="flex min-h-[96px] items-center justify-center overflow-x-auto bg-surface-2 px-4 py-5" [innerHTML]="preview()"></div>
        </div>
        <div class="min-w-0">
          <label class="es-label" for="snippet-search">заготовки</label>
          <div class="relative">
            <es-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <input id="snippet-search" class="es-input pl-9" placeholder="дробь, корень, вектор, интеграл…" [ngModel]="search()" (ngModelChange)="search.set($event)" />
          </div>
          <div class="mt-3 max-h-[52vh] space-y-4 overflow-y-auto pr-1">
            @for (group of groups(); track group.title) {
              <div>
                <p class="mb-1.5 text-xs font-semibold text-faint">{{ group.title }}</p>
                <div class="flex flex-wrap gap-1">
                  @for (item of group.items; track item.label) {
                    <button type="button" class="border border-line bg-surface px-2.5 py-1 text-xs transition-colors hover:border-accent hover:text-accent-hover" [title]="item.latex" (click)="insert(item.latex)">
                      {{ item.label }}
                    </button>
                  }
                </div>
              </div>
            } @empty {
              <p class="text-sm text-muted">Ничего не нашлось — наберите формулу вручную.</p>
            }
          </div>
        </div>
      </div>
      <ng-container flyout-actions>
        <button type="button" class="es-btn" (click)="closed.emit()">отмена</button>
        <button type="button" class="es-btn es-btn-primary" [disabled]="!latex().trim()" (click)="apply()">{{ request()?.editing ? 'сохранить' : 'вставить' }}</button>
      </ng-container>
    </es-flyout>
  `,
})
export class FormulaDialog {
  readonly request = input<FormulaRequest | null>(null);
  readonly closed = output<void>();
  readonly applied = output<{ latex: string; display: boolean }>();

  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');
  protected readonly latex = signal('');
  protected readonly display = signal(false);
  protected readonly search = signal('');

  protected readonly groups = computed(() => {
    const needle = this.search().trim().toLowerCase();
    return FORMULA_GROUPS.map((group) => ({
      title: group.title,
      items: needle
        ? group.items.filter((item) => item.label.toLowerCase().includes(needle) || item.latex.toLowerCase().includes(needle))
        : group.items,
    })).filter((group) => group.items.length);
  });

  private readonly sanitizer = inject(DomSanitizer);

  /** Вёрстка KaTeX держится на inline-стилях — штатная очистка Angular их срезала бы. */
  protected readonly preview = computed<SafeHtml>(() => {
    const latex = this.latex();
    if (!latex.trim()) {
      return '<span class="text-sm text-faint">Здесь появится формула</span>';
    }
    try {
      return this.sanitizer.bypassSecurityTrustHtml(
        katex.renderToString(latex, { throwOnError: false, displayMode: true, output: 'html', trust: false }),
      );
    } catch {
      return latex;
    }
  });

  constructor() {
    effect(() => {
      const request = this.request();
      if (request) {
        this.latex.set(request.latex);
        this.display.set(request.display);
        this.search.set('');
        setTimeout(() => this.field()?.nativeElement.focus());
      }
    });
  }

  protected insert(snippet: string): void {
    const field = this.field()?.nativeElement;
    const current = this.latex();
    if (!field) {
      this.latex.set(current ? `${current} ${snippet}` : snippet);
      return;
    }
    const start = field.selectionStart ?? current.length;
    const end = field.selectionEnd ?? current.length;
    this.latex.set(`${current.slice(0, start)}${snippet}${current.slice(end)}`);
    requestAnimationFrame(() => {
      field.focus();
      const caret = start + snippet.length;
      field.setSelectionRange(caret, caret);
    });
  }

  protected apply(): void {
    this.applied.emit({ latex: this.latex().trim(), display: this.display() });
  }
}

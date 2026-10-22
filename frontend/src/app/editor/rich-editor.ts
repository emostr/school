import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { Api, errorMessage } from '../core/api';
import { Notify } from '../core/notify';
import { Icon } from '../ui/icon';
import { MathBlock, MathInline } from './math';
import { FormulaDialog, FormulaRequest } from './formula-dialog';
import { NOTE_BLOCKS } from './blocks';

/**
 * compact — вариант ответа в тесте: начертание и формула.
 * test    — текст задания теста или домашнего задания: ещё списки и картинки.
 * full    — конспект: заголовки, таблицы, выравнивание, цитаты, код, формулы
 *           отдельной строкой, заготовки блоков и правка в Markdown.
 */
export type EditorMode = 'compact' | 'test' | 'full';

interface ToolButton {
  icon: string;
  title: string;
  run: () => void;
  active?: () => boolean;
}

@Component({
  selector: 'es-editor',
  imports: [FormsModule, Icon, FormulaDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="border-2 border-line bg-surface transition-colors focus-within:border-accent">
      <div class="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-2 px-1 py-1" role="toolbar" aria-label="Форматирование">
        @if (mode() === 'full') {
          <select class="es-select !min-h-8 w-[140px] !border-0 !bg-transparent !py-0 text-sm" [ngModel]="blockType()" (ngModelChange)="setBlock($event)" [disabled]="markdownMode()" aria-label="Стиль абзаца">
            <option value="p">обычный текст</option>
            <option value="h1">заголовок 1</option>
            <option value="h2">заголовок 2</option>
            <option value="h3">заголовок 3</option>
          </select>
          <span class="mx-1 h-5 w-px bg-line"></span>
        }
        @for (group of toolbar(); track $index) {
          @for (tool of group; track tool.title) {
            <button
              type="button"
              class="grid h-8 w-8 place-items-center transition-colors disabled:opacity-30"
              [class]="tool.active?.() ? 'bg-accent text-white' : 'text-muted hover:bg-surface-3 hover:text-ink'"
              [title]="tool.title"
              [attr.aria-label]="tool.title"
              [disabled]="markdownMode()"
              (mousedown)="$event.preventDefault()"
              (click)="tool.run()"
            >
              <es-icon [name]="tool.icon" [size]="16" />
            </button>
          }
          <span class="mx-1 h-5 w-px bg-line last:hidden"></span>
        }
        @if (mode() === 'full') {
          <div class="relative">
            <button type="button" class="es-btn es-btn-ghost es-btn-sm" [disabled]="markdownMode()" (click)="blocksOpen.set(!blocksOpen())">
              <es-icon name="layers" [size]="16" /> заготовки
            </button>
            @if (blocksOpen()) {
              <div class="absolute top-full left-0 z-20 mt-1 w-72 border-2 border-line bg-surface shadow-2xl">
                @for (block of blocks; track block.label) {
                  <button type="button" class="block w-full px-3 py-2 text-left hover:bg-surface-3" (click)="insertBlock(block.html)">
                    <span class="block text-sm font-semibold">{{ block.label }}</span>
                    <span class="block text-xs text-muted">{{ block.hint }}</span>
                  </button>
                }
              </div>
            }
          </div>
          <span class="flex-1"></span>
          <button type="button" class="es-btn es-btn-ghost es-btn-sm" [class.!bg-accent]="markdownMode()" [class.!text-white]="markdownMode()" (click)="toggleMarkdown()" title="Править как Markdown">
            <es-icon name="markdown" [size]="16" /> markdown
          </button>
        }
      </div>

      @if (inTable() && !markdownMode()) {
        <div class="flex flex-wrap items-center gap-1 border-b border-line bg-accent-soft px-2 py-1 text-xs">
          <span class="mr-1 font-semibold">таблица:</span>
          <button type="button" class="es-btn es-btn-sm !min-h-6 !text-xs" (click)="chain().addRowAfter().run()">+ строка</button>
          <button type="button" class="es-btn es-btn-sm !min-h-6 !text-xs" (click)="chain().addColumnAfter().run()">+ столбец</button>
          <button type="button" class="es-btn es-btn-sm !min-h-6 !text-xs" (click)="chain().deleteRow().run()">− строка</button>
          <button type="button" class="es-btn es-btn-sm !min-h-6 !text-xs" (click)="chain().deleteColumn().run()">− столбец</button>
          <button type="button" class="es-btn es-btn-sm !min-h-6 !text-xs" (click)="chain().toggleHeaderRow().run()">шапка</button>
          <button type="button" class="es-btn es-btn-sm !min-h-6 !text-xs" (click)="chain().mergeOrSplit().run()">объединить</button>
          <button type="button" class="es-btn es-btn-danger es-btn-sm !min-h-6 !text-xs" (click)="chain().deleteTable().run()">удалить таблицу</button>
        </div>
      }

      <div [hidden]="markdownMode()" #host class="px-3 py-2.5" [style.min-height.px]="height()"></div>
      @if (markdownMode()) {
        <textarea
          class="block w-full resize-y bg-surface px-3 py-2.5 font-mono text-sm outline-none"
          [style.min-height.px]="height()"
          [ngModel]="markdown()"
          (ngModelChange)="markdown.set($event)"
          spellcheck="false"
          aria-label="Текст в Markdown"
        ></textarea>
        <p class="border-t border-line px-3 py-1.5 text-xs text-faint">Markdown: # заголовок, **жирный**, *курсив*, - список, | таблица |, $формула$, $$формула отдельной строкой$$</p>
      }
      <input #file type="file" class="hidden" accept="image/*" (change)="uploadImage($event)" />
    </div>

    <es-formula-dialog [request]="formula()" (closed)="formula.set(null)" (applied)="applyFormula($event)" />
  `,
})
export class RichEditor {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  readonly value = model('');
  readonly mode = input<EditorMode>('test');
  readonly placeholder = input('Текст…');
  readonly minHeight = input<number | null>(null);
  /** content — картинку увидит вся школа; test — только учителя. */
  readonly imageScope = input<'content' | 'test'>('content');

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly file = viewChild.required<ElementRef<HTMLInputElement>>('file');
  private editor: Editor | null = null;
  /** Счётчик перерисовок: состояние кнопок меняется вместе с выделением. */
  private readonly tick = signal(0);

  protected readonly formula = signal<FormulaRequest | null>(null);
  protected readonly markdownMode = signal(false);
  protected readonly markdown = signal('');
  protected readonly blocksOpen = signal(false);
  protected readonly blocks = NOTE_BLOCKS;
  protected readonly height = computed(() => this.minHeight() ?? (this.mode() === 'compact' ? 40 : this.mode() === 'full' ? 420 : 140));

  protected readonly inTable = computed(() => {
    this.tick();
    return this.mode() === 'full' && Boolean(this.editor?.isActive('table'));
  });

  protected readonly blockType = computed(() => {
    this.tick();
    for (const level of [1, 2, 3]) {
      if (this.editor?.isActive('heading', { level })) return `h${level}`;
    }
    return 'p';
  });

  protected readonly toolbar = computed<ToolButton[][]>(() => {
    const mode = this.mode();
    const is = (name: string, attrs?: Record<string, unknown>) => () => {
      this.tick();
      return Boolean(this.editor?.isActive(name, attrs));
    };
    const marks: ToolButton[] = [
      { icon: 'bold', title: 'Полужирный', run: () => this.chain().toggleBold().run(), active: is('bold') },
      { icon: 'italic', title: 'Курсив', run: () => this.chain().toggleItalic().run(), active: is('italic') },
    ];
    if (mode !== 'compact') {
      marks.push({ icon: 'underline', title: 'Подчёркнутый', run: () => this.chain().toggleUnderline().run(), active: is('underline') });
    }
    if (mode === 'full') {
      marks.push(
        { icon: 'strike', title: 'Зачёркнутый', run: () => this.chain().toggleStrike().run(), active: is('strike') },
        { icon: 'subscript', title: 'Нижний индекс', run: () => this.chain().toggleSubscript().run(), active: is('subscript') },
        { icon: 'superscript', title: 'Верхний индекс', run: () => this.chain().toggleSuperscript().run(), active: is('superscript') },
        { icon: 'highlight', title: 'Выделить маркером', run: () => this.chain().toggleHighlight().run(), active: is('highlight') },
      );
    }
    const groups: ToolButton[][] = [marks];

    if (mode !== 'compact') {
      groups.push([
        { icon: 'list', title: 'Список', run: () => this.chain().toggleBulletList().run(), active: is('bulletList') },
        { icon: 'listOrdered', title: 'Нумерованный список', run: () => this.chain().toggleOrderedList().run(), active: is('orderedList') },
      ]);
    }
    if (mode === 'full') {
      groups.push([
        { icon: 'quote', title: 'Цитата', run: () => this.chain().toggleBlockquote().run(), active: is('blockquote') },
        { icon: 'code', title: 'Код', run: () => this.chain().toggleCodeBlock().run(), active: is('codeBlock') },
        { icon: 'hr', title: 'Горизонтальная черта', run: () => this.chain().setHorizontalRule().run() },
        { icon: 'table', title: 'Таблица', run: () => this.chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
      ]);
      groups.push([
        { icon: 'alignLeft', title: 'По левому краю', run: () => this.chain().setTextAlign('left').run(), active: is('paragraph', { textAlign: 'left' }) },
        { icon: 'alignCenter', title: 'По центру', run: () => this.chain().setTextAlign('center').run(), active: () => { this.tick(); return Boolean(this.editor?.isActive({ textAlign: 'center' })); } },
        { icon: 'alignRight', title: 'По правому краю', run: () => this.chain().setTextAlign('right').run(), active: () => { this.tick(); return Boolean(this.editor?.isActive({ textAlign: 'right' })); } },
      ]);
    }

    const insert: ToolButton[] = [{ icon: 'sigma', title: 'Формула в строке (LaTeX)', run: () => this.openFormula(false), active: is('formula') }];
    if (mode === 'full') {
      insert.push({ icon: 'sigmaBlock', title: 'Формула отдельной строкой', run: () => this.openFormula(true), active: is('formulaBlock') });
    }
    if (mode !== 'compact') {
      insert.push({ icon: 'image', title: 'Картинка', run: () => this.file().nativeElement.click() });
    }
    if (mode !== 'compact') {
      insert.push({ icon: 'link', title: 'Ссылка', run: () => this.setLink(), active: is('link') });
    }
    groups.push(insert);

    const history: ToolButton[] = [{ icon: 'eraser', title: 'Очистить форматирование', run: () => this.chain().unsetAllMarks().clearNodes().run() }];
    if (mode === 'full') {
      history.unshift(
        { icon: 'undo', title: 'Отменить', run: () => this.chain().undo().run() },
        { icon: 'redo', title: 'Повторить', run: () => this.chain().redo().run() },
      );
    }
    groups.push(history);
    return groups;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const host = this.host().nativeElement;
      untracked(() => this.create(host));
    });
    // Новое значение снаружи (загрузили запись на правку) попадает в
    // редактор, но обычный набор курсор не сбивает.
    effect(() => {
      const value = this.value();
      untracked(() => {
        if (this.editor && !this.markdownMode() && value !== this.editor.getHTML()) {
          this.editor.commands.setContent(value || '', { emitUpdate: false });
        }
      });
    });
    destroyRef.onDestroy(() => this.editor?.destroy());
  }

  private create(host: HTMLElement): void {
    if (this.editor) return;
    const mode = this.mode();
    this.editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({
          heading: mode === 'full' ? { levels: [1, 2, 3] } : mode === 'test' ? { levels: [3] } : false,
          bulletList: mode === 'compact' ? false : undefined,
          orderedList: mode === 'compact' ? false : undefined,
          blockquote: mode === 'full' ? undefined : false,
          codeBlock: mode === 'full' ? undefined : false,
          horizontalRule: mode === 'full' ? undefined : false,
          link: mode === 'compact' ? false : { openOnClick: false, autolink: true, defaultProtocol: 'https' },
        }),
        Image.configure({ inline: false, allowBase64: false }),
        Placeholder.configure({ placeholder: this.placeholder() }),
        MathInline,
        ...(mode === 'full'
          ? [
              MathBlock,
              TableKit.configure({ table: { resizable: false } }),
              TextAlign.configure({ types: ['heading', 'paragraph'] }),
              Highlight,
              Subscript,
              Superscript,
              Markdown,
            ]
          : []),
      ],
      content: this.value() || '',
      editorProps: { attributes: { class: 'es-rich text-[15px] outline-none' } },
      onUpdate: ({ editor }) => this.value.set(editor.isEmpty ? '' : editor.getHTML()),
      onSelectionUpdate: () => this.tick.update((n) => n + 1),
      onTransaction: () => this.tick.update((n) => n + 1),
    });
  }

  chain() {
    return this.editor!.chain().focus();
  }

  /** Вставка готового куска разметки — заготовки заданий и блоков. */
  insertHtml(html: string): void {
    if (this.markdownMode()) this.toggleMarkdown();
    this.chain().insertContent(html).run();
  }

  protected insertBlock(html: string): void {
    this.blocksOpen.set(false);
    this.insertHtml(html);
  }

  protected setBlock(type: string): void {
    if (type === 'p') {
      this.chain().setParagraph().run();
    } else {
      this.chain().toggleHeading({ level: Number(type.slice(1)) as 1 | 2 | 3 }).run();
    }
  }

  protected openFormula(display: boolean): void {
    const editor = this.editor;
    if (!editor) return;
    const editingBlock = editor.isActive('formulaBlock');
    const editingInline = editor.isActive('formula');
    const editing = editingBlock || editingInline;
    this.formula.set({
      latex: editing ? String(editor.getAttributes(editingBlock ? 'formulaBlock' : 'formula')['latex'] ?? '') : '',
      display: editing ? editingBlock : display,
      editing,
      allowDisplay: this.mode() === 'full',
    });
  }

  protected applyFormula(result: { latex: string; display: boolean }): void {
    const request = this.formula();
    this.formula.set(null);
    if (!request || !this.editor) return;
    const wasBlock = this.editor.isActive('formulaBlock');
    if (request.editing && wasBlock === result.display) {
      this.chain().updateFormula(result.latex).run();
    } else {
      if (request.editing) this.chain().deleteSelection().run();
      this.chain().insertFormula(result.latex, result.display).run();
    }
  }

  protected setLink(): void {
    const editor = this.editor;
    if (!editor) return;
    const current = String(editor.getAttributes('link')['href'] ?? '');
    const url = window.prompt('Адрес ссылки (пусто — убрать ссылку)', current || 'https://');
    if (url === null) return;
    if (!url.trim() || url.trim() === 'https://') {
      this.chain().extendMarkRange('link').unsetLink().run();
      return;
    }
    this.chain().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  protected toggleMarkdown(): void {
    const editor = this.editor;
    if (!editor) return;
    if (!this.markdownMode()) {
      this.markdown.set(editor.getMarkdown());
      this.markdownMode.set(true);
      return;
    }
    editor.commands.setContent(this.markdown(), { contentType: 'markdown', emitUpdate: true });
    this.value.set(editor.isEmpty ? '' : editor.getHTML());
    this.markdownMode.set(false);
  }

  /** Перед сохранением: если человек остался в Markdown, забираем текст оттуда. */
  flush(): void {
    if (this.markdownMode()) this.toggleMarkdown();
  }

  protected async uploadImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const form = [file];
      const path = this.imageScope() === 'content' ? '/files/images?scope=content' : '/files/images';
      const result = await this.api.upload<{ url: string }>(path, form, 'file');
      this.chain().setImage({ src: result.url }).run();
    } catch (error) {
      this.notify.error(errorMessage(error), 'Картинка не загрузилась');
    }
  }
}

import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import katex from 'katex';

/**
 * Формулы редактор хранит как <span data-formula="…"> (в строке) и
 * <div data-formula data-display> (отдельной строкой) с исходным LaTeX —
 * здесь они разворачиваются в вёрстку KaTeX.
 */
export function renderFormulas(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-formula]').forEach((node) => {
    const source = node.getAttribute('data-formula') ?? '';
    if (node.dataset['rendered'] === source) {
      return;
    }
    try {
      katex.render(source, node, {
        throwOnError: false,
        displayMode: node.hasAttribute('data-display') || node.tagName === 'DIV',
        output: 'html',
      });
      node.dataset['rendered'] = source;
    } catch {
      node.textContent = source;
    }
  });
}

/**
 * Показ HTML из редактора. Разметку уже очистил сервер, поэтому кладём её
 * как есть и только разворачиваем формулы.
 */
@Directive({
  selector: '[esRich]',
  host: { class: 'es-rich' },
})
export class Rich {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly esRich = input<string>('');

  constructor() {
    effect(() => {
      const root = this.element.nativeElement;
      root.innerHTML = this.esRich() || '';
      renderFormulas(root);
    });
  }
}

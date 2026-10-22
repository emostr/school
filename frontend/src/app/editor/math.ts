import { Node, mergeAttributes } from '@tiptap/core';
import katex from 'katex';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    formula: {
      insertFormula: (latex: string, display?: boolean) => ReturnType;
      updateFormula: (latex: string) => ReturnType;
    };
  }
}

function render(element: HTMLElement, latex: string, display: boolean): void {
  if (!latex.trim()) {
    element.classList.add('is-empty');
    element.textContent = '';
    return;
  }
  element.classList.remove('is-empty');
  try {
    katex.render(latex, element, { throwOnError: false, displayMode: display, output: 'html' });
  } catch {
    element.textContent = latex;
  }
}

/**
 * Формула в строке текста — неделимый знак. В документе живёт как
 * <span data-formula="\frac{1}{2}">: исходный LaTeX сохраняется как есть,
 * поэтому формулу можно поправить позже, а бланк теста, страница проверки
 * и конспект рисуют её тем же KaTeX. В Markdown — $…$.
 */
export const MathInline = Node.create({
  name: 'formula',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-formula') ?? '',
        renderHTML: (attributes) => ({ 'data-formula': attributes['latex'] as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-formula]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'ng-formula' }, HTMLAttributes)];
  },

  renderText({ node }) {
    return `$${String(node.attrs['latex'] ?? '')}$`;
  },

  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src: string) => src.indexOf('$'),
    tokenize: (src: string) => {
      const match = /^\$(?!\$)((?:\\.|[^$\\\n])+?)\$(?!\d)/.exec(src);
      return match ? { type: 'inlineMath', raw: match[0], text: match[1] } : undefined;
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode('formula', { latex: token.text ?? '' }),
  renderMarkdown: (node) => `$${String(node.attrs?.['latex'] ?? '')}$`,

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'ng-formula';
      dom.setAttribute('data-formula', String(node.attrs['latex'] ?? ''));
      render(dom, String(node.attrs['latex'] ?? ''), false);
      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'formula') return false;
          const latex = String(updated.attrs['latex'] ?? '');
          dom.setAttribute('data-formula', latex);
          render(dom, latex, false);
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      insertFormula:
        (latex: string, display = false) =>
        ({ commands }) =>
          commands.insertContent({ type: display ? 'formulaBlock' : 'formula', attrs: { latex } }),
      updateFormula:
        (latex: string) =>
        ({ editor, commands }) =>
          commands.updateAttributes(editor.isActive('formulaBlock') ? 'formulaBlock' : 'formula', { latex }),
    };
  },
});

/** Формула отдельной строкой, по центру: <div data-formula data-display>. В Markdown — $$…$$. */
export const MathBlock = Node.create({
  name: 'formulaBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-formula') ?? '',
        renderHTML: (attributes) => ({ 'data-formula': attributes['latex'] as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-formula]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'ng-formula-block', 'data-display': 'true' }, HTMLAttributes)];
  },

  markdownTokenizer: {
    name: 'blockMath',
    level: 'block',
    start: (src: string) => src.indexOf('$$'),
    tokenize: (src: string) => {
      const match = /^\$\$\s*([\s\S]+?)\s*\$\$(?:\n|$)/.exec(src);
      return match ? { type: 'blockMath', raw: match[0], text: match[1] } : undefined;
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode('formulaBlock', { latex: token.text ?? '' }),
  renderMarkdown: (node) => `$$\n${String(node.attrs?.['latex'] ?? '')}\n$$`,

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'ng-formula-block';
      dom.setAttribute('data-formula', String(node.attrs['latex'] ?? ''));
      render(dom, String(node.attrs['latex'] ?? ''), true);
      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'formulaBlock') return false;
          const latex = String(updated.attrs['latex'] ?? '');
          dom.setAttribute('data-formula', latex);
          render(dom, latex, true);
          return true;
        },
      };
    };
  },
});

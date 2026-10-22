import sanitizeHtml from 'sanitize-html';

const IMAGE_PREFIX = '/api/files/images/';

/**
 * Очистка разметки заданий и конспектов. Редактор конспектов богаче
 * конструктора тестов: заголовки, цитаты, код, таблицы, ссылки и формулы
 * в строку и отдельной строкой. Всё это видят ученики всей школы, поэтому
 * пропускаем ровно то, что умеет ставить редактор.
 */
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html ?? '', {
    allowedTags: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
      'a', 'span', 'div', 'img',
    ],
    allowedAttributes: {
      // Формула хранится исходным LaTeX и разворачивается уже в браузере.
      span: ['data-formula', 'class'],
      div: ['data-formula', 'data-display', 'class'],
      img: ['src', 'alt'],
      a: ['href', 'target', 'rel'],
      ol: ['start'],
      th: ['colspan', 'rowspan', 'colwidth'],
      td: ['colspan', 'rowspan', 'colwidth'],
      code: ['class'],
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      h4: ['style'],
    },
    allowedClasses: {
      span: ['ng-formula'],
      div: ['ng-formula-block'],
      code: [/^language-[a-z0-9-]+$/],
    },
    allowedStyles: {
      '*': { 'text-align': [/^(left|right|center|justify)$/] },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: [] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { href: attribs.href ?? '', target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
      img: (tagName, attribs) => {
        const src = attribs.src ?? '';
        if (!src.startsWith(IMAGE_PREFIX)) {
          return { tagName: 'span', attribs: {} };
        }
        return { tagName, attribs: { src, ...(attribs.alt ? { alt: attribs.alt } : {}) } };
      },
    },
  });
}

/** Пустой ли текст после очистки: «<p></p>» — это пусто. */
export function isBlankContent(html: string): boolean {
  return !/data-formula|<img|<table|<hr/i.test(html) && !html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

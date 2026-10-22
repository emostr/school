import sanitizeHtml from 'sanitize-html';

/** Куда загрузчик кладёт картинки заданий: другие адреса в разметке не нужны. */
const IMAGE_PREFIX = '/api/files/images/';

/**
 * Очистка разметки, пришедшей из визуального редактора.
 *
 * Текст задания и варианты ответа показываются как HTML — в конструкторе, при
 * проверке работ и на печатном листе. Тест можно передать коллеге, а значит
 * чужая разметка попадает на чужой экран: пропускаем только то, что редактор
 * действительно умеет ставить, и ничего сверх того.
 */
export function sanitizeRich(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'sub',
      'sup',
      'ul',
      'ol',
      'li',
      'h3',
      'span',
      'img',
    ],
    allowedAttributes: {
      // Формула хранится исходным LaTeX и разворачивается уже в браузере.
      span: ['data-formula', 'class'],
      img: ['src', 'alt'],
    },
    allowedClasses: { span: ['ng-formula'] },
    // Ни ссылок, ни data:-картинок: разрешён только наш каталог загрузок.
    allowedSchemes: [],
    allowProtocolRelative: false,
    transformTags: {
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

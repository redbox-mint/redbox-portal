import domPurify = require('dompurify');
import { JSDOM } from 'jsdom';
import {
  filterTranslationHtmlClasses, getTranslationHtmlClasses, translationHtmlTags, translationHtmlAttributes
} from '@researchdatabox/sails-ng-common';

const purifier = domPurify(new JSDOM('').window);

/** Enforce the same presentation policy for editor, REST and bundle writes. */
export function sanitizeTranslationHtml(content: string, allowedClasses?: unknown): string {
  const policy = getTranslationHtmlClasses(allowedClasses);
  purifier.addHook('afterSanitizeAttributes', node => {
    if (!('tagName' in node) || typeof node.getAttribute !== 'function') return;
    const classes = filterTranslationHtmlClasses(node.getAttribute('class'), node.tagName, policy);
    if (classes) node.setAttribute('class', classes);
    else node.removeAttribute('class');
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  try {
    return purifier.sanitize(content, {
      ALLOWED_TAGS: translationHtmlTags,
      ALLOWED_ATTR: translationHtmlAttributes,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      FORBID_ATTR: ['style'],
      FORBID_TAGS: ['style', 'script', 'link', 'iframe', 'object', 'embed', 'svg', 'math'],
    });
  } finally {
    purifier.removeHook('afterSanitizeAttributes');
  }
}

import domPurify = require('dompurify');
import { JSDOM } from 'jsdom';
import {
  filterTranslationHtmlClasses, getTranslationHtmlClasses, translationHtmlTags, translationHtmlAttributes,
  filterTranslationColumnWidth, normalizeTranslationTableWidths
} from '@researchdatabox/sails-ng-common';

const translationWindow = new JSDOM('').window;
const purifier = domPurify(translationWindow);

/** Enforce the same presentation policy for editor, REST and bundle writes. */
export function sanitizeTranslationHtml(content: string, allowedClasses?: unknown): string {
  const policy = getTranslationHtmlClasses(allowedClasses);
  const document = new translationWindow.DOMParser().parseFromString(content, 'text/html');
  normalizeTranslationTableWidths(document);
  purifier.addHook('afterSanitizeAttributes', node => {
    if (!('tagName' in node) || typeof node.getAttribute !== 'function') return;
    const classes = filterTranslationHtmlClasses(node.getAttribute('class'), node.tagName, policy);
    if (classes) node.setAttribute('class', classes);
    else node.removeAttribute('class');
    const width = filterTranslationColumnWidth(node.getAttribute('width'), node.tagName);
    if (width) node.setAttribute('width', width);
    else node.removeAttribute('width');
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  try {
    return purifier.sanitize(document.body.innerHTML, {
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

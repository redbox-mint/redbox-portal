import domPurify = require('dompurify');
import { JSDOM } from 'jsdom';
import {
  filterTranslationHtmlClasses, getTranslationHtmlClasses, translationHtmlAttributes,
  filterTranslationColumnWidth, normalizeTranslationTableWidths, translationHtmlSanitizerConfig
} from '@researchdatabox/sails-ng-common';

const translationWindow = new JSDOM('').window;
const purifier = domPurify(translationWindow);

/** Enforce the same presentation policy for editor, REST and bundle writes. */
export function sanitizeTranslationHtml(content: string, allowedClasses?: unknown): string {
  const policy = getTranslationHtmlClasses(allowedClasses);
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
    // Work on DOMPurify's sanitized DOM, never a raw parse of caller-provided HTML.
    // Reapply the full policy after normalization so editor-only colwidth never reaches storage.
    const source = purifier.sanitize(content, {
      ...translationHtmlSanitizerConfig,
      ALLOWED_ATTR: [...translationHtmlAttributes, 'colwidth'],
      RETURN_DOM: true
    });
    if (!(source instanceof translationWindow.HTMLElement)) throw new Error('HTML sanitization did not return an element');
    normalizeTranslationTableWidths(source);
    return purifier.sanitize(source.innerHTML, translationHtmlSanitizerConfig);
  } finally {
    purifier.removeHook('afterSanitizeAttributes');
  }
}

/** Developer-owned presentation policy for HTML translations; never supplied by an entry. */
export type TranslationHtmlClasses = Record<string, string[]>;

export const translationHtmlTags = [
  'a', 'p', 'br', 'strong', 'em', 'u', 'i', 'b', 's', 'span', 'div',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col'
];

export const translationHtmlAttributes = [
  'class', 'href', 'target', 'rel', 'title', 'scope', 'colspan', 'rowspan', 'colwidth', 'role'
];

const alertClasses = ['alert', 'alert-primary', 'alert-secondary', 'alert-success',
  'alert-danger', 'alert-warning', 'alert-info', 'alert-light', 'alert-dark'];
const tableColors = ['table-primary', 'table-secondary', 'table-success', 'table-danger',
  'table-warning', 'table-info', 'table-light', 'table-dark', 'table-active'];

export const defaultTranslationHtmlClasses: TranslationHtmlClasses = {
  div: alertClasses,
  p: alertClasses,
  table: ['table', 'table-bordered', 'table-borderless', 'table-sm', 'table-striped',
    'table-hover', ...tableColors],
  thead: tableColors,
  tbody: ['table-group-divider', ...tableColors],
  tfoot: tableColors,
  tr: tableColors,
  th: tableColors,
  td: tableColors
};

/** Merge exact, element-specific hook additions with core's supported classes. No wildcards. */
export function getTranslationHtmlClasses(additions?: unknown): TranslationHtmlClasses {
  const policy: TranslationHtmlClasses = {};
  for (const tag of translationHtmlTags) {
    const extra = additions && typeof additions === 'object'
      && Object.prototype.hasOwnProperty.call(additions, tag)
      ? (additions as Record<string, unknown>)[tag] : undefined;
    policy[tag] = [...new Set([
      ...(defaultTranslationHtmlClasses[tag] ?? []),
      ...(Array.isArray(extra) ? extra.filter((value): value is string =>
        typeof value === 'string' && /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(value)) : [])
    ])];
  }
  return policy;
}

export function filterTranslationHtmlClasses(
  value: string | null | undefined, tag: string, policy: TranslationHtmlClasses
): string {
  const allowed = new Set(policy[tag.toLowerCase()] ?? []);
  return [...new Set((value ?? '').split(/\s+/).filter(token => allowed.has(token)))].join(' ');
}

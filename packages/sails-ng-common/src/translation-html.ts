/** Developer-owned presentation policy for HTML translations; never supplied by an entry. */
export type TranslationHtmlClasses = Record<string, string[]>;

export const translationHtmlTags = [
  'a', 'p', 'br', 'strong', 'em', 'u', 'i', 'b', 's', 'span', 'div',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col'
];

export const translationHtmlAttributes = [
  'class', 'href', 'target', 'rel', 'title', 'scope', 'colspan', 'rowspan', 'width', 'role'
];

/** Only pixel counts on table columns are supported; percentages and CSS are not width metadata. */
export function filterTranslationColumnWidth(value: string | null, tag = 'col'): string | null {
  if (tag.toLowerCase() !== 'col' || !value || !/^[1-9]\d*$/.test(value)) return null;
  const width = Number(value);
  return Number.isSafeInteger(width) ? String(width) : null;
}

function tableColumns(table: HTMLTableElement): HTMLTableColElement[] {
  // Restrict the lookup to this table so nested tables cannot supply the outer cell's widths.
  return Array.from(table.children).filter(child => child.tagName === 'COLGROUP')
    .flatMap(group => Array.from(group.querySelectorAll<HTMLTableColElement>('col')));
}

function parseCellWidths(cell: HTMLTableCellElement): number[] | null {
  const raw = cell.getAttribute('colwidth');
  if (!raw) return null;
  const tokens = raw.split(',');
  if (tokens.length !== cell.colSpan || tokens.some(token => !/^\d+$/.test(token))) return null;
  const widths = tokens.map(Number);
  // Tiptap uses zero for an unmeasured column within a merged cell.
  return widths.every(width => Number.isSafeInteger(width) && width >= 0) ? widths : null;
}

/** Convert editor-only colwidth arrays into numeric HTML widths before either sanitizer runs. */
export function normalizeTranslationTableWidths(document: Document): void {
  document.querySelectorAll('table').forEach(table => {
    const columns = tableColumns(table);
    const widths: Array<string | null> = columns.map(col => filterTranslationColumnWidth(col.getAttribute('width')));
    const cells = Array.from(table.rows[0]?.cells ?? []);
    const columnCount = cells.reduce((count, cell) => count + cell.colSpan, 0);
    while (widths.length < columnCount) widths.push(null);
    let index = 0;
    for (const cell of cells) {
      const cellWidths = parseCellWidths(cell);
      if (cellWidths) cellWidths.forEach((width, offset) => {
        widths[index + offset] = width > 0 ? String(width) : null;
      });
      index += cell.colSpan;
    }
    if (!widths.some(width => width !== null)) return;
    let group = Array.from(table.children).filter(child => child.tagName === 'COLGROUP').at(-1);
    if (!group) {
      group = document.createElement('colgroup');
      table.insertBefore(group, table.firstChild);
    }
    widths.forEach((width, columnIndex) => {
      let col = columns[columnIndex];
      if (!col) {
        col = document.createElement('col');
        group.appendChild(col);
      }
      if (width) col.setAttribute('width', width);
      else col.removeAttribute('width');
    });
  });
  document.querySelectorAll('*').forEach(element => {
    // Angular strips colwidth and inline styles. Persist only validated standard column widths,
    // which survive sanitization and can reconstruct the editor's sizing without trusting HTML.
    element.removeAttribute('colwidth');
    const width = filterTranslationColumnWidth(element.getAttribute('width'), element.tagName);
    if (width) element.setAttribute('width', width);
    else element.removeAttribute('width');
  });
}

/** Rebuild the logical column slice for a cell, including colspan and preceding rowspans. */
export function readTranslationCellWidths(element: HTMLElement): number[] | null {
  const table = element.closest('table');
  if (!table) return null;
  const widths = tableColumns(table).map(col => Number(filterTranslationColumnWidth(col.getAttribute('width'))) || 0);
  const rows = Array.from(table.rows);
  const occupiedUntil: number[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    let columnIndex = 0;
    for (const cell of Array.from(rows[rowIndex].cells)) {
      while ((occupiedUntil[columnIndex] ?? 0) > rowIndex) columnIndex++;
      if (cell === element) {
        const slice = Array.from({ length: cell.colSpan }, (_, offset) => widths[columnIndex + offset] ?? 0);
        return slice.some(width => width > 0) ? slice : null;
      }
      let groupEnd = rowIndex + 1;
      while (groupEnd < rows.length && rows[groupEnd].parentElement === rows[rowIndex].parentElement) groupEnd++;
      const spanEnd = cell.rowSpan === 0 ? groupEnd : Math.min(groupEnd, rowIndex + cell.rowSpan);
      for (let offset = 0; offset < cell.colSpan; offset++) occupiedUntil[columnIndex + offset] = spanEnd;
      columnIndex += cell.colSpan;
    }
  }
  return null;
}

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

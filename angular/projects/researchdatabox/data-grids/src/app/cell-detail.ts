import { FieldType, JsonValue } from './data-grid.model';

export const CELL_TEXT = {
  missing: 'Missing',
  null: 'No value',
  'null-item': 'No item (null)',
  'empty-text': '(empty text)',
  true: 'True',
  false: 'False',
  'empty-list': 'Empty list',
  'empty-object': 'Empty object',
  'view-details': 'View details',
  'view-group': 'View group details',
  more: 'more',
  item: 'item',
  items: 'items',
  'item-heading': 'Item',
  'open-value': 'Open full value',
  close: 'Close details',
};
export type CellText = (key: keyof typeof CELL_TEXT) => string;
const defaultText: CellText = key => CELL_TEXT[key];

export function displayScalar(value: JsonValue | undefined, type?: FieldType, t: CellText = defaultText): string {
  if (value === undefined) return t('missing');
  if (value === null) return t('null');
  if (value === '') return t('empty-text');
  if (typeof value === 'boolean') return value ? t('true') : t('false');
  // Number.toString is the shortest representation that roundtrips to the same JS value.
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  // Only advertised timestamps receive date treatment; date-like strings remain text.
  if (type === 'datetime' && typeof value === 'string' && Number.isFinite(Date.parse(value)))
    return new Date(value).toISOString();
  return String(value);
}
export function cellSummary(value: JsonValue | undefined, type?: FieldType, t: CellText = defaultText): string {
  if (Array.isArray(value)) {
    if (!value.length) return t('empty-list');
    if (value.some(item => item !== null && typeof item === 'object'))
      return `${value.length} ${value.length === 1 ? t('item') : t('items')} · ${t('view-details')}`;
    const first = value
      .slice(0, 2)
      .map(item => {
        const text = displayScalar(item, undefined, t);
        return text.length > 36 ? text.slice(0, 36) + '…' : text;
      })
      .join('; ');
    return `${first}${value.length > 2 ? `; +${value.length - 2} ${t('more')}` : ''}`;
  }
  if (value !== null && typeof value === 'object') return t('view-group');
  return displayScalar(value, type, t);
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
/** Recursion stays inside its owning table cell, so nested repeated groups retain pairing. */
export function detailValue(value: JsonValue | undefined, t: CellText = defaultText): HTMLElement {
  if (Array.isArray(value)) {
    if (!value.length) return element('span', t('empty-list'));
    if (value.every(item => item === null || (typeof item === 'object' && !Array.isArray(item)))) {
      const keys = [...new Set(value.flatMap(item => (item ? Object.keys(item) : [])))];
      if (keys.length) {
        const table = element('table');
        const head = element('thead'),
          header = element('tr');
        header.append(element('th', t('item-heading')));
        for (const key of keys) {
          const th = element('th', key);
          th.scope = 'col';
          header.append(th);
        }
        head.append(header);
        table.append(head);
        const body = element('tbody');
        value.forEach((item, index) => {
          const row = element('tr'),
            label = element('th', String(index + 1));
          label.scope = 'row';
          row.append(label);
          if (item === null) {
            const missingItem = element('td', t('null-item'));
            missingItem.colSpan = keys.length;
            row.append(missingItem);
            body.append(row);
            return;
          }
          for (const key of keys) {
            const cell = element('td');
            cell.append(
              detailValue(
                item === null
                  ? null
                  : typeof item === 'object' && !Array.isArray(item) && Object.hasOwn(item, key)
                    ? item[key]
                    : undefined,
                t
              )
            );
            row.append(cell);
          }
          body.append(row);
        });
        table.append(body);
        return table;
      }
    }
    const list = element('ol');
    for (const item of value) {
      const li = element('li');
      li.append(detailValue(item, t));
      list.append(li);
    }
    return list;
  }
  if (value !== null && typeof value === 'object') {
    if (!Object.keys(value).length) return element('span', t('empty-object'));
    const list = element('dl');
    for (const [key, item] of Object.entries(value)) {
      list.append(element('dt', key));
      const dd = element('dd');
      dd.append(detailValue(item, t));
      list.append(dd);
    }
    return list;
  }
  return element('span', displayScalar(value, undefined, t));
}
let nextDialog = 0;
/** Native modal supplies focus containment, Escape and focus return; values are always text nodes. */
export function inspectCell(
  value: JsonValue | undefined,
  label: string,
  type?: FieldType,
  t: CellText = defaultText
): HTMLElement {
  const summary = cellSummary(value, type, t);
  if (!(value !== null && typeof value === 'object') && summary.length <= 100) return element('span', summary);
  const button = element('button', summary.length > 100 ? summary.slice(0, 100) + '… · ' + t('view-details') : summary);
  // Keep the extra-value indicator visible even when the grid column clips its preview.
  if (Array.isArray(value) && value.length && value.every(item => item === null || typeof item !== 'object')) {
    const separator = summary.lastIndexOf('; +');
    const preview = element('span', separator < 0 ? summary : summary.slice(0, separator));
    preview.className = 'grid-cell-preview';
    const extra = element(
      'span',
      separator < 0 ? `${value.length} ${t(value.length === 1 ? 'item' : 'items')}` : summary.slice(separator + 2)
    );
    extra.className = 'grid-cell-more';
    button.replaceChildren(preview, extra);
  }
  button.type = 'button';
  button.className = 'grid-cell-detail-button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-label', `${label}: ${button.textContent}. ${t('open-value')}`);
  button.addEventListener('click', () => {
    const dialog = element('dialog');
    dialog.className = 'grid-cell-detail rb-admin';
    const title = element('h2', label);
    title.id = `grid-cell-detail-${++nextDialog}`;
    dialog.setAttribute('aria-labelledby', title.id);
    const header = element('header');
    header.className = 'grid-cell-detail-header';
    header.append(title);
    const content = element('div');
    content.className = 'grid-cell-detail-content';
    content.append(detailValue(value, t));
    const footer = element('footer');
    footer.className = 'grid-cell-detail-footer';
    const close = element('button', t('close'));
    close.type = 'button';
    close.className = 'btn btn-outline-secondary grid-cell-detail-close';
    close.autofocus = true;
    close.addEventListener('click', () => dialog.close());
    footer.append(close);
    dialog.append(header, content, footer);
    dialog.addEventListener(
      'close',
      () => {
        dialog.remove();
        if (button.isConnected) button.focus();
      },
      { once: true }
    );
    document.body.append(dialog);
    dialog.showModal();
  });
  return button;
}

/** Let grid keyboard users enter the inspector without relying on pointer interaction. */
export function detailKeyboard(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  const cell = target.closest<HTMLElement>('[role="gridcell"]');
  const button = cell?.querySelector<HTMLButtonElement>('.grid-cell-detail-button');
  if (!cell || !button) return false;
  if (event.key === 'Enter' || event.key === ' ') {
    if (target !== button) {
      event.preventDefault();
      button.click();
    }
    return true;
  }
  if (event.key === 'Tab' && ((!event.shiftKey && target === cell) || (event.shiftKey && target === button))) {
    event.preventDefault();
    (target === cell ? button : cell).focus();
    return true;
  }
  return false;
}

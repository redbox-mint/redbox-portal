import { cellSummary, detailValue, inspectCell, displayScalar, detailKeyboard } from './cell-detail';
import { rawRows } from './graphql-query';
import { JsonValue, validatePage } from './data-grid.model';

describe('Structured record cells', () => {
  it('summarizes additional list values explicitly and retains false, zero, empty and null', () => {
    expect(cellSummary([false, 0, '', null])).toBe('False; 0; +2 more');
    expect(cellSummary([])).toBe('Empty list');
    expect(displayScalar('2026-03-04')).toBe('2026-03-04');
    expect(displayScalar('2026-03-04T04:00:00+04:00', 'datetime')).toBe('2026-03-04T00:00:00.000Z');
    expect(detailValue([false, 0, '', null]).textContent).toContain('False0(empty text)No value');
  });
  it('preserves tiny, precise, extreme and signed-zero JS numbers without rounding', () => {
    for (const value of [
      1e-21,
      -1e-25,
      1.234567890123456e-15,
      Number.MIN_VALUE,
      Number.MAX_VALUE,
      0,
      -0,
      123456789.12345679,
    ]) {
      const expected = Object.is(value, -0) ? '-0' : String(value);
      expect(displayScalar(value)).toBe(expected);
      expect(cellSummary(value)).toBe(expected);
      expect(detailValue(value).textContent).toBe(expected);
      expect(Object.is(Number(detailValue(value).textContent), value)).toBeTrue();
    }
  });
  it('distinguishes a null repeated item from an object with every child null', () => {
    const table = detailValue([null, { name: null, email: null }]);
    const rows = table.querySelector('tbody')!.children;
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('th')!.textContent).toBe('1');
    expect(rows[0].querySelector('td')!.colSpan).toBe(2);
    expect(rows[0].querySelector('td')!.textContent).toBe('No item (null)');
    expect(rows[1].querySelector('th')!.textContent).toBe('2');
    expect(rows[1].querySelectorAll('td').length).toBe(2);
    expect(rows[1].querySelectorAll('td')[0].textContent).toBe('No value');
    expect(rows[1].querySelectorAll('td')[1].textContent).toBe('No value');
  });
  it('renders empty objects explicitly at the root and inside nested repeated details', () => {
    expect(detailValue({}).textContent).toBe('Empty object');
    const details = detailValue([{ nested: {} }, {}, null, []]);
    expect(details.textContent).toContain('Empty object');
    expect(details.textContent).toContain('No value');
    expect(details.textContent).toContain('Empty list');
    expect(detailValue({ nested: {} }).textContent).toBe('nestedEmpty object');
  });
  it('keeps each name/email pair and nested repeated group in its original row', () => {
    const value: JsonValue = [
      {
        name: '<img src=x onerror=alert(1)>',
        email: 'first@example.invalid',
        children: [{ name: 'Child A', email: null }],
      },
      { name: 'Second', children: [{ name: 'Child B', email: 'b@example.invalid' }] },
    ];
    const table = detailValue(value);
    const rows = table.querySelector('tbody')!.children;
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('first@example.invalid');
    expect(rows[0].textContent).not.toContain('Child B');
    expect(rows[1].textContent).toContain('Missing');
    expect(rows[1].textContent).toContain('Child B');
    expect(table.querySelector('img')).toBeNull();
    expect(table.querySelectorAll('table').length).toBe(2); // Nested child table only (root is itself a table).
  });
  it('opens a labelled modal from a keyboard-operable button and restores focus on close', async () => {
    const button = inspectCell([{ name: 'One', email: 'one@example.invalid' }], 'Investigators');
    document.body.append(button);
    button.focus();
    button.click();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.grid-cell-detail')!;
    expect(dialog.open).toBeTrue();
    expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')!.id);
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    dialog.querySelector('button')!.click();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(document.querySelector('dialog.grid-cell-detail')).toBeNull();
    expect(document.activeElement).toBe(button);
    button.remove();
  });
  it('lets grid keyboard users Tab into details and activate from the owning cell', async () => {
    const cell = document.createElement('div');
    cell.setAttribute('role', 'gridcell');
    cell.tabIndex = 0;
    const button = inspectCell([0, false, null], 'Flags');
    cell.append(button);
    document.body.append(cell);
    cell.addEventListener('keydown', event => detailKeyboard(event));
    cell.focus();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(button);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(cell);
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const dialog = document.querySelector<HTMLDialogElement>('dialog.grid-cell-detail')!;
    expect(dialog.open).toBeTrue();
    dialog.close();
    await new Promise(resolve => setTimeout(resolve, 30));
    cell.remove();
  });
  it('uses localized inspector labels and marks clipped previews while retaining full values', () => {
    const text = 'A'.repeat(80);
    const button = inspectCell([text, text, 'last'], 'Names', undefined, key => (key === 'more' ? 'additional' : key));
    expect(button.textContent).toContain('+1 additional');
    expect(button.querySelector('.grid-cell-more')!.textContent).toBe('+1 additional');
    expect(button.textContent).toContain('…');
  });
  it('preserves arbitrary raw lists as cells with one row per record and bounded page identity', () => {
    const people = [{ name: 'One', email: 'one@example.invalid', nested: [[0, false], [null]] }];
    const mapped = rawRows(
      {
        records: {
          nodes: [
            { oid: 'a', people },
            { oid: 'b', people: [] },
          ],
        },
      },
      ['records', 'nodes'],
      'oid'
    );
    expect(mapped.rows.length).toBe(2);
    expect<unknown>(JSON.stringify(mapped.rows[0].values['people'])).toBe(JSON.stringify(people));
    expect<unknown>(JSON.stringify(mapped.rows[1].values['people'])).toBe('[]');
    expect(() =>
      validatePage({ rows: mapped.rows, pageInfo: { hasNextPage: true, endCursor: 'next' } }, 25, null)
    ).not.toThrow();
  });
});

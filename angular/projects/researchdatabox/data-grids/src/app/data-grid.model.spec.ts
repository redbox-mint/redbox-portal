import { filterValue, normalizeTimestamp, GridField, queryFor, validateGrid, validatePage } from './data-grid.model';

import { scope, validGrid } from './data-grid.testing';
const byId = (id: string): GridField => scope.fields.find(field => field.id === id)!;

describe('Data grid configuration', () => {
  it('blocks NUMBER-to-STRING drift and legacy unbound filters before constructing any query', () => {
    const grid = validGrid();
    grid.filters = [{ fieldId: 'budget', expectedScalarType: 'NUMBER', operator: 'eq', values: ['1.0'] }];
    expect(queryFor(grid, scope, null).filters[0].value).toBe(1);
    const changed = {
      ...scope,
      fields: scope.fields.map(field => (field.id === 'budget' ? { ...field, type: 'text' as const } : field)),
    };
    expect(validateGrid(grid, changed).some(issue => issue.key === 'filter-type-changed')).toBeTrue();
    expect(() => queryFor(grid, changed, null)).toThrow();
    delete grid.filters[0].expectedScalarType;
    expect(() => queryFor(grid, scope, null)).toThrow();
  });
  it('produces typed AND filter values without changing the saved definition', () => {
    const grid = validGrid();
    grid.filters = [
      { fieldId: 'budget', expectedScalarType: 'NUMBER' as const, operator: 'between', values: ['1.5', '200'] },
      { fieldId: 'active', expectedScalarType: 'BOOLEAN' as const, operator: 'eq', values: ['false'] },
      { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'exists', values: ['false'] },
    ];
    const result = queryFor(grid, scope, 'opaque-cursor');
    expect(result.filters.map(filter => filter.value)).toEqual([[1.5, 200], false, false]);
    expect(result.after).toBe('opaque-cursor');
    result.definition.columns.push('budget');
    expect(grid.columns).toEqual(['title']);
  });
  it('rejects filters and sorts unsupported by the catalogue, including unavailable saved fields', () => {
    const grid = validGrid();
    grid.columns.push('removed');
    grid.filters = [{ fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'gt', values: ['x'] }];
    grid.sort = { fieldId: 'active', direction: 'asc', expectedScalarType: 'BOOLEAN' };
    expect(validateGrid(grid, scope).map(issue => issue.key)).toEqual([
      'unavailable-column',
      'unavailable-filter',
      'unavailable-sort',
    ]);
  });
  it('rejects unsupported repeated columns and duplicate columns', () => {
    const grid = validGrid();
    grid.columns = ['people', 'title', 'title'];
    expect(validateGrid(grid, scope).map(issue => issue.key)).toContain('duplicate-columns');
    expect(validateGrid(grid, scope).map(issue => issue.key)).toContain('unavailable-column');
  });
  it('validates real calendar dates, finite decimal numbers and enum membership', () => {
    for (const [id, value] of [
      ['start', '2026-02-30'],
      ['budget', 'Infinity'],
      ['budget', '0x20'],
      ['budget', '2xyz'],
      ['status', 'removed'],
      ['active', 'yes'],
    ]) {
      expect(() => filterValue({ fieldId: id, operator: 'eq', values: [value] }, byId(id))).toThrow();
    }
    expect(
      filterValue(
        {
          fieldId: 'start',
          expectedScalarType: 'DATETIME' as const,
          operator: 'eq',
          values: ['2028-02-29T12:00:00+12:00'],
        },
        byId('start')
      )
    ).toBe('2028-02-29T00:00:00.000Z');
  });
  it('rejects reversed ranges, empty lists and oversized filter values', () => {
    expect(() =>
      filterValue(
        { fieldId: 'budget', expectedScalarType: 'NUMBER' as const, operator: 'between', values: ['20', '10'] },
        byId('budget')
      )
    ).toThrow();
    expect(() =>
      filterValue(
        { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'in', values: [] },
        byId('title')
      )
    ).toThrow();
    expect(() =>
      filterValue(
        { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'eq', values: ['x'.repeat(257)] },
        byId('title')
      )
    ).toThrow();
    expect(() =>
      filterValue(
        { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'in', values: Array(26).fill('x') },
        byId('title')
      )
    ).toThrow();
  });
  it('matches endpoint timestamp, integer, UTF-8 byte and existence semantics', () => {
    for (const timestamp of [
      '2026-02-30T00:00:00Z',
      '2026-01-01T24:00:00Z',
      '2026-01-01T00:00:60Z',
      '2026-01-01T00:00:00+24:00',
      '2026-01-01T00:00:00+00:60',
      '2026-01-01T00:00:00.1234Z',
      '2026-01-01',
      '0000-01-01T00:00:00Z',
      '0001-01-01T00:00:00+01:00',
    ])
      expect(() => normalizeTimestamp(timestamp)).toThrow();
    expect(normalizeTimestamp('2028-02-29T12:00:00+12:00')).toBe('2028-02-29T00:00:00.000Z');
    expect(() =>
      filterValue(
        {
          fieldId: 'start',
          expectedScalarType: 'DATETIME' as const,
          operator: 'between',
          values: ['2026-01-01T12:00:00-12:00', '2026-01-01T13:00:00+12:00'],
        },
        byId('start')
      )
    ).toThrow();
    expect(() =>
      filterValue(
        { fieldId: 'budget', expectedScalarType: 'NUMBER' as const, operator: 'eq', values: ['1.5'] },
        { ...byId('budget'), integer: true }
      )
    ).toThrow();
    expect(() =>
      filterValue(
        { fieldId: 'budget', expectedScalarType: 'NUMBER' as const, operator: 'eq', values: ['9007199254740992'] },
        { ...byId('budget'), integer: true }
      )
    ).toThrow();
    expect(() =>
      filterValue(
        { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'eq', values: ['é'.repeat(129)] },
        byId('title')
      )
    ).toThrow();
    expect(
      filterValue(
        { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'eq', values: [''] },
        byId('title')
      )
    ).toBe('');
    expect(() =>
      filterValue(
        { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'contains', values: [''] },
        byId('title')
      )
    ).toThrow();
    expect(
      filterValue(
        { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'exists', values: ['false'] },
        byId('title')
      )
    ).toBeFalse();
    expect(() =>
      filterValue(
        { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'exists', values: [] },
        byId('title')
      )
    ).toThrow();
    expect(() =>
      filterValue(
        { fieldId: 'title', expectedScalarType: 'STRING' as const, operator: 'in', values: Array(21).fill('x') },
        byId('title')
      )
    ).toThrow();
  });
  it('enforces page, filter and column bounds before querying', () => {
    const grid = validGrid();
    grid.pageSize = 1000;
    grid.filters = Array(11).fill({
      fieldId: 'title',
      expectedScalarType: 'STRING' as const,
      operator: 'eq',
      values: ['a'],
    });
    expect(validateGrid(grid, scope).map(issue => issue.key)).toContain('invalid-page-size');
    expect(validateGrid(grid, scope).map(issue => issue.key)).toContain('too-many-filters');
    expect(() => queryFor(grid, scope, null)).toThrow();
  });
  it('rejects duplicate rows, oversize pages and non-advancing continuation cursors', () => {
    const row = { oid: 'a', values: { title: 'A' } };
    expect(() =>
      validatePage({ rows: [row, row], pageInfo: { hasNextPage: false, endCursor: null } }, 25, null)
    ).toThrow();
    expect(() => validatePage({ rows: [row], pageInfo: { hasNextPage: true, endCursor: 'old' } }, 25, 'old')).toThrow();
    expect(() => validatePage({ rows: [row], pageInfo: { hasNextPage: false, endCursor: null } }, 0, null)).toThrow();
    expect(() => validatePage({ rows: [], pageInfo: { hasNextPage: false, endCursor: null } }, 25, null)).not.toThrow();
  });
});

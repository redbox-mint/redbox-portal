import assert from 'node:assert/strict';
import {
  recordGridFilter,
  recordGridFilterValue,
  recordGridSort,
  type RecordGridOperator,
} from '../../src/record-grid-filter';

const field = {
  scalarType: 'STRING',
  filterable: true,
  repeating: false,
  availableInAllVariants: true,
  operators: ['EQ', 'IN', 'EXISTS', 'CONTAINS', 'IPREFIX'],
};
const filter = {
  fieldId: 'metadata:/title',
  expectedScalarType: 'STRING',
  operator: 'eq' as const,
  values: ['current'],
};

describe('shared visual grid filter validation', () => {
  it('builds typed operands from current raw values without mutating inputs', () => {
    const before = structuredClone(filter);
    assert.deepEqual(recordGridFilter(filter, field), { field: filter.fieldId, eq: { text: 'current' } });
    assert.deepEqual(recordGridFilter({ ...filter, operator: 'contains' }, field), {
      field: filter.fieldId,
      contains: 'current',
    });
    assert.deepEqual(recordGridFilter({ ...filter, operator: 'iprefix' }, field), {
      field: filter.fieldId,
      iprefix: 'current',
    });
    assert.deepEqual(recordGridFilter({ ...filter, operator: 'exists', values: ['false'] }, field), {
      field: filter.fieldId,
      exists: false,
    });
    assert.deepEqual(recordGridFilter({ ...filter, operator: 'in', values: ['', 'next'] }, field), {
      field: filter.fieldId,
      in: [{ text: '' }, { text: 'next' }],
    });
    assert.deepEqual(
      recordGridFilter(
        { ...filter, expectedScalarType: 'INTEGER', values: ['+02'] },
        { ...field, scalarType: 'INTEGER' }
      ),
      { field: filter.fieldId, eq: { number: 2 } }
    );
    assert.deepEqual(
      recordGridFilter(
        { ...filter, expectedScalarType: 'BOOLEAN', values: ['false'] },
        { ...field, scalarType: 'BOOLEAN' }
      ),
      { field: filter.fieldId, eq: { boolean: false } }
    );
    assert.deepEqual(
      recordGridFilter(
        {
          ...filter,
          expectedScalarType: 'DATETIME',
          operator: 'between',
          values: ['2028-02-29T12:00:00+12:00', '2028-03-01T00:00:00Z'],
        },
        { ...field, scalarType: 'DATETIME', operators: ['BETWEEN'] }
      ),
      {
        field: filter.fieldId,
        between: { from: { dateTime: '2028-02-29T00:00:00.000Z' }, to: { dateTime: '2028-03-01T00:00:00.000Z' } },
      }
    );
    assert.deepEqual(filter, before);
  });
  for (const unavailable of [
    { filterable: false },
    { repeating: true, scalarType: 'JSON' },
    { availableInAllVariants: false },
    { operators: [] },
  ])
    it(`rejects unavailable fresh capabilities ${JSON.stringify(unavailable)}`, () => {
      assert.throws(() => recordGridFilter(filter, { ...field, ...unavailable }), /schema-changed/);
    });
  it('accepts declared scalar-list element predicates only with matching expected LIST cardinality', () => {
    const list = { ...field, repeating: true, cardinality: 'LIST' as const };
    const listFilter = { ...filter, expectedCardinality: 'LIST' as const };
    // Operands are unchanged; storage applies any-element semantics.
    assert.deepEqual(recordGridFilter(listFilter, list), recordGridFilter(filter, field));
    assert.deepEqual(recordGridFilter({ ...listFilter, operator: 'iprefix' }, list), {
      field: filter.fieldId,
      iprefix: 'current',
    });
    // Legacy (missing) and explicit SCALAR expectations require visible repair.
    assert.throws(() => recordGridFilter(filter, list), /filter-cardinality-changed/);
    assert.throws(
      () => recordGridFilter({ ...filter, expectedCardinality: 'SCALAR' }, list),
      /filter-cardinality-changed/
    );
    assert.throws(() => recordGridFilter(listFilter, field), /filter-cardinality-changed/);
    assert.throws(
      () => recordGridFilter(listFilter, { ...field, cardinality: 'SCALAR' }),
      /filter-cardinality-changed/
    );
    // Type drift is reported first so its repair also resets the cardinality.
    assert.throws(() => recordGridFilter(filter, { ...list, scalarType: 'NUMBER' }), /filter-type-changed/);
  });
  for (const unavailable of [
    { repeating: true },
    { repeating: true, cardinality: 'SCALAR' as const },
    { repeating: false, cardinality: 'LIST' as const },
    { repeating: true, cardinality: 'LIST' as const, scalarType: 'JSON' },
    { repeating: true, cardinality: 'LIST' as const, scalarType: 'MIXED' },
  ])
    it(`rejects repeating fields that are not declared scalar lists ${JSON.stringify(unavailable)}`, () => {
      assert.throws(
        () => recordGridFilter({ ...filter, expectedCardinality: 'LIST' }, { ...field, ...unavailable }),
        /schema-changed/
      );
    });
  it('validates sorts against current capabilities, type and cardinality', () => {
    const sortField = { scalarType: 'STRING', sortable: true, repeating: false, availableInAllVariants: true };
    const sort = { fieldId: 'metadata:/title', direction: 'desc' as const, expectedScalarType: 'STRING' };
    assert.deepEqual(recordGridSort(sort, sortField), { field: 'metadata:/title', direction: 'DESC' });
    assert.deepEqual(
      recordGridSort({ ...sort, expectedCardinality: 'SCALAR' }, { ...sortField, cardinality: 'SCALAR' }),
      {
        field: 'metadata:/title',
        direction: 'DESC',
      }
    );
    const list = { ...sortField, repeating: true, cardinality: 'LIST' as const };
    assert.deepEqual(recordGridSort({ ...sort, direction: 'asc', expectedCardinality: 'LIST' }, list), {
      field: 'metadata:/title',
      direction: 'ASC',
    });
    assert.throws(() => recordGridSort(sort, list), /sort-cardinality-changed/);
    assert.throws(
      () => recordGridSort({ ...sort, expectedCardinality: 'LIST' }, sortField),
      /sort-cardinality-changed/
    );
    assert.throws(() => recordGridSort({ ...sort, expectedScalarType: undefined }, sortField), /sort-type-changed/);
    assert.throws(() => recordGridSort(sort, { ...sortField, scalarType: 'NUMBER' }), /sort-type-changed/);
    for (const unavailable of [
      { sortable: false },
      { availableInAllVariants: false },
      { repeating: true },
      { repeating: true, cardinality: 'LIST' as const, scalarType: 'JSON' },
    ])
      assert.throws(
        () => recordGridSort({ ...sort, expectedCardinality: 'LIST' }, { ...sortField, ...unavailable }),
        /schema-changed/
      );
    assert.throws(() => recordGridSort({ ...sort, direction: 'up' as never }, sortField), /schema-changed/);
  });
  it('rejects missing or changed type bindings and unsupported scalar discovery', () => {
    assert.throws(() => recordGridFilter({ ...filter, expectedScalarType: undefined }, field), /filter-type-changed/);
    assert.throws(() => recordGridFilter(filter, { ...field, scalarType: 'NUMBER' }), /filter-type-changed/);
    assert.throws(
      () => recordGridFilter({ ...filter, expectedScalarType: 'OBJECT' }, { ...field, scalarType: 'OBJECT' }),
      /invalid-scalar-type/
    );
  });
  const invalid: [string, RecordGridOperator, string[]][] = [
    ['STRING', 'exists', []],
    ['STRING', 'exists', ['true', 'false']],
    ['STRING', 'exists', ['yes']],
    ['STRING', 'contains', ['']],
    ['STRING', 'contains', ['a', 'b']],
    ['STRING', 'iprefix', ['']],
    ['STRING', 'iprefix', ['a', 'b']],
    ['NUMBER', 'iprefix', ['1']],
    ['INTEGER', 'iprefix', ['1']],
    ['BOOLEAN', 'iprefix', ['true']],
    ['DATETIME', 'iprefix', ['2026-01-01T00:00:00Z']],
    ['STRING', 'eq', []],
    ['STRING', 'eq', ['a', 'b']],
    ['STRING', 'in', []],
    ['STRING', 'in', Array(21).fill('x')],
    ['STRING', 'eq', ['é'.repeat(129)]],
    ['NUMBER', 'eq', ['Infinity']],
    ['NUMBER', 'eq', ['0x20']],
    ['INTEGER', 'eq', ['1.5']],
    ['INTEGER', 'eq', ['9007199254740992']],
    ['BOOLEAN', 'eq', ['yes']],
    ['NUMBER', 'between', ['20', '10']],
    ['NUMBER', 'between', ['10']],
    ['BOOLEAN', 'between', ['false', 'true']],
    ['DATETIME', 'eq', ['2026-02-30T00:00:00Z']],
    ['DATETIME', 'between', ['2026-01-01T12:00:00-12:00', '2026-01-01T13:00:00+12:00']],
  ];
  invalid.forEach(([scalarType, operator, values], index) =>
    it(`rejects crafted operands ${index + 1}`, () => {
      assert.throws(() => recordGridFilterValue(scalarType, operator, values));
    })
  );
  it('allows the bounded IN and UTF-8 edges and empty equality', () => {
    assert.equal((recordGridFilterValue('STRING', 'in', Array(20).fill('x')) as string[]).length, 20);
    assert.equal(recordGridFilterValue('STRING', 'eq', ['é'.repeat(128)]), 'é'.repeat(128));
    assert.equal(recordGridFilterValue('STRING', 'eq', ['']), '');
  });
});

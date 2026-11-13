import assert from 'node:assert/strict';
import { recordGridFilter, recordGridFilterValue, type RecordGridOperator } from '../../src/record-grid-filter';

const field = {
  scalarType: 'STRING',
  filterable: true,
  repeating: false,
  availableInAllVariants: true,
  operators: ['EQ', 'IN', 'EXISTS', 'CONTAINS'],
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
    { repeating: true },
    { availableInAllVariants: false },
    { operators: [] },
  ])
    it(`rejects unavailable fresh capabilities ${JSON.stringify(unavailable)}`, () => {
      assert.throws(() => recordGridFilter(filter, { ...field, ...unavailable }), /schema-changed/);
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

import assert from 'node:assert/strict';
import { flattenContextFields } from '../../src/schema-fields';
import {
  queryResultFields,
  reportCsvTemplateFields,
  reportDisplayTemplateFields,
} from '../../src/query-report-context';

describe('report column context adapters', () => {
  const rows = queryResultFields(
    'record',
    flattenContextFields({
      properties: {
        team: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              groups: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' } } } },
            },
          },
        },
        teamwork: { type: 'object', properties: { unrelated: { type: 'string' } } },
      },
    })
  );

  it('keeps array item descendants in a CSV value when multivalue is disabled', () => {
    const fields = reportCsvTemplateFields(rows, 'metadata.team', false);
    assert.equal(fields.find(field => field.path === 'recordTableMeta.val')?.type, 'array');
    assert.equal(fields.find(field => field.path === 'recordTableMeta.val[].name')?.type, 'string');
    assert.equal(fields.find(field => field.path === 'recordTableMeta.val[].groups[].label')?.type, 'string');
    assert.equal(
      fields.some(field => field.path.startsWith('recordTableMeta.valwork')),
      false
    );
  });

  it('keeps display val undefined for an array column when multivalue is disabled', () => {
    const fields = reportDisplayTemplateFields(rows, 'metadata.team', false);
    assert.equal(fields.find(field => field.path === 'recordTableMeta.val')?.type, 'undefined');
    assert.equal(
      fields.some(field => field.path.startsWith('recordTableMeta.val[]')),
      false
    );
    assert.ok(fields.some(field => field.path === 'metadata.team[].name'));
  });

  it('rebases nested array descendants onto each multivalue item for both contexts', () => {
    for (const adapter of [reportCsvTemplateFields, reportDisplayTemplateFields]) {
      const fields = adapter(rows, 'metadata.team', true);
      assert.equal(fields.find(field => field.path === 'recordTableMeta.val')?.type, 'object');
      assert.equal(fields.find(field => field.path === 'recordTableMeta.val.name')?.type, 'string');
      assert.equal(fields.find(field => field.path === 'recordTableMeta.val.groups[].label')?.type, 'string');
    }
  });
});

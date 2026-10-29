import { validateContextJson } from './context-validation';
import type { EmailContextSchema } from '@researchdatabox/sails-ng-common';

describe('validateContextJson', () => {
  const schema: EmailContextSchema = {
    type: 'object',
    required: ['record'],
    additionalProperties: false,
    properties: {
      record: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string' },
          authors: {
            type: 'array',
            items: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
          },
        },
      },
      choice: { enum: ['a', 'b'] },
    },
  };
  it('returns required, type, enum and unknown-field errors by JSON path without values', () => {
    const errors = validateContextJson(
      { record: { title: 1, authors: [{}] }, choice: 'PRIVATE', unknown: true },
      schema
    );
    expect(errors.map(e => e.path)).toEqual(['$.record.title', '$.record.authors[0].name', '$.choice', '$.unknown']);
    expect(JSON.stringify(errors)).not.toContain('PRIVATE');
  });
  it('accepts valid data and permits missing optional fields', () => {
    expect(validateContextJson({ record: { title: 'Research' } }, schema)).toEqual([]);
    expect(validateContextJson({}, schema)[0].path).toBe('$.record');
  });
  it('resolves local references, nullable types, alternatives and numeric/array constraints', () => {
    const schema: EmailContextSchema = {
      type: 'object',
      $defs: { count: { type: ['integer', 'null'], minimum: 1 } },
      properties: {
        count: { $ref: '#/$defs/count' },
        values: { type: 'array', minItems: 1, items: { anyOf: [{ type: 'number' }, { type: 'boolean' }] } },
      },
    };
    expect(validateContextJson({ count: null, values: [true] }, schema)).toEqual([]);
    expect(validateContextJson({ count: 0, values: ['bad'] }, schema).map(e => e.code)).toEqual(['minimum', 'anyOf']);
  });
  it('does not fetch remote references and bounds recursive input', () => {
    expect(validateContextJson({ anything: true }, { $ref: 'https://example.org/schema' })).toEqual([]);
    const recursive: EmailContextSchema = { type: 'object', properties: { child: { $ref: '#/properties' } } };
    expect(() => validateContextJson({}, recursive)).not.toThrow();
  });
  it('flags data under a read-only (derived) field instead of validating it', () => {
    const aliased: EmailContextSchema = {
      type: 'object',
      properties: {
        record: { type: 'object', properties: { title: { type: 'string' } } },
        imports: { type: 'object', readOnly: true, properties: { record: { $ref: '#/properties/record' } } },
      },
    };
    const errors = validateContextJson({ record: { title: 'T' }, imports: { record: { title: 1 } } }, aliased);
    expect(errors.map(e => [e.path, e.code])).toEqual([['$.imports', 'readOnly']]);
  });
});

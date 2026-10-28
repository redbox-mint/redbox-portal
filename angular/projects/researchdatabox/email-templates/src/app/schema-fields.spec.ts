import { flattenContextFields } from './schema-fields';

describe('flattenContextFields', () => {
  it('keeps paths, annotations, requiredness and array item paths in preorder', () => {
    const fields = flattenContextFields({
      type: 'object',
      required: ['record'],
      properties: {
        record: {
          type: 'object',
          properties: {
            authors: {
              type: 'array',
              title: 'Authors',
              description: 'Record authors',
              items: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
            },
          },
        },
      },
    });
    expect(fields.map(f => f.path)).toEqual(['record', 'record.authors', 'record.authors[].name']);
    expect(fields[0].required).toBeTrue();
    expect(fields[1]).toEqual({
      path: 'record.authors',
      type: 'array',
      title: 'Authors',
      description: 'Record authors',
      required: false,
      isArray: true,
    });
    expect(fields[2].required).toBeTrue();
  });
  it('handles aliases and bounds recursive schemas', () => {
    const fields = flattenContextFields({
      type: 'object',
      properties: {
        record: { type: 'object', properties: { title: { type: 'string' } } },
        imports: { $ref: '#/properties/record' },
      },
    });
    expect(fields.map(f => f.path)).toContain('imports.title');
  });
});

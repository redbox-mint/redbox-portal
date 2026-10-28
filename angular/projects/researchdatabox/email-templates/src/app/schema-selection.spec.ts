import { defaultSchemaSelection } from './schema-selection';

describe('defaultSchemaSelection', () => {
  const targets = [
    { id: 'first', label: 'First', stages: [{ id: 'draft', label: 'Draft', starting: true }] },
    {
      id: 'rdmp',
      label: 'RDMP',
      stages: [
        { id: 'draft', label: 'Draft', starting: true },
        { id: 'published', label: 'Published', starting: false },
      ],
    },
  ];
  const context = { record: { metaMetadata: { type: 'rdmp' }, workflow: { stage: 'published' } } };
  it('defaults to selected record type/stage, otherwise the brand first type', () => {
    expect(defaultSchemaSelection(targets, context)).toEqual({ recordType: 'rdmp', stage: 'published' });
    expect(defaultSchemaSelection(targets)).toEqual({ recordType: 'first', stage: 'draft' });
    expect(defaultSchemaSelection([], context)).toBeNull();
  });
  it('preserves a valid per-template explicit selection and repairs removed stages/types', () => {
    expect(defaultSchemaSelection(targets, context, { recordType: 'first', stage: 'draft' })).toEqual({
      recordType: 'first',
      stage: 'draft',
    });
    expect(defaultSchemaSelection(targets, context, { recordType: 'rdmp', stage: 'gone' })).toEqual({
      recordType: 'rdmp',
      stage: 'draft',
    });
    expect(defaultSchemaSelection(targets, context, { recordType: 'gone', stage: 'gone' })).toEqual({
      recordType: 'rdmp',
      stage: 'published',
    });
  });
});

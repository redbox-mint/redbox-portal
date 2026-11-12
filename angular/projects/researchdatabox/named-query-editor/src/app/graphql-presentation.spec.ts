import {
  conditionLabels,
  selectedResultFields,
  savedValueLabel,
  previewRows,
  previewValue,
} from './graphql-presentation';
import type { GraphqlNamedQueryDefinition } from '@researchdatabox/sails-ng-common';
describe('GraphQL editor presentation', () => {
  const draft: GraphqlNamedQueryDefinition = {
    source: 'graphql',
    graphql: {
      document:
        'query Q($condition_1:String){records(recordType:"rdmp",filters:[{field:"metadata:/title",contains:$condition_1}]){nodes{oid metadata{... on Example {label:title}}}}}',
      variables: {},
      resultPath: ['records', 'nodes'],
    },
  };
  it('labels the published condition from its document, independently of a changed saved source', () => {
    expect(
      conditionLabels(draft, { 'metadata:/title': 'Project title' }, key => (key === 'op-contains' ? 'Contains' : key))
    ).toEqual({ condition_1: 'Project title contains' });
  });
  it('offers literal response aliases and excludes internal type names and __typename', () => {
    const fields = selectedResultFields(draft);
    expect(fields.some(field => JSON.stringify(field.path) === JSON.stringify(['metadata', 'label']))).toBeTrue();
    expect(JSON.stringify(fields)).not.toContain('Example');
  });
  it('leaves invalid handwritten documents editable with no invented conditions', () => {
    expect(conditionLabels({ ...draft, graphql: { ...draft.graphql, document: 'query {' } }, {}, key => key)).toEqual(
      {}
    );
  });
  it('describes compound saved conditions without raw input-object keys', () => {
    expect(savedValueLabel({ from: { number: 5 }, to: { number: 12 } })).toBe('5 – 12');
    expect(savedValueLabel([{ text: 'Open' }, { text: 'Active' }])).toBe('Open, Active');
  });
  it('shows friendly preview fields and removes schema discriminators, including aliased selections', () => {
    const rows = [
      {
        oid: 'one',
        metadata: { __typename: 'M_dataPublication_draft_123456', label: 'Title' },
        kind: 'M_dataPublication_draft_123456',
      },
    ];
    expect(previewRows(rows, selectedResultFields(draft))).toEqual([{ Oid: 'one', Title: 'Title' }]);
    expect(previewValue({ metadata: rows[0].metadata })).toEqual({ metadata: { label: 'Title' } });
  });
});

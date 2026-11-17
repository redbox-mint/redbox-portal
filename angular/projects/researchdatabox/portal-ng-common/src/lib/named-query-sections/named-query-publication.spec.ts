import { buildSchema, parse, print, validate } from 'graphql';
import type { NamedQueryPromotionDraft } from '@researchdatabox/sails-ng-common';
import { initializePublish, visualPublicationProjection } from './named-query-publication';
const field = (id: string, label: string, alias: string) => ({
  id: 'metadata:/' + id,
  label,
  type: 'text',
  selections: [{ responsePath: ['metadata', alias] }],
});
describe('Readable publication aliases', () => {
  it('uses catalogue keys and the same aliases across variants', () => {
    const result = visualPublicationProjection(
      '{records{nodes{metadata{... on A{a:one b:two c:three} ... on B{d:three}}}}}',
      [
        field('title', 'Title', 'a'),
        field('ethics_approval_status', 'Ethics approval', 'b'),
        {
          ...field('startDate', 'Start date', 'c'),
          selections: [{ responsePath: ['metadata', 'c'] }, { responsePath: ['metadata', 'd'] }],
        },
      ]
    );
    expect(result.fields.map(f => f.path.at(-1))).toEqual(['title', 'ethicsApprovalStatus', 'startDate']);
    expect(result.document).toContain('ethicsApprovalStatus: two');
    expect(() => parse(result.document)).not.toThrow();
  });
  it('makes valid unique names with stable suffixes independent of selection order', () => {
    const fields = [
      { ...field('a/title', 'One', 'a'), selections: [{ responsePath: ['metadata', 'p', 'a'] }] },
      { ...field('b/title', 'Two', 'b'), selections: [{ responsePath: ['metadata', 'q', 'b'] }] },
      field('123 strange-key', 'Three', 'c'),
    ];
    const document = '{metadata{p:one{a:title} q:two{b:title} c:three}}';
    const one = visualPublicationProjection(document, fields),
      two = visualPublicationProjection(document, [...fields].reverse());
    expect(one.fields.map(f => f.path.at(-1))).toEqual(['title', 'title2', 'field123StrangeKey']);
    expect(one.fields.every(f => /^[_A-Za-z][_0-9A-Za-z]*$/.test(f.path.at(-1)!))).toBeTrue();
    expect(one.fields.map(f => f.path.join('.')).sort()).toEqual(two.fields.map(f => f.path.join('.')).sort());
  });
  it('retains existing numbered publication response paths without rewriting their document', () => {
    const document = '{metadata{explorer_field_1:title}}';
    const result = visualPublicationProjection(document, [field('title', 'Title', 'internal')]);
    expect(result.fields[0].path).toEqual(['metadata', 'explorer_field_1']);
    expect(print(parse(result.document))).toBe(print(parse(document)));
  });
});

describe('GraphQL publication AST construction', () => {
  const schema = buildSchema(`
    input RecordFilterValue { text: String number: Float boolean: Boolean }
    input RecordFilterRange { from: RecordFilterValue! to: RecordFilterValue! }
    input RecordFilterInput {
      field: ID! contains: String eq: RecordFilterValue exists: Boolean
      between: RecordFilterRange in: [RecordFilterValue!]
    }
    type Query { records(filters: [RecordFilterInput!]): Page }
    type Page { nodes: [Record] }
    type Record { oid: ID }
  `);
  const prepared = (filters: NamedQueryPromotionDraft['variableValues'][string]): NamedQueryPromotionDraft => ({
    definition: {
      source: 'graphql',
      name: 'plans',
      graphql: {
        document: 'query($filters:[RecordFilterInput!]) {records(filters:$filters){nodes{oid}}}',
        variables: { filters: { ownership: 'fixed', value: filters } },
        resultPath: ['records', 'nodes'],
      },
    },
    variableValues: { filters },
  });
  it('publishes scalar conditions with typed variables and preserves falsy defaults', () => {
    const input = prepared([
      { field: 'title', contains: '' },
      { field: 'active', eq: { boolean: false } },
      { field: 'size', eq: { number: 0 } },
    ]);
    const original = structuredClone(input);
    const result = initializePublish(input, { mode: 'visual' }, {}, key => key);
    expect(validate(schema, parse(result.draft.graphql.document))).toEqual([]);
    expect(result.variables.map(variable => variable.inputType)).toEqual(['String!', 'Boolean!', 'Float!']);
    expect<unknown>(result.draft.graphql.variables).toEqual({
      condition_1: { ownership: 'fixed', value: '' },
      condition_2: { ownership: 'fixed', value: false },
      condition_3: { ownership: 'fixed', value: 0 },
    });
    expect<unknown>(input).toEqual(original);
  });
  it('publishes list, range and existence conditions as valid GraphQL bindings', () => {
    const range = { from: { number: 1 }, to: { number: 5 } };
    const list = [{ text: 'A' }, { text: 'B' }];
    const result = initializePublish(
      prepared([
        { field: 'size', between: range },
        { field: 'title', in: list },
        { field: 'active', exists: true },
      ]),
      { mode: 'visual' },
      {},
      key => key
    );
    expect(validate(schema, parse(result.draft.graphql.document))).toEqual([]);
    expect(result.variables.map(variable => variable.inputType)).toEqual([
      'RecordFilterRange!',
      '[RecordFilterValue!]!',
      'Boolean!',
    ]);
    expect<unknown>(result.draft.graphql.variables).toEqual({
      condition_1: { ownership: 'fixed', value: range },
      condition_2: { ownership: 'fixed', value: list },
      condition_3: { ownership: 'fixed', value: true },
    });
  });
});

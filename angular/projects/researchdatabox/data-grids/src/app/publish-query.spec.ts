import { buildSchema, validate, parse } from 'graphql';
import { initializePublish, publishPreviewVariables, visualPublicationProjection } from './publish-query';
import { selectedResultFields } from './graphql-query';
import { validGrid } from './data-grid.testing';
import type { NamedQueryPromotionDraft } from '@researchdatabox/sails-ng-common';

describe('Publishing condition defaults and selected result paths', () => {
  const prepared = (): NamedQueryPromotionDraft => ({
    definition: {
      source: 'graphql',
      name: '',
      graphql: {
        document: 'query($filters:[Filter!]) { records(filters:$filters) { nodes { oid } } }',
        variables: {},
        resultPath: ['records', 'nodes'],
      },
    },
    variableValues: {
      filters: [
        { field: 'title', contains: 'heat' },
        { field: 'active', eq: { boolean: false } },
      ],
    },
  });
  it('prefills a valid slug from a saved query without modifying the saved name', () => {
    const input = prepared(); input.definition.name = 'active research plans';
    expect(initializePublish(input, { ...validGrid(), name: 'active research plans' }, {}, k => k).draft.name).toBe('active_research_plans');
    expect(input.definition.name).toBe('active research plans');
  });
  it('turns visual scalar conditions into labelled parameters with fixed saved values and valid GraphQL', () => {
    const original = prepared();
    const result = initializePublish(original, validGrid(), { title: 'Project title', active: 'Active' }, k => k);
    expect(result.variables.map(v => v.label)).toEqual(['Project title op-contains', 'Active op-eq']);
    expect<unknown>(result.draft.graphql.variables['condition_1']).toEqual({ ownership: 'fixed', value: 'heat' });
    expect<unknown>(result.draft.graphql.variables['condition_2']).toEqual({ ownership: 'fixed', value: false });
    const schema = buildSchema(
      'input Value { boolean:Boolean } input Filter {field:String contains:String eq:Value} type Query {records(filters:[Filter!]):Page} type Page {nodes:[Record]} type Record {oid:ID}'
    );
    expect(validate(schema, parse(result.draft.graphql.document))).toEqual([]);
    expect(original.definition.graphql.document).toContain('$filters');
    expect(original.definition.graphql.variables).toEqual({});
  });
  it('keeps range, list and existence conditions visible with valid fixed bindings', () => {
    const input = prepared();
    input.definition.graphql.document = 'query($filters:[RecordFilterInput!]) {records(filters:$filters){nodes{oid}}}';
    input.variableValues['filters'] = [
      { field: 'size', between: { from: { number: 1 }, to: { number: 5 } } },
      { field: 'title', in: [{ text: 'A' }, { text: 'B' }] },
      { field: 'title', exists: true },
    ];
    const result = initializePublish(input, validGrid(), { size: 'Size', title: 'Title' }, k => k);
    expect(result.variables.map(v => v.label)).toEqual(['Size op-between', 'Title op-in', 'Title op-exists']);
    expect(result.variables.map(v => v.consumerAllowed)).toEqual([false, false, true]);
    const schema = buildSchema(
      'input RecordFilterValue {number:Float text:String} input RecordFilterRange {from:RecordFilterValue! to:RecordFilterValue!} input RecordFilterInput {field:ID! between:RecordFilterRange in:[RecordFilterValue!] exists:Boolean} type Query {records(filters:[RecordFilterInput!]):Page} type Page {nodes:[Record]} type Record {oid:ID}'
    );
    expect(validate(schema, parse(result.draft.graphql.document))).toEqual([]);
  });
  it('maps a visual scalar consistently across form variants without exposing internal aliases', () => {
    const document = '{records{nodes{metadata{... on A{g_a:title} ... on B{g_b:title}}}}}';
    const projected = visualPublicationProjection(document, [
      {
        id: 'metadata:/title',
        label: 'Title',
        path: '/title',
        type: 'text',
        selectable: true,
        operators: [],
        sortable: false,
        selections: [
          { variant: 'A', selection: '', responsePath: ['metadata', 'g_a'] },
          { variant: 'B', selection: '', responsePath: ['metadata', 'g_b'] },
        ],
      },
    ]);
    const schema = buildSchema(
      'type Query {records:Page} type Page {nodes:[Record]} type Record {metadata:RecordMetadata} union RecordMetadata=A|B type A {title:String} type B {title:String}'
    );
    expect(validate(schema, parse(projected.document))).toEqual([]);
    expect(projected.fields).toEqual([{ label: 'Title', path: ['metadata', 'explorer_field_1'], type: 'text' }]);
    expect(projected.document).not.toMatch(/g_[ab]/);
    expect(document).toContain('g_a');
  });
  it('binds preview values without replacing explicit false, zero, empty text or operation defaults', () => {
    const definition = prepared().definition;
    definition.graphql.variables = {
      fixed: { ownership: 'fixed', value: false },
      count: { ownership: 'consumer', parameter: 'count', inputType: 'Int!', required: true },
      text: { ownership: 'consumer', parameter: 'text', inputType: 'String', required: false, defaultValue: 'default' },
      flag: { ownership: 'consumer', parameter: 'flag', inputType: 'Boolean', required: false },
      list: { ownership: 'consumer', parameter: 'list', inputType: '[String!]', required: false },
      skip: { ownership: 'omitted' },
    };
    expect(publishPreviewVariables(definition, { count: '0', text: '', flag: 'false', list: '["A","B"]' })).toEqual({
      fixed: false,
      count: 0,
      text: '',
      flag: false,
      list: ['A', 'B'],
    });
    expect(publishPreviewVariables(definition, {})).toEqual({ fixed: false, text: 'default' });
    expect(() => publishPreviewVariables(definition, { count: 'invalid' })).toThrow();
  });
  it('retains legacy handwritten documents and operation defaults', () => {
    const original = prepared();
    original.definition.graphql.document = 'query($first:Int=25){ __typename }';
    original.variableValues = {};
    const result = initializePublish(original, null, {}, k => k);
    expect(result.draft.graphql.document).toBe(original.definition.graphql.document);
    expect<unknown>(result.draft.graphql.variables['first']).toEqual({ ownership: 'fixed', value: 25 });
  });
  it('offers literal aliased fields and union-fragment subfields before a query runs, excluding repeated arrays', () => {
    const schema = buildSchema(
      'type Query { records:Page } type Page {nodes:[Record]} type Record {oid:ID metadata:Metadata tags:[String]} union Metadata = Plan type Plan {title:String details:Details} type Details {size:Int}'
    );
    const result = selectedResultFields(
      schema,
      '{ rows:records { items:nodes { id:oid metadata { ... on Plan { title details { size } } } tags } } }',
      ['rows', 'items']
    );
    expect(result).toContain({ label: 'metadata.title', path: ['metadata', 'title'], type: 'text' });
    expect(result).toContain({ label: 'metadata', path: ['metadata'], type: 'object' });
    expect(result).toContain({ label: 'id', path: ['id'], type: 'text' });
    expect(result.some(f => f.path[0] === 'tags')).toBeFalse();
  });
  it('resolves opaque aliases to the stored field pointer from schema descriptions', () => {
    const schema = buildSchema(
      'type Query {records:Page} type Page {nodes:[Record]} type Record {metadata:Plan} type Plan {"""Stored metadata pointer (JSON string): "/title" """ title:String}'
    );
    const fields = selectedResultFields(schema, '{ records {nodes {metadata {g_internal:title}}}}', [
      'records',
      'nodes',
    ]);
    expect(fields.find(f => f.path.at(-1) === 'g_internal')?.sourcePath).toBe('/title');
  });
});

import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { buildSchema, GraphQLScalarType, getVariableValues, GraphQLSchema, executeSync, parse } from 'graphql';
import type { GraphqlNamedQueryDefinition, GraphqlNamedQueryVariable } from '@researchdatabox/sails-ng-common';
import { createRecordYoga } from '../../src/record-graphql/schema';
import { metadataTypeName } from '../../src/record-graphql/renderer';
import { gridContracts, gridHarness, gridRecord } from '../fixtures/record-grid.fixtures';
import { RecordContractContributorRegistry, createCoreRecordContractContributors } from '../../src/record-contract';
import { recordGraphql } from '../../src/config/recordGraphql.config';
import { Services as GraphqlServices } from '../../src/services/RecordGraphqlService';
import { Services as QueryServices } from '../../src/services/NamedQueryService';
import { Services as EditorServices } from '../../src/services/NamedQueryEditorService';
import {
  validateGraphqlNamedQuery,
  inspectGraphqlNamedQuery,
  bindGraphqlNamedQuery,
  graphqlPath,
  GraphqlNamedQueryValidationError,
} from '../../src/services/named-query/graphql-validation';
import { convertGraphqlInput, GraphqlNamedQueryInputError } from '../../src/services/named-query/graphql-input';
import type { ReadCaller } from '../../src/record-graphql/read-record';
import type { FormRecordAccessContext } from '../../src/services/FormsService';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals, createQueryObject } from './testHelper';

const schema = createRecordYoga(
  gridContracts().map(contract => ({ ...contract, context: { ...contract.context, recordType: 'rdmp' } })),
  { getRecord: async () => null, hasViewAccess: () => false }
).schema;
const brand = { id: 'brand', name: 'default', css: '', roles: [] };
const caller: ReadCaller = { brand, portal: 'rdmp', user: { username: 'author' }, roles: [] };
const editorCaller: FormRecordAccessContext = {
  brand,
  user: { id: 'author', username: 'author', type: 'local', name: '', email: '', roles: [] },
};
const definition = (): GraphqlNamedQueryDefinition => ({
  source: 'graphql',
  graphql: {
    document: `query Lookup($search: String = "rdmp", $first: Int, $after: String) {
    matches: records(recordType: "rdmp", filters: [{field: "title", contains: $search}], first: $first, after: $after) {
      items: nodes { id: oid label: workflowStep } more: hasNextPage cursor: endCursor
    }
  }`,
    operationName: 'Lookup',
    variables: { search: { ownership: 'consumer', parameter: 'search', inputType: 'String', required: false } },
    resultPath: ['matches', 'items'],
    mappings: { oid: ['id'], title: ['label'], metadata: [] },
    lookup: {
      mode: 'firstPage',
      collectionPath: ['matches'],
      hasNextPagePath: ['matches', 'more'],
      endCursorPath: ['matches', 'cursor'],
      firstVariable: 'first',
      afterVariable: 'after',
      searchParameter: 'search',
    },
  },
});
function prepare(value = definition(), target = schema) {
  const result = validateGraphqlNamedQuery(value, target);
  assert.ok(result.prepared, JSON.stringify(result.validation));
  return result.prepared;
}
function variable(
  type: string,
  binding?: GraphqlNamedQueryVariable,
  operationDefault = ''
): GraphqlNamedQueryDefinition {
  const base = definition();
  const usage: Record<string, string> = {
    Int: 'first: $value',
    Float: 'filters: [{field: "a", eq: {number: $value}}]',
    Boolean: 'filters: [{field: "a", exists: $value}]',
    String: 'recordType: $value',
    ID: 'filters: [{field: $value, exists: true}]',
    RecordSortDirection: 'sort: [{field: "a", direction: $value}]',
    '[String!]': 'workflowStages: $value',
    '[String]': 'recordType: "rdmp"',
    '[RecordFilterInput!]': 'filters: $value',
  };
  const key = type.endsWith('!') && !type.endsWith('!]') ? type.slice(0, -1) : type;
  const use = usage[key];
  base.graphql = {
    document: `query Values($value: ${type}${operationDefault}) { records(${key === 'String' ? '' : 'recordType: "rdmp", '}${use}) { nodes { oid } } }`,
    variables: {
      value: binding ?? { ownership: 'consumer', parameter: 'value', inputType: type, required: type.endsWith('!') },
    },
    resultPath: ['records', 'nodes'],
  };
  return base;
}
const bound = (type: string, input: unknown) =>
  bindGraphqlNamedQuery(prepare(variable(type, undefined, type === 'String' || type === 'ID' ? ' = "rdmp"' : '')), {
    value: input,
  }).value;

describe('GraphQL named query validation and binding', () => {
  it('uses the real read schema, selected aliases and bounded collection adapter without execution', () => {
    const p = prepare();
    assert.equal(p.validation.capabilities?.lookup, true);
    assert.deepEqual({ ...bindGraphqlNamedQuery(p, {}) }, {});
  });
  for (const document of [
    'query {',
    'mutation { change }',
    'subscription { updates }',
    'query A { record(oid:"x"){oid} } query B { record(oid:"x"){oid} }',
    '{ __schema { queryType { name } } }',
    '{ removedPrivateField }',
    'query($n: Int){ records(recordType:"rdmp", first:$n){ nodes { oid } } }',
  ])
    it('rejects syntax, non-query, multi-operation, introspection, schema drift and missing ownership', () => {
      const input = definition();
      input.graphql.document = document;
      assert.equal(validateGraphqlNamedQuery(input, schema).validation.valid, false);
    });
  it('rejects an incorrect operation name', () => {
    const input = definition();
    input.graphql.operationName = 'Other';
    assert.equal(validateGraphqlNamedQuery(input, schema).validation.valid, false);
  });
  it('distinguishes executable non-lookup definitions from invalid definitions', () => {
    const input = variable('Int');
    const p = prepare(input);
    assert.equal(p.validation.valid, true);
    assert.equal(p.validation.capabilities?.lookup, false);
    assert.ok(p.validation.capabilities?.diagnostics.every(d => d.capability === 'lookup' && d.severity === 'warning'));
  });
  it('applies consumer then named default then omission for GraphQL operation defaults', () => {
    const input = variable(
      'Int!',
      { ownership: 'consumer', parameter: 'value', inputType: 'Int!', required: true, defaultValue: 7 },
      ' = 3'
    );
    const p = prepare(input);
    assert.equal(bindGraphqlNamedQuery(p, {}).value, 7);
    assert.equal(bindGraphqlNamedQuery(p, { value: 0 }).value, 0);
    assert.throws(() => bindGraphqlNamedQuery(p, { value: null }), GraphqlNamedQueryInputError);
    const binding = input.graphql.variables.value;
    assert.ok(binding.ownership === 'consumer');
    delete binding.defaultValue;
    assert.equal(Object.hasOwn(bindGraphqlNamedQuery(prepare(input), {}), 'value'), false);
    const omitted = prepare(input);
    const effective = getVariableValues(
      schema,
      omitted.operation.variableDefinitions ?? [],
      bindGraphqlNamedQuery(omitted, {})
    );
    assert.equal(effective.coerced?.value, 3);
    input.graphql.document = input.graphql.document.replace(' = 3', '');
    assert.throws(() => bindGraphqlNamedQuery(prepare(input), {}), GraphqlNamedQueryInputError);
  });
  for (const [type, value, expected] of [
    ['Int', '0', 0],
    ['Float', '-1.5e2', -150],
    ['Boolean', 'false', false],
    ['Boolean', false, false],
    ['String', '', ''],
    ['ID', 0, 0],
    ['RecordSortDirection!', 'ASC', 'ASC'],
    ['[String!]', [], []],
    ['[String!]', ['a', ''], ['a', '']],
    ['Int', null, null],
  ] as const)
    it(`preserves/converts valid ${type} input ${JSON.stringify(value)}`, () =>
      assert.deepEqual(bound(type, value), expected));
  for (const [type, value] of [
    ['Int', ''],
    ['Int', ' 1'],
    ['Int', '01'],
    ['Int', '0x10'],
    ['Int', '1.0'],
    ['Int', '1e2'],
    ['Int', 1.2],
    ['Int', 2147483648],
    ['Int', Infinity],
    ['Float', ' '],
    ['Float', 'NaN'],
    ['Float', NaN],
    ['Boolean', 'TRUE'],
    ['Boolean', 'no'],
    ['Boolean', 1],
    ['String', {}],
    ['String', 1],
    ['ID', {}],
    ['ID', false],
    ['RecordSortDirection!', 'asc'],
    ['[String!]', 'a,b'],
    ['[String!]', ['a', null]],
    ['[String!]', [false]],
    ['Int', undefined],
  ] as const)
    it(`rejects ambiguous ${type} input ${JSON.stringify(value)}`, () =>
      assert.throws(() => bound(type, value), GraphqlNamedQueryInputError));
  it('accepts integer string spelling only for Int while Float retains decimal/exponent inputs', () => {
    for (const text of ['0', '-0', '-12', '2147483647']) assert.equal(bound('Int', text), Number(text));
    for (const text of ['1.0', '1e2', '-2E1']) {
      assert.throws(() => bound('Int', text), GraphqlNamedQueryInputError);
      assert.equal(bound('Float', text), Number(text));
    }
  });
  it('retains structural definition field locations without exposing input or budget exceptions', () => {
    const missing = variable('Int');
    Reflect.deleteProperty(missing.graphql.variables.value, 'required');
    const validation = validateGraphqlNamedQuery(missing, schema).validation;
    assert.equal(validation.valid, false);
    assert.equal(validation.diagnostics[0].field, 'graphql.variables.value.required');
    assert.equal(validation.diagnostics[0].code, 'INVALID_DEFINITION');
    const oversized = { ...definition(), privateInput: 'PRIVATE_VALUE'.repeat(100000) };
    const budget = validateGraphqlNamedQuery(oversized, schema).validation;
    assert.equal(budget.valid, false);
    assert.equal(budget.diagnostics[0].field, 'graphql');
    assert.ok(!JSON.stringify(budget).includes('PRIVATE_VALUE'));
  });
  it('keeps nullable named defaults distinct from explicit null and falsy values', () => {
    for (const [type, value] of [
      ['String', ''],
      ['Boolean', false],
      ['Int', 0],
      ['Int', null],
    ] as const) {
      const p = prepare(
        variable(
          type,
          { ownership: 'consumer', parameter: 'value', inputType: type, required: false, defaultValue: value },
          type === 'String' ? ' = "rdmp"' : ''
        )
      );
      assert.equal(bindGraphqlNamedQuery(p, {}).value, value);
      assert.equal(bindGraphqlNamedQuery(p, { value: null }).value, null);
    }
  });
  it('requires explicit ownership and matching required/types, rejects extra/duplicate/reserved consumers and page collisions', () => {
    for (const mutate of [
      (x: GraphqlNamedQueryDefinition) => {
        x.graphql.variables = {};
      },
      (x: GraphqlNamedQueryDefinition) => {
        x.graphql.variables.first = { ownership: 'fixed', value: 25 };
      },
      (x: GraphqlNamedQueryDefinition) => {
        x.graphql.variables.after = {
          ownership: 'consumer',
          parameter: 'cursor',
          inputType: 'String',
          required: false,
        };
      },
      (x: GraphqlNamedQueryDefinition) => {
        x.graphql.variables.extra = { ownership: 'omitted' };
      },
      (x: GraphqlNamedQueryDefinition) => {
        x.graphql.variables.search = {
          ownership: 'consumer',
          parameter: 'start',
          inputType: 'String',
          required: false,
        };
      },
      (x: GraphqlNamedQueryDefinition) => {
        x.graphql.variables.search = {
          ownership: 'consumer',
          parameter: 'first',
          inputType: 'String',
          required: false,
        };
      },
      (x: GraphqlNamedQueryDefinition) => {
        x.graphql.variables.search = { ownership: 'consumer', parameter: 'search', inputType: 'Int', required: false };
      },
      (x: GraphqlNamedQueryDefinition) => {
        x.graphql.variables.search = {
          ownership: 'consumer',
          parameter: 'search',
          inputType: 'String',
          required: true,
        };
      },
      (x: GraphqlNamedQueryDefinition) => {
        x.graphql.lookup!.afterVariable = 'first';
      },
    ]) {
      const input = definition();
      mutate(input);
      assert.equal(validateGraphqlNamedQuery(input, schema).validation.valid, false);
    }
    const duplicate = definition();
    duplicate.graphql.document = duplicate.graphql.document
      .replace('$first: Int', '$other: String, $first: Int')
      .replace('contains: $search', 'contains: $search, eq: {text: $other}');
    duplicate.graphql.variables.other = {
      ownership: 'consumer',
      parameter: 'search',
      inputType: 'String',
      required: false,
    };
    assert.equal(validateGraphqlNamedQuery(duplicate, schema).validation.valid, false);
  });
  it('rejects page variables reused as business arguments inside fragments', () => {
    const input = definition();
    input.graphql.document = input.graphql.document
      .replace(' {\n    matches:', ' { ...Root } fragment Root on Query {\n    matches:')
      .replace('recordType: "rdmp"', 'recordType: $after')
      .replace('$after: String)', '$after: String = "rdmp")');
    const validation = validateGraphqlNamedQuery(input, schema).validation;
    assert.equal(validation.valid, false);
    assert.ok(validation.diagnostics.some(d => d.code === 'VARIABLE_OWNERSHIP'));
  });
  it('permits explicit default omission only when the operation can satisfy it', () => {
    assert.ok(prepare(variable('Int!', { ownership: 'omitted' }, ' = 25')));
    assert.equal(validateGraphqlNamedQuery(variable('Int!', { ownership: 'omitted' }), schema).validation.valid, false);
  });
  it('validates nested fixed objects including unknown fields and non-null list members, and rejects consumer objects', () => {
    const input = variable('[RecordFilterInput!]', {
      ownership: 'fixed',
      value: [{ field: 'title', eq: { text: 'a' }, exists: false }],
    });
    assert.ok(prepare(input));
    for (const value of [
      [{ eq: { text: 'a' } }],
      [{ field: 'title', unknown: true }],
      [null],
      [{ field: 'title', eq: { number: 'ambiguous' } }],
    ]) {
      input.graphql.variables.value = { ownership: 'fixed', value };
      assert.equal(validateGraphqlNamedQuery(input, schema).validation.valid, false);
    }
    assert.equal(validateGraphqlNamedQuery(variable('[RecordFilterInput!]'), schema).validation.valid, false);
  });
  it('uses registered scalar contracts for fixed values without parsing twice; unsupported custom consumers are disabled', () => {
    const custom = new GraphQLScalarType({
      name: 'Token',
      parseValue: value => {
        if (typeof value !== 'string' || !value.startsWith('ok:')) throw new Error('SECRET');
        return { internal: value };
      },
    });
    assert.equal(convertGraphqlInput(custom, 'ok:a', 'fixed', true), 'ok:a');
    assert.throws(() => convertGraphqlInput(custom, 'PRIVATE', 'fixed', true), /Invalid GraphQL/);
    assert.throws(() => convertGraphqlInput(custom, 'ok:a', 'consumer'), GraphqlNamedQueryInputError);
  });
  it('keeps lists explicit and respects nested element nullability', () => {
    const types = buildSchema('type Query { x(a: [[Int!]!]): Int }').getQueryType()!.getFields().x.args[0].type;
    assert.deepEqual(convertGraphqlInput(types, [['0', '2']], 'value'), [[0, 2]]);
    assert.throws(() => convertGraphqlInput(types, [[null]], 'value'), GraphqlNamedQueryInputError);
    assert.throws(() => convertGraphqlInput(types, [new Array(1)], 'value'), GraphqlNamedQueryInputError);
    const nullable = buildSchema('type Query { x(a: [Int]): Int }').getQueryType()!.getFields().x.args[0].type;
    assert.deepEqual(convertGraphqlInput(nullable, [null, '0'], 'value'), [null, 0]);
  });
  it('allows established scalar transport controls separately and rejects variable/scope injection and undeclared parameters', () => {
    assert.deepEqual({ ...bindGraphqlNamedQuery(prepare(), { queryName: 'q', start: '0', rows: '25' }) }, {});
    for (const key of ['first', 'after', 'brand', 'portal', 'user', 'roles', 'unknown'])
      assert.throws(() => bindGraphqlNamedQuery(prepare(), { [key]: 'x' }), GraphqlNamedQueryInputError);
    assert.throws(() => bindGraphqlNamedQuery(prepare(), { rows: 25 }, false), GraphqlNamedQueryInputError);
  });
  it('resolves own literal segments, missing/null/falsy values, and rejects prototype access without flattening', () => {
    const value = { 'dc:title': '', nested: { null: null, false: false, zero: 0 }, rows: [{ oid: 'a' }] };
    assert.equal(graphqlPath(value, ['dc:title']), '');
    assert.equal(graphqlPath(value, ['nested', 'null']), null);
    assert.equal(graphqlPath(value, ['nested', 'false']), false);
    assert.equal(graphqlPath(value, ['nested', 'zero']), 0);
    assert.equal(graphqlPath(value, ['absent']), undefined);
    assert.equal(graphqlPath(Object.create({ inherited: 1 }), ['inherited']), undefined);
    assert.equal(graphqlPath(value, ['rows', '0']), undefined);
    for (const part of ['__proto__', 'constructor', 'prototype']) assert.throws(() => graphqlPath(value, [part]));
  });
  it('rejects unsafe, unselected, list-traversing and non-list result paths and unknown mapping targets', () => {
    for (const path of [['__proto__'], ['matches'], ['matches', 'items', 'oid'], ['records', 'nodes']]) {
      const input = definition();
      input.graphql.resultPath = path;
      assert.equal(validateGraphqlNamedQuery(input, schema).validation.valid, false);
    }
    const input = definition();
    input.graphql.mappings = { title: ['workflowStep'] };
    assert.equal(validateGraphqlNamedQuery(input, schema).validation.valid, false);
    Reflect.set(input.graphql.mappings, 'unexpected', ['id']);
    assert.equal(validateGraphqlNamedQuery(input, schema).validation.valid, false);
  });
  it('handles fragments, nested mappings and detects conditional/unsupported page capabilities independently', () => {
    const input = definition();
    input.graphql.document =
      input.graphql.document.replace('id: oid label: workflowStep', '...Fields') +
      ' fragment Fields on Record { id: oid label: workflowStep }';
    assert.equal(prepare(input).validation.capabilities?.lookup, true);
    input.graphql.document = input.graphql.document.replace(
      'label: workflowStep',
      'label: workflowStep @skip(if: true)'
    );
    assert.equal(prepare(input).validation.capabilities?.lookup, false);
    const wrong = definition();
    wrong.graphql.lookup!.hasNextPagePath = ['matches', 'cursor'];
    assert.equal(prepare(wrong).validation.capabilities?.lookup, false);
  });
  for (const [selection, path] of [
    ['metadata { other } metadata @skip(if: true) { title }', ['metadata', 'title']],
    ['metadata @include(if: false) { title } metadata { other }', ['metadata', 'title']],
    ['metadata { other } ... on Record @skip(if: true) { metadata { title } }', ['metadata', 'title']],
    ['metadata { detail { other } } metadata @skip(if: true) { detail { title } }', ['metadata', 'detail', 'title']],
    ['metadata { detail { other } detail @skip(if: true) { title } }', ['metadata', 'detail', 'title']],
  ] as const)
    it(`keeps conditional ancestor provenance when merging ${selection}`, () => {
      const nested = buildSchema(`
        input RecordFilterInput { field: ID!, contains: String }
        type Query { records(recordType: String!, filters: [RecordFilterInput!], first: Int, after: String): Page }
        type Page { nodes: [Record!]!, hasNextPage: Boolean!, endCursor: String }
        type Record { oid: ID!, metadata: Metadata }
        type Metadata { other: String, title: String, detail: Metadata }
      `);
      const input = definition();
      input.graphql.document = input.graphql.document.replace('label: workflowStep', selection);
      input.graphql.mappings!.title = [...path];
      const result = executeSync({
        schema: nested,
        document: parse(input.graphql.document),
        variableValues: { first: 25, after: null },
        rootValue: {
          records: {
            nodes: [{ oid: 'r', metadata: { other: 'x', title: 'hidden', detail: { other: 'y', title: 'hidden' } } }],
            hasNextPage: false,
            endCursor: null,
          },
        },
      });
      assert.equal(result.errors, undefined);
      const rows = graphqlPath(result.data, ['matches', 'items']);
      assert.ok(Array.isArray(rows));
      assert.equal(graphqlPath(rows[0], [...path]), undefined);
      const validation = prepare(input, nested).validation;
      assert.equal(validation.capabilities?.lookup, false);
      assert.ok(
        validation.capabilities?.diagnostics.some(
          d => d.code === 'LOOKUP_MAPPING' && d.field === 'graphql.mappings.title'
        )
      );
      // An unconditional copy of the whole mapped path is sufficient even when
      // a duplicate parent is conditional. Do not disable safe merged selections.
      input.graphql.document = input.graphql.document.replace('metadata { other }', 'metadata { other title }');
      if (path.length === 2 && selection.startsWith('metadata { other }'))
        assert.equal(prepare(input, nested).validation.capabilities?.lookup, true);
    });
  it('keeps conditional provenance across duplicate list selections', () => {
    const input = definition();
    input.graphql.document = input.graphql.document.replace(
      'items: nodes { id: oid label: workflowStep }',
      'items: nodes { id: oid } items: nodes @skip(if: true) { label: workflowStep }'
    );
    const validation = prepare(input).validation;
    assert.equal(validation.capabilities?.lookup, false);
    assert.ok(
      validation.capabilities?.diagnostics.some(
        d => d.code === 'LOOKUP_MAPPING' && d.field === 'graphql.mappings.title'
      )
    );
    input.graphql.document = input.graphql.document.replace(
      'items: nodes { id: oid }',
      'items: nodes { id: oid label: workflowStep }'
    );
    assert.equal(prepare(input).validation.capabilities?.lookup, true);
  });
  it('validates nested aliases across every selected metadata union variant', () => {
    const nested = buildSchema(`
      type Query { rows: [Row!]! }
      type Row { oid: ID!, metadata: Metadata }
      union Metadata = A | B
      type A { details: Detail }
      type B { details: Detail }
      type Detail { title: String }
    `);
    const input: GraphqlNamedQueryDefinition = {
      source: 'graphql',
      graphql: {
        document:
          '{ matches: rows { id: oid metadata { ... on A { info: details { label: title } } ... on B { info: details { label: title } } } } }',
        variables: {},
        resultPath: ['matches'],
        mappings: { oid: ['id'], title: ['metadata', 'info', 'label'] },
      },
    };
    assert.ok(prepare(input, nested));
    input.graphql.document = input.graphql.document.replace(
      '... on B { info: details { label: title } }',
      '... on B { details { title } }'
    );
    assert.equal(validateGraphqlNamedQuery(input, nested).validation.valid, false);
  });
  for (const missing of ['draft', 'published'])
    it(`rejects a result-list mapping missing from the ${missing} metadata variant in the real read schema`, async () => {
      const h = gridHarness(['draft', 'published']);
      for (const stage of ['draft', 'published']) {
        const record = gridRecord(stage, stage);
        record.metadata.people = [{ name: `${stage} person` }];
        h.records.set(stage, record);
      }
      const branches = h.contracts.map(contract => {
        const stage = contract.context.workflowStep;
        return `... on ${metadataTypeName(contract)} { rows: people { ${stage === missing ? 'other' : 'label'}: name } }`;
      });
      const input: GraphqlNamedQueryDefinition = {
        source: 'graphql',
        graphql: {
          document: `query($oid: ID!) { record(oid: $oid) { metadata { ${branches.join(' ')} } } }`,
          variables: { oid: { ownership: 'consumer', parameter: 'recordId', inputType: 'ID!', required: true } },
          resultPath: ['record', 'metadata', 'rows'],
          mappings: { title: ['label'] },
        },
      };
      for (const stage of ['draft', 'published']) {
        const result = await h.query(input.graphql.document, { oid: stage });
        assert.equal(result.body.errors, undefined);
        assert.deepEqual(graphqlPath(result.body.data, input.graphql.resultPath), [
          { [stage === missing ? 'other' : 'label']: `${stage} person` },
        ]);
      }
      const validation = validateGraphqlNamedQuery(input, h.schema).validation;
      assert.equal(validation.valid, false);
      assert.ok(validation.diagnostics.some(d => d.code === 'MAPPING_PATH' && d.field === 'graphql.mappings.title'));
      // Duplicates within this variant still merge; another variant cannot supply them.
      input.graphql.document = input.graphql.document.replace(
        'rows: people { other: name }',
        'rows: people { other: name } rows: people { label: name }'
      );
      assert.ok(prepare(input, h.schema));
    });
  it('narrows known metadata variants for a fixed collection scope without trusting consumer defaults', () => {
    const base = buildSchema(`
      type Query { records(recordType: String!): Page }
      type Page { nodes: [Row!]! }
      type Row { metadata: RecordMetadata }
      union RecordMetadata = A | B
      type A { title: String }
      type B { other: String }
    `);
    const scoped = new GraphQLSchema({
      ...base.toConfig(),
      extensions: {
        recordReadVariants: [
          { recordType: 'a', workflowStep: 'draft', typeName: 'A' },
          { recordType: 'b', workflowStep: 'draft', typeName: 'B' },
        ],
      },
    });
    const input: GraphqlNamedQueryDefinition = {
      source: 'graphql',
      graphql: {
        document:
          'query($type: String!) { records(recordType: $type) { nodes { metadata { ... on A { label: title } } } } }',
        variables: { type: { ownership: 'fixed', value: 'a' } },
        resultPath: ['records', 'nodes'],
        mappings: { title: ['metadata', 'label'] },
      },
    };
    assert.ok(prepare(input, scoped));
    input.graphql.variables.type = {
      ownership: 'consumer',
      parameter: 'type',
      inputType: 'String!',
      required: true,
      defaultValue: 'a',
    };
    assert.equal(validateGraphqlNamedQuery(input, scoped).validation.valid, false);
    input.graphql.variables.type = { ownership: 'omitted' };
    input.graphql.document = input.graphql.document.replace('$type: String!', '$type: String! = "a"');
    assert.ok(prepare(input, scoped));
  });
  it('narrows metadata stages using GraphQL literal/default coercion while supplied JSON lists stay explicit', () => {
    const base = buildSchema(`
      type Query { records(recordType: String!, workflowStages: [String!]): Page }
      type Page { nodes: [Row!]! }
      type Row { metadata: RecordMetadata }
      union RecordMetadata = Draft | Published
      type Draft { title: String }
      type Published { other: String }
    `);
    const scoped = new GraphQLSchema({
      ...base.toConfig(),
      extensions: {
        recordReadVariants: [
          { recordType: 'a', workflowStep: 'draft', typeName: 'Draft' },
          { recordType: 'a', workflowStep: 'published', typeName: 'Published' },
        ],
      },
    });
    const input: GraphqlNamedQueryDefinition = {
      source: 'graphql',
      graphql: {
        document:
          'query($stages: [String!] = "draft") { records(recordType: "a", workflowStages: $stages) { nodes { metadata { ... on Draft { title } } } } }',
        variables: { stages: { ownership: 'omitted' } },
        resultPath: ['records', 'nodes'],
        mappings: { title: ['metadata', 'title'] },
      },
    };
    const prepared = prepare(input, scoped);
    assert.deepEqual(getVariableValues(scoped, prepared.operation.variableDefinitions ?? [], {}).coerced?.stages, [
      'draft',
    ]);
    assert.ok(
      prepare(
        {
          ...input,
          graphql: { ...input.graphql, document: input.graphql.document.replace('= "draft"', '= ["draft"]') },
        },
        scoped
      )
    );
    input.graphql.variables = {};
    input.graphql.document = input.graphql.document
      .replace('query($stages: [String!] = "draft")', 'query')
      .replace('workflowStages: $stages', 'workflowStages: "draft"');
    assert.ok(prepare(input, scoped));
    input.graphql.document = input.graphql.document
      .replace('query {', 'query($stages: [String!]) {')
      .replace('workflowStages: "draft"', 'workflowStages: $stages');
    input.graphql.variables = { stages: { ownership: 'fixed', value: 'draft' } };
    assert.equal(validateGraphqlNamedQuery(input, scoped).validation.valid, false);
    input.graphql.variables = { stages: { ownership: 'fixed', value: ['draft'] } };
    assert.ok(prepare(input, scoped));
    input.graphql.variables = {
      stages: {
        ownership: 'consumer',
        parameter: 'stages',
        inputType: '[String!]',
        required: false,
        defaultValue: ['draft'],
      },
    };
    assert.equal(validateGraphqlNamedQuery(input, scoped).validation.valid, false);
  });
  for (const scope of ['literal', 'fixed', 'omitted'] as const)
    for (const metadata of [false, true])
      it(`diagnoses an unknown ${scope} record type before ${metadata ? 'metadata mapping' : 'envelope-only'} validation`, () => {
        const input: GraphqlNamedQueryDefinition = {
          source: 'graphql',
          graphql: {
            document: `query${scope === 'literal' ? '' : `($type: String!${scope === 'omitted' ? ' = "PRIVATE_UNKNOWN_TYPE"' : ''})`} {
              records(recordType: ${scope === 'literal' ? '"PRIVATE_UNKNOWN_TYPE"' : '$type'}) {
                nodes { oid ${metadata ? `metadata { ... on ${metadataTypeName(gridContracts()[0])} { label: title } }` : ''} }
              }
            }`,
            variables:
              scope === 'literal'
                ? {}
                : {
                    type:
                      scope === 'fixed'
                        ? { ownership: 'fixed', value: 'PRIVATE_UNKNOWN_TYPE' }
                        : { ownership: 'omitted' },
                  },
            resultPath: ['records', 'nodes'],
            ...(metadata ? { mappings: { title: ['metadata', 'label'] } } : {}),
          },
        };
        const actual = gridHarness().schema;
        const validation = validateGraphqlNamedQuery(input, actual).validation;
        assert.equal(validation.valid, false);
        assert.deepEqual(
          validation.diagnostics.map(d => d.code),
          ['UNKNOWN_RECORD_TYPE']
        );
        assert.equal(
          validation.diagnostics[0].field,
          scope === 'literal' ? 'graphql.document' : 'graphql.variables.type'
        );
        assert.ok(!JSON.stringify(validation).includes('PRIVATE_UNKNOWN_TYPE'));
      });
  it('checks statically unknown record types behind aliases and root fragments', () => {
    const input: GraphqlNamedQueryDefinition = {
      source: 'graphql',
      graphql: {
        document:
          'query { ...Root } fragment Root on Query { matches: records(recordType: "PRIVATE_UNKNOWN_TYPE") { items: nodes { oid } } }',
        variables: {},
        resultPath: ['matches', 'items'],
      },
    };
    const validation = validateGraphqlNamedQuery(input, schema).validation;
    assert.equal(validation.valid, false);
    assert.deepEqual(
      validation.diagnostics.map(d => d.code),
      ['UNKNOWN_RECORD_TYPE']
    );
    assert.equal(validation.diagnostics[0].field, 'graphql.document');
  });
  it('does not reject dynamic consumer record types or narrow them using their defaults', () => {
    const input = variable('String!', {
      ownership: 'consumer',
      parameter: 'type',
      inputType: 'String!',
      required: true,
      defaultValue: 'not-a-static-type',
    });
    assert.equal(validateGraphqlNamedQuery(input, schema).validation.valid, true);
    const empty = createRecordYoga([], { getRecord: async () => null, hasViewAccess: () => false }).schema;
    assert.equal(validateGraphqlNamedQuery(input, empty).validation.valid, true);
    assert.equal(validateGraphqlNamedQuery(variable('Int'), empty).validation.valid, false);
  });
  it('checks static collection scope even when the mapped list belongs to another selected root', () => {
    const input: GraphqlNamedQueryDefinition = {
      source: 'graphql',
      graphql: {
        document: `{ records(recordType: "PRIVATE_UNKNOWN_TYPE") { nodes { oid } }
          record(oid: "r") { metadata { ... on ${metadataTypeName(gridContracts()[0])} { people { name } } } } }`,
        variables: {},
        resultPath: ['record', 'metadata', 'people'],
        mappings: { title: ['name'] },
      },
    };
    const validation = validateGraphqlNamedQuery(input, gridHarness().schema).validation;
    assert.equal(validation.valid, false);
    assert.deepEqual(
      validation.diagnostics.map(d => d.code),
      ['UNKNOWN_RECORD_TYPE']
    );
  });
  it('leaves omitted nested fixed input-field defaults for GraphQL to apply', () => {
    const nested = buildSchema(
      'input Options { count: Int! = 4 flag: Boolean = false } type Query { rows(options: Options): [String] }'
    );
    const input: GraphqlNamedQueryDefinition = {
      source: 'graphql',
      graphql: {
        document: 'query($options: Options) { rows(options:$options) }',
        variables: { options: { ownership: 'fixed', value: {} } },
        resultPath: ['rows'],
      },
    };
    const p = prepare(input, nested);
    const values = bindGraphqlNamedQuery(p, {});
    assert.ok(values.options && typeof values.options === 'object');
    assert.deepEqual(Object.keys(values.options), []);
    const effective = getVariableValues(nested, p.operation.variableDefinitions ?? [], values);
    assert.deepEqual(effective.coerced?.options, { count: 4, flag: false });
  });
  it('handles merged response selections and preserves the validated snapshot after author edits', () => {
    const input = definition();
    input.graphql.document = input.graphql.document.replace(
      'items: nodes { id: oid label: workflowStep }',
      'items: nodes { id: oid } items: nodes { label: workflowStep }'
    );
    const p = prepare(input);
    assert.equal(p.validation.capabilities?.lookup, true);
    input.graphql.variables.search = { ownership: 'fixed', value: 'changed' };
    assert.equal(bindGraphqlNamedQuery(p, { search: 'original' }).search, 'original');
  });
  it('rejects reuse of server page variables in business filters and bounds parameter work', () => {
    const input = definition();
    input.graphql.document = input.graphql.document.replace(
      'contains: $search',
      'contains: $search, eq: {number: $first}'
    );
    assert.equal(validateGraphqlNamedQuery(input, schema).validation.valid, false);
    assert.throws(() => bindGraphqlNamedQuery(prepare(), { search: 'x'.repeat(70_000) }), GraphqlNamedQueryInputError);
    assert.throws(() => bindGraphqlNamedQuery(prepare(), { rows: {} }), GraphqlNamedQueryInputError);
  });
  it('does not disclose invalid literal values, scalar exceptions or private schema names in diagnostics', () => {
    const input = definition();
    input.graphql.document = '{ records(recordType: "PRIVATE", first: "SECRET") { nodes { missingPrivateField } } }';
    const result = JSON.stringify(validateGraphqlNamedQuery(input, schema).validation);
    assert.ok(!/PRIVATE|SECRET|missingPrivateField/.test(result));
    assert.match(result, /GRAPHQL_SCHEMA/);
  });
});

describe('GraphQL named query schema inspection', () => {
  let previous: unknown;
  let getReadSchema: sinon.SinonStub;
  beforeEach(() => {
    previous = Reflect.get(globalThis, 'RecordGraphqlService');
    getReadSchema = sinon.stub().resolves(schema);
    Reflect.set(globalThis, 'RecordGraphqlService', { getReadSchema });
  });
  afterEach(() => {
    sinon.restore();
    Reflect.set(globalThis, 'RecordGraphqlService', previous);
  });
  it('reports safe schema retrieval failures without leaking the exception', async () => {
    getReadSchema.rejects(new Error('PRIVATE_SCHEMA_CONFIG'));
    const result = await inspectGraphqlNamedQuery(definition(), caller, brand.id);
    assert.equal(result.validation.diagnostics[0].code, 'GRAPHQL_SCHEMA_UNAVAILABLE');
    assert.ok(!JSON.stringify(result).includes('PRIVATE_SCHEMA_CONFIG'));
  });
  it('distinguishes an explicitly disabled schema using its stable error code', async () => {
    getReadSchema.rejects(Object.assign(new Error('PRIVATE_SCHEMA_CONFIG'), { code: 'GRAPHQL_DISABLED' }));
    const result = await inspectGraphqlNamedQuery(definition(), caller, brand.id);
    assert.equal(result.validation.diagnostics[0].code, 'GRAPHQL_DISABLED');
    assert.ok(!JSON.stringify(result).includes('PRIVATE_SCHEMA_CONFIG'));
  });
  it('lets internal validator failures propagate instead of misreporting schema availability', async () => {
    const broken = new GraphQLSchema(schema.toConfig());
    const internal = new Error('PRIVATE_VALIDATOR_BUG');
    sinon.stub(broken, 'getQueryType').throws(internal);
    getReadSchema.resolves(broken);
    await assert.rejects(inspectGraphqlNamedQuery(definition(), caller, brand.id), error => error === internal);
    assert.equal(getReadSchema.callCount, 1);
  });
});

describe('GraphQL named query server boundaries', () => {
  let query: QueryServices.NamedQueryService;
  let editor: EditorServices.NamedQueryEditor;
  let model: { create: sinon.SinonStub; updateOne: sinon.SinonStub; findOne: sinon.SinonStub; find: sinon.SinonStub };
  let previous: Record<string, unknown>;
  beforeEach(() => {
    previous = Object.fromEntries(
      ['NamedQuery', 'NamedQueryService', 'RecordGraphqlService'].map(k => [k, Reflect.get(globalThis, k)])
    );
    setupServiceTestGlobals(createMockSails());
    model = {
      create: sinon.stub().returns(createQueryObject({})),
      updateOne: sinon.stub().returns({ set: () => createQueryObject({}) }),
      findOne: sinon
        .stub()
        .resolves({ key: 'brand_q', source: 'graphql', graphql: JSON.stringify(definition().graphql) }),
      find: sinon.stub().resolves([]),
    };
    query = new QueryServices.NamedQueryService();
    editor = new EditorServices.NamedQueryEditor();
    Object.assign(globalThis, {
      NamedQuery: model,
      NamedQueryService: query,
      RecordGraphqlService: {
        getReadSchema: sinon.stub().resolves(schema),
        execute: sinon.stub().throws('must not execute'),
      },
    });
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    Object.assign(globalThis, previous);
  });
  it('blocks invalid saves and contextless non-HTTP saves before model mutation, permits valid non-lookup saves', async () => {
    model.findOne.resolves(null);
    await assert.rejects(query.create(brand, 'q', definition()), GraphqlNamedQueryValidationError);
    const invalid = definition();
    invalid.graphql.document = '{ removed }';
    await assert.rejects(query.create(brand, 'q', invalid, caller), GraphqlNamedQueryValidationError);
    assert.equal(model.create.called, false);
    await query.create(brand, 'q', variable('Int'), caller);
    assert.equal(model.create.calledOnce, true);
    model.findOne.resolves({ key: 'brand_q', source: 'graphql' });
    await assert.rejects(query.update(brand, 'q', invalid, caller), GraphqlNamedQueryValidationError);
    assert.equal(model.updateOne.called, false);
  });
  it('keeps schema-drifted catalogue/get/description accessible while validation blocks saving and execution', async () => {
    const stale = definition();
    stale.graphql.document = '{ removedPrivateField }';
    const stored = { name: 'stale', source: 'graphql', graphql: JSON.stringify(stale.graphql) };
    model.findOne.resolves(stored);
    model.find.resolves([stored]);
    assert.equal((await query.list(brand))[0].name, 'stale');
    assert.equal((await query.getNamedQueryConfig(brand, 'stale'))?.source, 'graphql');
    const described = await editor.describeSaved(brand, 'rdmp', editorCaller, 'stale');
    assert.equal(described.source, 'graphql');
    assert.equal(described.valid, false);
    assert.ok(described.diagnostics.some(d => d.code === 'GRAPHQL_SCHEMA'));
    await assert.rejects(query.update(brand, 'stale', stale, caller), GraphqlNamedQueryValidationError);
    await assert.rejects(query.performNamedQueryFromConfig(stale, {}, brand, 0, 25));
  });
  it('protects editor validation/preview and fails contextless execution closed', async () => {
    const validation = await editor.validateDraft(brand, 'rdmp', editorCaller, { definition: definition() });
    assert.equal(validation.valid, true);
    assert.equal(validation.capabilities?.lookup, true);
    await assert.rejects(
      editor.previewDraft(brand, 'rdmp', editorCaller, {
        definition: definition(),
        parameters: { undeclared: 'SECRET' },
      }),
      GraphqlNamedQueryInputError
    );
    Object.assign(Reflect.get(globalThis, 'RecordGraphqlService'), { execute: sinon.stub().resolves({
      status: 200, data: { data: { matches: { items: [], more: false, cursor: null } } },
    }) });
    const sample = await editor.previewDraft(brand, 'rdmp', editorCaller, { definition: definition() });
    assert.equal(sample.source, 'graphql');
    assert.equal(sample.summary.numFound, null);
    assert.deepEqual(sample.records, []);
    const db = sinon.spy(query, 'performNamedQuery');
    await assert.rejects(query.performNamedQueryFromConfig(definition(), {}, brand, 0, 25));
    assert.equal(db.called, false);
  });
  it('compiles trusted bootstrap schema while disabled without inventing an authenticated identity or reading records', async () => {
    const read = sinon.stub().resolves(null);
    const registry = new RecordContractContributorRegistry(
      createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const }))
    );
    const graph = new GraphqlServices.RecordGraphql({
      getConfig: () => ({ ...recordGraphql, enabled: false }),
      getContributorRegistry: () => registry,
      getCandidates: async scope => {
        assert.deepEqual(scope.user, {});
        assert.deepEqual(scope.roles, []);
        return [
          {
            recordType: 'rdmp',
            workflowStep: 'draft',
            form: 'rdmp-draft',
            configuration: { name: 'rdmp-draft', type: 'rdmp', componentDefinitions: [] },
          },
        ];
      },
      getReusableDefinitions: () => ({}),
      getRecord: read,
    });
    const actual = await graph.getBootstrapReadSchema(brand, 'rdmp');
    assert.equal(validateGraphqlNamedQuery(definition(), actual).validation.valid, true);
    assert.equal(read.called, false);
    await assert.rejects(graph.getReadSchema(caller), /disabled/);
  });
  it('preserves database required-before-default ordering separately from GraphQL defaults', () => {
    assert.throws(
      () =>
        query.setParamsInQuery(
          {},
          {
            value: {
              path: 'value',
              type: 'string',
              required: true,
              whenUndefined: 'defaultValue',
              defaultValue: 'legacy',
            },
          },
          {}
        ),
      /value is a required parameter/
    );
  });
  it('authenticates static schema tooling before compiling any schema', async () => {
    const graph = new GraphqlServices.RecordGraphql();
    await assert.rejects(graph.getReadSchema({ ...caller, user: {} }), /authenticated context/);
  });
});

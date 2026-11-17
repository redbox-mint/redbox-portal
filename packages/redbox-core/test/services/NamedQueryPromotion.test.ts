import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { graphqlFailure } from '../../src/services/RecordGraphqlService';
import { prepareExplorerNamedQuery } from '../../src/services/named-query/explorer-promotion';
import { Services as Editors } from '../../src/services/NamedQueryEditorService';
import { Services as Rules } from '../../src/services/PathRulesService';
import { createRecordYoga } from '../../src/record-graphql/schema';
import { gridContracts } from '../fixtures/record-grid.fixtures';
import { metadataTypeName } from '../../src/record-graphql/renderer';
import { validateGraphqlNamedQuery } from '../../src/services/named-query/graphql-validation';

const brand = { id: 'brand-1', name: 'default', css: '', roles: [] };
const caller = {
  brand,
  portal: 'rdmp',
  user: { username: 'author', roles: [{ id: 'admin' }] },
  roles: [{ id: 'admin' }],
};
const raw = () => ({
  version: 1,
  mode: 'graphql',
  name: '',
  document:
    'query Q($type: String!, $filters: [RecordFilterInput!], $first: Int) { matches: records(recordType: $type, filters: $filters, first: $first) { items: nodes { identity: oid label: workflowStep } } }',
  variables: { type: 'plan', filters: [{ field: 'record:oid', eq: { text: 'current' } }], first: 25 },
  resultPath: ['matches', 'items'],
});
const visual = () => ({
  version: 1,
  name: '',
  recordType: 'plan',
  columns: ['record:oid', 'metadata:/title'],
  filters: [
    { fieldId: 'metadata:/title', expectedScalarType: 'STRING', operator: 'contains', values: ['CURRENT_VALUE'] },
  ],
  sort: { fieldId: 'metadata:/title', expectedScalarType: 'STRING', direction: 'desc' },
  pageSize: 50,
});
const contract = { ...gridContracts()[0], context: { ...gridContracts()[0].context, recordType: 'plan' } };
const fields = () => [
  {
    id: 'record:oid',
    scalarType: 'STRING',
    selectable: true,
    filterable: true,
    repeating: false,
    availableInAllVariants: true,
    operators: ['EQ'],
    sortable: true,
    selections: [{ selection: 'oid', responsePath: ['oid'] }],
  },
  {
    id: 'metadata:/title',
    scalarType: 'STRING',
    selectable: true,
    filterable: true,
    repeating: false,
    availableInAllVariants: true,
    operators: ['CONTAINS'],
    sortable: true,
    selections: [
      {
        selection: `... on ${metadataTypeName(contract)} { currentLabel: title }`,
        responsePath: ['metadata', 'currentLabel'],
      },
    ],
  },
];

describe('Detached explorer named-query promotion', () => {
  let previous: Record<string, unknown>;
  let execute: sinon.SinonStub;
  beforeEach(() => {
    previous = Object.fromEntries(
      ['RecordGraphqlService', 'BrandingService', 'PathRulesService'].map(key => [key, Reflect.get(globalThis, key)])
    );
    execute = sinon.stub().resolves({ status: 200, data: { data: { recordFields: { fields: fields() } } } });
    Reflect.set(globalThis, 'RecordGraphqlService', { execute });
    Reflect.set(globalThis, 'BrandingService', { getRootContext: () => '/context' });
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) Reflect.set(globalThis, key, value);
    sinon.restore();
  });

  it('copies current raw values, aliases and provenance without executing or choosing ownership/defaults', async () => {
    const input = { ...raw(), id: '0123456789abcdef01234567', revision: 7 };
    const before = structuredClone(input);
    const result = await prepareExplorerNamedQuery(input, caller);
    assert.equal(execute.called, false);
    assert.deepEqual(result.definition.graphql.variables, {});
    assert.deepEqual(result.definition.graphql.mappings, { oid: ['identity'] });
    assert.deepEqual(result.definition.graphql.resultPath, ['matches', 'items']);
    assert.deepEqual(result.definition.graphql.provenance, { explorerId: input.id, explorerRevision: 7, explorerPortal: caller.portal });
    assert.deepEqual(result.variableValues, input.variables);
    assert.equal(result.definition.name, '');
    const filters = result.variableValues.filters;
    assert.ok(Array.isArray(filters));
    filters.push({ field: 'another', eq: { text: 'detached' } });
    result.definition.graphql.resultPath.push('changed');
    input.variables.filters[0].eq.text = 'original edited';
    assert.deepEqual(result.variableValues.type, before.variables.type);
    assert.equal(JSON.stringify(result.variableValues).includes('original edited'), false);
    assert.deepEqual(input.resultPath, before.resultPath);
    assert.deepEqual(result.definition.graphql.variables, {});
  });
  it('generates from fresh discovery and current unsaved visual selections, filters and sort', async () => {
    const input = visual();
    const before = structuredClone(input);
    const result = await prepareExplorerNamedQuery(input, caller);
    assert.equal(execute.callCount, 1);
    const [actualCaller, request] = execute.firstCall.args;
    assert.equal(actualCaller, caller);
    assert.ok(request.query.includes('recordFields('));
    assert.ok(!request.query.includes('records('));
    assert.deepEqual(request.variables.ids, input.columns);
    assert.ok(result.definition.graphql.document.includes('currentLabel: title'));
    assert.ok(!result.definition.graphql.document.includes('CURRENT_VALUE'));
    assert.deepEqual(result.variableValues.filters, [{ field: 'metadata:/title', contains: 'CURRENT_VALUE' }]);
    assert.deepEqual(result.variableValues.sort, [{ field: 'metadata:/title', direction: 'DESC' }]);
    assert.equal(result.variableValues.first, 50);
    assert.equal(result.variableValues.after, null);
    assert.deepEqual(result.definition.graphql.variables, {});
    assert.deepEqual(input, before);
    // Generated selections validate against the real schema without reading records.
    const schema = createRecordYoga([contract], {
      getRecord: async () => {
        throw new Error('Must not execute');
      },
      hasViewAccess: () => false,
    }).schema;
    const candidate = result.definition;
    candidate.name = 'visual';
    for (const [key, value] of Object.entries(result.variableValues))
      candidate.graphql.variables[key] = { ownership: 'fixed', value };
    candidate.graphql.variables.stages = { ownership: 'omitted' };
    const validation = validateGraphqlNamedQuery(candidate, schema).validation;
    assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics));
    assert.equal(validation.capabilities?.lookup, false);
  });
  for (const drift of ['missing', 'type', 'sort', 'filterable'] as const)
    it(`refuses current discovery ${drift} drift without silently dropping an operation`, async () => {
      const found = fields();
      if (drift === 'missing') found.pop();
      if (drift === 'type') found[1].scalarType = 'INTEGER';
      if (drift === 'filterable') found[1].filterable = false;
      if (drift === 'sort') found[1].sortable = false;
      execute.resolves({ status: 200, data: { data: { recordFields: { fields: found } } } });
      await assert.rejects(prepareExplorerNamedQuery(visual(), caller), {
        code: drift === 'type' ? 'sort-type-changed' : 'schema-changed',
      });
    });
  for (const [operator, values] of [
    ['exists', []],
    ['exists', ['true', 'false']],
    ['exists', ['yes']],
    ['contains', ['']],
    ['eq', ['a', 'b']],
    ['in', []],
    ['in', Array(21).fill('x')],
    ['eq', ['é'.repeat(129)]],
  ] as const)
    it(`rejects crafted visual ${operator} operands ${JSON.stringify(values)}`, async () => {
      const input = {
        ...visual(),
        filters: [{ fieldId: 'metadata:/title', expectedScalarType: 'STRING', operator, values }],
      };
      await assert.rejects(prepareExplorerNamedQuery(input, caller), { status: 400, code: 'invalid-definition' });
      assert.equal(execute.called, false);
    });
  for (const [scalarType, operator, values] of [
    ['NUMBER', 'eq', ['0x20']],
    ['INTEGER', 'eq', ['1.5']],
    ['BOOLEAN', 'eq', ['yes']],
    ['DATETIME', 'eq', ['2026-02-30T00:00:00Z']],
    ['NUMBER', 'between', ['20', '10']],
  ] as const)
    it(`rejects crafted ${scalarType} conversion using fresh discovery`, async () => {
      const found = fields();
      found[1].scalarType = scalarType;
      found[1].operators = [operator.toUpperCase()];
      execute.resolves({ status: 200, data: { data: { recordFields: { fields: found } } } });
      await assert.rejects(
        prepareExplorerNamedQuery(
          {
            ...visual(),
            sort: null,
            filters: [
              {
                fieldId: found[1].id,
                expectedScalarType: scalarType,
                operator,
                values,
              },
            ],
          },
          caller
        ),
        { status: 400, code: 'invalid-definition' }
      );
    });
  for (const [scalarType, operator, values, operand] of [
    ['INTEGER', 'in', ['+02', '3'], { in: [{ number: 2 }, { number: 3 }] }],
    ['BOOLEAN', 'eq', ['false'], { eq: { boolean: false } }],
    [
      'DATETIME',
      'between',
      ['2028-02-29T12:00:00+12:00', '2028-03-01T00:00:00Z'],
      {
        between: { from: { dateTime: '2028-02-29T00:00:00.000Z' }, to: { dateTime: '2028-03-01T00:00:00.000Z' } },
      },
    ],
    ['STRING', 'exists', ['false'], { exists: false }],
  ] as const)
    it(`preserves unsaved ${scalarType} ${operator} operands`, async () => {
      const found = fields();
      found[1].scalarType = scalarType;
      found[1].operators = [operator.toUpperCase()];
      execute.resolves({ status: 200, data: { data: { recordFields: { fields: found } } } });
      const input = {
        ...visual(),
        sort: null,
        filters: [{ fieldId: found[1].id, expectedScalarType: scalarType, operator, values }],
      };
      const before = structuredClone(input);
      const result = await prepareExplorerNamedQuery(input, caller);
      assert.deepEqual(result.variableValues.filters, [{ field: found[1].id, ...operand }]);
      assert.deepEqual(input, before);
    });
  for (const [status, code] of [
    [503, 'GRAPHQL_DISABLED'],
    [503, 'UNAVAILABLE'],
    [503, 'QUERY_TIMEOUT'],
    [504, 'QUERY_TIMEOUT'],
    [413, 'QUERY_LIMIT'],
  ] as const)
    it(`preserves safe discovery ${status}/${code} without private errors`, async () => {
      execute.resolves(graphqlFailure(status, code, 'PRIVATE QUERY AND VALUES'));
      await assert.rejects(prepareExplorerNamedQuery(visual(), caller), { status, code });
    });
  for (const [code, status, expectedCode] of [
    ['SEARCH_UNAVAILABLE', 503, 'UNAVAILABLE'],
    ['COLLECTION_UNAVAILABLE', 503, 'UNAVAILABLE'],
    ['STORAGE_UNAVAILABLE', 503, 'UNAVAILABLE'],
    ['UNSUPPORTED_SEARCH_INDEX', 503, 'UNAVAILABLE'],
    ['QUERY_TIMEOUT', 503, 'QUERY_TIMEOUT'],
    ['QUERY_LIMIT', 413, 'QUERY_LIMIT'],
    ['CATALOGUE_LIMIT', 413, 'CATALOGUE_LIMIT'],
    ['UNKNOWN_FIELD', 400, 'schema-changed'],
    ['UNKNOWN_WORKFLOW_STAGE', 400, 'schema-changed'],
    ['UNKNOWN_RECORD_TYPE', 400, 'schema-changed'],
    ['PRIVATE_CODE', 400, 'schema-changed'],
  ] as const)
    it(`classifies HTTP 200 discovery resolver error ${code} safely`, async () => {
      execute.resolves({
        status: 200,
        data: { errors: [{ message: 'PRIVATE QUERY AND VALUES', extensions: { code } }] },
      });
      await assert.rejects(prepareExplorerNamedQuery(visual(), caller), { status, code: expectedCode });
    });
  it('normalizes unexpected upstream errors and malformed successful discovery safely', async () => {
    execute.resolves(graphqlFailure(500, 'PRIVATE_CODE', 'PRIVATE QUERY AND VALUES'));
    await assert.rejects(prepareExplorerNamedQuery(visual(), caller), { status: 503, code: 'UNAVAILABLE' });
    execute.resolves({ status: 200, data: { data: { recordFields: { fields: 'PRIVATE' } } } });
    await assert.rejects(prepareExplorerNamedQuery(visual(), caller), { status: 400, code: 'schema-changed' });
  });
  it('does not require lookup compatibility or execute a raw query to prepare a repairable definition', async () => {
    const input = {
      ...raw(),
      document: 'query { records(recordType: "plan") { nodes { oid } } }',
      variables: {},
      resultPath: ['records', 'nodes'],
    };
    const result = await prepareExplorerNamedQuery(input, caller);
    assert.equal(result.definition.graphql.lookup, undefined);
    assert.equal(execute.called, false);
  });
  it('requires destination write rules independently, including fail-closed missing rules', () => {
    const editor = new Editors.NamedQueryEditor();
    const rules = new Rules.PathRules();
    const getRules = sinon.stub().returns([
      {
        path: '/context/default/rdmp/api/named-query',
        branding: { id: brand.id, name: brand.name },
        role: { id: 'admin' },
        can_read: true,
        can_update: false,
      },
    ]);
    Reflect.set(globalThis, 'PathRulesService', { getRulesFromPath: getRules, canWrite: rules.canWrite });
    assert.equal(editor.canCreate(brand, caller.portal, caller.user), false);
    getRules.returns([{ branding: { id: brand.id, name: brand.name }, role: { id: 'admin' }, can_update: true }]);
    assert.equal(editor.canCreate(brand, caller.portal, caller.user), true);
    assert.equal(getRules.lastCall.args[0], '/context/default/rdmp/api/named-query');
    getRules.returns(null);
    assert.equal(editor.canCreate(brand, caller.portal, caller.user), false);
  });
  it('denies preparation before discovery when only explorer access is available', async () => {
    const editor = new Editors.NamedQueryEditor();
    sinon.stub(editor, 'canCreate').returns(false);
    assert.throws(() => editor.preparePromotion(visual(), caller), {
      code: 'NAMED_QUERY_CREATE_FORBIDDEN',
      status: 403,
    });
    assert.equal(execute.called, false);
  });
});

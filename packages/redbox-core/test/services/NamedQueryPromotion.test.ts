import assert from 'node:assert/strict';
import * as sinon from 'sinon';
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
    assert.deepEqual(result.definition.graphql.provenance, { explorerId: input.id, explorerRevision: 7 });
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
  for (const drift of ['missing', 'type', 'sort'] as const)
    it(`refuses current discovery ${drift} drift without silently dropping an operation`, async () => {
      const found = fields();
      if (drift === 'missing') found.pop();
      if (drift === 'type') found[1].scalarType = 'INTEGER';
      if (drift === 'sort') found[1].sortable = false;
      execute.resolves({ status: 200, data: { data: { recordFields: { fields: found } } } });
      await assert.rejects(prepareExplorerNamedQuery(visual(), caller), {
        code: drift === 'type' ? 'sort-type-changed' : 'schema-changed',
      });
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

import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import type { GraphqlNamedQueryDefinition, GraphqlNamedQueryVariable } from '@researchdatabox/sails-ng-common';
import { Services } from '../../src/services/NamedQueryService';
import { Services as EditorServices } from '../../src/services/NamedQueryEditorService';
import type { NamedQueryAttributes } from '../../src/waterline-models/NamedQuery';
import {
  NamedQueryUpdateConfirmationError,
  NamedQueryUpdateConflictError,
  namedQueryBreakingChanges,
} from '../../src/services/named-query/update-review';
import { gridContracts } from '../fixtures/record-grid.fixtures';
import { createRecordYoga } from '../../src/record-graphql/schema';
import { metadataTypeName } from '../../src/record-graphql/renderer';
import { createMockSails, createQueryObject, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

const brand = { id: 'brand-1', name: 'brand-1', css: '', roles: [] };
const caller = {
  brand,
  portal: 'rdmp',
  user: { id: 'author', type: 'local', name: 'Author', email: 'author@example.invalid', username: 'author', roles: [] },
  roles: [],
};
const database = { collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
const graphql: GraphqlNamedQueryDefinition = {
  name: 'review',
  source: 'graphql',
  graphql: {
    document:
      'query Q($search: String! = "rdmp", $first: Int, $after: String) { records(recordType: $search, first: $first, after: $after) { nodes { oid workflowStep } hasNextPage } }',
    variables: { search: { ownership: 'consumer', parameter: 'search', inputType: 'String!', required: true } },
    resultPath: ['records', 'nodes'],
    mappings: { oid: ['oid'], title: ['workflowStep'] },
    lookup: {
      mode: 'firstPage',
      collectionPath: ['records'],
      hasNextPagePath: ['records', 'hasNextPage'],
      firstVariable: 'first',
      afterVariable: 'after',
      searchParameter: 'search',
    },
  },
};

const contracts = gridContracts().map(contract => ({
  ...contract,
  context: { ...contract.context, recordType: 'rdmp' },
}));
const scopedLookup = (): GraphqlNamedQueryDefinition => ({
  ...structuredClone(graphql),
  graphql: {
    ...structuredClone(graphql.graphql),
    document: `query Q($search: String! = "rdmp", $stages: [String!] = ["draft"], $first: Int, $after: String) {
      records(recordType: "rdmp", workflowStages: $stages, filters: [{field: "title", contains: $search}], first: $first, after: $after) {
        nodes { oid metadata {
          ... on ${metadataTypeName(contracts[0])} { label: title }
          ... on ${metadataTypeName(contracts[1])} { label: title @skip(if: true) }
        } }
        hasNextPage
      }
    }`,
    variables: { ...structuredClone(graphql.graphql.variables), stages: { ownership: 'fixed', value: ['draft'] } },
    mappings: { oid: ['oid'], title: ['metadata', 'label'] },
  },
});

describe('named query update review', () => {
  let service: Services.NamedQueryService;
  let row: NamedQueryAttributes;
  let update: sinon.SinonStub;
  let usage: sinon.SinonStub;
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    Reflect.set(globalThis, 'RecordGraphqlService', {
      getReadSchema: async () =>
        createRecordYoga(contracts, { getRecord: async () => null, hasViewAccess: () => false }).schema,
    });
    row = {
      id: 'review-id',
      key: 'brand-1_review',
      name: 'review',
      branding: brand.id,
      source: 'graphql',
      graphql: JSON.stringify(graphql.graphql),
    };
    update = sinon.stub().callsFake(({ where: criteria }: { where: Record<string, unknown> }) => ({
      set: (value: Partial<NamedQueryAttributes>) => {
        if (!Object.entries(criteria).every(([key, value]) => Reflect.get(row, key) === value))
          return createQueryObject(undefined);
        row = { ...row, ...value };
        return createQueryObject(row);
      },
    }));
    Reflect.set(globalThis, 'NamedQuery', { findOne: async () => ({ ...row }), updateOne: update });
    service = new Services.NamedQueryService();
    usage = sinon
      .stub(service, 'getUsage')
      .resolves({ review: [{ type: 'form', name: 'Known form', path: '/record/form/known' }] });
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    Reflect.deleteProperty(globalThis, 'RecordGraphqlService');
    Reflect.deleteProperty(globalThis, 'NamedQuery');
    sinon.restore();
  });
  const changed = () => {
    const next = structuredClone(graphql);
    next.graphql.variables.search = {
      ownership: 'consumer',
      parameter: 'search',
      inputType: 'String!',
      required: true,
      defaultValue: 'other',
    };
    return next;
  };
  it('refuses API/service bypass and binds acknowledgement to the reviewed draft and known usages', async () => {
    const next = changed();
    await assert.rejects(service.update(brand, 'review', next, caller), NamedQueryUpdateConfirmationError);
    assert.equal(update.called, false);
    const review = await service.reviewUpdate(brand, 'review', next, caller);
    assert.deepEqual(review.changes, ['parameters', 'bindings']);
    assert.equal(review.usageComplete, false);
    assert.equal(review.usedBy[0].name, 'Known form');
    assert.ok(review.confirmation);
    const altered = structuredClone(next);
    altered.description = 'Changed after review';
    await assert.rejects(
      service.update(brand, 'review', altered, caller, review.confirmation),
      NamedQueryUpdateConfirmationError
    );
    usage.resolves({ review: [{ type: 'report', name: 'New consumer', path: '/admin/report/new' }] });
    await assert.rejects(
      service.update(brand, 'review', next, caller, review.confirmation),
      NamedQueryUpdateConfirmationError
    );
    assert.equal(update.called, false);
    usage.resolves({ review: review.usedBy });
    await service.update(brand, 'review', next, caller, review.confirmation);
    assert.deepEqual(JSON.parse(row.graphql!), next.graphql);
    // It is a normal immediate saved edit, without a publication stage.
    const saved = await service.getNamedQueryConfig(brand, 'review');
    assert.equal(saved?.source, 'graphql');
    if (saved?.source === 'graphql') assert.deepEqual(saved.graphql, next.graphql);
  });
  it('rejects acknowledgement after a concurrent saved edit, for another actor/portal, or after expiry', async () => {
    const next = changed();
    const review = await service.reviewUpdate(brand, 'review', next, caller);
    row.description = 'Concurrent edit';
    await assert.rejects(
      service.update(brand, 'review', next, caller, review.confirmation),
      NamedQueryUpdateConfirmationError
    );
    delete row.description;
    for (const context of [
      { ...caller, portal: 'other' },
      { ...caller, user: { username: 'someone-else' } },
    ])
      await assert.rejects(
        service.update(brand, 'review', next, context, review.confirmation),
        NamedQueryUpdateConfirmationError
      );
    const clock = sinon.useFakeTimers({ now: Date.now() + 600_001, toFake: ['Date'] });
    try {
      await assert.rejects(
        service.update(brand, 'review', next, caller, review.confirmation),
        NamedQueryUpdateConfirmationError
      );
    } finally {
      clock.restore();
    }
    await assert.rejects(
      service.update(brand, 'review', next, caller, review.confirmation + 'tampered'),
      NamedQueryUpdateConfirmationError
    );
    await assert.rejects(
      service.update(brand, 'review', next, caller, review.confirmation + '.extra'),
      NamedQueryUpdateConfirmationError
    );
    const malformed = review.confirmation!.split('.');
    malformed[2] = 'é'.repeat(64);
    await assert.rejects(
      service.update(brand, 'review', next, caller, malformed.join('.')),
      NamedQueryUpdateConfirmationError
    );
    assert.equal(update.called, false);
  });
  it('atomically refuses a write that races with the reviewed saved definition', async () => {
    const next = changed();
    const review = await service.reviewUpdate(brand, 'review', next, caller);
    const originalUpdate = update.getCall(0);
    assert.equal(originalUpdate, null);
    update.callsFake(() => ({ set: () => createQueryObject(undefined) }));
    await assert.rejects(
      service.update(brand, 'review', next, caller, review.confirmation),
      NamedQueryUpdateConflictError
    );
  });
  it('requires explicit review when replacing either source and clears inactive persisted fields', async () => {
    const review = await service.reviewUpdate(brand, 'review', database, caller);
    assert.deepEqual(review.changes, ['source']);
    await assert.rejects(service.update(brand, 'review', database, caller), NamedQueryUpdateConfirmationError);
    await service.update(brand, 'review', database, caller, review.confirmation);
    assert.equal(row.graphql, null);
    assert.equal(row.mongoQuery, '{}');
    const reverse = await service.reviewUpdate(brand, 'review', graphql, caller);
    await service.update(brand, 'review', graphql, caller, reverse.confirmation);
    assert.equal(row.mongoQuery, null);
    assert.equal(row.collectionName, null);
  });
  for (const [label, mutate] of [
    [
      'removed parameter',
      (next: GraphqlNamedQueryDefinition) => {
        next.graphql.variables.search = { ownership: 'fixed', value: 'rdmp' };
        next.graphql.lookup = undefined;
        next.graphql.variables.first = { ownership: 'omitted' };
        next.graphql.variables.after = { ownership: 'omitted' };
      },
    ],
    [
      'renamed parameter',
      (next: GraphqlNamedQueryDefinition) => {
        const binding = next.graphql.variables.search;
        if (binding.ownership === 'consumer') binding.parameter = 'renamed';
        next.graphql.lookup!.searchParameter = 'renamed';
      },
    ],
    [
      'type and nullability',
      (next: GraphqlNamedQueryDefinition) => {
        next.graphql.document = next.graphql.document.replace('String!', 'String');
        next.graphql.variables.search = {
          ownership: 'consumer',
          parameter: 'search',
          inputType: 'String',
          required: false,
        };
      },
    ],
    [
      'operation default',
      (next: GraphqlNamedQueryDefinition) => {
        next.graphql.document = next.graphql.document.replace('"rdmp"', '"other"');
      },
    ],
    [
      'required mapping',
      (next: GraphqlNamedQueryDefinition) => {
        delete next.graphql.mappings!.title;
      },
    ],
  ] as const)
    it(`reviews ${label} changes before persistence`, async () => {
      const next = structuredClone(graphql);
      mutate(next);
      const review = await service.reviewUpdate(brand, 'review', next, caller);
      assert.equal(review.required, true);
      await assert.rejects(service.update(brand, 'review', next, caller), NamedQueryUpdateConfirmationError);
    });
  it('reviews document-only conditional removal of a required mapped selection before saving', async () => {
    const lookup = structuredClone(graphql);
    lookup.graphql.document = lookup.graphql.document.replace(
      'recordType: $search',
      'recordType: "rdmp", filters: [{field: "title", contains: $search}]'
    );
    row.graphql = JSON.stringify(lookup.graphql);
    const editor = new EditorServices.NamedQueryEditor();
    const context = { brand, user: caller.user };
    const before = await editor.describeDraft(brand, caller.portal, context, { definition: lookup });
    assert.equal(before.valid, true);
    assert.equal(before.capabilities?.lookup, true);
    const next = structuredClone(lookup);
    next.graphql.document = next.graphql.document.replace('oid workflowStep', 'oid workflowStep @skip(if: true)');
    const after = await editor.describeDraft(brand, caller.portal, context, { definition: next });
    assert.equal(after.valid, true);
    assert.equal(after.capabilities?.lookup, false);
    assert.ok(after.capabilities?.diagnostics.some(diagnostic => diagnostic.code === 'LOOKUP_MAPPING'));
    const reviewed = await service.reviewUpdate(brand, 'review', next, caller);
    assert.deepEqual(reviewed.changes, ['document']);
    assert.equal(reviewed.required, true);
    assert.equal(reviewed.usedBy[0].name, 'Known form');
    await assert.rejects(service.update(brand, 'review', next, caller), NamedQueryUpdateConfirmationError);
    assert.equal(update.called, false);
    assert.deepEqual(JSON.parse(row.graphql!), lookup.graphql);
    const changedAgain = structuredClone(next);
    changedAgain.graphql.document = changedAgain.graphql.document.replace('if: true', 'if: false');
    await assert.rejects(
      service.update(brand, 'review', changedAgain, caller, reviewed.confirmation),
      NamedQueryUpdateConfirmationError
    );
    await service.update(brand, 'review', next, caller, reviewed.confirmation);
    assert.deepEqual(JSON.parse(row.graphql!), next.graphql);
  });
  it('reviews fixed scope changes with unchanged document and mappings before lookup compatibility is lost', async () => {
    const previous = scopedLookup();
    row.graphql = JSON.stringify(previous.graphql);
    const editor = new EditorServices.NamedQueryEditor();
    const context = { brand, user: caller.user };
    const before = await editor.describeDraft(brand, caller.portal, context, { definition: previous });
    assert.equal(before.valid, true);
    assert.equal(before.capabilities?.lookup, true);
    const next = structuredClone(previous);
    next.graphql.variables.stages = { ownership: 'fixed', value: ['published'] };
    assert.equal(next.graphql.document, previous.graphql.document);
    assert.deepEqual(next.graphql.mappings, previous.graphql.mappings);
    const after = await editor.describeDraft(brand, caller.portal, context, { definition: next });
    assert.equal(after.valid, true);
    assert.equal(after.capabilities?.lookup, false);
    assert.ok(after.capabilities?.diagnostics.some(diagnostic => diagnostic.code === 'LOOKUP_MAPPING'));
    const reviewed = await service.reviewUpdate(brand, 'review', next, caller);
    assert.deepEqual(reviewed.changes, ['bindings']);
    assert.equal(reviewed.required, true);
    assert.deepEqual(reviewed.usedBy, [{ type: 'form', name: 'Known form', path: '/record/form/known' }]);
    assert.equal(usage.calledWith(brand), true);
    await assert.rejects(service.update(brand, 'review', next, caller), NamedQueryUpdateConfirmationError);
    const changedAgain = structuredClone(next);
    changedAgain.graphql.variables.stages = { ownership: 'omitted' };
    await assert.rejects(
      service.update(brand, 'review', changedAgain, caller, reviewed.confirmation),
      NamedQueryUpdateConfirmationError
    );
    row.description = 'Concurrent saved edit';
    await assert.rejects(
      service.update(brand, 'review', next, caller, reviewed.confirmation),
      NamedQueryUpdateConfirmationError
    );
    delete row.description;
    assert.equal(update.called, false);
    assert.deepEqual(JSON.parse(row.graphql!), previous.graphql);
    await service.update(brand, 'review', next, caller, reviewed.confirmation);
    assert.deepEqual(JSON.parse(row.graphql!), next.graphql);
  });
  const ownerships: GraphqlNamedQueryVariable[] = [
    { ownership: 'fixed', value: ['draft'] },
    { ownership: 'omitted' },
    { ownership: 'consumer', parameter: 'stages', inputType: '[String!]', required: false, defaultValue: ['draft'] },
  ];
  for (const previousBinding of ownerships)
    for (const nextBinding of ownerships)
      if (previousBinding.ownership !== nextBinding.ownership)
        it(`reviews ${previousBinding.ownership} to ${nextBinding.ownership} ownership with unchanged document`, async () => {
          const previous = scopedLookup();
          previous.graphql.variables.stages = structuredClone(previousBinding);
          row.graphql = JSON.stringify(previous.graphql);
          const next = structuredClone(previous);
          next.graphql.variables.stages = structuredClone(nextBinding);
          const reviewed = await service.reviewUpdate(brand, 'review', next, caller);
          assert.ok(reviewed.changes.includes('bindings'));
          assert.equal(reviewed.required, true);
          assert.equal(reviewed.usedBy[0].name, 'Known form');
          await assert.rejects(service.update(brand, 'review', next, caller), NamedQueryUpdateConfirmationError);
          assert.equal(update.called, false);
          await service.update(brand, 'review', next, caller, reviewed.confirmation);
          assert.deepEqual(JSON.parse(row.graphql!), next.graphql);
        });
  for (const [label, defaultValue] of [
    ['adding', ['draft']],
    ['removing', undefined],
    ['clearing to null', null],
    ['changing', []],
  ] as const)
    it(`reviews ${label} a consumer default without changing ownership or document`, async () => {
      const previous = scopedLookup();
      previous.graphql.variables.stages = {
        ownership: 'consumer',
        parameter: 'stages',
        inputType: '[String!]',
        required: false,
        ...(label === 'adding' ? {} : { defaultValue: ['draft'] }),
      };
      row.graphql = JSON.stringify(previous.graphql);
      const next = structuredClone(previous);
      const binding = next.graphql.variables.stages;
      assert.equal(binding.ownership, 'consumer');
      if (binding.ownership !== 'consumer') throw new Error('Consumer fixture required');
      if (defaultValue === undefined) delete binding.defaultValue;
      else binding.defaultValue = defaultValue === null ? null : [...defaultValue];
      const reviewed = await service.reviewUpdate(brand, 'review', next, caller);
      assert.deepEqual(reviewed.changes, ['parameters', 'bindings']);
      assert.equal(reviewed.usedBy[0].name, 'Known form');
      await assert.rejects(service.update(brand, 'review', next, caller), NamedQueryUpdateConfirmationError);
      assert.equal(update.called, false);
      await service.update(brand, 'review', next, caller, reviewed.confirmation);
      assert.deepEqual(JSON.parse(row.graphql!), next.graphql);
    });
  it('compares complete bindings without treating object-key ordering as a change', () => {
    const previous = scopedLookup();
    const next = structuredClone(previous);
    next.graphql.variables = Object.fromEntries(Object.entries(next.graphql.variables).reverse());
    assert.deepEqual(namedQueryBreakingChanges(previous, next), []);
    // Presence and JSON values belong to the binding contract as well.
    for (const binding of [
      undefined,
      { ownership: 'fixed', value: null },
      { ownership: 'fixed', value: [] },
      { ownership: 'fixed', value: ['draft', 'published'] },
    ] satisfies Array<GraphqlNamedQueryVariable | undefined>) {
      const changed = structuredClone(previous);
      if (binding === undefined) delete changed.graphql.variables.stages;
      else changed.graphql.variables.stages = structuredClone(binding);
      assert.deepEqual(namedQueryBreakingChanges(previous, changed), ['bindings']);
    }
  });
  it('also reviews a selected-operation edit when document text and paths stay unchanged', async () => {
    const next = structuredClone(graphql);
    next.graphql.operationName = 'Q';
    const review = await service.reviewUpdate(brand, 'review', next, caller);
    assert.deepEqual(review.changes, ['document']);
    await assert.rejects(service.update(brand, 'review', next, caller), NamedQueryUpdateConfirmationError);
  });
  it('keeps unchanged database/source saves and nonbreaking GraphQL edits usable without acknowledgement', async () => {
    const next = { ...structuredClone(graphql), description: 'New description' };
    assert.equal((await service.reviewUpdate(brand, 'review', next, caller)).required, false);
    await service.update(brand, 'review', next, caller);
    row = {
      id: row.id,
      key: row.key,
      name: row.name,
      branding: brand.id,
      collectionName: 'record',
      mongoQuery: '{ }',
      queryParams: '{}',
      resultObjectMapping: '{}',
    };
    await service.update(brand, 'review', database);
    assert.equal(row.mongoQuery, '{ }');
    assert.equal(Object.hasOwn(row, 'source'), false);
  });
  it('does not claim an operation default satisfies a required variable when none is declared', async () => {
    const definition = structuredClone(graphql);
    definition.graphql.document = definition.graphql.document.replace(' = "rdmp"', '');
    const editor = new EditorServices.NamedQueryEditor();
    const described = await editor.describeDraft(brand, caller.portal, { brand, user: caller.user }, { definition });
    assert.equal(described.source, 'graphql');
    if (described.source === 'graphql') {
      assert.equal(described.parameters[0].hasOperationDefault, false);
      assert.equal(described.parameters[0].omissionSatisfied, false);
    }
  });
  it('describes operation-default satisfaction from the actual schema without record execution', async () => {
    const editor = new EditorServices.NamedQueryEditor();
    const description = await editor.describeDraft(
      brand,
      caller.portal,
      { brand, user: caller.user },
      { definition: graphql }
    );
    assert.equal(description.source, 'graphql');
    if (description.source !== 'graphql') return;
    const parameter = description.parameters[0];
    assert.equal(parameter.required, true);
    assert.equal(parameter.hasOperationDefault, true);
    assert.equal(parameter.omissionSatisfied, true);
    assert.deepEqual(
      description.operationVariables?.find(variable => variable.variable === 'search'),
      {
        variable: 'search',
        inputType: 'String!',
        required: true,
        consumerSupported: true,
        hasOperationDefault: true,
        omissionSatisfied: true,
      }
    );
  });
});

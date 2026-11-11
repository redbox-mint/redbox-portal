import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import type { GraphqlNamedQueryDefinition } from '@researchdatabox/sails-ng-common';
import { Services } from '../../src/services/NamedQueryService';
import { Services as EditorServices } from '../../src/services/NamedQueryEditorService';
import type { NamedQueryAttributes } from '../../src/waterline-models/NamedQuery';
import {
  NamedQueryUpdateConfirmationError,
  NamedQueryUpdateConflictError,
} from '../../src/services/named-query/update-review';
import { gridContracts } from '../fixtures/record-grid.fixtures';
import { createRecordYoga } from '../../src/record-graphql/schema';
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

describe('named query update review', () => {
  let service: Services.NamedQueryService;
  let row: NamedQueryAttributes;
  let update: sinon.SinonStub;
  let usage: sinon.SinonStub;
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    Reflect.set(globalThis, 'RecordGraphqlService', {
      getReadSchema: async () =>
        createRecordYoga(
          gridContracts().map(contract => ({ ...contract, context: { ...contract.context, recordType: 'rdmp' } })),
          { getRecord: async () => null, hasViewAccess: () => false }
        ).schema,
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
    assert.deepEqual(review.changes, ['parameters']);
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

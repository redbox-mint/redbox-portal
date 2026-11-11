import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as sinon from 'sinon';
import type { GraphqlNamedQueryDefinition } from '@researchdatabox/sails-ng-common';
import type { NamedQueryAttributes } from '../../src/waterline-models/NamedQuery';
import { NamedQueryWLDef } from '../../src/waterline-models/NamedQuery';
import { Services, readNamedQueryConfig } from '../../src/services/NamedQueryService';
import { DATABASE_NAMED_QUERY_FIELDS, NamedQueryDefinitionError } from '../../src/services/named-query/definition';
import { createMockSails, createQueryObject, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

const graphql: GraphqlNamedQueryDefinition = {
  source: 'graphql',
  description: 'Detached lookup',
  graphql: {
    document:
      'query Lookup($search: String, $first: Int, $after: String) { matches: records(first: $first, after: $after) { nodes { oid } hasNextPage } }',
    operationName: 'Lookup',
    variables: {
      search: { ownership: 'consumer', parameter: 'search', inputType: 'String', required: false, defaultValue: '' },
      fixed: { ownership: 'fixed', value: { nested: [null, false, 0, ''] } },
      omitted: { ownership: 'omitted' },
    },
    resultPath: ['matches', 'nodes'],
    mappings: { oid: ['oid'], title: ['metadata', 'dc:title'], metadata: [] },
    lookup: {
      mode: 'firstPage',
      collectionPath: ['matches'],
      hasNextPagePath: ['matches', 'hasNextPage'],
      firstVariable: 'first',
      afterVariable: 'after',
      searchParameter: 'search',
    },
    provenance: { explorerId: 'detached-grid', explorerRevision: 2 },
  },
};
const database = { collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
const brand = { id: 'brand-1', name: 'brand-1', css: '', roles: [] };

describe('named query source persistence boundaries', () => {
  let service: Services.NamedQueryService;
  let mockSails: ReturnType<typeof createMockSails>;
  let store: Map<string, NamedQueryAttributes>;
  let model: { create: sinon.SinonStub; findOne: sinon.SinonStub; find: sinon.SinonStub; updateOne: sinon.SinonStub };
  beforeEach(() => {
    mockSails = createMockSails();
    setupServiceTestGlobals(mockSails);
    store = new Map();
    model = {
      create: sinon.stub().callsFake((attrs: Partial<NamedQueryAttributes>) => {
        const row = {
          ...attrs,
          id: attrs.id ?? 'id',
          name: attrs.name ?? '',
          branding: attrs.branding ?? '',
          key: `${attrs.branding}_${attrs.name}`,
        };
        store.set(row.key, row);
        return createQueryObject(row);
      }),
      findOne: sinon.stub().callsFake(({ key }: { key: string }) => Promise.resolve(store.get(key))),
      find: sinon.stub().callsFake(() => createQueryObject([...store.values()])),
      updateOne: sinon.stub().callsFake(({ key }: { key: string }) => ({
        set: (attrs: Partial<NamedQueryAttributes>) => {
          const existing = store.get(key);
          const row = existing ? { ...existing, ...attrs } : undefined;
          if (row) store.set(key, row);
          return createQueryObject(row);
        },
      })),
    };
    Reflect.set(globalThis, 'NamedQuery', model);
    service = new Services.NamedQueryService();
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    Reflect.deleteProperty(globalThis, 'NamedQuery');
    sinon.restore();
  });

  for (const source of [undefined, 'database'] as const) {
    it(`preserves ${source ?? 'legacy omitted'} database source and all meaningful JSON through reload/edit/save`, async () => {
      const stored = {
        id: 'legacy',
        name: 'legacy',
        key: 'brand-1_legacy',
        branding: brand.id,
        ...(source ? { source } : {}),
        collectionName: 'user',
        brandIdFieldPath: 'branding',
        mongoQuery: '{ "hook": { "$custom": true } }',
        queryParams: '[ ]',
        resultObjectMapping: '{ "title": "{{#if custom}}x{{/if}}" }',
        sort: '[ { "createdAt": "DESC" } ]',
        relatedRecordFilters: '[ ]',
        expandRelations: true,
      };
      store.set(stored.key, stored);
      const reloaded = await new Services.NamedQueryService().getNamedQueryConfig(brand, 'legacy');
      assert.ok(reloaded);
      await service.update(brand, 'legacy', reloaded);
      const saved = store.get(stored.key)!;
      for (const key of [
        'source',
        'mongoQuery',
        'queryParams',
        'resultObjectMapping',
        'brandIdFieldPath',
        'sort',
        'relatedRecordFilters',
        'expandRelations',
      ] as const)
        assert.deepEqual(saved[key], stored[key]);
      assert.equal(Object.hasOwn(saved, 'source'), source !== undefined);
    });
  }

  it('creates, lists, reloads and updates GraphQL without resolving a database collection', async () => {
    const scope = sinon.spy(service, 'resolveBrandScope');
    await service.create(brand, 'graphql', graphql);
    assert.equal(scope.called, false);
    assert.equal(store.get('brand-1_graphql')?.branding, brand.id);
    const [listed] = await service.list(brand);
    assert.equal(listed.source, 'graphql');
    assert.deepEqual(listed.graphql, graphql.graphql);
    const reloaded = await new Services.NamedQueryService().getNamedQueryConfig(brand, 'graphql');
    assert.ok(reloaded && reloaded.source === 'graphql');
    assert.deepEqual(reloaded.graphql, graphql.graphql);
    reloaded.graphql.document = 'query Changed { record(oid: "gone") { oid } }';
    await service.update(brand, 'graphql', reloaded);
    assert.equal(scope.called, false);
    assert.equal((await service.getNamedQueryConfig(brand, 'graphql'))?.source, 'graphql');
    assert.equal(JSON.parse(store.get('brand-1_graphql')!.graphql!).document, reloaded.graphql.document);
    assert.equal(listed.graphql?.document, graphql.graphql.document);
  });

  it('clears inactive execution fields when either source is replaced', async () => {
    await service.create(brand, 'switch', database);
    await service.update(brand, 'switch', graphql);
    assert.equal(store.get('brand-1_switch')?.mongoQuery, null);
    const gql = await service.getNamedQueryConfig(brand, 'switch');
    assert.ok(gql && !Object.hasOwn(gql, 'mongoQuery'));
    await service.update(brand, 'switch', database);
    assert.equal(store.get('brand-1_switch')?.graphql, null);
    const db = await service.getNamedQueryConfig(brand, 'switch');
    assert.ok(db && db.source !== 'graphql');
    assert.deepEqual(db.mongoQuery, {});
    assert.equal(Object.hasOwn(db, 'graphql'), false);
  });

  for (const invalid of [
    { ...database, source: 'unknown' },
    { ...database, source: null },
    { ...database, source: '' },
    { ...database, graphql: graphql.graphql },
    { ...database, source: 'database', graphql: graphql.graphql },
    ...DATABASE_NAMED_QUERY_FIELDS.map(field => ({
      ...graphql,
      [field]: database[field as keyof typeof database] ?? false,
    })),
    { source: 'graphql', graphql: { ...graphql.graphql, variables: { search: { ownership: 'guess' } } } },
    { source: 'graphql', graphql: { ...graphql.graphql, resultPath: 'matches.nodes' } },
  ])
    it('rejects unknown/contradictory/malformed source definitions before CRUD writes', async () => {
      await assert.rejects(service.create(brand, 'invalid', invalid), NamedQueryDefinitionError);
      store.set('brand-1_invalid', { id: 'invalid', name: 'invalid', branding: brand.id });
      await assert.rejects(service.update(brand, 'invalid', invalid), NamedQueryDefinitionError);
      assert.equal(model.create.called, false);
      assert.equal(model.updateOne.called, false);
    });

  it('imports both sources, individually reports invalid files and leaves valid/existing definitions intact', async () => {
    const root = await fs.mkdtemp(path.resolve('.tmp-t03-bootstrap-'));
    await fs.mkdir(path.join(root, 'namedqueries'));
    const fixtures = {
      database,
      graphql,
      unknown: { source: 'remote' },
      malformed: { source: 'graphql', graphql: {} },
      contradictory: { ...graphql, mongoQuery: {} },
    };
    try {
      for (const [name, value] of Object.entries(fixtures))
        await fs.writeFile(path.join(root, 'namedqueries', `${name}.json`), JSON.stringify(value));
      mockSails.config.bootstrap = { ...mockSails.config.bootstrap, bootstrapDataPath: root };
      await service.bootstrapData(brand);
      assert.deepEqual([...store.keys()].sort(), ['brand-1_database', 'brand-1_graphql']);
      assert.equal(mockSails.log.error.callCount, 3);
      for (const name of ['unknown', 'malformed', 'contradictory'])
        assert.ok(mockSails.log.error.calledWithMatch(`Failed to bootstrap named query from file: ${name}.json`));
      const restarted = new Services.NamedQueryService();
      assert.deepEqual((await restarted.getNamedQueryConfig(brand, 'graphql'))?.source, 'graphql');
      const original = store.get('brand-1_graphql');
      await restarted.bootstrapData(brand);
      assert.equal(store.get('brand-1_graphql'), original);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('reads schema-drifted saved documents without parsing or executing them', () => {
    const stale = readNamedQueryConfig({
      source: 'graphql',
      graphql: JSON.stringify({ ...graphql.graphql, document: 'query { removedPrivateField }' }),
    });
    assert.ok(stale.source === 'graphql');
    assert.equal(stale.graphql.document, 'query { removedPrivateField }');
  });

  it('fails closed for GraphQL and unknown sources before direct or accumulating database execution', async () => {
    const execute = sinon.spy(service, 'performNamedQuery');
    for (const config of [graphql, { ...database, source: 'unknown' }]) {
      await assert.rejects(service.performNamedQueryFromConfig(config, {}, brand, 0, 25));
      await assert.rejects(service.performNamedQueryFromConfigResults(config, {}, brand, 'blocked'));
    }
    assert.equal(execute.called, false);
  });

  it('registers source-specific storage without required database fields or a source default', () => {
    const attributes = NamedQueryWLDef.attributes;
    for (const field of ['mongoQuery', 'queryParams', 'collectionName', 'resultObjectMapping'])
      assert.notEqual(attributes[field].required, true);
    assert.equal(attributes.source.defaultsTo, undefined);
    assert.equal(attributes.graphql.type, 'string');
  });
});

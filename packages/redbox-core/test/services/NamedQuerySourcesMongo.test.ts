import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { MongoClient } from 'mongodb';
import { NamedQueryWLDef, NamedQueryWaterlineModel } from '../../src/waterline-models/NamedQuery';
import { Services } from '../../src/services/NamedQueryService';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

interface Orm {
  registerModel(model: unknown): void;
  initialize(
    config: unknown,
    done: (error: Error | null, ontology: { collections: { namedquery: NamedQueryWaterlineModel } }) => void
  ): void;
  teardown(done: (error?: Error) => void): void;
}
const normalizeModel: (
  definition: unknown,
  identity: string,
  hook: unknown,
  sails: unknown
) => unknown = require('sails-hook-orm/lib/validate-model-def');
const Waterline: { new (): Orm; Collection: { extend(definition: unknown): unknown } } = require('waterline');

/** Real Waterline defaults/serialization and Mongo persistence, including ORM restart.
 * Opt in with a dedicated server URL; a unique database is created and removed.
 */
describe('named query source Mongo persistence', function () {
  this.timeout(30_000);
  const databaseName = `named_query_sources_${randomUUID().replace(/-/g, '')}`;
  const brand = { id: '0123456789abcdef01234567', name: 'source-test', css: '', roles: [] };
  const database = {
    collectionName: 'record',
    mongoQuery: { 'metadata.fixture': true },
    queryParams: {},
    resultObjectMapping: {},
  };
  const graphql = {
    source: 'graphql',
    description: 'Stale schema remains editable',
    graphql: {
      document: 'query Lookup($search: String) { removedCollection(search: $search) { nodes { oid } } }',
      operationName: 'Lookup',
      variables: {
        search: {
          ownership: 'consumer',
          parameter: 'search',
          inputType: 'String',
          required: false,
          defaultValue: null,
        },
      },
      resultPath: ['removedCollection', 'nodes'],
      mappings: { oid: ['oid'], title: ['metadata', 'dc:title'] },
    },
  };
  let orm: Orm | undefined;
  let initialized = false;
  let service: Services.NamedQueryService;
  let client: MongoClient | undefined;
  let url: string;
  let bootstrapRoot: string | undefined;
  const mockSails = createMockSails();

  async function start() {
    // A process restart also clears sails-mongo's singleton model registry.
    const adapterPath = require.resolve('sails-mongo');
    delete require.cache[adapterPath];
    const adapter: unknown = require(adapterPath);
    orm = new Waterline();
    const id = { type: 'string', columnName: '_id' };
    // Use Sails' own normalization (validation/unique -> Waterline metadata), as on lift.
    const hook = { normalizedDSConfigs: { default: { adapter: 'sails-mongo' } }, adapters: { 'sails-mongo': adapter } };
    mockSails.config.models = { datastore: 'default', primaryKey: 'id', migrate: 'safe', attributes: { id } };
    orm.registerModel(Waterline.Collection.extend(normalizeModel(NamedQueryWLDef, 'namedquery', hook, mockSails)));
    orm.registerModel(
      Waterline.Collection.extend(
        normalizeModel({ identity: 'brandingconfig', attributes: {} }, 'brandingconfig', hook, mockSails)
      )
    );
    const engine = orm;
    const ontology = await new Promise<{ collections: { namedquery: NamedQueryWaterlineModel } }>((resolve, reject) =>
      engine.initialize(
        {
          adapters: { mongo: adapter },
          datastores: { default: { adapter: 'mongo', url } },
          defaults: {
            migrate: 'safe',
            schema: true,
            fetchRecordsOnCreate: true,
            fetchRecordsOnUpdate: true,
            fetchRecordsOnDestroy: true,
          },
        },
        (error, result) => (error ? reject(error) : resolve(result))
      )
    );
    initialized = true;
    Reflect.set(globalThis, 'NamedQuery', ontology.collections.namedquery);
    service = new Services.NamedQueryService();
  }
  async function stop() {
    if (!orm || !initialized) return;
    const engine = orm;
    orm = undefined;
    initialized = false;
    await new Promise<void>((resolve, reject) => engine.teardown(error => (error ? reject(error) : resolve())));
  }
  before(async function () {
    const server = process.env.NAMED_QUERY_TEST_MONGO_URL;
    if (!server) this.skip();
    const parsed = new URL(server);
    parsed.pathname = `/${databaseName}`;
    url = parsed.toString();
    setupServiceTestGlobals(mockSails);
    client = await new MongoClient(url).connect();
    await start();
  });
  after(async () => {
    await stop();
    if (client) {
      await client.db(databaseName).dropDatabase();
      await client.close();
    }
    if (bootstrapRoot) await fs.rm(bootstrapRoot, { recursive: true, force: true });
    cleanupServiceTestGlobals();
    Reflect.deleteProperty(globalThis, 'NamedQuery');
  });

  it('persists both sources, preserves legacy bytes, reloads after ORM restart and clears replaced source fields', async () => {
    await service.create(brand, 'legacy', database);
    await service.create(brand, 'explicit', { ...database, source: 'database' });
    await service.create(brand, 'graphql', graphql);
    const before = await NamedQuery.findOne({ key: `${brand.id}_legacy` });
    assert.ok(before);
    assert.equal(before.source, null);
    // Existing rows predate the source attribute entirely. A normal edit/save
    // must not backfill even a nullable discriminator into those Mongo records.
    assert.ok(client);
    const storedQueries = client.db(databaseName).collection('namedquery');
    await storedQueries.updateOne({ key: `${brand.id}_legacy` }, { $unset: { source: '' } });
    const rawBefore = await storedQueries.findOne({ key: `${brand.id}_legacy` });
    assert.ok(rawBefore);
    assert.equal(Object.hasOwn(rawBefore, 'source'), false);
    await service.update(brand, 'legacy', await service.getNamedQueryConfig(brand, 'legacy'));
    const rawAfter = await storedQueries.findOne({ key: `${brand.id}_legacy` });
    assert.ok(rawAfter);
    assert.equal(Object.hasOwn(rawAfter, 'source'), false);
    const after = await NamedQuery.findOne({ key: `${brand.id}_legacy` });
    for (const field of ['mongoQuery', 'queryParams', 'resultObjectMapping', 'sort', 'relatedRecordFilters'] as const)
      assert.equal(after?.[field], before[field]);
    await stop();
    await start();
    const reloaded = await service.getNamedQueryConfig(brand, 'graphql');
    assert.ok(reloaded?.source === 'graphql');
    assert.deepEqual(reloaded.graphql, graphql.graphql);
    assert.equal(reloaded.branding, brand.id);
    assert.equal((await service.getNamedQueryConfig(brand, 'explicit'))?.source, 'database');
    const legacy = await service.getNamedQueryConfig(brand, 'legacy');
    assert.ok(legacy?.source !== 'graphql');
    assert.equal(legacy?.source, undefined);
    await service.update(brand, 'graphql', {
      ...graphql,
      graphql: { ...graphql.graphql, document: 'query Changed { stale }' },
    });
    await service.update(brand, 'explicit', graphql);
    await service.update(brand, 'explicit', database);
    assert.equal((await NamedQuery.findOne({ key: `${brand.id}_explicit` }))?.graphql, null);
    assert.equal((await service.getNamedQueryConfig(brand, 'explicit'))?.source, undefined);
  });

  it('keeps database create requirements after making storage fields source-specific', async () => {
    await assert.rejects(
      service.create(brand, 'incompleteDb', { collectionName: 'record' }),
      /required for a database named query/
    );
    await assert.rejects(
      service.update(brand, 'graphql', { collectionName: 'record' }),
      /Invalid named query definition/
    );
  });

  it('bootstraps valid sources despite invalid neighbours and recovers them after another restart', async () => {
    bootstrapRoot = await fs.mkdtemp(path.resolve('.tmp-t03-mongo-bootstrap-'));
    await fs.mkdir(path.join(bootstrapRoot, 'namedqueries'));
    const fixtures = {
      importedDb: database,
      importedGql: graphql,
      invalidSource: { ...database, source: 'unknown' },
      contradictory: { ...graphql, mongoQuery: {} },
    };
    for (const [name, value] of Object.entries(fixtures))
      await fs.writeFile(path.join(bootstrapRoot, 'namedqueries', `${name}.json`), JSON.stringify(value));
    mockSails.config.bootstrap = { bootstrapDataPath: bootstrapRoot };
    await service.bootstrapData(brand);
    assert.equal(mockSails.log.error.callCount, 2);
    await stop();
    await start();
    const list = await service.list(brand);
    assert.ok(list.some(item => item.name === 'importedDb' && item.source !== 'graphql'));
    assert.ok(list.some(item => item.name === 'importedGql' && item.source === 'graphql'));
    assert.equal(await service.getNamedQueryConfig(brand, 'invalidSource'), null);
    assert.equal(await service.getNamedQueryConfig(brand, 'contradictory'), null);
    await service.bootstrapData(brand);
    const imported = await service.getNamedQueryConfig(brand, 'importedGql');
    assert.ok(imported?.source === 'graphql');
    assert.deepEqual(imported.graphql, graphql.graphql);
  });
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Collection, MongoClient } from 'mongodb';
import { Services } from '../../src/services/NamedQueryService';
import { NamedQueryExecutionBudget } from '../../src/utilities/NamedQueryPreview';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

// Opt in with an isolated test database. Failpoints additionally require a disposable
// mongod started with --setParameter enableTestCommands=1 and the flag below.
describe('Named query preview native Mongo deadlines', function () {
  let client: MongoClient;
  let collection: Collection;
  let native: Pick<Collection, 'countDocuments' | 'find'>;
  let service: Services.NamedQueryService;
  let commands: Array<{ name: string; maxTimeMS?: number }>;
  const brand = { id: 'preview-test-brand', name: 'preview-test-brand', css: '', roles: [] };
  const failpoints = process.env.NAMED_QUERY_TEST_MONGO_FAILPOINTS === 'true';
  const failpoint = (mode: 'alwaysOn' | 'off') =>
    client.db('admin').command({ configureFailPoint: 'maxTimeAlwaysTimeOut', mode });
  const run = () =>
    service.performNamedQuery(
      '',
      {},
      'record',
      {},
      {},
      {},
      brand,
      0,
      100,
      undefined,
      undefined,
      false,
      [],
      new NamedQueryExecutionBudget(1000)
    );

  before(async function () {
    const url = process.env.NAMED_QUERY_TEST_MONGO_URL;
    if (!url) this.skip();
    client = new MongoClient(url, { monitorCommands: true });
    client.on('commandStarted', event => {
      if (commands) commands.push({ name: event.commandName, maxTimeMS: event.command.maxTimeMS });
    });
    await client.connect();
    collection = client.db('redbox_named_query_regression').collection(`preview_${randomUUID().replace(/-/g, '')}`);
    await collection.insertMany([
      { redboxOid: 'ours', metadata: { title: 'Ours' }, metaMetadata: { brandId: brand.id } },
      { redboxOid: 'theirs', metadata: { title: 'Theirs' }, metaMetadata: { brandId: 'other' } },
    ]);
  });
  beforeEach(() => {
    commands = [];
    native = collection;
    setupServiceTestGlobals(
      createMockSails({
        models: {
          record: { native: (callback: (error: null, value: typeof native) => void) => callback(null, native) },
        },
      })
    );
    service = new Services.NamedQueryService();
  });
  afterEach(async () => {
    if (client && failpoints) await failpoint('off');
    cleanupServiceTestGlobals();
  });
  after(async () => {
    if (collection) await collection.drop();
    if (client) await client.close();
  });

  it('sends remaining maxTimeMS to both server count and find commands', async () => {
    const result = await run();
    assert.equal(result.summary.numFound, 1);
    assert.deepEqual(
      result.records.map(record => record.oid),
      ['ours']
    );
    const queries = commands.filter(command => ['aggregate', 'find'].includes(command.name));
    assert.deepEqual(
      queries.map(command => command.name),
      ['aggregate', 'find']
    );
    const countTime = queries[0].maxTimeMS;
    const findTime = queries[1].maxTimeMS;
    assert(typeof countTime === 'number' && countTime > 0 && countTime <= 1000);
    assert(typeof findTime === 'number' && findTime > 0 && findTime <= countTime);
  });
  it('enforces the count deadline on the Mongo server', async function () {
    if (!failpoints) this.skip();
    await failpoint('alwaysOn');
    await assert.rejects(run(), /PREVIEW_TIMEOUT/);
    assert(
      commands.some(
        command => command.name === 'aggregate' && typeof command.maxTimeMS === 'number' && command.maxTimeMS > 0
      )
    );
    assert(!commands.some(command => command.name === 'find'));
  });
  it('enforces the find deadline on the Mongo server after a successful count', async function () {
    if (!failpoints) this.skip();
    native = {
      countDocuments: async (...args: Parameters<Collection['countDocuments']>) => {
        const count = await collection.countDocuments(...args);
        await failpoint('alwaysOn');
        return count;
      },
      find: collection.find.bind(collection),
    };
    await assert.rejects(run(), /PREVIEW_TIMEOUT/);
    assert(
      commands.some(
        command => command.name === 'find' && typeof command.maxTimeMS === 'number' && command.maxTimeMS > 0
      )
    );
  });
});

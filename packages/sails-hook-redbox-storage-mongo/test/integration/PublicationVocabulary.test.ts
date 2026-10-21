import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MongoClient, type Db } from 'mongodb';
import { of } from 'rxjs';
import { PublicationVocabularyStore } from '@researchdatabox/redbox-core/dist/services/publication-vocabulary/store';
import { convertPublicationVocabulary } from '@researchdatabox/redbox-core/dist/services/publication-vocabulary/conversion';
import { Services } from '@researchdatabox/redbox-core/dist/services/PublicationVocabularyService';
import { crosswalkId, seedLegacyVocabulary } from '../../../redbox-core/test/fixtures/publication/legacyVocabulary';

if (process.env.CI && !process.env.MONGO_TEST_URL) throw new Error('PUB-25 requires MONGO_TEST_URL');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Vocabulary release rehearsal (PUB-25, real Mongo + CLI)', function () {
  this.timeout(30000);
  let client: MongoClient;
  let db: Db;
  let store: PublicationVocabularyStore;
  let service: TestService;
  const saved = new Map<string, unknown>();
  class TestService extends Services.PublicationVocabulary {
    protected override getStore() {
      return store;
    }
  }
  function globalValue(name: string, value: unknown) {
    saved.set(name, Reflect.get(globalThis, name));
    Reflect.set(globalThis, name, value);
  }
  before(async () => {
    client = await new MongoClient(process.env.MONGO_TEST_URL!).connect();
    db = client.db(`vocabulary_rehearsal_${randomUUID().replaceAll('-', '')}`);
    store = new PublicationVocabularyStore(db);
    await store.ensureIndexes();
    service = new TestService();
    const sails = Reflect.get(globalThis, 'sails');
    globalValue('sails', { ...sails, config: { ...sails.config, vocab: { publicationAdministrationEnabled: true } } });
    globalValue('Vocabulary', { getDatastore: () => ({ manager: db }) });
    globalValue('PublicationSync', { getDatastore: () => ({ manager: db }) });
    globalValue('Record', { tableName: 'record', getDatastore: () => ({ manager: db }) });
    globalValue('UsersService', {
      getUserWithUsername: () => of({ username: 'admin', roles: [{ name: 'Admin', branding: 'brand' }] }),
    });
    globalValue('RolesService', {
      getAdminFromRoles: (roles: unknown[]) => (roles.length ? { name: 'Admin' } : undefined),
    });
    globalValue('BrandingService', {
      getBrandById: (id: string) => (id === 'brand' ? { id, name: id } : null),
      loadAvailableBrands: () => of({ id: 'brand', name: 'brand' }),
    });
  });
  after(async () => {
    for (const [name, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
    if (client) {
      await db.dropDatabase();
      await client.close();
    }
  });
  const conversion = { brandId: 'brand', actor: 'admin', apply: true, reason: 'Verified vocabulary cutover' };
  it('PUB-25 rehearses the CLI after interrupted crosswalk copying and compares complete legacy, approval and audit inventories', async () => {
    await seedLegacyVocabulary(db);
    const runner = require(resolve(__dirname, '../../../../support/publication/rehearse.js'));
    const directory = await mkdtemp(join(tmpdir(), 'pub25-rehearsal-'));
    try {
      await writeFile(
        join(directory, 'baseline.json'),
        JSON.stringify(await runner.inventory(db, runner.legacyCollections))
      );
      await assert.rejects(
        convertPublicationVocabulary(db, conversion, async step => {
          if (step === `crosswalk:${crosswalkId}`) throw new Error('Interrupted after copying approval history');
        }),
        /Interrupted/
      );
      let closed = 0;
      const summary = await runner.main(
        [
          '--disposable-copy',
          '--brand',
          'brand',
          '--username',
          'admin',
          '--stage',
          '2',
          '--baseline',
          join(directory, 'baseline.json'),
          '--evidence',
          join(directory, 'evidence'),
          '--apply',
          '--reason',
          'Disposable PUB25 history rehearsal',
        ],
        async () => ({
          vocabularyService: service,
          close: async () => {
            closed++;
          },
        })
      );
      assert.equal(summary.legacyUnchanged, true);
      assert.equal(summary.replayUnchanged, true);
      assert.equal(summary.vocabulary.approvals, 1);
      assert.equal(summary.vocabulary.mappings, 3);
      assert.equal(summary.vocabulary.imports, 1);
      assert.equal(closed, 1);
      assert.deepEqual(
        JSON.parse(await readFile(join(directory, 'evidence/before.json'), 'utf8')),
        JSON.parse(await readFile(join(directory, 'evidence/after.json'), 'utf8'))
      );
      if (process.env.PUBLICATION_REHEARSAL_EVIDENCE) {
        await mkdir(process.env.PUBLICATION_REHEARSAL_EVIDENCE, { recursive: true, mode: 0o700 });
        await cp(join(directory, 'evidence'), join(process.env.PUBLICATION_REHEARSAL_EVIDENCE, 'vocabulary'), {
          recursive: true,
        });
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

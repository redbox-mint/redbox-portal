import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { of } from 'rxjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { PublicationVocabularyStore } from '../../../src/services/publication-vocabulary/store';
import { convertPublicationVocabulary } from '../../../src/services/publication-vocabulary/conversion';
import {
  targetIdentity,
  isPublicationVocabularyAdministrationEnabled,
  type PublicationSourceImport,
} from '../../../src/services/publication-vocabulary/contracts';
import { resolvePublicationCrosswalkBinding } from '../../../src/services/publication-vocabulary/bindings';
import {
  publicationTargetTermSchema,
  publicationVocabularyApiRoutes,
} from '../../../src/api-routes/groups/publication-vocabulary';
import { validateApiRouteRequest } from '../../../src/api-routes/validation';
import { Controllers as VocabularyControllers } from '../../../src/controllers/webservice/PublicationVocabularyController';
import type { BuildResponseType } from '../../../src/model';
import { isRecord } from '../../../src/api-routes/helpers';
import { legacyFigshareResolution, figshareCategoryId } from '../../../src/services/figshare-v2/vocabulary-adapter';
import { resolveSealedFigshareCrosswalk } from '../../../src/services/figshare-v2/publication-source';
import { figshareCrosswalkResolver } from '../../../src/services/figshare-v2/bindings';
import { buildMetadataPayload } from '../../../src/services/figshare-v2/metadata';
import { baselineFigshare, baselineRecord, baselineOni } from '../../fixtures/publication/baseline';
import { buildOniRoCrate } from '../../../src/services/oni-v2/crate';
import { publicationDigest } from '../../../src/services/publication/canonical';
import { Services as SharedServices } from '../../../src/services/PublicationVocabularyService';
import { Services as LegacyServices } from '../../../src/services/FigshareVocabularyService';
import { withLegacyVocabularyWriter } from '../../../src/services/publication-vocabulary/legacy';
import { insertLegacyVocabularyRow, vocabularyEntries } from '../../../src/services/publication-vocabulary/mongo';

import {
  crosswalkId,
  sourceId,
  localId,
  localEntryId,
  categoryIds,
  seedLegacyVocabulary,
} from '../../fixtures/publication/legacyVocabulary';

const actor = { brandId: 'brand', userId: 'admin' };
const sourceInput = (): PublicationSourceImport => {
  const namespace = 'https://example.org/subjects';
  return {
    provider: 'test',
    scope: 'public',
    catalogueId: 'subjects',
    namespace,
    displayName: 'Subjects',
    importId: 'import-1',
    terms: [
      {
        id: targetIdentity(namespace, 'https://example.org/subject/Math'),
        namespace,
        value: 'https://example.org/subject/Math',
        sourceId: 'Math',
        label: 'Mathematics',
        selectable: true,
      },
      {
        id: targetIdentity(namespace, 'opaque:not-a-number'),
        namespace,
        value: 'opaque:not-a-number',
        sourceId: 'opaque',
        label: 'Opaque subject',
        selectable: true,
      },
    ],
  };
};
describe('Generalised vocabulary contracts (PUB-22)', () => {
  it('accepts explicit boolean environment configuration and keeps other values disabled', () => {
    for (const value of [true, 'true', ' TRUE '])
      assert.equal(isPublicationVocabularyAdministrationEnabled(value), true);
    for (const value of [false, 'false', '', undefined, 1, 'yes', {}])
      assert.equal(isPublicationVocabularyAdministrationEnabled(value), false);
  });
  it('validates Figshare and URI target fixtures without numeric coercion', () => {
    const rows: unknown = JSON.parse(
      readFileSync(join(__dirname, '../../fixtures/publication/vocabulary/targets.json'), 'utf8')
    );
    assert.ok(Array.isArray(rows));
    for (const row of rows) assert.equal(publicationTargetTermSchema.safeParse(row).success, true);
    assert.equal(publicationTargetTermSchema.safeParse({ ...rows[0], value: 42 }).success, false);
    assert.notEqual(targetIdentity('a:b', 'c'), targetIdentity('a', 'b:c'));
  });
  it('only the Figshare boundary converts numeric identities', () => {
    assert.equal(figshareCategoryId({ namespace: 'figshare:brand:public:1', value: '42' }), 42);
    for (const target of [
      { namespace: 'test', value: '42' },
      { namespace: 'figshare:brand', value: 'opaque' },
      { namespace: 'figshare:brand', value: '9007199254740993' },
    ])
      assert.throws(() => figshareCategoryId(target));
  });
});
if (process.env.CI && !process.env.MONGO_TEST_URL) throw new Error('PUB-22/23 requires MONGO_TEST_URL');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Shared vocabulary conversion and immutable approvals (PUB-22/23, real Mongo)', function () {
  this.timeout(30000);
  let client: MongoClient;
  let db: Db;
  let store: PublicationVocabularyStore;
  const saved = new Map<string, unknown>();
  class TestService extends SharedServices.PublicationVocabulary {
    protected override getStore() {
      return store;
    }
  }
  let service: TestService;
  const setGlobal = (name: string, value: unknown) => Reflect.set(globalThis, name, value);
  before(async () => {
    client = await new MongoClient(process.env.MONGO_TEST_URL!).connect();
    db = client.db(`vocabulary_pub2223_${randomUUID().replaceAll('-', '')}`);
    for (const key of [
      'sails',
      'Vocabulary',
      'PublicationSync',
      'Record',
      'AppConfigService',
      'PublicationVocabularyService',
      'UsersService',
      'RolesService',
      'BrandingService',
    ])
      saved.set(key, Reflect.get(globalThis, key));
  });
  beforeEach(async () => {
    await db.dropDatabase();
    store = new PublicationVocabularyStore(db);
    await store.ensureIndexes();
    service = new TestService();
    setGlobal('AppConfigService', saved.get('AppConfigService'));
    setGlobal('sails', {
      config: { vocab: { publicationAdministrationEnabled: true } },
      log: { warn() {}, error() {}, debug() {}, info() {} },
    });
    setGlobal('Vocabulary', { getDatastore: () => ({ manager: db }) });
    setGlobal('PublicationSync', { getDatastore: () => ({ manager: db }) });
    setGlobal('Record', { tableName: 'record', getDatastore: () => ({ manager: db }) });
    setGlobal('PublicationVocabularyService', service);
    setGlobal('UsersService', {
      getUserWithUsername: () => of({ username: 'admin', roles: [{ name: 'Admin', branding: 'brand' }] }),
    });
    setGlobal('RolesService', {
      getAdminFromRoles: (roles: unknown[]) => (roles.length ? { name: 'Admin' } : undefined),
    });
    setGlobal('BrandingService', {
      getBrandById: (id: string) => (id === 'brand' ? { id, name: id } : null),
      getBrand: () => ({ id: 'brand', name: 'brand' }),
      getBrandNameFromReq: () => 'brand',
      loadAvailableBrands: () => of({ id: 'brand', name: 'brand' }),
    });
  });
  after(async () => {
    for (const [key, value] of saved) setGlobal(key, value);
    await db.dropDatabase();
    await client.close();
  });
  async function seed() {
    await seedLegacyVocabulary(db);
  }
  const conversion = { brandId: 'brand', actor: 'admin', apply: true, reason: 'Verified vocabulary cutover' };
  const request = {
    brandId: 'brand',
    crosswalkId: String(crosswalkId),
    sourceVocabularyId: String(localId),
    codes: ['https://example.org/for/300101', 'unknown'],
  };
  it('dry-runs without creating control or shared rows and without leaking evidence', async () => {
    await seed();
    const report = await convertPublicationVocabulary(db, { ...conversion, apply: false });
    assert.equal(await store.controls.countDocuments(), 0);
    assert.equal(await store.sources.countDocuments(), 0);
    assert.equal(JSON.stringify(report).includes('departed-approver'), false);
    assert.match(JSON.stringify(report), /"identity":"preserved"/);
  });
  it('PUB-25 keeps configured Figshare credentials out of catalogue, revision and history evidence', async () => {
    await convertPublicationVocabulary(db, conversion);
    const token = `private-${randomUUID()}`;
    let authenticated = false;
    const server = createServer((request, response) => {
      authenticated = request.headers.authorization === `token ${token}`;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify([{ id: 42, title: 'Math', source_id: 'Math', taxonomy_id: 1, is_selectable: true }]));
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    setGlobal('AppConfigService', {
      getAppConfigurationForBrand: () => ({
        figsharePublishing: {
          connection: { baseUrl: `http://127.0.0.1:${address.port}/v2`, token },
        },
      }),
    });
    try {
      const source = await service.importFigshare(
        { scope: 'account', taxonomyId: '1', importId: 'private-catalogue' },
        actor
      );
      assert.equal(authenticated, true);
      const stored = await store.source('brand', source.id);
      const history = await service.sourceHistory(source.id, actor);
      for (const value of [source, stored, history, await service.administrationCapabilities(actor)])
        assert.ok(!JSON.stringify(value).includes(token));
      await assert.rejects(
        service.listTargets(source.id, {}, { brandId: 'foreign', userId: 'admin' }),
        /administrator/
      );
    } finally {
      await new Promise<void>(done => server.close(() => done()));
    }
  });
  it('retains IDs, draft revisions, approvals, historical terms, scope and audit evidence exactly', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    const row = await store.crosswalk('brand', String(crosswalkId));
    assert.equal(row.workingRevision, 2);
    assert.equal(row.approvedRevision, 1);
    assert.equal(row.revisions[0].approvedBy, 'departed-approver');
    assert.equal(row.revisions[0].approvedAt, '2025-06-01T00:00:00Z');
    assert.equal(row.revisions[1].approvedAt, undefined);
    assert.equal(
      row.revisions[0].mappings[0].evidence?.evidence && JSON.stringify(row.revisions[0].mappings[0].evidence.evidence),
      '{"auditId":"audit-original"}'
    );
    const source = await store.source('brand', String(sourceId));
    assert.equal(source.scope, 'account');
    assert.equal(source.terms[1].historical, true);
    assert.match(JSON.stringify(source.imports), /import-audit/);
    assert.equal(await db.collection('figsharevocabularycrosswalkmapping').countDocuments(), 3);
  });
  for (const step of ['fenced', `source:${sourceId}`, `crosswalk:${crosswalkId}`, 'verified', 'committed']) {
    it(`resumes after ${step} without changing any identities or approval evidence`, async () => {
      await seed();
      await assert.rejects(
        convertPublicationVocabulary(db, conversion, async boundary => {
          if (boundary === step) throw new Error('interrupted');
        }),
        /interrupted/
      );
      await convertPublicationVocabulary(db, conversion);
      const first = await store.crosswalk('brand', String(crosswalkId));
      await convertPublicationVocabulary(db, conversion);
      assert.deepEqual(await store.crosswalk('brand', String(crosswalkId)), first);
      assert.equal(await store.sources.countDocuments(), 1);
      assert.equal(await store.crosswalks.countDocuments(), 1);
      assert.deepEqual(legacyFigshareResolution(await store.resolve({ ...request, revision: 1 }), 'categoryId'), {
        values: [42],
        normalizedCodes: ['300101', 'unknown'],
        unresolvedCodes: ['unknown'],
        historicalTargets: [{ code: '300101', categoryId: 99, sourceId: 'removed' }],
      });
    });
  }
  it('keeps an old sealed publication response byte-equivalent after conversion and a newer approval', async () => {
    await seed();
    const result = {
      values: [42],
      normalizedCodes: ['300101', 'unknown'],
      unresolvedCodes: ['unknown'],
      historicalTargets: [{ code: '300101', categoryId: 99, sourceId: 'removed' }],
    };
    const lookup = { ...request, outputs: 'categoryId' };
    const prepared = {
      crosswalks: {
        [String(crosswalkId)]: {
          sourceVocabularyId: String(localId),
          revision: '1',
          resolutions: { [publicationDigest(lookup)]: result },
        },
      },
    };
    const original = await resolveSealedFigshareCrosswalk(prepared, lookup);
    const config = baselineFigshare();
    config.categories.allowUnmapped = true;
    config.metadata.categories.source = {
      kind: 'crosswalk',
      source: { kind: 'path', path: 'metadata.forCodes' },
      crosswalkId: String(crosswalkId),
      sourceVocabularyId: String(localId),
      outputs: 'categoryId',
    };
    const record = baselineRecord();
    record.metaMetadata.brandId = 'brand';
    record.metadata.forCodes = lookup.codes;
    const payload = () =>
      figshareCrosswalkResolver.run(
        input => resolveSealedFigshareCrosswalk(prepared, input),
        () => buildMetadataPayload(config, record)
      );
    const beforePayload = JSON.stringify(await payload());
    await convertPublicationVocabulary(db, conversion);
    const row = await store.crosswalk('brand', String(crosswalkId));
    await store.approve(row.id, row.version, row.revisions[0].entries, actor);
    assert.deepEqual(await resolveSealedFigshareCrosswalk(prepared, lookup), original);
    assert.deepEqual(await service.legacyResolve({ ...lookup, revision: 1 }), original);
    assert.equal((await store.resolve({ ...request, revision: 1 })).revision, 1);
    assert.equal(JSON.stringify(await payload()), beforePayload);
    assert.deepEqual((await payload()).categories, [42]);
  });
  it('preserves frozen codes/labels after a source import, local edit, new approval and archival', async () => {
    const source = await store.importSource(sourceInput(), actor);
    let row = await store.createCrosswalk({ name: 'URI map', sourceId: source.id, localVocabularyId: 'local' }, actor);
    const entries = [{ id: 'e', label: 'Code', value: 'CaseSensitive', codes: ['CaseSensitive'] }];
    row = await store.saveMappings(
      row.id,
      {
        version: row.version,
        mappings: [
          { id: 'm', localEntryId: 'e', targetId: source.terms[0].id, status: 'proposed', matchType: 'manual' },
        ],
      },
      entries,
      actor
    );
    row = await store.approve(row.id, row.version, entries, actor);
    const input = {
      brandId: 'brand',
      crosswalkId: row.id,
      sourceVocabularyId: 'local',
      codes: ['CaseSensitive'],
      revision: 1,
      outputs: 'label' as const,
    };
    const original = await store.resolve(input);
    await store.importSource(
      { ...sourceInput(), id: source.id, expectedVersion: source.version, importId: 'import-2', terms: [] },
      actor
    );
    assert.equal((await store.resolve({ ...input, revision: undefined })).historicalTargets.length, 1);
    assert.deepEqual(await store.resolve(input), original);
    row = await store.saveMappings(
      row.id,
      { version: row.version, mappings: [] },
      [{ ...entries[0], codes: ['new-code'] }],
      actor
    );
    await store.replaceCrosswalk(row, { ...row, status: 'archived', version: row.version + 1 });
    assert.deepEqual(await store.resolve(input), original);
    await assert.rejects(store.resolve({ ...input, revision: undefined }), /archived/);
  });
  it('resolves non-numeric targets through async JSONata with the caller mapping context', async () => {
    const source = await store.importSource(sourceInput(), actor);
    let row = await store.createCrosswalk({ name: 'URI map', sourceId: source.id, localVocabularyId: 'local' }, actor);
    const entries = [{ id: 'e', label: 'Code', value: 'CaseSensitive', codes: ['CaseSensitive'] }];
    row = await store.saveMappings(
      row.id,
      {
        version: row.version,
        mappings: [
          { id: 'm', localEntryId: 'e', targetId: source.terms[0].id, status: 'proposed', matchType: 'manual' },
        ],
      },
      entries,
      actor
    );
    row = await store.approve(row.id, row.version, entries, actor);
    const result = await resolvePublicationCrosswalkBinding(
      {
        kind: 'crosswalk',
        source: { kind: 'jsonata', expression: '[code]' },
        crosswalkId: row.id,
        sourceVocabularyId: 'local',
        outputs: 'value',
      },
      { code: 'CaseSensitive' },
      { brandId: 'brand', resolve: input => store.resolve(input) }
    );
    assert.deepEqual(result.values, ['https://example.org/subject/Math']);
    assert.deepEqual(
      (
        await store.resolve({
          brandId: 'brand',
          crosswalkId: row.id,
          sourceVocabularyId: 'local',
          codes: ['casesensitive'],
        })
      ).unresolvedCodes,
      ['casesensitive']
    );
  });
  it('PUB-25 preserves URI and opaque mapping values in the actual Oni crate without Figshare coercion', async () => {
    const source = await store.importSource(sourceInput(), actor);
    let row = await store.createCrosswalk(
      { name: 'Oni subjects', sourceId: source.id, localVocabularyId: 'local' },
      actor
    );
    const entries = [{ id: 'e', label: 'Subject', value: 'CaseSensitive', codes: ['CaseSensitive'] }];
    row = await store.saveMappings(
      row.id,
      {
        version: row.version,
        mappings: source.terms.map((term, index) => ({
          id: `edge-${index}`,
          localEntryId: 'e',
          targetId: term.id,
          status: 'proposed',
          matchType: 'manual',
        })),
      },
      entries,
      actor
    );
    await store.approve(row.id, row.version, entries, actor);
    const result = await store.resolve({
      brandId: 'brand',
      crosswalkId: row.id,
      sourceVocabularyId: 'local',
      codes: ['CaseSensitive'],
      outputs: 'value',
      revision: 1,
    });
    assert.equal(result.values.length, 2);
    assert.ok(result.values.includes('opaque:not-a-number'));
    assert.ok(result.values.includes('https://example.org/subject/Math'));
    assert.throws(() => legacyFigshareResolution(result, 'categoryId'), /verified Figshare/);
    const config = baselineOni();
    const record = baselineRecord();
    record.metadata.finalKeywords = result.values;
    const crate = await buildOniRoCrate({
      config,
      site: config.sites.public,
      siteName: 'public',
      oid: 'vocabulary-oni',
      record,
      publicationTimestamp: '2026-02-03T04:05:06Z',
      creator: {},
      approver: {},
    });
    const graph = crate.crateJson['@graph'];
    assert.ok(Array.isArray(graph));
    const dataset = graph.find(entity => isRecord(entity) && entity['@id'] === crate.rootId);
    assert.ok(isRecord(dataset));
    assert.deepEqual(dataset.keywords, result.values);
  });
  it('rejects cross-brand reads, conflicting revisions and concurrent editors without losing the approved snapshot', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    await assert.rejects(store.resolve({ ...request, brandId: 'other' }), /unavailable/);
    await assert.rejects(store.resolve({ ...request, sourceVocabularyId: 'other' }), /does not belong/);
    const row = await store.crosswalk('brand', String(crosswalkId));
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        store.saveMappings(
          row.id,
          { version: row.version, mappings: row.revisions[1].mappings },
          row.revisions[1].entries,
          actor
        )
      )
    );
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.deepEqual((await store.resolve({ ...request, revision: 1 })).values, [
      targetIdentity('figshare:brand:account:1', '42'),
    ]);
  });
  it('fences legacy mutation during conversion and drains admitted writers before switching authority', async () => {
    await seed();
    let finish: () => void = () => {};
    let started: () => void = () => {};
    const entered = new Promise<void>(resolve => {
      started = resolve;
    });
    const wait = new Promise<void>(resolve => {
      finish = resolve;
    });
    const writer = withLegacyVocabularyWriter(
      'brand',
      async () => {
        started();
        await wait;
        return 'legacy';
      },
      async () => 'shared'
    );
    await entered;
    await assert.rejects(convertPublicationVocabulary(db, conversion), /drain/);
    finish();
    assert.equal(await writer, 'legacy');
    await assert.rejects(
      convertPublicationVocabulary(db, conversion, async step => {
        if (step === 'fenced') throw new Error('stop');
      }),
      /stop/
    );
    await assert.rejects(
      withLegacyVocabularyWriter(
        'brand',
        async () => 'bad',
        async () => 'shared'
      ),
      /fenced/
    );
    await convertPublicationVocabulary(db, conversion);
    assert.equal(
      await withLegacyVocabularyWriter(
        'brand',
        async () => 'bad',
        async () => 'shared'
      ),
      'shared'
    );
  });
  it('retains a failed legacy writer until late database writes are settled before conversion', async () => {
    await seed();
    let finish: () => void = () => {};
    const delayed = new Promise<void>(resolve => {
      finish = resolve;
    }).then(() =>
      db
        .collection('figsharevocabularysource')
        .updateOne({ _id: sourceId }, { $set: { displayName: 'Late acknowledged catalogue' } })
    );
    try {
      await assert.rejects(
        withLegacyVocabularyWriter(
          'brand',
          async () => {
            throw new Error('Lost database write acknowledgement');
          },
          async () => assert.fail('Conversion has not committed')
        ),
        /Lost database/
      );
      const failed = await store.control('brand');
      assert.equal(failed?.writers.length, 1, 'An error cannot establish that an issued write will not apply');
      assert.equal(failed.writerOwners?.[0].id, failed.writers[0]);
      await assert.rejects(convertPublicationVocabulary(db, conversion), /drain/);
      assert.equal(await store.sources.countDocuments(), 0);
      finish();
      await delayed;
      await convertPublicationVocabulary(db, {
        ...conversion,
        settledWriterIds: failed.writers,
        settlementEvidence: 'incident/late-write-confirmed-and-writer-stopped',
        confirmLegacyWritersStopped: true,
      });
      assert.equal((await store.source('brand', String(sourceId))).displayName, 'Late acknowledged catalogue');
      const committed = await store.control('brand');
      assert.equal(committed?.state, 'committed');
      assert.equal(committed.settlements?.length, 1);
      assert.deepEqual(committed.writers, []);
    } finally {
      finish();
      await delayed;
    }
  });
  it('refuses evidence drift after interruption and retains the conversion fence', async () => {
    await seed();
    await assert.rejects(
      convertPublicationVocabulary(db, conversion, async step => {
        if (step === 'fenced') throw new Error('stop');
      }),
      /stop/
    );
    await db
      .collection('figsharevocabularycrosswalk')
      .updateOne({ _id: crosswalkId }, { $set: { name: 'Unexpected external write' } });
    await assert.rejects(convertPublicationVocabulary(db, conversion), /evidence changed/);
    assert.equal((await store.control('brand'))?.state, 'converting');
  });
  it('keeps stage 2 off by default and requires a current brand administrator', async () => {
    setGlobal('sails', { config: { vocab: {} } });
    await assert.rejects(service.convert({ brandId: 'brand', username: 'admin' }), /disabled/);
    assert.equal(await store.controls.countDocuments(), 0);
    setGlobal('sails', { config: { vocab: { publicationAdministrationEnabled: true } } });
    await assert.rejects(service.convert({ brandId: 'other', username: 'admin' }), /administrator/);
    setGlobal('UsersService', { getUserWithUsername: () => of({ username: 'admin', disabled: true, roles: [] }) });
    await assert.rejects(service.convert({ brandId: 'brand', username: 'admin' }), /administrator/);
  });
  it('retains legacy route/service shapes while resolving converted data', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    const legacy = new LegacyServices.FigshareVocabularyService();
    const result = await legacy.resolveCategories(request);
    assert.deepEqual(result.categoryIds, [42]);
    assert.equal(result.historicalTargets[0].categoryId, 99);
    const summary = await legacy.getCrosswalk(String(crosswalkId), actor);
    assert.equal(summary.id, String(crosswalkId));
    assert.equal(summary.figshareSourceId, String(sourceId));
    const draft = await legacy.listCrosswalkMappings(String(crosswalkId), { revision: 2 }, actor);
    assert.equal(draft.data.length, 1);
    assert.equal(draft.meta.revision, 2);
    const approval = await legacy.approveCrosswalk(String(crosswalkId), 2, actor);
    assert.equal(approval.approvedRevision, 2);
    const approved = await store.crosswalk('brand', String(crosswalkId));
    await service.saveMappings(
      approved.id,
      { version: approved.version, mappings: approved.revisions[1].mappings },
      actor
    );
    assert.equal((await legacy.getCrosswalk(approved.id, actor)).status, 'approved');
    assert.equal((await legacy.listCrosswalks({ status: 'approved' }, actor)).meta.total, 1);
    assert.deepEqual((await service.legacyResolve({ ...request, outputs: 'categoryId', revision: 1 }))?.values, [42]);
  });
  it('keeps repeated conversion from overwriting newer shared edits or changing another brand', async () => {
    await seed();
    await db.collection('figsharevocabularysource').insertOne({ branding: 'other', displayName: 'Other evidence' });
    await convertPublicationVocabulary(db, conversion);
    const row = await store.crosswalk('brand', String(crosswalkId));
    await store.replaceCrosswalk(row, { ...row, name: 'Shared editor change', version: row.version + 1 });
    await convertPublicationVocabulary(db, conversion);
    assert.equal((await store.crosswalk('brand', row.id)).name, 'Shared editor change');
    assert.equal(await store.sources.countDocuments({ brandId: 'other' }), 0);
    assert.equal(await db.collection('figsharevocabularysource').countDocuments({ branding: 'other' }), 1);
  });
  it('rejects cross-brand vocabulary ownership and future conversion authority', async () => {
    await seed();
    await db.collection('vocabulary').updateOne({ _id: localId }, { $set: { branding: 'other' } });
    await assert.rejects(convertPublicationVocabulary(db, conversion), /brand boundary/);
    assert.equal(await store.controls.countDocuments(), 0);
    await db
      .collection('publicationvocabularyconversion')
      .insertOne({ schemaVersion: 2, brandId: 'brand', state: 'committed', writers: [] });
    await assert.rejects(service.converted('brand'), /Unsupported/);
  });
  it('pins a PUB-04 reference and resolves it after later approval and disabled administration', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    const reference = await service.snapshot({
      brandId: 'brand',
      crosswalkId: String(crosswalkId),
      sourceVocabularyId: String(localId),
    });
    assert.equal(reference.revisionId, '1');
    const before = await service.resolveFrozenReference(reference, ['300101'], 'value');
    const row = await store.crosswalk('brand', String(crosswalkId));
    await store.approve(row.id, row.version, row.revisions[0].entries, actor);
    setGlobal('sails', { config: { vocab: {} } });
    assert.deepEqual(await service.resolveFrozenReference(reference, ['300101'], 'value'), before);
    await assert.rejects(
      service.resolveFrozenReference({ ...reference, revisionId: '01' }, ['300101']),
      /Invalid frozen/
    );
    await assert.rejects(service.listSources(actor), /disabled/);
  });
  it('uses the supported CLI for dry-run/apply, requires a reason and always closes its application', async () => {
    await seed();
    let brandLoaded = false;
    setGlobal('BrandingService', {
      getBrandById: () => (brandLoaded ? { id: 'brand', name: 'brand' } : null),
      loadAvailableBrands: () => {
        brandLoaded = true;
        return of({ id: 'brand', name: 'brand' });
      },
    });
    const cli = require('../../../../../support/publication/admin.js');
    let closed = 0;
    const load = async () => ({
      vocabularyService: service,
      close: async () => {
        closed++;
      },
    });
    await cli.main(['convert-vocabularies', '--brand', 'brand', '--username', 'admin'], load, () => {});
    assert.equal(await store.controls.countDocuments(), 0);
    await assert.rejects(
      cli.main(['convert-vocabularies', '--brand', 'brand', '--username', 'admin', '--apply'], load, () => {}),
      /reason/
    );
    await cli.main(
      ['convert-vocabularies', '--brand', 'brand', '--username', 'admin', '--apply', '--reason', 'Verified evidence'],
      load,
      () => {}
    );
    assert.equal((await store.control('brand'))?.state, 'committed');
    assert.equal(closed, 2);
  });
  it('retains Figshare account/public imports, reviewed proposals, history and legacy category aliases', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    setGlobal('AppConfigService', {
      getAppConfigurationForBrand: () => ({ figsharePublishing: { connection: { token: '' } } }),
    });
    sails.config.figshareDev = {
      enabled: true,
      mode: 'fixture',
      fixtures: {
        categories: [
          { id: 42, title: 'Updated mathematics', source_id: '300101', taxonomy_id: 1, is_selectable: true },
        ],
      },
    };
    const legacy = new LegacyServices.FigshareVocabularyService();
    const preview = await legacy.createPreview(
      { scope: 'account', taxonomyId: '1', sourceId: String(sourceId), crosswalkId: String(crosswalkId) },
      actor
    );
    assert.equal(preview.summary.proposed, 1);
    const page = await legacy.getPreview(preview.runId, { view: 'proposals' }, actor);
    const proposal = page.page.records[0];
    assert.ok(proposal && typeof proposal === 'object' && 'proposalId' in proposal);
    const decisions = {
      remoteHash: preview.remoteHash,
      expectedRevision: 2,
      approvedProposalIds: [String(proposal.proposalId)],
    };
    const result = await legacy.applyPreview(preview.runId, decisions, actor);
    assert.equal(result.state, 'applied');
    assert.deepEqual(await legacy.applyPreview(preview.runId, decisions, actor), result);
    const picker = await legacy.listSourceCategories(String(sourceId), { includeHistorical: true }, actor);
    assert.equal(picker.data.find(row => row.categoryId === 42)?.id, String(categoryIds[0]));
    assert.equal(picker.data.find(row => row.categoryId === 99)?.historical, true);
    const publicSource = await service.importFigshare(
      { scope: 'public', taxonomyId: '1', importId: 'public-import' },
      actor
    );
    const accountSource = await store.source('brand', String(sourceId));
    assert.notEqual(publicSource.namespace, accountSource.namespace);
    assert.notEqual(publicSource.terms[0].id, accountSource.terms[0].id);
    assert.equal(accountSource.imports.length, 2);
    await assert.rejects(
      service.importFigshare({ scope: 'public', taxonomyId: 'missing', importId: 'bad' }, actor),
      /no categories/
    );
    assert.equal(await store.sources.countDocuments(), 2);
  });
  it('audits explicit crashed-writer settlement and resumes after its write boundary', async () => {
    await seed();
    await store.controls.insertOne({
      schemaVersion: 1,
      brandId: 'brand',
      state: 'legacy',
      writers: ['crashed-writer'],
    });
    await assert.rejects(
      convertPublicationVocabulary(db, { ...conversion, settledWriterIds: ['crashed-writer'] }),
      /stopped-process/
    );
    const settlement = {
      ...conversion,
      settledWriterIds: ['crashed-writer'],
      settlementEvidence: 'operator-evidence:process-terminated',
      confirmLegacyWritersStopped: true,
    };
    await assert.rejects(
      convertPublicationVocabulary(db, settlement, async step => {
        if (step === 'writers_settled') throw new Error('interrupted settlement');
      }),
      /interrupted settlement/
    );
    await convertPublicationVocabulary(db, settlement);
    await convertPublicationVocabulary(db, settlement);
    const control = await store.control('brand');
    assert.equal(control?.state, 'committed');
    assert.equal(control?.settlements?.length, 1);
    assert.equal(control?.settlements?.[0].actor, 'admin');
    assert.equal(control?.settlements?.[0].evidenceReference, settlement.settlementEvidence);
    assert.deepEqual(control?.writers, []);
  });
  it('keeps exact local code case through the public service and isolates generic crosswalks from Figshare lists', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    await db
      .collection('vocabularyentry')
      .updateOne({ _id: localEntryId }, { $set: { value: 'CaseSensitive', valueLower: 'casesensitive' } });
    const source = await service.importSource(sourceInput(), actor);
    let row = await service.createCrosswalk(
      { name: 'Generic', sourceId: source.id, localVocabularyId: String(localId) },
      actor
    );
    row = await service.saveMappings(
      row.id,
      {
        version: row.version,
        mappings: [
          {
            id: 'generic-edge',
            localEntryId: String(localEntryId),
            targetId: source.terms[0].id,
            status: 'proposed',
            matchType: 'manual',
          },
        ],
      },
      actor
    );
    row = await service.approveCrosswalk(row.id, row.version, actor);
    const input = {
      brandId: 'brand',
      crosswalkId: row.id,
      sourceVocabularyId: String(localId),
      outputs: 'value' as const,
    };
    assert.deepEqual((await service.resolve({ ...input, codes: ['CaseSensitive'] })).values, [
      'https://example.org/subject/Math',
    ]);
    assert.deepEqual((await service.resolve({ ...input, codes: ['casesensitive'] })).unresolvedCodes, [
      'casesensitive',
    ]);
    const legacy = new LegacyServices.FigshareVocabularyService();
    const list = await legacy.listCrosswalks({}, actor);
    assert.equal(list.meta.total, 1);
    assert.equal(list.data[0].localVocabularyName, 'Local codes');
  });
  it('accepts omitted optional fields through the registered route validator, controller and Mongo service', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    class Controller extends VocabularyControllers.PublicationVocabulary {
      response?: BuildResponseType;
      protected override sendResp(_req: Sails.Req, res: Sails.Res, response?: BuildResponseType) {
        this.response = response;
        return res;
      }
    }
    const controller = new Controller();
    const invoke = async (
      action: string,
      body: unknown,
      run: (req: Sails.Req, res: Sails.Res) => Promise<unknown>,
      id?: string
    ) => {
      const route = publicationVocabularyApiRoutes.find(route => route.action === action);
      assert.ok(route);
      const request: Partial<Sails.Req> = {
        method: route.method.toUpperCase(),
        path: '/default/rdmp/publication-vocabularies',
        headers: { 'content-type': 'application/json' },
        params: id ? { id } : {},
        user: { username: 'admin' },
        body,
      };
      const req = request as Sails.Req;
      const validated = validateApiRouteRequest(req, route);
      assert.equal(validated.valid, true);
      if (!validated.valid) throw new Error('Expected a valid vocabulary request');
      req.apiRequest = validated;
      await run(req, {} as Sails.Res);
      const response = controller.response;
      assert.ok(response && 'data' in response && isRecord(response.data));
      assert.equal(response.status, undefined);
      return response.data;
    };
    const source = await invoke('importSource', sourceInput(), (req, res) => controller.importSource(req, res));
    const draft = await invoke(
      'createCrosswalk',
      { name: 'Validated HTTP draft', sourceId: source.id, localVocabularyId: String(localId) },
      (req, res) => controller.createCrosswalk(req, res)
    );
    const saved = await invoke(
      'saveMappings',
      {
        version: draft.version,
        mappings: [
          {
            id: 'validated-mapping',
            localEntryId: String(localEntryId),
            targetId: sourceInput().terms[0].id,
            status: 'proposed',
            matchType: 'manual',
          },
        ],
      },
      (req, res) => controller.saveMappings(req, res),
      String(draft.id)
    );
    const approved = await invoke(
      'approve',
      { version: saved.version },
      (req, res) => controller.approve(req, res),
      String(draft.id)
    );
    assert.equal(approved.approvedRevision, 1);
  });
  it('creates legacy BSON identities on the server and preserves edited clone rows on replay', async () => {
    await insertLegacyVocabularyRow(db, 'vocabulary', String(localId), { name: '$Literal', branding: 'brand' });
    await insertLegacyVocabularyRow(
      db,
      'vocabularyentry',
      String(localEntryId),
      { label: '$Label', value: 'CaseSensitive' },
      { vocabulary: String(localId) }
    );
    assert.equal((await db.collection('vocabulary').findOne({ _id: localId }))?.name, '$Literal');
    await db.collection('vocabularyentry').updateOne({ _id: localEntryId }, { $set: { label: 'Edited locally' } });
    await insertLegacyVocabularyRow(
      db,
      'vocabularyentry',
      String(localEntryId),
      { label: 'Replacement', value: 'replacement' },
      { vocabulary: String(localId) }
    );
    const entries = await vocabularyEntries(db, String(localId));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, String(localEntryId));
    assert.equal(entries[0].label, 'Edited locally');
    assert.deepEqual(entries[0].codes, ['CaseSensitive']);
  });
  it('retains clone identity mappings, unique labels and current retirement counts at the legacy boundary', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    const legacy = new LegacyServices.FigshareVocabularyService();
    const clone = await legacy.cloneMirror(String(sourceId), { name: 'Clone' }, actor);
    const mappings = await legacy.listCrosswalkMappings(clone.crosswalkId, {}, actor);
    assert.equal(mappings.data.length, 1);
    const approved = await legacy.approveCrosswalk(clone.crosswalkId, 1, actor);
    assert.equal(approved.approvedRevision, 1);
    assert.deepEqual(
      (
        await legacy.resolveCategories({
          ...request,
          crosswalkId: clone.crosswalkId,
          sourceVocabularyId: clone.localVocabularyId,
        })
      ).categoryIds,
      [42]
    );
    const source = await store.source('brand', String(sourceId));
    await store.sources.updateOne(
      { brandId: 'brand', id: source.id },
      { $set: { terms: source.terms.map(term => ({ ...term, historical: true })) } }
    );
    assert.equal((await legacy.getCrosswalk(clone.crosswalkId, actor)).historicalTargetCount, 1);
    assert.deepEqual(
      (
        await service.resolveFrozenReference(
          { brandId: 'brand', crosswalkId: clone.crosswalkId, revisionId: '1' },
          ['300101'],
          'value'
        )
      ).values,
      ['42']
    );
  });
  it('keeps failed import runs and original import attribution visible after conversion', async () => {
    await seed();
    await db.collection('figsharevocabularysyncrun').insertOne({
      branding: 'brand',
      scope: 'public',
      taxonomyId: '2',
      state: 'failed',
      requestedBy: 'original-importer',
      errorCode: 'catalogue-unavailable',
      createdAt: Date.now(),
    });
    await convertPublicationVocabulary(db, conversion);
    const legacy = new LegacyServices.FigshareVocabularyService();
    const history = await legacy.listSyncRuns({}, actor);
    assert.equal(history.meta.total, 2);
    const failed = history.data.find(
      row => typeof row === 'object' && row !== null && Reflect.get(row, 'state') === 'failed'
    );
    assert.ok(failed);
    assert.equal(Reflect.get(failed, 'requestedBy'), 'original-importer');
    assert.equal(Reflect.get(failed, 'errorCode'), 'catalogue-unavailable');
  });
  it('pages local terms with case-preserving codes and refuses foreign vocabulary ownership (PUB-24)', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    const result = await service.listLocalEntries(String(crosswalkId), { q: 'MATHEMATICS', limit: 1 }, actor);
    assert.equal(result.meta.total, 1);
    assert.equal(result.data[0].value, '300101');
    assert.ok(result.data[0].codes.includes('https://example.org/for/300101'));
    assert.equal((await service.listLocalEntries(String(crosswalkId), { offset: 1 }, actor)).data.length, 0);
    await assert.rejects(service.listLocalEntries('missing', {}, actor), /unavailable/);
    await db.collection('vocabulary').updateOne({ _id: localId }, { $set: { branding: 'other' } });
    await assert.rejects(service.listLocalEntries(String(crosswalkId), {}, actor), /belong to this brand/);
  });
  it('returns original import history without raw evidence and denies non-administrators (PUB-24)', async () => {
    await seed();
    await convertPublicationVocabulary(db, conversion);
    const history = await service.sourceHistory(String(sourceId), actor);
    assert.equal(history.length, 1);
    assert.equal(history[0].actor, 'importer');
    assert.equal(history[0].at, '2026-01-01T00:00:00Z');
    assert.deepEqual(Object.keys(history[0]).sort(), ['actor', 'at', 'digest', 'id']);
    await assert.rejects(service.sourceHistory('foreign', actor), /unavailable/);
    setGlobal('UsersService', { getUserWithUsername: () => of({ username: 'guest', roles: [] }) });
    await assert.rejects(service.sourceHistory(String(sourceId), actor), /administrator/);
    await assert.rejects(service.listLocalEntries(String(crosswalkId), {}, actor), /administrator/);
    await assert.rejects(service.administrationCapabilities(actor), /administrator/);
  });
  it('gates administration capabilities on activation and configured Figshare scopes (PUB-24)', async () => {
    await seed();
    await assert.rejects(service.administrationCapabilities(actor), /Convert and verify/);
    await convertPublicationVocabulary(db, conversion);
    setGlobal('AppConfigService', { getAppConfigurationForBrand: () => ({}) });
    assert.deepEqual(await service.administrationCapabilities(actor), {
      snapshotImport: true,
      figshareScopes: [],
      editMappings: true,
      approve: true,
    });
    setGlobal('AppConfigService', { getAppConfigurationForBrand: () => ({ figsharePublishing: {} }) });
    assert.deepEqual((await service.administrationCapabilities(actor)).figshareScopes, ['public']);
    setGlobal('sails', { config: { vocab: { publicationAdministrationEnabled: false } } });
    await assert.rejects(service.administrationCapabilities(actor), /disabled/);
  });
});

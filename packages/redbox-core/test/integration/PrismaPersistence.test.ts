import type { PersistenceOwner } from '../../src/persistence/owner';
import assert from 'node:assert/strict';
import { GridFSBucket, MongoClient, ObjectId, type FindCursor } from 'mongodb';
import * as runtime from '../../src/persistence/runtime';
import * as storageRuntime from '../../src/persistence/storage/runtime';
const persistence = { ...runtime, ...storageRuntime };
import { ensureCachePersistenceIndex } from '../../src/persistence/cache/preflight';
import { initializeCachePersistence, getCacheEntryRepository } from '../../src/persistence/cache/runtime';
import { inspectPersistenceIndex, ensurePersistenceIndex } from '../../src/persistence/indexes';
import { composeHttpSession } from '../../src/http/express/session';
import { createSinonStubLogger } from '../logger.test';
import express from 'express';
import { createServer } from 'node:http';
import * as sinon from 'sinon';
import { GridFSDriver } from '../../src/storage/GridFSDriver';
import { Services as LogoServices } from '../../src/services/BrandingLogoService';
import { executeNamedQuery } from '../../src/persistence/reference/NamedQueryExecution';
import { executeStorageQuery } from '../../src/persistence/storage/NamedQueryTargets';

const url = process.env.PERSISTENCE_TEST_MONGO_URL;
(url ? describe : describe.skip)('Prisma persistence regression contracts', function () {
  this.timeout(30_000);
  let app: PersistenceOwner, native: MongoClient;
  const names = [
    'Migration',
    'Reference',
    'Configuration',
    'Progress',
    'Harvest',
    'Siem',
    'Figshare',
    'Vocabulary',
    'Branding',
    'Identity',
    'Storage',
  ];
  const brand = new ObjectId().toHexString();
  before(async () => {
    native = await new MongoClient(url!).connect();
    app = {
      config: {
        datastores: { mongodb: { url }, redboxStorage: { url: url!.replace(/\/([^/?]+)(\?|$)/, '/$1_storage$2') } },
      },
      log: { warn() {} },
    } as any;
    await persistence.initializePersistence(app);
    await ensureCachePersistenceIndex(app);
    await persistence.ensureMigrationPersistenceIndex(app);
    await require('../../src/persistence/progress/preflight').ensureProgressPersistenceIndexes(app);
    for (const name of names.filter(name => !['Migration', 'Progress'].includes(name)))
      await (persistence as any)['ensure' + name + 'PersistenceIndexes'](app);
    await initializeCachePersistence(app);
    for (const name of names) await (persistence as any)['initialize' + name + 'Persistence'](app);
  });
  after(async () => {
    if (!native) return;
    await persistence.cleanupPersistence(app);
    await native.db().dropDatabase();
    const storage = new URL(url!);
    storage.pathname += '_storage';
    await native.db(storage.pathname.slice(1)).dropDatabase();
    await native.close();
  });
  it('recovers GridFS bytes after the first separately configured connection fails', async () => {
    const owner = { config: {}, log: { warn() {} } } as unknown as PersistenceOwner;
    await persistence.initializePersistence(owner);
    const driver = new GridFSDriver({ url, bucketName: 'recovery' }, undefined, undefined, owner);
    const connect = sinon.stub(MongoClient.prototype, 'connect').callThrough();
    connect.onFirstCall().rejects(new Error('server unavailable'));
    const close = sinon.spy(MongoClient.prototype, 'close');
    try {
      await assert.rejects(driver.put('recovered', 'bytes'));
      assert.equal(close.callCount, 1);
      await driver.put('recovered', 'bytes');
      assert.equal(await driver.get('recovered'), 'bytes');
      assert.equal(connect.callCount, 2);
    } finally {
      await persistence.cleanupPersistence(owner);
      connect.restore();
      close.restore();
    }
    assert.equal(close.callCount, 2);
  });
  it('closes the live chunk cursor after a malformed legacy logo download', async () => {
    const id = new ObjectId();
    await native.db().collection('fs.files').insertOne({
      _id: id,
      length: 300,
      chunkSize: 1,
      uploadDate: new Date(),
      filename: 'broken-logo',
    });
    // More than a default cursor batch; the missing initial chunk fails while
    // the server still has a live cursor rather than exhausting it naturally.
    await native
      .db()
      .collection('fs.chunks')
      .insertMany(Array.from({ length: 299 }, (_, index) => ({ files_id: id, n: index + 1, data: Buffer.from('x') })));
    const logo = new LogoServices.BrandingLogo({
      repository: persistence.getBrandingRepository(app),
      disk: () => ({ getBytes: async () => { throw new Error('ENOENT'); } }) as any,
      legacyDatabase: async () => native.db(),
      sanitize: value => ({
        safe: true,
        sanitized: value,
        errors: [],
        warnings: [],
        info: { originalBytes: value.length, sanitizedBytes: value.length },
      }),
      config: {},
      log: createSinonStubLogger(sinon),
    });
    const download = sinon.spy(GridFSBucket.prototype, 'openDownloadStream');
    try {
      assert.equal(await logo.getBinaryAsync(id.toHexString()), null);
      assert.equal(download.callCount, 1);
      const stream = download.firstCall.returnValue as unknown as {
        s: { cursor?: FindCursor & { session?: { hasEnded: boolean } } };
      };
      assert(stream.s.cursor, 'download must initialize its chunk cursor');
      assert.equal(stream.s.cursor.killed, true);
      assert.equal(stream.s.cursor.session?.hasEnded, true);
      assert.equal(
        await native
          .db()
          .command({ ping: 1 })
          .then(result => result.ok),
        1
      );
    } finally {
      download.restore();
      await logo.close();
    }
  });
  it('uses BSON ids and supplied-field patches without rewriting existing raw documents', async () => {
    const repo = persistence.getReferenceRepositories(app).forms;
    const created = await repo.createDefinition({
      name: 'raw-form',
      branding: brand,
      configuration: { list: [false, 0, null] },
    });
    const raw = await native.db().collection('form').findOne({ name: 'raw-form' });
    assert(raw!._id instanceof ObjectId);
    assert(raw!.branding instanceof ObjectId);
    assert.equal(raw!.key, undefined);
    assert.equal(typeof raw!.createdAt, 'string');
    assert.deepEqual((await repo.findByName('raw-form', brand))!.configuration, { list: [false, 0, null] });
    assert.equal(created.id, raw!._id.toHexString());
  });
  it('refuses fixture-only R/Q fields before writes or named-query execution', async () => {
    const forms = persistence.getReferenceRepositories(app).forms;
    const configs = persistence.getConfigurationRepositories(app).appConfigs;
    for (const field of ['syntheticUnknown', 'institutionUnknown', 'extension', 'unknown']) {
      await assert.rejects(
        forms.createDefinition({ name: 'rejected-fixture', branding: brand, [field]: 'fixture' }),
        /Undeclared reference field/
      );
      await assert.rejects(
        configs.createConfiguration({ configKey: 'rejected-fixture', branding: brand, [field]: 'fixture' }),
        /Undeclared Q field/
      );
      for (const target of ['form', 'recordtype', 'appconfig']) {
        await assert.rejects(
          executeNamedQuery(app, {
            target,
            tenant: brand,
            start: 0,
            expression: { [field]: 'fixture' },
          }),
          /Unsupported named-query/
        );
      }
    }
    assert.equal(await native.db().collection('form').countDocuments({ name: 'rejected-fixture' }), 0);
    assert.equal(await native.db().collection('appconfig').countDocuments({ configKey: 'rejected-fixture' }), 0);
    const form = await forms.createDefinition({ name: 'real-fields', branding: brand, attachmentFields: ['file'] });
    assert.deepEqual(form.attachmentFields, ['file']);
    await native
      .db()
      .collection('form')
      .deleteOne({ _id: new ObjectId(form.id) });
    const workspace = await persistence.getReferenceRepositories(app).workspaceTypes.createDefinition({
      name: 'real-fields',
      branding: brand,
      label: 'Workspace',
    });
    assert.equal(workspace.label, 'Workspace');
  });
  it('preserves cache JSON, duplicate classification and numeric timestamps', async () => {
    const cache = getCacheEntryRepository(app);
    await cache.create({ name: 'raw', data: { zero: 0, nil: null, flag: false }, ts_added: 42 });
    const raw = await native.db().collection('cacheentry').findOne({ name: 'raw' });
    assert.equal(raw!.ts_added, 42);
    assert.equal(typeof raw!.createdAt, 'string');
    await assert.rejects(
      cache.create({ name: 'raw', data: null, ts_added: 42 }),
      (error: any) => error.code === 'duplicate-cache-entry'
    );
  });
  it('keeps migration execution names and ordering durable', async () => {
    const repo = persistence.getMigrationLedgerRepository(app);
    await repo.recordExecution({ name: 'one', ranAt: 1 });
    assert.equal(await repo.isExecuted('one'), true);
    assert.deepEqual(await repo.executedNames(), ['one']);
    await repo.removeExecution('one');
    assert.equal(await repo.isExecuted('one'), false);
  });
  it('keeps configuration BSON references and fences dashboard revisions', async () => {
    const repos = persistence.getConfigurationRepositories(app);
    await repos.appConfigs.createConfiguration({
      branding: brand,
      configKey: 'test',
      configData: { secretReference: 'fixture', list: [0, false] },
    });
    assert((await native.db().collection('appconfig').findOne({ configKey: 'test' }))!.branding instanceof ObjectId);
    await repos.dashboards.createAggregate({ branding: brand, revision: 1, configData: {} as any });
    const patch = { revision: 2, configData: {} as any, updatedAt: new Date().toISOString() };
    const winners = await Promise.all(
      Array.from({ length: 8 }, () => repos.dashboards.compareAndSwap(brand, 1, patch))
    );
    assert.equal(winners.filter(Boolean).length, 1);
  });
  it('retains progress defaults and supplied JSON fields', async () => {
    const repo = persistence.getProgressRepositories(app).progress;
    const row = await repo.startProgress({ name: 'job', branding: brand, started_by: 'admin', metadata: { zero: 0 } });
    assert.equal(row.currentIdx, 0);
    assert.equal(row.branding, brand);
    assert.deepEqual((await repo.listProgress({ where: { id: row.id } }))[0].metadata, { zero: 0 });
  });
  it('atomically accumulates harvest counters under concurrent chunk completion', async () => {
    const repo = persistence.getHarvestRepositories(app).runs;
    const row = await repo.createRun({
      brandId: brand,
      recordType: 'data',
      sourceName: 'test',
      sourceRunId: 'one',
      startedAt: new Date().toISOString(),
    });
    const counters = { totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0 };
    await Promise.all(
      Array.from({ length: 20 }, () => repo.completeChunkCounters(row, counters, false, new Date().toISOString()))
    );
    const saved = await repo.findRun({ id: row.id });
    assert.equal(saved!.totalProcessed, 20);
    assert.equal(saved!.chunksProcessed, 20);
  });
  it('grants one SIEM lease and refuses stale delivery writes', async () => {
    const repo = persistence.getSiemRepository(app);
    const input = {
      eventId: 'event',
      brandId: brand,
      eventType: 'record.updated',
      category: 'recordLifecycle',
      severity: 'info',
      occurredAt: new Date().toISOString(),
      source: 'test',
      deliveryState: 'pending',
    } as any;
    await repo.capture(input);
    await repo.capture(input);
    const claims = (await Promise.all(Array.from({ length: 12 }, () => repo.claimDelivery(input, 30_000)))).filter(
      Boolean
    );
    assert.equal(claims.length, 1);
    assert.equal(
      await repo.saveDelivery({ ...claims[0]!, leaseToken: 'stale' }, { deliveryState: 'delivered' }),
      false
    );
    assert.equal(await repo.saveDelivery(claims[0]!, { deliveryState: 'delivered' }), true);
  });
  it('persists Figshare state with a single exclusive lease', async () => {
    const repo = persistence.getFigshareSyncRepository(app);
    await repo.initialise('record', brand);
    await repo.request('record', 'sync', Date.now());
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_, i) => repo.claim('record', brand, `worker-${i}`, 30_000))
    );
    assert.equal(claims.filter(Boolean).length, 1);
    const raw = await native.db().collection('figsharesync').findOne({ oid: 'record' });
    assert.equal(typeof raw!.leaseUntil, 'number');
    assert.equal(typeof raw!.work.sync.requested, 'number');
  });
  it('keeps vocabulary normalization and branding drafts on model CRUD', async () => {
    const vocab = persistence.getVocabularyRepositories(app);
    const row = await vocab.createVocabulary({ name: 'Test', slug: 'test', branding: brand });
    const entry = await vocab.createEntry({ vocabulary: row.id, label: 'Value', value: 'Code' });
    assert.equal(entry.labelLower, 'value');
    assert.equal(entry.valueLower, 'code');
    assert(
      (await native
        .db()
        .collection('vocabularyentry')
        .findOne({ _id: new ObjectId(entry.id) }))!.vocabulary instanceof ObjectId
    );
    const branding = persistence.getBrandingRepository(app);
    const b = await branding.createBrand({ name: 'test-brand' });
    assert.equal(
      (await branding.reviseDraft(b.id, 0, { variables: { primary: '#112233' }, draftRevision: 1 }))!.draftRevision,
      1
    );
    assert.equal(await branding.reviseDraft(b.id, 0, { draftRevision: 1 }), null);
  });
  it('hashes credentials and never returns them through identity projections', async () => {
    const users = persistence.getIdentityRepositories(app);
    const row = await users.create('user', {
      username: 'credential-test',
      name: 'Test',
      type: 'local',
      email: 'test@example.invalid',
      password: 'fixture-password',
    });
    const raw = await native
      .db()
      .collection('user')
      .findOne({ _id: new ObjectId(row.id) });
    assert.notEqual(raw!.password, 'fixture-password');
    assert.equal(await users.verifyPassword(row.id, 'fixture-password'), true);
    assert.equal(row.password, undefined);
    assert.equal(row.token, undefined);
    assert.equal((await users.one('user', { id: row.id }))!.password, undefined);
  });
  it('executes tenant-scoped user, role and path-rule named queries on string timestamps', async () => {
    const repo = persistence.getIdentityRepositories(app);
    const createdAt = '2026-01-01T00:00:00.000Z',
      updatedAt = '2026-02-01T00:00:00.000Z';
    const other = new ObjectId().toHexString();
    const role = await repo.create('role', { name: 'timestamp-role', branding: brand, createdAt, updatedAt });
    const foreignRole = await repo.create('role', { name: 'timestamp-other', branding: other, createdAt, updatedAt });
    const user = await repo.create('user', {
      username: 'timestamp-user',
      name: 'Timestamp',
      type: 'local',
      email: 'timestamp@example.invalid',
      createdAt,
      updatedAt,
    });
    const foreignUser = await repo.create('user', {
      username: 'timestamp-other',
      name: 'Other',
      type: 'local',
      email: 'other@example.invalid',
      createdAt,
      updatedAt,
    });
    await repo.addMemberships('user', user.id!, [role.id!]);
    await repo.addMemberships('user', foreignUser.id!, [foreignRole.id!]);
    const rule = await repo.create('pathrule', {
      path: '/timestamp',
      role: role.id,
      branding: brand,
      createdAt,
      updatedAt,
    });
    await repo.create('pathrule', { path: '/timestamp', role: foreignRole.id, branding: other, createdAt, updatedAt });
    for (const [target, expected] of [
      ['user', user],
      ['role', role],
      ['pathrule', rule],
    ] as const) {
      const page = await executeNamedQuery(
        app,
        {
          target,
          tenant: brand,
          start: 0,
          expression: { createdAt: { $gte: createdAt, $lt: '2026-01-02' }, updatedAt },
          select: ['id', 'createdAt', 'updatedAt'],
        },
        true
      );
      assert.equal(page.total, 1);
      assert.deepEqual(page.records, [{ id: expected.id, createdAt, updatedAt }]);
      const miss = await executeNamedQuery(
        app,
        {
          target,
          tenant: brand,
          start: 0,
          expression: { updatedAt: { $gt: updatedAt } },
        },
        true
      );
      assert.equal(miss.total, 0);
    }
  });
  it('allocates every Counter value exactly once under concurrent first use', async () => {
    const counter = persistence.getStorageRepositories(app).counters;
    const values = await Promise.all(Array.from({ length: 40 }, () => counter.incrementGlobal('global', brand)));
    assert.deepEqual(
      values.sort((a, b) => a - b),
      Array.from({ length: 40 }, (_, i) => i + 1)
    );
    const raw = await native.db().collection('counter').findOne({ name: 'global' });
    assert.equal(raw!.value, 40);
  });
  it('sorts identity JSON paths before tenant-scoped paging and retains safe populated rows', async () => {
    const repo = persistence.getIdentityRepositories(app);
    const tenant = new ObjectId().toHexString(),
      other = new ObjectId().toHexString();
    const roles = await Promise.all(
      [tenant, other].map(branding => repo.create('role', { name: `json-sort-${branding}`, branding }))
    );
    const departments = [undefined, null, 'A', 'A', 'B', ['A', 'Z'], 'AA', 'AB'];
    const documents = departments.map((department, index) => ({
      _id: new ObjectId(),
      username: `json-sort-${index}`,
      name: 'JSON sort',
      type: 'local',
      email: `json-sort-${index}@example.invalid`,
      password: 'fixture-secret',
      token: 'fixture-key',
      additionalAttributes: { ...(department === undefined ? {} : { department }), secret: 'nested-secret' },
    }));
    const ids = documents.map(row => row._id.toHexString());
    try {
      await native.db().collection('user').insertMany(documents);
      for (let index = 0; index < 7; index++)
        await repo.addMemberships('user', ids[index], [roles[index === 6 ? 1 : 0].id!]);
      // A linked alias is visible through the tenant's active link without a role.
      await repo.create('userlink', {
        primaryUserId: ids[0],
        primaryUsername: documents[0].username,
        secondaryUserId: ids[7],
        secondaryUsername: documents[7].username,
        brandId: tenant,
        status: 'active',
        createdBy: ids[0],
      });
      const visible = ids.filter((_, index) => index !== 6);
      for (const direction of ['ASC', 'DESC'] as const) {
        const expected = await native
          .db()
          .collection('user')
          .find({ _id: { $in: visible.map(value => new ObjectId(value)) } })
          .sort({ 'additionalAttributes.department': direction === 'ASC' ? 1 : -1, username: 1 })
          .toArray();
        const sort: Record<string, 'ASC' | 'DESC'>[] = [
          { 'additionalAttributes.department': direction },
          { username: 'ASC' },
        ];
        for (const count of [false, true]) {
          const pages = [];
          for (let start = 0; start < visible.length; start += 2) {
            const page = await executeNamedQuery(
              app,
              {
                target: 'user',
                tenant,
                expression: { id: { $in: ids } },
                sort,
                start,
                rows: 2,
              },
              count
            );
            assert.equal(page.total, visible.length);
            for (const row of page.records) {
              assert(Array.isArray(row.roles));
              assert.equal(row.password, undefined);
              assert.equal(row.token, undefined);
              assert.equal((row.additionalAttributes as any).secret, undefined);
              assert.equal(row.hasApiKey, true);
            }
            pages.push(...page.records);
          }
          assert.deepEqual(
            pages.map(row => row.id),
            expected.map(row => row._id.toHexString())
          );
        }
        // Repository paging uses the same typed sort and encodes nested ObjectId predicates.
        const direct = await repo.list(
          'user',
          { and: [{ id: visible }, { type: 'local' }] },
          {
            sort,
            skip: 1,
            limit: 2,
            populate: ['roles'],
          }
        );
        assert.deepEqual(
          direct.map(row => row.id),
          expected.slice(1, 3).map(row => row._id.toHexString())
        );
      }
      const projected = await executeNamedQuery(
        app,
        {
          target: 'user',
          tenant,
          expression: { id: { $in: ids } },
          start: 2,
          rows: 2,
          sort: [{ 'additionalAttributes.department': 'ASC' }, { username: 'ASC' }],
          select: ['id', 'additionalAttributes.department'],
        },
        true
      );
      assert.deepEqual(
        projected.records,
        [2, 3].map(index => ({ id: ids[index], additionalAttributes: { department: 'A' } }))
      );
      const workspaces = [];
      try {
        for (const [index, rank] of [2, 1].entries())
          workspaces.push(
            await repo.create('workspaceapp', { app: `json-sort-${index}`, user: ids[0], info: { rank } })
          );
        const ordered = await repo.list('workspaceapp', { user: ids[0] }, { sort: [{ 'info.rank': 'ASC' }], limit: 1 });
        assert.equal(ordered[0].id, workspaces[1].id);
      } finally {
        await repo.remove('workspaceapp', { user: ids[0] });
      }
    } finally {
      await native
        .db()
        .collection('user')
        .deleteMany({ _id: { $in: documents.map(row => row._id) } });
      for (const role of roles) {
        await repo.removeMemberships('role', role.id!, ids);
        await repo.remove('role', { id: role.id });
      }
      await repo.remove('userlink', { brandId: tenant });
    }
  });

  describe('Counter named queries', () => {
    const tenant = new ObjectId().toHexString();
    const ids = [new ObjectId(), new ObjectId(), new ObjectId()];
    const names = [`Alpha-${tenant}`, `alpha-${tenant}`, `Alpha-other-${tenant}`];
    const query = (expression: Record<string, unknown>) => ({ target: 'counter', tenant, expression, start: 0 });
    before(async () => {
      // Parent lifecycle tests deliberately drain repositories before nested suites run.
      await persistence.initializeStoragePersistence(app);
      await native
        .db()
        .collection('counter')
        .insertMany(
          ids.map((_id, index) => ({
            _id,
            name: names[index],
            value: index === 1 ? 3 : 2,
            branding: new ObjectId(index === 2 ? new ObjectId().toHexString() : tenant),
          }))
        );
    });
    after(async () => {
      await native
        .db()
        .collection('counter')
        .deleteMany({ _id: { $in: ids } });
    });

    it('maps ID predicates and sort keys before tenant-scoped count and paging', async () => {
      const ordered = ids
        .slice(0, 2)
        .map(id => id.toHexString())
        .sort();
      for (const direction of ['ASC', 'DESC'] as const) {
        const page = await executeNamedQuery(app, {
          ...query({ id: { in: ids.map(id => id.toHexString()) } }),
          sort: [{ id: direction }],
          start: 1,
          rows: 1,
          select: ['id'],
        });
        assert.equal(page.total, 2);
        assert.deepEqual(page.records, [{ id: direction === 'ASC' ? ordered[1] : ordered[0] }]);
      }
      const single = await executeNamedQuery(app, { ...query({ id: ids[0].toHexString() }), select: ['id'] });
      assert.equal(single.total, 1);
      assert.deepEqual(single.records, [{ id: ids[0].toHexString() }]);
    });

    it('coerces numeric strings in equality, membership and range predicates', async () => {
      for (const value of ['2', { in: ['2'] }, { '>=': '2', '<': '3' }]) {
        const page = await executeNamedQuery(app, { ...query({ value }), select: ['id', 'value'] });
        assert.equal(page.total, 1);
        assert.deepEqual(page.records, [{ id: ids[0].toHexString(), value: 2 }]);
      }
    });

    it('matches Counter text case-sensitively and retains empty and intersected modifiers', async () => {
      for (const name of [{ contains: 'Alpha' }, { startsWith: 'Alpha' }, { contains: 'Alpha', endsWith: tenant }]) {
        const page = await executeNamedQuery(app, { ...query({ name }), select: ['id'] });
        assert.equal(page.total, 1);
        assert.deepEqual(page.records, [{ id: ids[0].toHexString() }]);
      }
      const page = await executeNamedQuery(app, query({ name: { contains: '' } }));
      assert.equal(page.total, 2);
    });

    it('preserves internal ObjectId operands in equality and membership without count', async () => {
      for (const id of [ids[0], { $in: [ids[0]] }]) {
        const page = await executeStorageQuery(
          app,
          {
            ...query({ and: [{ id }, { branding: new ObjectId(tenant) }] }),
            select: ['id'],
          },
          false
        );
        assert.equal(page.total, 0);
        assert.deepEqual(page.records, [{ id: ids[0].toHexString() }]);
      }
    });
  });

  it('preserves native record regex options, JSON scalars and Mongo identity refusal', async () => {
    const tenant = new ObjectId().toHexString();
    const redboxOid = `native-query-${tenant}`;
    const collection = native.db(new URL(url!).pathname.slice(1) + '_storage').collection('record');
    await collection.insertOne({
      redboxOid,
      metaMetadata: { brandId: tenant },
      metadata: { title: 'Alpha', number: 2 },
    });
    const query = { target: 'record', tenant, start: 0 };
    try {
      const page = await executeNamedQuery(app, {
        ...query,
        expression: { redboxOid, 'metadata.title': { $regex: 'alpha', $options: 'i' }, 'metadata.number': 2 },
        select: ['redboxOid', 'metadata.title'],
      });
      assert.equal(page.total, 1);
      assert.deepEqual(
        page.records.map(({ _id, ...row }) => row),
        [{ redboxOid, metadata: { title: 'Alpha' } }]
      );
      assert.equal(
        (await executeNamedQuery(app, { ...query, expression: { redboxOid, 'metadata.number': '2' } })).total,
        0
      );
      for (const key of ['id', '_id'])
        for (const extra of [
          { expression: { [key]: new ObjectId().toHexString() } },
          { expression: {}, sort: [{ [key]: 'ASC' as const }] },
          { expression: {}, select: [key] },
        ])
          await assert.rejects(
            executeNamedQuery(app, { ...query, ...extra }),
            error => error instanceof Error && Reflect.get(error, 'code') === 'named-query-compatibility'
          );
    } finally {
      await collection.deleteMany({ redboxOid });
    }
  });

  for (const [target, json, defaults] of [
    ['form', 'configuration', { name: 'json-sort' }],
    ['appconfig', 'configData', { configKey: 'json-sort' }],
    ['asynchprogress', 'metadata', { name: 'json-sort' }],
    ['brandingconfighistory', 'variables', { version: 1, hash: 'json-sort' }],
    [
      'figsharevocabularysyncrun',
      'summary',
      {
        scope: 'json-sort',
        taxonomyId: 'json-sort',
        normalizerVersion: '1',
        expiresAt: '2027-01-01',
        requestedBy: 'fixture',
      },
    ],
    ['record', 'metadata', {}],
  ] as const) {
    it(`retains dotted JSON sorting with tenant scope and paging for ${target}`, async () => {
      const tenant = new ObjectId().toHexString(),
        other = new ObjectId().toHexString();
      const database = ['brandingconfighistory', 'record'].includes(target)
        ? native.db(new URL(url!).pathname.slice(1) + '_storage')
        : native.db();
      const collection = database.collection(target);
      const documents = [undefined, null, 'A', 'B', 'C', 'AA'].map((department, index) => ({
        _id: new ObjectId(),
        ...defaults,
        ...(target === 'record'
          ? { redboxOid: `json-sort-${tenant}-${index}`, metaMetadata: { brandId: index === 5 ? other : tenant } }
          : { branding: new ObjectId(index === 5 ? other : tenant) }),
        [json]: { ...(department === undefined ? {} : { department }) },
      }));
      const identity = target === 'record' ? 'redboxOid' : 'id';
      const ids = documents.map(row => (target === 'record' ? Reflect.get(row, 'redboxOid') : row._id.toHexString()));
      try {
        await collection.insertMany(documents);
        for (const direction of ['ASC', 'DESC'] as const) {
          const expected = await collection
            .find({ _id: { $in: documents.slice(0, 5).map(row => row._id) } })
            .sort({
              [`${json}.department`]: direction === 'ASC' ? 1 : -1,
              [target === 'record' ? 'redboxOid' : '_id']: 1,
            })
            .skip(1)
            .limit(3)
            .toArray();
          const page = await executeNamedQuery(
            app,
            {
              target,
              tenant,
              expression: { [identity]: { $in: ids } },
              start: 1,
              rows: 3,
              sort: [{ [`${json}.department`]: direction }, { [identity]: 'ASC' }],
              select: [identity],
            },
            true
          );
          assert.equal(page.total, 5);
          assert.deepEqual(
            page.records.map(row => row[identity]),
            expected.map(row => (target === 'record' ? row.redboxOid : row._id.toHexString()))
          );
        }
      } finally {
        await collection.deleteMany({ _id: { $in: documents.map(row => row._id) } });
      }
    });
  }
  it('inspects duplicate indexes without rewriting documents and only prepares explicit scopes', async () => {
    const descriptor = {
      datastore: 'mongodb' as const,
      collection: 'appconfig',
      name: 'config_key_unique',
      keys: { configKey: 1 as const },
      unique: true,
    };
    await native
      .db()
      .collection(descriptor.collection)
      .insertMany([{ configKey: 'same' }, { configKey: 'same' }]);
    assert.equal((await inspectPersistenceIndex(app, descriptor)).duplicateKeyGroups, 1);
    await assert.rejects(ensurePersistenceIndex(app, descriptor));
    assert.equal(await native.db().collection(descriptor.collection).countDocuments({ configKey: 'same' }), 2);
  });
  it('shares session transport with the app runtime and closes it only after the store', async () => {
    const web = express();
    const sessions = composeHttpSession({ adapter: 'mongo', mongoUrl: url, secret: 'fixture-secret', cookie: { secure: false } }, app);
    await sessions.ready;
    web.use(sessions.middleware);
    web.get('/', (req, res) => {
      (req.session as any).fixture = true;
      res.end('ok');
    });
    const server = createServer(web);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/`);
      assert.equal(await response.text(), 'ok');
      assert.equal(
        (await persistence.mongoSessionDatabase(app, { mongoUrl: url })).client,
        (await persistence.mongoDatabase(app, 'mongodb')).client
      );
      assert.equal(await native.db().collection('sessions').countDocuments(), 1);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await sessions.drain();
    }
  });
  it('fences retained repositories across shutdown and restart without rewriting stored data', async () => {
    const repo = persistence.getReferenceRepositories(app);
    await persistence.cleanupPersistence(app);
    await assert.rejects(repo.forms.list(brand));
    await persistence.initializeReferencePersistence(app);
    assert.equal((await persistence.getReferenceRepositories(app).forms.list(brand)).length, 1);
    await assert.rejects(repo.forms.list(brand));
  });
});

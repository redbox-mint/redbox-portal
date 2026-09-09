import { seedManifest, seedAuthority } from '../helpers/record-definition-seed-fixture';
import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { Services, type RecordDefinitionSeedManifest } from '../../src/services/RecordDefinitionSeedService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('B10 versioned create-only aggregate seeds', function () {
  let service: Services.RecordDefinitionSeed;
  let tables: Record<string, any[]>;
  let writes: string[];
  let failHistory: boolean;
  let failIdentity: boolean;
  let loseIdentityAck: boolean;

  beforeEach(function () {
    const sails = createMockSails();
    sails.config.appmode = { bootstrapAlways: true };
    setupServiceTestGlobals(sails);
    tables = { RecordType: [], RecordDefinitionRevision: [], RecordDefinitionHistory: [] };
    writes = [];
    failHistory = false;
    failIdentity = false;
    loseIdentityAck = false;
    for (const [name, rows] of Object.entries(tables)) {
      (global as any)[name] = {
        findOne: async (criteria: any) =>
          structuredClone(rows.find(row => Object.entries(criteria).every(([key, value]) => row[key] === value))),
        create: (value: any) => ({
          fetch: async () => {
            writes.push(name);
            if (name === 'RecordType' && failIdentity) throw new Error('identity unavailable');
            if (name === 'RecordDefinitionHistory' && failHistory) throw new Error('history unavailable');
            if (
              rows.some(
                row =>
                  row.id === value.id ||
                  (name === 'RecordType' && row.branding === value.branding && row.name === value.name)
              )
            ) {
              throw new Error('duplicate key');
            }
            rows.push(structuredClone(value));
            if (name === 'RecordType' && loseIdentityAck) throw new Error('lost acknowledgement');
            return structuredClone(value);
          },
        }),
      };
    }
    service = new Services.RecordDefinitionSeed(seedAuthority);
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    for (const name of Object.keys(tables)) delete (global as any)[name];
    sinon.restore();
  });

  it('creates revision and history before making the identity active; reports first and repeat startup', async function () {
    const manifest = seedManifest();
    const original = structuredClone(manifest);
    assert.deepEqual(await service.seed(manifest), {
      created: 1,
      skipped: 0,
      outcomes: [{ brandId: 'brand-a', recordTypeKey: 'dataset', seedVersion: 1, status: 'created' }],
    });
    assert.deepEqual(writes, ['RecordDefinitionRevision', 'RecordDefinitionHistory', 'RecordType']);
    assert.equal(tables.RecordType[0].packageType, 'dataset');
    assert.equal(tables.RecordType[0].searchCore, 'records');
    assert.equal(tables.RecordType[0].activeRevisionId, tables.RecordDefinitionRevision[0].id);
    assert.equal(tables.RecordDefinitionHistory[0].operation, 'bootstrap');
    const snapshot = structuredClone(tables);
    const result = await service.seed(manifest);
    assert.equal(result.skipped, 1);
    assert.equal(result.created, 0);
    assert.deepEqual(tables, snapshot);
    assert.deepEqual(manifest, original);
  });

  it('preserves legacy, edited, retired and draft-only identities with bootstrapAlways enabled', async function () {
    for (const extra of [
      { packageType: 'admin-edited' },
      { retiredAt: '2026-09-05' },
      { draftId: 'draft', version: 3 },
    ]) {
      tables.RecordType.splice(0, tables.RecordType.length, {
        id: 'existing',
        branding: 'brand-a',
        name: 'dataset',
        ...extra,
      });
      const original = structuredClone(tables);
      assert.equal((await service.seed(seedManifest())).skipped, 1);
      assert.deepEqual(tables, original);
    }
    assert.equal(writes.length, 0);
  });

  it('does not merge an updated seed version into existing state', async function () {
    await service.seed(seedManifest());
    const snapshot = structuredClone(tables);
    const updated: any = seedManifest();
    updated.seeds[0].seedVersion = 2;
    updated.seeds[0].definition.recordType.labels.name = 'New release';
    assert.equal((await service.seed(updated)).skipped, 1);
    assert.deepEqual(tables, snapshot);
  });

  it('isolates the same key across two brands', async function () {
    const manifest: RecordDefinitionSeedManifest = {
      schemaVersion: 1,
      seeds: [...seedManifest().seeds, ...seedManifest('brand-b').seeds],
    };
    assert.equal((await service.seed(manifest)).created, 2);
    assert.notEqual(tables.RecordType[0].id, tables.RecordType[1].id);
    assert.notEqual(tables.RecordType[0].activeRevisionId, tables.RecordType[1].activeRevisionId);
    assert.equal((await service.seed(seedManifest('brand-b'))).skipped, 1);
    assert.equal(tables.RecordDefinitionRevision.length, 2);
  });

  for (const defect of ['version', 'extra', 'duplicate', 'graph', 'function', 'role', 'form', 'accessor', 'deployment-metadata']) {
    it(`rejects ${defect} before the first write, even after a valid earlier aggregate`, async function () {
      const manifest: any = { schemaVersion: 1, seeds: [...seedManifest().seeds, ...seedManifest('brand-b').seeds] };
      const seed = manifest.seeds[1];
      if (defect === 'deployment-metadata') seed.packageType = '';
      if (defect === 'version') manifest.schemaVersion = 2;
      if (defect === 'extra') seed.extra = true;
      if (defect === 'duplicate') seed.brandId = 'brand-a';
      if (defect === 'graph') seed.definition.stages[0].starting = false;
      if (defect === 'function') seed.definition.recordType.hooks = { function: 'evil' };
      if (defect === 'role') seed.definition.stages[0].viewRoles = ['missing'];
      if (defect === 'form') seed.definition.stages[0].formReference = 'missing';
      if (defect === 'accessor')
        Object.defineProperty(seed, 'definition', {
          get() {
            throw new Error('must not run');
          },
          enumerable: true,
        });
      await assert.rejects(service.seed(manifest), /Invalid record-definition seed/);
      assert.equal(writes.length, 0);
    });
  }

  for (const target of ['seeds', 'entry', 'nested-array', 'nested-object']) {
    for (const defect of ['function', 'accessor', 'proxy', 'hidden-function', 'symbol-accessor']) {
      it(`rejects ${target} ${defect} properties without executing caller code`, async function () {
        const manifest: any = seedManifest();
        if (target === 'seeds') manifest.seeds[0].seedVersion = 0; // An override returning [] must not bypass validation.
        const container = target === 'seeds' ? manifest.seeds
          : target === 'entry' ? manifest.seeds[0]
          : target === 'nested-array' ? manifest.seeds[0].definition.stages
          : manifest.seeds[0].definition.recordType;
        let calls = 0;
        const callback = () => { calls += 1; return []; };
        const key = defect === 'symbol-accessor' ? Symbol.iterator : 'map';
        Object.defineProperty(container, key, {
          ...(defect.includes('accessor') ? { get: callback } : {
            value: defect === 'proxy' ? new Proxy({}, { ownKeys() { calls += 1; return []; } }) : callback,
          }),
          enumerable: defect !== 'hidden-function',
        });
        await assert.rejects(service.seed(manifest), /Invalid record-definition seed/);
        assert.equal(calls, 0);
        assert.deepEqual(writes, []);
      });
    }
  }

  const revisionCorruptions = {
    id: 'wrong', schemaVersion: 2, recordTypeId: 'rtd_wrong', recordTypeKey: 'wrong',
    revisionNumber: 2, branding: 'wrong', recordType: 'wrong', canonicalHash: 'wrong',
    definition: {}, actionContracts: [{}], source: {}, createdBy: {}, publishedBy: {},
    publishedAt: 'invalid', publicationNote: 'unexpected',
  };
  for (const [field, value] of Object.entries(revisionCorruptions)) {
    it(`rejects an orphan revision with corrupt ${field} without further writes`, async function () {
      failHistory = true;
      await assert.rejects(service.seed(seedManifest()), /history unavailable/);
      failHistory = false;
      tables.RecordDefinitionRevision[0][field] = value;
      // Return the corrupted ID too, simulating an adapter returning a mismatched artifact.
      if (field === 'id') sinon.stub((global as any).RecordDefinitionRevision, 'findOne')
        .resolves(structuredClone(tables.RecordDefinitionRevision[0]));
      const snapshot = structuredClone(tables);
      writes.length = 0;
      await assert.rejects(service.seed(seedManifest()), /Conflicting seed revision/);
      assert.deepEqual(tables, snapshot);
      assert.deepEqual(writes, []);
    });
  }

  const historyCorruptions = {
    id: 'wrong', schemaVersion: 2, operationId: 'wrong', recordTypeId: 'rtd_wrong',
    recordTypeKey: 'wrong', revisionNumber: 2, branding: 'wrong', recordType: 'wrong',
    revision: 'wrong', operation: 'publish', canonicalHash: 'wrong', source: {}, actor: {},
    expectedIdentityVersion: 1, resultingIdentityVersion: 2, expectedDraftVersion: 0,
    expectedActiveRevisionNumber: 1, occurredAt: '2000-01-01T00:00:00.000Z',
    validation: {}, impact: {}, changes: [{}], redactions: [{}], truncated: true, note: 'unexpected',
  };
  for (const [field, value] of Object.entries(historyCorruptions)) {
    it(`rejects orphan history with corrupt ${field} without activating or changing artifacts`, async function () {
      failIdentity = true;
      await assert.rejects(service.seed(seedManifest()), /identity unavailable/);
      failIdentity = false;
      tables.RecordDefinitionHistory[0][field] = value;
      if (field === 'id') sinon.stub((global as any).RecordDefinitionHistory, 'findOne')
        .resolves(structuredClone(tables.RecordDefinitionHistory[0]));
      const snapshot = structuredClone(tables);
      writes.length = 0;
      await assert.rejects(service.seed(seedManifest()), /Conflicting seed history/);
      assert.deepEqual(tables, snapshot);
      assert.deepEqual(writes, []);
    });
  }

  it('reuses intact orphan history after an interrupted identity insert', async function () {
    failIdentity = true;
    await assert.rejects(service.seed(seedManifest()), /identity unavailable/);
    failIdentity = false;
    writes.length = 0;
    assert.equal((await service.seed(seedManifest())).created, 1);
    assert.deepEqual(writes, ['RecordType']);
  });

  it('reconciles duplicate concurrent startup without overwriting the winner', async function () {
    const results = await Promise.all([service.seed(seedManifest()), service.seed(seedManifest())]);
    assert.equal(
      results.reduce((count, report) => count + report.created, 0),
      1
    );
    assert.equal(
      results.reduce((count, report) => count + report.skipped, 0),
      1
    );
    for (const rows of Object.values(tables)) assert.equal(rows.length, 1);
  });

  it('recovers the same seed after a history failure without activating partial data', async function () {
    failHistory = true;
    await assert.rejects(service.seed(seedManifest()), /history unavailable/);
    assert.equal(tables.RecordType.length, 0);
    assert.equal(tables.RecordDefinitionRevision.length, 1);
    failHistory = false;
    assert.equal((await service.seed(seedManifest())).created, 1);
    assert.equal(tables.RecordDefinitionRevision.length, 1);
  });

  it('fails closed for a changed seed after interrupted creation', async function () {
    failHistory = true;
    await assert.rejects(service.seed(seedManifest()));
    failHistory = false;
    const changed: any = seedManifest();
    changed.seeds[0].definition.recordType.labels.name = 'Changed';
    await assert.rejects(service.seed(changed), /Conflicting seed revision/);
    assert.equal(tables.RecordType.length, 0);
  });

  it('reports an observed identity as skipped after acknowledgement loss', async function () {
    loseIdentityAck = true;
    assert.equal((await service.seed(seedManifest())).skipped, 1);
    assert.equal(tables.RecordType.length, 1);
  });
});

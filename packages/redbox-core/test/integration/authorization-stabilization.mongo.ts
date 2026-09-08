import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { after, before, describe, it } from 'mocha';
import { AuthorizationCollectionHealth } from '../../src/authorization/collection-health';
import { Services, persistShadowMismatch } from '../../src/services/AuthorizationRolloutService';
import { asScopeKey, scopeAuthorization, freezeAuthorizationContext } from '../../src/authorization';
import { navigationCollectionFixture } from '../fixtures/authorization-navigation-collection.fixtures';
import { getCapturedOpenTelemetryMeasurements, clearCapturedOpenTelemetryMeasurements } from '../setup';

/** Explicit Docker profile: real native persistence with injected deterministic write faults. */
describe('Phase 15.2 Mongo collection and process restart integration', () => {
  const client = new MongoClient(process.env.AUTHORIZATION_TEST_MONGO_URL ?? 'mongodb://mongodb:27017');
  const directory = mkdtempSync(join(tmpdir(), 'authorization-stabilization-'));
  const file = join(directory, 'health.json');
  const saved = new Map(
    ['sails', 'AuthorizationShadowMismatch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  const collection = client.db('authorization_phase152_test').collection('shadow');
  before(async () => {
    await client.connect();
    await collection.createIndex({ fingerprint: 1 }, { unique: true });
    Reflect.set(globalThis, 'sails', {
      config: { authorization: { mode: 'shadow' } },
      log: { error: () => undefined, info: () => undefined },
    });
    Reflect.set(globalThis, 'AuthorizationShadowMismatch', {
      tableName: 'shadow',
      getDatastore: () => ({ manager: client.db('authorization_phase152_test') }),
    });
  });
  after(async () => {
    await client.db('authorization_phase152_test').dropDatabase();
    await client.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    rmSync(directory, { recursive: true, force: true });
  });
  it('retains a real aggregate and reopening semantics across fail/recover/fail and a separate process', async () => {
    let fail = false;
    let pending: Promise<void> = Promise.resolve();
    const health = new AuthorizationCollectionHealth(file);
    const service = new Services.AuthorizationRolloutService(
      {
        getMode: () => 'shadow',
        collectLegacyEvidenceInEnforce: () => true,
        authorizeScope: () => ({ allowed: false, reasonCode: 'scope-missing' }),
        evaluateLegacy: () => true,
        persistMismatch: input => {
          pending = fail
            ? Promise.reject(new Error('injected write outage'))
            : persistShadowMismatch(input, new Date());
          return pending;
        },
      },
      health
    );
    const scope = asScopeKey('record.read');
    const context = freezeAuthorizationContext({
      contextType: 'brand',
      principal: { category: 'authenticated', authMethod: 'session', active: true },
      brand: { id: 'b', exists: true, authorized: true },
    });
    const req = { options: { controller: 'record' }, authorization: context } as unknown as Sails.Req;
    const evaluate = async () => {
      assert.equal(
        service.evaluateRequest({
          req,
          context,
          authorization: scopeAuthorization(scope),
          routeId: 'GET /records (record#read)',
          requestId: 'safe-probe',
        }).allowed,
        true
      );
      await pending.catch(() => undefined);
      await Promise.resolve();
    };
    await evaluate();
    assert.equal(await collection.countDocuments(), 1);
    await collection.updateOne({}, { $set: { resolvedAt: new Date().toISOString(), remediationStatus: 'verified' } });
    fail = true;
    await evaluate();
    assert.equal(health.snapshot().evidenceGap, true);
    fail = false;
    await evaluate();
    const row = await collection.findOne({});
    assert.equal(row?.count, 2);
    assert.equal(row?.resolvedAt, undefined);
    assert.equal(row?.remediationStatus, undefined);
    assert.equal(health.snapshot().evidenceGap, false);
    fail = true;
    await evaluate();
    assert.equal(health.snapshot().failures, 2);
    const script = `const { AuthorizationCollectionHealth } = require(${JSON.stringify(resolve(__dirname, '../../src/authorization/collection-health.ts'))}); process.stdout.write(JSON.stringify(new AuthorizationCollectionHealth(process.argv[1]).snapshot()));`;
    const restarted: unknown = JSON.parse(
      execFileSync(
        process.execPath,
        ['--no-experimental-strip-types', '-r', 'ts-node/register/transpile-only', '-e', script, file],
        { encoding: 'utf8' }
      )
    );
    assert.ok(typeof restarted === 'object' && restarted !== null);
    assert.equal(Reflect.get(restarted, 'failures'), 2);
    assert.equal(Reflect.get(restarted, 'evidenceGap'), true);
    assert.equal(Reflect.get(restarted, 'state'), 'unknown');
    assert.notEqual(Reflect.get(restarted, 'bootId'), health.snapshot().bootId);
    assert.equal(await collection.countDocuments(), 1);
  });
  it('collects navigation faults durably and recovers through real navigation in a new process', async () => {
    const navigationFile = join(directory, 'navigation-health.json');
    let fail = false;
    let pending: Promise<void> = Promise.resolve();
    const service = new Services.AuthorizationRolloutService(
      {
        persistMismatch: input => {
          pending = fail
            ? Promise.reject(new Error('injected navigation outage'))
            : persistShadowMismatch(input, new Date());
          return pending;
        },
      },
      new AuthorizationCollectionHealth(navigationFile)
    );
    const navigation = navigationCollectionFixture(service);
    const evaluate = async () => {
      assert.equal(await navigation.visible(), true);
      await pending.catch(() => undefined);
      await Promise.resolve();
    };
    try {
      await evaluate();
      const filter = { routeId: 'navigation:menu:collection-probe' };
      assert.equal(await collection.countDocuments(filter), 1);
      await collection.updateOne(filter, {
        $set: { resolvedAt: new Date().toISOString(), remediationStatus: 'verified' },
      });
      clearCapturedOpenTelemetryMeasurements();
      fail = true;
      await evaluate();
      await evaluate();
      assert.equal(service.getCollectionHealth().failures, 2);
      assert.equal(service.getCollectionHealth().evidenceGap, true);
      fail = false;
      await evaluate();
      const recovered = await collection.findOne(filter);
      assert.equal(recovered?.count, 2);
      assert.equal(recovered?.resolvedAt, undefined);
      assert.equal(recovered?.remediationStatus, undefined);
      assert.equal(service.getCollectionHealth().evidenceGap, false);
      fail = true;
      await evaluate();
      assert.equal(service.getCollectionHealth().failures, 3);
      assert.equal(service.getCollectionHealth().recoveries, 2);
      assert.equal(service.getCollectionHealth().evidenceGap, true);
      const measurements = getCapturedOpenTelemetryMeasurements();
      assert.deepEqual(
        measurements
          .filter(event => event.name === 'redbox.authorization.collection_transitions')
          .map(event => event.attributes.outcome),
        ['failed', 'recovered', 'failed']
      );
      assert.deepEqual(
        measurements
          .filter(event => event.name === 'redbox.authorization.shadow_collection')
          .map(event => event.attributes.outcome),
        ['error', 'error', 'success', 'error']
      );
      const script = `
        const { MongoClient } = require('mongodb');
        const { AuthorizationCollectionHealth } = require(${JSON.stringify(resolve(__dirname, '../../src/authorization/collection-health.ts'))});
        const { Services, persistShadowMismatch } = require(${JSON.stringify(resolve(__dirname, '../../src/services/AuthorizationRolloutService.ts'))});
        const { navigationCollectionFixture } = require(${JSON.stringify(resolve(__dirname, '../fixtures/authorization-navigation-collection.fixtures.ts'))});
        (async () => {
          const client = new MongoClient(process.env.AUTHORIZATION_TEST_MONGO_URL);
          await client.connect();
          global.AuthorizationShadowMismatch = { tableName: 'shadow', getDatastore: () => ({ manager: client.db('authorization_phase152_test') }) };
          let fail = false;
          let pending = Promise.resolve();
          const service = new Services.AuthorizationRolloutService({ persistMismatch: input => {
            pending = fail ? Promise.reject(new Error('injected')) : persistShadowMismatch(input, new Date());
            return pending;
          } }, new AuthorizationCollectionHealth(process.argv[1]));
          const navigation = navigationCollectionFixture(service);
          try {
            const before = service.getCollectionHealth();
            const visible = await navigation.visible();
            await pending;
            await Promise.resolve();
            const recovered = service.getCollectionHealth();
            fail = true;
            const failedVisible = await navigation.visible();
            await pending.catch(() => undefined);
            await Promise.resolve();
            process.stdout.write(JSON.stringify({ before, recovered, failed: service.getCollectionHealth(), visible, failedVisible }));
          } finally {
            navigation.restore();
            await client.close();
          }
        })().catch(error => { process.stderr.write(String(error)); process.exitCode = 1; });
      `;
      const restarted = JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--no-experimental-strip-types',
            '-r',
            'ts-node/register/transpile-only',
            '-r',
            resolve(__dirname, '../setup.ts'),
            '-e',
            script,
            navigationFile,
          ],
          { encoding: 'utf8' }
        )
      );
      assert.equal(restarted.before.failures, 3);
      assert.equal(restarted.before.recoveries, 2);
      assert.equal(restarted.before.state, 'unknown');
      assert.equal(restarted.before.evidenceGap, true);
      assert.notEqual(restarted.before.bootId, service.getCollectionHealth().bootId);
      assert.equal(restarted.visible, true);
      assert.equal(restarted.recovered.state, 'healthy');
      assert.equal(restarted.recovered.durable, true);
      assert.equal(restarted.recovered.evidenceGap, false);
      assert.equal(restarted.recovered.failures, 3);
      assert.equal(restarted.recovered.recoveries, 3);
      assert.equal(restarted.failedVisible, true);
      assert.equal(restarted.failed.state, 'failed');
      assert.equal(restarted.failed.evidenceGap, true);
      assert.equal(restarted.failed.failures, 4);
      assert.equal(new AuthorizationCollectionHealth(navigationFile).snapshot().failures, 4);
      assert.equal((await collection.findOne(filter))?.count, 3);
    } finally {
      navigation.restore();
    }
  });
});

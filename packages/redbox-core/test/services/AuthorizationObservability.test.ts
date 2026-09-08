import { sendAuthorizationContractProblem } from '../../src/responses/authorization-problems';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'mocha';
import sinon from 'sinon';
import type { Attributes } from '@opentelemetry/api';
import { AuthorizationCollectionHealth } from '../../src/authorization/collection-health';
import {
  AuthorizationTelemetry,
  authorizationTelemetry,
  contextQuery,
  measureAuthorizationContext,
  type AuthorizationMetric,
} from '../../src/authorization/observability';
import { Services as Rollout } from '../../src/services/AuthorizationRolloutService';
import { Services as Authorization } from '../../src/services/AuthorizationService';
import { Services as Administration } from '../../src/services/RoleAdministrationService';
import {
  NAVIGATION_COLLECTION_SURFACES,
  navigationCollectionFixture,
} from '../fixtures/authorization-navigation-collection.fixtures';
import {
  asScopeKey,
  createScopeRegistry,
  freezeAuthorizationContext,
  scopeAuthorization,
  AuthorizationAdministrationError,
} from '../../src/authorization';
import {
  sendAuthorizationProblem,
  sendAuthorizationTransactionUnavailable,
  sendAuthorizationAdministrationError,
  sendAuthorizationResourceError,
} from '../../src/policies/authorization-response';

const scope = asScopeKey('record.read');
const registry = createScopeRegistry([
  {
    sourceType: 'core',
    sourcePackage: 'core',
    sourceVersion: 'test',
    definitions: [{ key: scope, label: 'Read', description: 'Read', risk: 'read' }],
  },
]);
const context = freezeAuthorizationContext({
  contextType: 'brand',
  principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'u' },
  brand: { id: 'b', exists: true, authorized: true },
  effectiveScopeKeys: [scope],
  grantedScopeKeys: [scope],
});
function request(): Sails.Req {
  return {
    method: 'GET',
    path: '/secret/records/private-id',
    headers: { authorization: 'Bearer SECRET' },
    query: {},
    options: { controller: 'record' },
    session: {},
    user: { id: 'u' },
    authorization: context,
  } as unknown as Sails.Req;
}

describe('Authorization decision, response, query and collection instrumentation', () => {
  let directory: string;
  let time: number;
  let events: Array<{ name: AuthorizationMetric; value: number; labels: Attributes }>;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let navigation: ReturnType<typeof navigationCollectionFixture> | undefined;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'authorization-health-'));
    time = Date.parse('2026-09-08T10:00:00Z');
    events = [];
    saved = new Map(
      ['sails', 'User', 'Role', 'RoleAssignment', 'RoleTemplateRevision', 'RoleScopeOverride'].map(key => [
        key,
        Object.getOwnPropertyDescriptor(globalThis, key),
      ])
    );
    Reflect.set(globalThis, 'sails', {
      config: { authorization: { mode: 'enforce' }, auth: { defaultBrand: 'b' } },
      services: {},
      log: { error: () => undefined, info: () => undefined, warn: () => undefined },
    });
    const telemetry = new AuthorizationTelemetry((name, value, labels) => events.push({ name, value, labels }));
    sinon.stub(authorizationTelemetry, 'emit').callsFake((...args) => telemetry.emit(...args));
  });
  afterEach(() => {
    navigation?.restore();
    navigation = undefined;
    sinon.restore();
    authorizationTelemetry.failures = 0;
    authorizationTelemetry.rejected = 0;
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    rmSync(directory, { recursive: true, force: true });
  });
  function health(file = join(directory, 'health.json')) {
    return new AuthorizationCollectionHealth(file, () => new Date(time));
  }
  for (const mode of ['legacy', 'shadow', 'enforce'] as const) {
    for (const allowed of [true, false])
      it(`counts one final ${allowed ? 'allow' : 'deny'} per ${mode} evaluation, never a comparison as a second decision`, () => {
        sails.config.authorization.mode = mode;
        const service = new Rollout.AuthorizationRolloutService(
          {
            getMode: () => mode,
            collectLegacyEvidenceInEnforce: () => true,
            authorizeScope: () => ({ allowed, reasonCode: allowed ? 'allowed' : 'scope-missing' }),
            evaluateLegacy: () => allowed,
            persistMismatch: async () => undefined,
          },
          health()
        );
        const result = service.evaluateRequest({
          req: request(),
          context,
          routeId: '/secret-route/PRIVATE',
          requestId: 'SECRET',
          authorization: scopeAuthorization(scope),
        });
        assert.equal(result.allowed, allowed);
        const decisions = events.filter(event => event.name === 'decisions');
        assert.equal(decisions.length, 1);
        assert.equal(decisions[0].value, 1);
        assert.equal(decisions[0].labels.mode, mode);
        assert.equal(decisions[0].labels.route, 'records');
        assert.equal(decisions[0].labels.outcome, allowed ? 'allow' : 'deny');
        assert.equal(JSON.stringify(events).includes('SECRET'), false);
        assert.equal(JSON.stringify(events).includes('PRIVATE'), false);
      });
    it(`counts 401/403/404/503/409 helpers once in ${mode}, including delegated resource errors`, () => {
      sails.config.authorization.mode = mode;
      const req = request();
      const statuses: number[] = [];
      const res = {
        status: (status: number) => {
          statuses.push(status);
          return res;
        },
        type: () => res,
        json: () => res,
      } as unknown as Sails.Res;
      sendAuthorizationProblem(req, res, 401, 'authorization.invalid-credential', 'Inactive');
      sendAuthorizationProblem(req, res, 403, 'authorization.scope-denied', 'Denied');
      sendAuthorizationProblem(req, res, 404, 'authorization.not-found', 'Missing');
      assert.equal(
        sendAuthorizationTransactionUnavailable(req, res, { code: 'authorization.transaction-unavailable' }),
        true
      );
      assert.equal(
        sendAuthorizationResourceError(
          req,
          res,
          new AuthorizationAdministrationError('authorization.version-conflict', 409, 'Changed')
        ),
        true
      );
      assert.equal(sendAuthorizationAdministrationError(req, res, new Error('SECRET')), false);
      sendAuthorizationContractProblem(
        req,
        res,
        new AuthorizationAdministrationError('authorization.version-conflict', 409, 'Changed')
      );
      assert.deepEqual(statuses, [401, 403, 404, 503, 409, 409]);
      const responses = events.filter(event => event.name === 'responses');
      assert.equal(responses.length, 6);
      assert.ok(responses.every(event => event.labels.mode === mode));
      assert.deepEqual(
        responses.map(event => event.labels.status),
        statuses.map(String)
      );
    });
  }
  it('rejects arbitrary labels and collapses invalid bounded values without leaking secrets or increasing series', () => {
    const telemetry = new AuthorizationTelemetry((name, value, labels) => events.push({ name, value, labels }));
    for (let i = 0; i < 1000; i++)
      telemetry.emit('decisions', 1, {
        route: `/secret/${i}`,
        reason: `Bearer SECRET-${i}`,
        mode: 'enforce',
        category: 'authenticated',
        userId: `user-${i}`,
      });
    assert.equal(telemetry.rejected, 1000);
    assert.equal(new Set(events.map(event => JSON.stringify(event.labels))).size, 2);
    assert.equal(JSON.stringify(events).includes('SECRET'), false);
    assert.equal(JSON.stringify(events).includes('userId'), false);
    const broken = new AuthorizationTelemetry(() => {
      throw new Error('exporter failed');
    });
    assert.doesNotThrow(() => broken.emit('decisions', 1, { mode: 'enforce' }));
    assert.equal(broken.failures, 1);
  });
  it('preserves decisions and response bodies when the telemetry boundary itself throws', () => {
    sinon.restore();
    sinon.stub(authorizationTelemetry, 'emit').throws(new Error('telemetry failure'));
    for (const mode of ['legacy', 'shadow', 'enforce'] as const) {
      const service = new Rollout.AuthorizationRolloutService(
        {
          getMode: () => mode,
          collectLegacyEvidenceInEnforce: () => false,
          authorizeScope: () => ({ allowed: false, reasonCode: 'scope-missing' }),
          evaluateLegacy: () => true,
          persistMismatch: async () => undefined,
        },
        health()
      );
      assert.equal(
        service.evaluateRequest({
          req: request(),
          context,
          routeId: 'test',
          requestId: 'test',
          authorization: scopeAuthorization(scope),
        }).allowed,
        mode !== 'enforce'
      );
    }
    const res = { status: () => res, type: () => res, json: sinon.spy() } as unknown as Sails.Res;
    assert.doesNotThrow(() => sendAuthorizationProblem(request(), res, 403, 'authorization.scope-denied', 'Denied'));
    assert.ok(authorizationTelemetry.failures > 0);
  });
  it('observes fail/recover/fail, repeated failures, synchronous throws and restart continuity without changing decisions', async () => {
    let fail = true;
    const collection = health();
    const service = new Rollout.AuthorizationRolloutService(
      {
        getMode: () => 'shadow',
        collectLegacyEvidenceInEnforce: () => true,
        authorizeScope: () => ({ allowed: false, reasonCode: 'scope-missing' }),
        evaluateLegacy: () => true,
        persistMismatch: () => {
          if (fail) throw new Error('SECRET');
          return Promise.resolve();
        },
      },
      collection
    );
    const run = async () => {
      assert.equal(
        service.evaluateRequest({
          req: request(),
          context,
          routeId: 'SECRET',
          requestId: 'SECRET',
          authorization: scopeAuthorization(scope),
        }).allowed,
        true
      );
      await Promise.resolve();
      time += 1000;
    };
    assert.equal(service.getCollectionHealth().evidenceGap, true);
    await run();
    await run();
    assert.equal(service.getCollectionHealth().failures, 2);
    fail = false;
    await run();
    assert.equal(service.getCollectionHealth().state, 'healthy');
    assert.equal(service.getCollectionHealth().evidenceGap, false);
    fail = true;
    await run();
    assert.equal(service.getCollectionHealth().failures, 3);
    assert.equal(service.getCollectionHealth().evidenceGap, true);
    const persisted = readFileSync(join(directory, 'health.json'), 'utf8');
    const rebooted = health();
    assert.equal(rebooted.snapshot().failures, 3);
    assert.equal(rebooted.snapshot().recoveries, 1);
    assert.equal(rebooted.snapshot().state, 'unknown');
    assert.equal(rebooted.snapshot().evidenceGap, true);
    assert.notEqual(rebooted.snapshot().bootId, collection.snapshot().bootId);
    assert.equal(
      readFileSync(join(directory, 'health.json'), 'utf8'),
      persisted,
      'probe must not write or clear health'
    );
    rebooted.observe(true);
    assert.equal(rebooted.snapshot().recoveries, 2);
    assert.equal(rebooted.snapshot().failures, 3);
    assert.deepEqual(
      events.filter(event => event.name === 'collection_transitions').map(event => event.labels.outcome),
      ['failed', 'recovered', 'failed']
    );
    assert.equal(
      events.filter(event => event.name === 'shadow_collection' && event.labels.outcome === 'error').length,
      3
    );
    assert.equal(persisted.includes('SECRET'), false);
  });
  it('does not call missing/unwritable health storage healthy, including a new boot after recovery', () => {
    const absent = new AuthorizationCollectionHealth('');
    absent.observe(true);
    assert.equal(absent.snapshot().evidenceGap, true);
    const unwritable = health(join(directory, 'missing', 'health.json'));
    unwritable.observe(true);
    assert.equal(unwritable.snapshot().durable, false);
    const first = health();
    first.observe(false);
    first.observe(true);
    const restarted = health();
    assert.equal(restarted.snapshot().failures, 1);
    assert.equal(restarted.snapshot().evidenceGap, true);
  });
  for (const surface of NAVIGATION_COLLECTION_SURFACES) {
    for (const roleAllowed of [true, false]) {
      it(`durably observes ${surface} ${roleAllowed ? 'visible' : 'hidden'} fail/recover/fail, repeated failures and restart recovery`, async () => {
        let fault: 'reject' | 'throw' | undefined;
        const inputs: string[] = [];
        const dependencies = {
          getMode: () => 'shadow' as const,
          persistMismatch: (input: { routeId: string }) => {
            inputs.push(input.routeId);
            if (fault === 'throw') throw new Error('SECRET');
            return fault === 'reject' ? Promise.reject(new Error('SECRET')) : Promise.resolve();
          },
        };
        let service = new Rollout.AuthorizationRolloutService(dependencies, health());
        navigation = navigationCollectionFixture(service, roleAllowed);
        const run = async () => {
          assert.equal(await navigation!.visible(surface), roleAllowed);
          await Promise.resolve();
          time += 1000;
        };
        await run();
        assert.equal(service.getCollectionHealth().state, 'healthy');
        events.length = 0;
        fault = 'reject';
        await run();
        const firstGap = service.getCollectionHealth().lastGapAt;
        assert.equal(service.getCollectionHealth().state, 'failed');
        assert.equal(service.getCollectionHealth().evidenceGap, true);
        fault = 'throw';
        await run();
        assert.equal(service.getCollectionHealth().failures, 2);
        assert.ok(service.getCollectionHealth().lastGapAt > firstGap);
        fault = undefined;
        await run();
        assert.equal(service.getCollectionHealth().state, 'healthy');
        assert.equal(service.getCollectionHealth().durable, true);
        assert.equal(service.getCollectionHealth().evidenceGap, false);
        assert.equal(service.getCollectionHealth().recoveries, 2);
        fault = 'reject';
        await run();
        const failed = service.getCollectionHealth();
        assert.equal(failed.failures, 3);
        assert.equal(failed.state, 'failed');
        assert.equal(failed.evidenceGap, true);
        const persisted = readFileSync(join(directory, 'health.json'), 'utf8');
        assert.equal(JSON.parse(persisted).failures, 3);
        assert.equal(JSON.parse(persisted).state, 'failed');
        service = new Rollout.AuthorizationRolloutService(dependencies, health());
        navigation.runtime.services.authorizationrolloutservice = service.exports();
        const rebooted = service.getCollectionHealth();
        assert.equal(rebooted.failures, 3);
        assert.equal(rebooted.recoveries, 2);
        assert.equal(rebooted.state, 'unknown');
        assert.equal(rebooted.evidenceGap, true);
        assert.notEqual(rebooted.bootId, failed.bootId);
        assert.equal(readFileSync(join(directory, 'health.json'), 'utf8'), persisted);
        fault = undefined;
        await run();
        assert.equal(service.getCollectionHealth().evidenceGap, false);
        assert.equal(service.getCollectionHealth().failures, 3);
        assert.equal(service.getCollectionHealth().recoveries, 3);
        // Even a restart after healthy collection requires a new successful write.
        const healthyRestart = health().snapshot();
        assert.equal(healthyRestart.failures, 3);
        assert.equal(healthyRestart.recoveries, 3);
        assert.equal(healthyRestart.evidenceGap, true);
        assert.deepEqual(
          events.filter(event => event.name === 'collection_transitions').map(event => event.labels.outcome),
          ['failed', 'recovered', 'failed', 'recovered']
        );
        assert.deepEqual(
          events.filter(event => event.name === 'shadow_collection').map(event => event.labels.outcome),
          ['error', 'error', 'success', 'error', 'success']
        );
        assert.equal(inputs.length, 6);
        assert.ok(inputs.every(routeId => routeId.startsWith('navigation:')));
        assert.equal(/SECRET|PRIVATE|collection-probe/.test(JSON.stringify(events) + persisted), false);
      });
    }
  }
  it('uses one observer when request and navigation collection failures alternate', async () => {
    let fail = false;
    const service = new Rollout.AuthorizationRolloutService(
      {
        getMode: () => 'shadow',
        authorizeScope: () => ({ allowed: false, reasonCode: 'scope-missing' }),
        evaluateLegacy: () => true,
        persistMismatch: async () => {
          if (fail) throw new Error('injected');
        },
      },
      health()
    );
    navigation = navigationCollectionFixture(service);
    const runRequest = async () => {
      assert.equal(
        service.evaluateRequest({
          req: navigation!.req,
          context: navigation!.context,
          authorization: scopeAuthorization(scope),
          routeId: 'request-probe',
          requestId: 'SECRET',
        }).allowed,
        true
      );
      await Promise.resolve();
    };
    await runRequest();
    fail = true;
    assert.equal(await navigation.visible(), true);
    assert.equal(service.getCollectionHealth().failures, 1);
    fail = false;
    await runRequest();
    assert.equal(service.getCollectionHealth().evidenceGap, false);
    fail = true;
    await runRequest();
    assert.equal(service.getCollectionHealth().failures, 2);
    fail = false;
    assert.equal(await navigation.visible(), true);
    assert.equal(service.getCollectionHealth().evidenceGap, false);
    assert.equal(service.getCollectionHealth().recoveries, 3);
  });
  for (const roleAllowed of [true, false]) {
    it(`preserves ${roleAllowed ? 'visible' : 'hidden'} navigation when telemetry, logging or health storage fails`, async () => {
      let fail = false;
      const service = new Rollout.AuthorizationRolloutService(
        {
          persistMismatch: async () => {
            if (fail) throw new Error('SECRET');
          },
        },
        health()
      );
      navigation = navigationCollectionFixture(service, roleAllowed);
      sinon.stub(navigation.runtime.log, 'error').throws(new Error('logger unavailable'));
      sinon.stub(navigation.runtime.log, 'info').throws(new Error('logger unavailable'));
      assert.equal(await navigation.visible(), roleAllowed);
      fail = true;
      assert.equal(await navigation.visible(), roleAllowed);
      assert.equal(service.getCollectionHealth().failures, 1);
      assert.equal(service.getCollectionHealth().evidenceGap, true);
      assert.ok(service.getCollectionHealth().telemetryFailures >= 2);
      // A throwing provider must still leave durable collection transitions intact.
      sinon.restore();
      sinon.stub(authorizationTelemetry, 'emit').throws(new Error('provider unavailable'));
      fail = false;
      assert.equal(await navigation.visible(), roleAllowed);
      assert.equal(service.getCollectionHealth().state, 'healthy');
      assert.equal(service.getCollectionHealth().recoveries, 2);
      fail = true;
      assert.equal(await navigation.visible(), roleAllowed);
      assert.equal(service.getCollectionHealth().failures, 2);
      assert.ok(service.getCollectionHealth().telemetryFailures >= 4);
      const unwritable = new Rollout.AuthorizationRolloutService(
        { persistMismatch: async () => undefined },
        health(join(directory, 'missing', 'health.json'))
      );
      navigation.runtime.services.authorizationrolloutservice = unwritable.exports();
      assert.equal(await navigation.visible(), roleAllowed);
      assert.equal(unwritable.getCollectionHealth().durable, false);
      assert.equal(unwritable.getCollectionHealth().evidenceGap, true);
      // Missing/old hook collectors also invalidate coverage, without a direct-write fallback.
      const failures = authorizationTelemetry.failures;
      Reflect.deleteProperty(navigation.runtime.services, 'authorizationrolloutservice');
      assert.equal(await navigation.visible(), roleAllowed);
      assert.equal(authorizationTelemetry.failures, failures + 1);
    });
  }
  it('counts actual default datastore dispatches, fallback reads and skips, with a single latency sample on request cache reuse', async () => {
    let fallback = false;
    Reflect.set(globalThis, 'User', {
      findOne: (criteria: { id?: string }) =>
        Promise.resolve(criteria.id && fallback ? undefined : { id: 'u', username: 'name' }),
    });
    Reflect.set(globalThis, 'RoleAssignment', { find: () => Promise.resolve([]) });
    Reflect.set(globalThis, 'Role', { find: () => Promise.resolve([]) });
    const service = new Authorization.AuthorizationService({
      resolveBrand: async () => ({ id: 'b' }),
      getRegistry: () => registry,
    });
    const req = request();
    req.headers = {};
    const pending = service.resolveRequestContext(req);
    assert.equal(service.resolveRequestContext(req), pending);
    await pending;
    assert.deepEqual(
      events.filter(event => event.name === 'context_query_count').map(event => event.value),
      [3]
    );
    assert.equal(events.filter(event => event.name === 'context_duration').length, 1);
    assert.deepEqual(
      events.filter(event => event.name === 'context_queries').map(event => event.labels.operation),
      ['user-id', 'assignments', 'roles']
    );
    assert.equal(events.filter(event => event.name === 'context_cache' && event.labels.outcome === 'hit').length, 1);
    fallback = true;
    const next = request();
    next.headers = {};
    await service.resolveRequestContext(next);
    assert.deepEqual(
      events.filter(event => event.name === 'context_query_count').map(event => event.value),
      [3, 4]
    );
  });
  it('measures one-role, multi-role and large assignment batches without per-assignment queries', async () => {
    for (const count of [1, 2, 250]) {
      const roles = Array.from({ length: count }, (_, i) => ({
        id: `r${i}`,
        key: `role-${i}`,
        name: `Role ${i}`,
        contextType: 'brand',
        branding: 'b',
        status: 'active',
        protectedKind: 'none',
        template: 't',
        templateRevision: 1,
      }));
      Reflect.set(globalThis, 'User', { findOne: async () => ({ id: 'u', username: 'name' }) });
      Reflect.set(globalThis, 'RoleAssignment', {
        find: async () =>
          roles.map(role => ({
            id: `a-${role.id}`,
            principalId: 'u',
            role: role.id,
            branding: 'b',
            source: 'manual',
            sourceKey: 'manual',
            status: 'active',
            sourcePresent: true,
          })),
      });
      Reflect.set(globalThis, 'Role', { find: async () => roles });
      Reflect.set(globalThis, 'RoleTemplateRevision', {
        find: async () => [{ id: 'revision', template: 't', revision: 1, scopeKeys: [scope] }],
      });
      Reflect.set(globalThis, 'RoleScopeOverride', { find: async () => [] });
      const service = new Authorization.AuthorizationService({
        resolveBrand: async () => ({ id: 'b' }),
        getRegistry: () => registry,
      });
      const resolved = await service.resolveUserContext('u', 'b');
      assert.equal(resolved.roles.length, count);
      assert.ok(resolved.effectiveScopeKeys.includes(scope));
    }
    assert.deepEqual(
      events.filter(event => event.name === 'context_query_count').map(event => event.value),
      [5, 5, 5]
    );
    assert.equal(events.filter(event => event.name === 'context_duration').length, 3);
  });

  it('counts errored queries and resolution latency, evicts a rejected request cache entry and preserves the rejection', async () => {
    let failed = true;
    const original = new Error('db failed');
    Reflect.set(globalThis, 'User', {
      findOne: () => {
        if (failed) throw original;
        return Promise.resolve({ id: 'u', username: 'name', loginDisabled: true });
      },
    });
    const service = new Authorization.AuthorizationService({
      resolveBrand: async () => ({ id: 'b' }),
      getRegistry: () => registry,
    });
    const req = request();
    req.headers = {};
    await assert.rejects(service.resolveRequestContext(req), error => error === original);
    failed = false;
    await service.resolveRequestContext(req);
    assert.deepEqual(
      events.filter(event => event.name === 'context_queries').map(event => event.labels.outcome),
      ['error', 'success']
    );
    assert.deepEqual(
      events.filter(event => event.name === 'context_resolutions').map(event => event.labels.outcome),
      ['error', 'success']
    );
    assert.deepEqual(
      events.filter(event => event.name === 'context_query_count').map(event => event.value),
      [1, 1]
    );
  });
  it('keeps concurrent query measurements isolated and records healthy zero separately from no resolution', async () => {
    assert.equal(events.length, 0);
    const labels = { route: 'internal', mode: 'enforce', category: 'unknown' };
    await Promise.all([
      measureAuthorizationContext(labels, async () => {
        await Promise.all([contextQuery('roles', async () => []), contextQuery('revisions', async () => [])]);
      }),
      measureAuthorizationContext(labels, async () => undefined),
    ]);
    assert.deepEqual(
      events
        .filter(event => event.name === 'context_query_count')
        .map(event => event.value)
        .sort(),
      [0, 2]
    );
    assert.equal(events.filter(event => event.name === 'context_duration').length, 2);
  });
  it('observes orphan use at the action gate independently of rollout mode', () => {
    const orphanRegistry = { ...registry, isActive: () => false };
    const service = new Authorization.AuthorizationService({ getRegistry: () => orphanRegistry });
    for (const mode of ['legacy', 'shadow', 'enforce'] as const) {
      sails.config.authorization.mode = mode;
      assert.equal(service.authorizeAction(context, scope).reasonCode, 'scope-orphaned');
    }
    assert.deepEqual(
      events.filter(event => event.name === 'orphan_observations').map(event => event.labels.mode),
      ['legacy', 'shadow', 'enforce']
    );
  });
  it('observes quorum rejection at the service guard, including direct worker calls without HTTP', async () => {
    const query = (value: unknown) => ({ limit: () => ({ usingConnection: async () => value }) });
    Reflect.set(globalThis, 'Role', { find: () => query([{ id: 'r' }]) });
    Reflect.set(globalThis, 'RoleAssignment', { find: () => query([]) });
    const service = new Administration.RoleAdministrationService();
    const guard: unknown = Reflect.get(service, 'assertAdministratorQuorum');
    assert.equal(typeof guard, 'function');
    if (typeof guard !== 'function') throw new Error('missing guard');
    for (const mode of ['legacy', 'shadow', 'enforce'] as const) {
      sails.config.authorization.mode = mode;
      await assert.rejects(
        () =>
          Reflect.apply(guard, service, [
            { id: 'r', contextType: 'system', protectedKind: 'system-admin', status: 'active' },
            {},
          ]),
        { code: 'authorization.last-system-admin' }
      );
    }
    assert.equal(events.filter(event => event.name === 'quorum_rejections').length, 3);
  });
});

import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { asRoleKey, asScopeKey, freezeAuthorizationContext, type AuthorizationContext } from '../../src/authorization';
import {
  AUTHORIZATION_AUDIT_SCHEMA_VERSION,
  Services,
  createAuthorizationAuditEvent,
  type AuthorizationAuditEventFactory,
} from '../../src/services/AuthorizationAuditService';

function actorContext(scopeKeys: readonly string[], brandId = 'brand-1'): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'reader-1' },
    brand: { requestedIdentifier: brandId, id: brandId, name: brandId, exists: true, authorized: true },
    roles: [
      {
        id: 'reader-role',
        key: asRoleKey('audit-reader'),
        name: 'audit-reader',
        displayName: 'Audit reader',
        contextType: 'brand',
        brandId,
        protectedKind: 'none',
        implicit: false,
        assignmentCount: 1,
        assignmentsTruncated: false,
        assignments: [],
        effectiveScopeKeys: scopeKeys.map(asScopeKey),
        inactiveScopeKeys: [],
        missingScopeKeys: [],
      },
    ],
    compatibilityRoles: [],
    grantedScopeKeys: scopeKeys.map(asScopeKey),
    effectiveScopeKeys: scopeKeys.map(asScopeKey),
    scopeProvenance: [],
  });
}

const FACTORY: AuthorizationAuditEventFactory = Object.freeze({
  eventId: () => '00000000-0000-4000-8000-000000000001',
  now: () => new Date('2026-08-28T00:00:00.000Z'),
});

const EVENT_INPUT = Object.freeze({
  eventType: 'role.updated' as const,
  actorType: 'user' as const,
  actorId: 'user-1',
  authMethod: 'session' as const,
  brandId: 'brand-1',
  targetType: 'role' as const,
  targetId: 'role-1',
  requestId: 'request-1',
});

let originalAuthorizationAuditDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalAuthorizationAuditDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AuthorizationAudit');
});

afterEach(() => {
  if (originalAuthorizationAuditDescriptor === undefined) {
    Reflect.deleteProperty(globalThis, 'AuthorizationAudit');
    return;
  }
  Object.defineProperty(globalThis, 'AuthorizationAudit', originalAuthorizationAuditDescriptor);
});

describe('AuthorizationAuditService', () => {
  it('constructs bounded, recursively redacted typed events', () => {
    const event = createAuthorizationAuditEvent(
      {
        ...EVENT_INPUT,
        before: {
          password: 'secret',
          rawClaims: { groups: ['private'] },
          safe: { status: 'inactive' },
        },
        after: {
          headers: { authorization: 'Bearer secret' },
          tokenHash: 'secret hash',
          safe: { status: 'active' },
        },
        reason: ' approved\u0000 by operator ',
      },
      'succeeded',
      FACTORY
    );

    assert.equal(event.schemaVersion, AUTHORIZATION_AUDIT_SCHEMA_VERSION);
    assert.equal(event.occurredAt, '2026-08-28T00:00:00.000Z');
    assert.equal(event.reason, 'approved by operator');
    assert.deepEqual(event.before, { safe: { status: 'inactive' } });
    assert.deepEqual(event.after, { headers: {}, safe: { status: 'active' } });
  });

  it('exports append/read/retention operations but no update or arbitrary destroy', () => {
    const exported = new Services.AuthorizationAuditService(FACTORY).exports();
    assert.equal(typeof exported.createSucceededEvent, 'function');
    assert.equal(typeof exported.createSucceededEventOnce, 'function');
    assert.equal(typeof exported.recordAttempt, 'function');
    assert.equal(typeof exported.readEvents, 'function');
    assert.equal(typeof exported.applyRetention, 'function');
    assert.equal(exported.update, undefined);
    assert.equal(exported.destroy, undefined);
  });

  it('requires and uses the caller transaction connection for successful events', async () => {
    const connection = Object.freeze({ lease: 'audit-transaction' });
    let usedConnection: Sails.Connection;
    let createdEvent: Record<string, unknown> | undefined;
    const query = {
      fetch() {
        return query;
      },
      usingConnection(leasedConnection: Sails.Connection) {
        usedConnection = leasedConnection;
        return Promise.resolve({ ...createdEvent, id: 'audit-1' });
      },
    };
    Reflect.set(globalThis, 'AuthorizationAudit', {
      create(event: Record<string, unknown>) {
        createdEvent = event;
        return query;
      },
    });

    const service = new Services.AuthorizationAuditService(FACTORY);
    const event = await service.createSucceededEvent(EVENT_INPUT, connection);
    assert.equal(usedConnection, connection);
    assert.equal(event.id, 'audit-1');
    assert.equal(createdEvent?.eventId, '00000000-0000-4000-8000-000000000001');
    assert.equal(Object.isFrozen(createdEvent), false);
    await assert.rejects(service.createSucceededEvent(EVENT_INPUT, undefined), /caller transaction connection/);
  });

  it('consumes a confirmation replay key exactly once and maps duplicate-key races to a stale preview', async () => {
    const connection = Object.freeze({ lease: 'audit-transaction' });
    let existing = false;
    const findQuery = {
      usingConnection(leasedConnection: Sails.Connection) {
        assert.equal(leasedConnection, connection);
        return Promise.resolve(existing ? { eventId: 'confirmation-nonce' } : undefined);
      },
    };
    const createQuery = {
      fetch() {
        return createQuery;
      },
      usingConnection(leasedConnection: Sails.Connection) {
        assert.equal(leasedConnection, connection);
        existing = true;
        return Promise.resolve({ ...EVENT_INPUT, id: 'audit-1', eventId: 'confirmation-nonce' });
      },
    };
    Reflect.set(globalThis, 'AuthorizationAudit', {
      findOne: () => findQuery,
      create: () => createQuery,
    });

    const service = new Services.AuthorizationAuditService(FACTORY);
    const event = await service.createSucceededEventOnce(EVENT_INPUT, 'confirmation-nonce', connection);
    assert.equal(event.eventId, 'confirmation-nonce');
    await assert.rejects(
      service.createSucceededEventOnce(EVENT_INPUT, 'confirmation-nonce', connection),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        Reflect.get(error, 'code') === 'authorization.preview-stale' &&
        Reflect.get(error, 'status') === 409
    );
  });

  it('keeps a denied attempt denied when independent audit persistence is unavailable', async () => {
    let createInvocations = 0;
    Reflect.set(globalThis, 'AuthorizationAudit', {
      create() {
        createInvocations += 1;
        throw new Error('must not be called');
      },
      getDatastore() {
        return undefined;
      },
    });
    const service = new Services.AuthorizationAuditService(FACTORY);
    const result = await service.recordAttempt(EVENT_INPUT, 'denied');
    assert.equal(result.persisted, false);
    assert.equal(result.event.outcome, 'denied');
    assert.equal(createInvocations, 0);
  });

  it('retains indefinitely when disabled and respects legal hold while emitting summaries', async () => {
    const connection = Object.freeze({ lease: 'retention-transaction' });
    const summaries: Record<string, unknown>[] = [];
    let findInvocations = 0;
    const datastore = {
      transaction(work: (leasedConnection: Sails.Connection) => Promise<unknown>) {
        return work(connection);
      },
    };
    Reflect.set(globalThis, 'AuthorizationAudit', {
      create(event: Record<string, unknown>) {
        summaries.push(event);
        const query = {
          fetch() {
            return query;
          },
          usingConnection(leasedConnection: Sails.Connection) {
            assert.equal(leasedConnection, connection);
            return Promise.resolve({ ...event, id: `summary-${summaries.length}` });
          },
        };
        return query;
      },
      find() {
        findInvocations += 1;
        throw new Error('Retention must not query rows while disabled or on legal hold.');
      },
      getDatastore() {
        return datastore;
      },
    });

    const service = new Services.AuthorizationAuditService(FACTORY);
    const disabled = await service.applyRetention({}, EVENT_INPUT);
    const held = await service.applyRetention({ retentionDays: 30, legalHold: true }, EVENT_INPUT);

    assert.deepEqual(disabled, {
      auditEventId: '00000000-0000-4000-8000-000000000001',
      deletedCount: 0,
      status: 'disabled',
    });
    assert.deepEqual(held, {
      auditEventId: '00000000-0000-4000-8000-000000000001',
      deletedCount: 0,
      status: 'legal-hold',
    });
    assert.equal(findInvocations, 0);
    assert.equal(summaries.length, 2);
    assert.deepEqual(
      summaries.map(summary => summary.eventType),
      ['audit.retention.completed', 'audit.retention.completed']
    );
    assert.deepEqual(
      summaries.map(summary => summary.reasonCode),
      ['audit-retention-disabled', 'audit-retention-legal-hold']
    );
  });

  it('bounds age-based retention and writes its summary in the same transaction', async () => {
    const connection = Object.freeze({ lease: 'retention-transaction' });
    let requestedLimit: number | undefined;
    let destroyedCriteria: Record<string, unknown> | undefined;
    let summary: Record<string, unknown> | undefined;
    const oldEvents = ['audit-old-1', 'audit-old-2'].map((id, index) => ({
      id,
      eventId: `event-old-${index + 1}`,
      schemaVersion: 1,
      eventType: 'role.updated',
      outcome: 'succeeded',
      actorType: 'operator',
      actorId: 'operator-1',
      authMethod: 'operator',
      targetType: 'role',
      occurredAt: `2026-06-0${index + 1}T00:00:00.000Z`,
    }));
    const datastore = {
      transaction(work: (leasedConnection: Sails.Connection) => Promise<unknown>) {
        return work(connection);
      },
    };
    Reflect.set(globalThis, 'AuthorizationAudit', {
      create(event: Record<string, unknown>) {
        summary = event;
        const query = {
          fetch() {
            return query;
          },
          usingConnection(leasedConnection: Sails.Connection) {
            assert.equal(leasedConnection, connection);
            return Promise.resolve({ ...event, id: 'summary-1' });
          },
        };
        return query;
      },
      destroy(criteria: Record<string, unknown>) {
        destroyedCriteria = criteria;
        const query = {
          fetch() {
            return query;
          },
          usingConnection(leasedConnection: Sails.Connection) {
            assert.equal(leasedConnection, connection);
            return Promise.resolve(oldEvents);
          },
        };
        return query;
      },
      find() {
        const query = {
          sort() {
            return query;
          },
          limit(limit: number) {
            requestedLimit = limit;
            return query;
          },
          usingConnection(leasedConnection: Sails.Connection) {
            assert.equal(leasedConnection, connection);
            return Promise.resolve(oldEvents);
          },
        };
        return query;
      },
      getDatastore() {
        return datastore;
      },
    });

    const service = new Services.AuthorizationAuditService(FACTORY);
    const result = await service.applyRetention({ retentionDays: 30, batchSize: 2 }, EVENT_INPUT);

    assert.deepEqual(result, {
      auditEventId: '00000000-0000-4000-8000-000000000001',
      deletedCount: 2,
      status: 'completed',
    });
    assert.equal(requestedLimit, 2);
    assert.deepEqual(destroyedCriteria, {
      id: ['audit-old-1', 'audit-old-2'],
      occurredAt: { '<': '2026-07-29T00:00:00.000Z' },
    });
    assert.equal(summary?.eventType, 'audit.retention.completed');
    assert.deepEqual(summary?.after, {
      batchSize: 2,
      cutoff: '2026-07-29T00:00:00.000Z',
      deletedCount: 2,
      legalHold: false,
      retentionDays: 30,
      status: 'completed',
    });
  });

  it('uses a stable timestamp/eventId cursor and returns detached immutable event snapshots', async () => {
    const occurredAt = '2026-08-27T12:00:00.000Z';
    const persistedEvents = ['audit-3', 'audit-2', 'audit-1'].map(id => ({
      id,
      eventId: `event-${id}`,
      schemaVersion: 1,
      eventType: 'role.updated',
      outcome: 'succeeded',
      actorType: 'operator',
      actorId: 'operator-1',
      authMethod: 'operator',
      targetType: 'role',
      before: { nested: { status: 'inactive' } },
      occurredAt,
    }));
    const criteriaSeen: Record<string, unknown>[] = [];
    const sortsSeen: unknown[] = [];
    const limitsSeen: number[] = [];
    let invocation = 0;
    Reflect.set(globalThis, 'AuthorizationAudit', {
      find(criteria: Record<string, unknown>) {
        criteriaSeen.push(criteria);
        const query = {
          sort(sort: unknown) {
            sortsSeen.push(sort);
            return query;
          },
          limit(limit: number) {
            limitsSeen.push(limit);
            return query;
          },
          then(resolve: (events: Record<string, unknown>[]) => unknown) {
            const page = invocation === 0 ? persistedEvents : persistedEvents.slice(2);
            invocation += 1;
            return Promise.resolve(page).then(resolve);
          },
        };
        return query;
      },
    });

    const service = new Services.AuthorizationAuditService(FACTORY);
    const filter = Object.freeze({ actorId: 'operator-1', limit: 2 });
    const firstPage = await service.readEvents(filter);
    assert.deepEqual(
      firstPage.events.map(event => event.id),
      ['audit-3', 'audit-2']
    );
    assert.equal(typeof firstPage.nextCursor, 'string');
    assert.equal(Object.isFrozen(firstPage), true);
    assert.equal(Object.isFrozen(firstPage.events), true);
    assert.equal(Object.isFrozen(firstPage.events[0]), true);
    assert.equal(Object.isFrozen(firstPage.events[0].before), true);
    assert.notEqual(firstPage.events[0], persistedEvents[0]);
    assert.throws(() => {
      (firstPage.events[0].before as { nested: { status: string } }).nested.status = 'tampered';
    }, TypeError);
    assert.deepEqual(persistedEvents[0].before, { nested: { status: 'inactive' } });

    const secondPage = await service.readEvents({ ...filter, cursor: firstPage.nextCursor });
    assert.deepEqual(
      secondPage.events.map(event => event.id),
      ['audit-1']
    );
    assert.equal(secondPage.nextCursor, undefined);
    assert.deepEqual(criteriaSeen[0], { actorId: 'operator-1' });
    assert.deepEqual(criteriaSeen[1], {
      actorId: 'operator-1',
      or: [{ occurredAt: { '<': occurredAt } }, { eventId: { '<': 'event-audit-2' }, occurredAt }],
    });
    assert.deepEqual(sortsSeen, [
      [{ occurredAt: 'DESC' }, { eventId: 'DESC' }],
      [{ occurredAt: 'DESC' }, { eventId: 'DESC' }],
    ]);
    assert.deepEqual(limitsSeen, [3, 3]);
    assert.deepEqual(filter, { actorId: 'operator-1', limit: 2 });
  });

  it('forces brand audit readers to their active brand and strips storage-only fields', async () => {
    let criteria: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'AuthorizationAudit', {
      find(value: Record<string, unknown>) {
        criteria = value;
        const query = {
          sort() {
            return query;
          },
          limit() {
            return query;
          },
          then(resolve: (events: Record<string, unknown>[]) => unknown) {
            return Promise.resolve([
              {
                id: 'database-id',
                eventId: 'event-1',
                schemaVersion: 1,
                eventType: 'role.updated',
                outcome: 'succeeded',
                actorType: 'user',
                actorId: 'operator-1',
                authMethod: 'session',
                brandId: 'brand-1',
                targetType: 'role',
                occurredAt: '2026-08-28T00:00:00.000Z',
                createdAt: 1,
                updatedAt: 2,
              },
            ]).then(resolve);
          },
        };
        return query;
      },
    });
    const service = new Services.AuthorizationAuditService(FACTORY);
    const page = await service.queryEvents({
      actor: actorContext(['authorization.audit.read']),
      targetType: 'role',
      limit: 10,
    });

    assert.deepEqual(criteria, { brandId: 'brand-1', targetType: 'role' });
    assert.equal(page.items.length, 1);
    assert.equal('id' in page.items[0], false);
    assert.equal('createdAt' in page.items[0], false);
    assert.equal('updatedAt' in page.items[0], false);
    assert.equal(Object.isFrozen(page.items[0]), true);
  });

  it('hides foreign audit topology from brand readers and permits an explicit brand only to system readers', async () => {
    const service = new Services.AuthorizationAuditService(FACTORY);
    await assert.rejects(
      service.queryEvents({
        actor: actorContext(['authorization.audit.read']),
        brandId: 'foreign-brand',
      }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        Reflect.get(error, 'code') === 'authorization.not-found' &&
        Reflect.get(error, 'status') === 404
    );

    let criteria: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'AuthorizationAudit', {
      find(value: Record<string, unknown>) {
        criteria = value;
        const query = {
          sort() {
            return query;
          },
          limit() {
            return query;
          },
          then(resolve: (events: Record<string, unknown>[]) => unknown) {
            return Promise.resolve([]).then(resolve);
          },
        };
        return query;
      },
    });
    await service.queryEvents({
      actor: actorContext(['authorization.audit.read', 'system.authorization.manage']),
      brandId: 'foreign-brand',
    });
    assert.deepEqual(criteria, { brandId: 'foreign-brand' });
  });

  it('rejects an unsafe retention date boundary before opening a transaction', async () => {
    let transactionInvocations = 0;
    Reflect.set(globalThis, 'AuthorizationAudit', {
      getDatastore() {
        return {
          transaction() {
            transactionInvocations += 1;
            throw new Error('must not run');
          },
        };
      },
    });
    const service = new Services.AuthorizationAuditService(FACTORY);

    await assert.rejects(
      service.applyRetention({ retentionDays: Number.MAX_SAFE_INTEGER }, EVENT_INPUT),
      /safe date boundary/
    );
    assert.equal(transactionInvocations, 0);
  });
});

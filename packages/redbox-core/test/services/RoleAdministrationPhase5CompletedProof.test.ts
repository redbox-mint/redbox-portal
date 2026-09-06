import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'mocha';
import { asScopeKey, createScopeRegistry, type AuthorizationContext } from '../../src/authorization';
import { genuineTestActor } from './genuineActor';
import { Services } from '../../src/services/RoleAdministrationService';

const CONFIRMATION_SECRET = 'phase-5-completed-proof-secret-long-enough!!';
const NOW = new Date('2026-09-01T00:00:00.000Z');
const EXPIRED_NOW = new Date(NOW.getTime() + 10 * 60 * 1_000);

function waterlineQuery<T>(rows: T): Promise<T> & Record<string, (...args: never[]) => unknown> {
  const pending = Promise.resolve(rows);
  const query = pending as Promise<T> & Record<string, (...args: never[]) => unknown>;
  for (const method of [
    'exec',
    'fetch',
    'populate',
    'where',
    'sort',
    'limit',
    'skip',
    'select',
    'set',
    'meta',
    'usingConnection',
  ]) {
    query[method] = () => query;
  }
  return query;
}

interface CapturedAudits {
  readonly succeeded: { readonly input: Record<string, unknown> }[];
  readonly attempts: { readonly input: Record<string, unknown>; readonly outcome: 'denied' | 'failed' }[];
}

function capturedAudits(): CapturedAudits & {
  succeeded: { readonly input: Record<string, unknown> }[];
  attempts: { readonly input: Record<string, unknown>; readonly outcome: 'denied' | 'failed' }[];
} {
  return { succeeded: [], attempts: [] };
}

const testConnection = Object.freeze({ lease: 'phase-5-proof-test' }) as Sails.Connection;

let proofNonce = 0;

function serviceDependencies(
  audits: CapturedAudits,
  registry: ReturnType<typeof createScopeRegistry>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    now: () => new Date(NOW),
    randomId: () => `proof-id-${(proofNonce += 1)}`,
    getRegistry: () => registry,
    getConfirmationSecret: () => CONFIRMATION_SECRET,
    audit: () => ({
      createSucceededEvent: async (input: Record<string, unknown>) => {
        audits.succeeded.push({ input });
        return { eventId: `event-${audits.succeeded.length}` };
      },
      recordAttempt: async (input: Record<string, unknown>, outcome: 'denied' | 'failed') => {
        audits.attempts.push({ input, outcome });
        return { persisted: true };
      },
    }),
    runTransaction: (work: (connection: Sails.Connection) => Promise<unknown>) => work(testConnection),
    ...overrides,
  };
}

function testRegistry(): ReturnType<typeof createScopeRegistry> {
  return createScopeRegistry([
    {
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '1.0.0',
      definitions: [
        { key: asScopeKey('authorization.assignment.manage'), label: 'Manage', description: 'Manage.', risk: 'admin' },
        { key: asScopeKey('authorization.assignment.read'), label: 'Read', description: 'Read.', risk: 'read' },
        { key: asScopeKey('user.account-link.manage'), label: 'Link', description: 'Legacy link.', risk: 'admin' },
        { key: asScopeKey('user.manage'), label: 'User manage', description: 'Legacy user manage.', risk: 'admin' },
      ],
    },
  ]);
}

function brandActor(scopes: readonly string[] = ['authorization.assignment.manage']): Promise<AuthorizationContext> {
  return genuineTestActor({
    contextType: 'brand',
    principal: {
      category: 'authenticated',
      authMethod: 'session',
      active: true,
      userId: 'operator-1',
      username: 'operator',
    },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1' },
    effectiveScopeKeys: scopes,
  });
}

/** Same scopes/brand as `brandActor` but a distinct operator identity. */
function brandActorAs(
  userId: string,
  scopes: readonly string[] = ['authorization.assignment.manage']
): Promise<AuthorizationContext> {
  return genuineTestActor({
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active: true, userId, username: userId },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1' },
    effectiveScopeKeys: scopes,
  });
}

function roleRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'role-1',
    name: 'researcher',
    key: 'researcher',
    displayName: 'Researchers',
    contextType: 'brand',
    branding: 'brand-1',
    protectedKind: 'none',
    status: 'active',
    version: 1,
    ...overrides,
  };
}

function activeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user-1',
    username: 'user-1',
    loginDisabled: false,
    accountLinkState: 'active',
    ...overrides,
  };
}

function stubRoleGlobals(role: Record<string, unknown>, extraRoles: readonly Record<string, unknown>[] = []): void {
  const roles = [role, ...extraRoles];
  Reflect.set(globalThis, 'Role', {
    find: (criteria: Record<string, unknown>) => {
      let filtered = roles;
      if (criteria?.id !== undefined) {
        const ids = new Set(
          (Array.isArray(criteria.id) ? criteria.id : [criteria.id]).map((value: unknown) => String(value))
        );
        filtered = filtered.filter(candidate => ids.has(String(candidate.id)));
      } else if (Array.isArray(criteria?.or)) {
        const wanted = new Set(
          (criteria.or as Record<string, unknown>[]).map(entry => String(entry.key ?? entry.name ?? ''))
        );
        filtered = filtered.filter(
          candidate => wanted.has(String(candidate.key ?? '')) || wanted.has(String(candidate.name ?? ''))
        );
        if (criteria?.branding !== undefined) {
          filtered = filtered.filter(candidate => String(candidate.branding ?? '') === String(criteria.branding));
        }
      }
      return waterlineQuery(filtered);
    },
    findOne: (criteria: Record<string, unknown>) => {
      if (criteria?.key !== undefined || criteria?.name !== undefined) {
        const found = roles.find(
          candidate =>
            String(candidate.key ?? '') === String(criteria.key ?? criteria.name ?? '') ||
            String(candidate.name ?? '') === String(criteria.key ?? criteria.name ?? '')
        );
        return waterlineQuery(found);
      }
      return waterlineQuery(roles[0]);
    },
    updateOne: () => waterlineQuery(undefined),
  });
  Reflect.set(globalThis, 'RoleTemplate', { findOne: () => waterlineQuery(undefined) });
  Reflect.set(globalThis, 'RoleTemplateRevision', { findOne: () => waterlineQuery(undefined) });
  Reflect.set(globalThis, 'RoleScopeOverride', { find: () => ({ sort: () => waterlineQuery([]) }) });
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function stubAtomicLinkGlobals(recordRows: Record<string, unknown> | Record<string, unknown>[]): {
  recordUpdates: { criteria: Record<string, unknown>; values: Record<string, unknown> }[];
  linkCreates: { values: Record<string, unknown> }[];
} {
  const rows = Array.isArray(recordRows) ? recordRows : [recordRows];
  stubRoleGlobals(roleRow());
  const primary = activeUser({ id: 'primary-1', username: 'primary-1' });
  const secondary = activeUser({
    id: 'secondary-1',
    username: 'secondary-1',
    email: 'secondary@example.com',
  });
  Reflect.set(globalThis, 'User', {
    findOne: (criteria: Record<string, unknown>) => {
      const isPrimary = String(criteria?.id) === 'primary-1';
      const target = isPrimary ? primary : secondary;
      return {
        populate: () =>
          waterlineQuery({
            ...target,
            roles: isPrimary ? [{ id: 'role-1', branding: 'brand-1' }] : [],
          }),
        usingConnection: () => waterlineQuery(target),
      };
    },
    find: () => waterlineQuery([]),
    updateOne: () => ({
      set: (values: Record<string, unknown>) => ({
        usingConnection: () => waterlineQuery({ ...secondary, ...values }),
      }),
    }),
    addToCollection: () => ({ members: () => ({ usingConnection: () => waterlineQuery([]) }) }),
    removeFromCollection: () => ({ members: () => ({ usingConnection: () => waterlineQuery([]) }) }),
  });
  const secondaryTuple = {
    id: 'assignment-secondary-1',
    principalType: 'user',
    principalId: 'secondary-1',
    role: 'role-1',
    branding: 'brand-1',
    source: 'manual',
    sourceKey: 'manual',
    status: 'active',
    sourcePresent: true,
    assignedBy: 'operator-1',
    assignedAt: NOW,
    expiresAt: null,
    version: 1,
  };
  let secondaryRevoked = false;
  const adoptedPrimary: Record<string, unknown>[] = [];
  Reflect.set(globalThis, 'RoleAssignment', {
    findOne: () => waterlineQuery(undefined),
    find: (criteria: Record<string, unknown>) => {
      if (String(criteria?.principalId) === 'secondary-1') {
        return waterlineQuery(secondaryRevoked ? [] : [secondaryTuple]);
      }
      if (String(criteria?.principalId) === 'primary-1') return waterlineQuery([...adoptedPrimary]);
      return waterlineQuery([]);
    },
    create: (values: Record<string, unknown>) => {
      adoptedPrimary.push({ id: `adopted-${adoptedPrimary.length + 1}`, ...values });
      return { fetch: () => ({ usingConnection: () => waterlineQuery({ id: 'adopted-1', ...values }) }) };
    },
    updateOne: (criteria: Record<string, unknown>) => ({
      set: (values: Record<string, unknown>) => ({
        usingConnection: () => {
          if (String(criteria?.id) === 'assignment-secondary-1') {
            if (Number(criteria?.version) !== 1) return waterlineQuery(undefined);
            secondaryRevoked = true;
          }
          return waterlineQuery({ ...secondaryTuple, ...values });
        },
      }),
    }),
  });
  const linkCreates: { values: Record<string, unknown> }[] = [];
  Reflect.set(globalThis, 'UserLink', {
    findOne: () => waterlineQuery(undefined),
    find: () => waterlineQuery([]),
    create: (values: Record<string, unknown>) => ({
      usingConnection: () => {
        linkCreates.push({ values: { ...values } });
        return waterlineQuery({ id: 'link-1', ...values });
      },
    }),
  });
  Reflect.set(globalThis, 'UserAudit', { create: () => waterlineQuery({ id: 'legacy-1' }) });
  const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
  roleGlobal.updateOne = () => waterlineQuery(undefined);
  const recordUpdates: { criteria: Record<string, unknown>; values: Record<string, unknown> }[] = [];
  Reflect.set(globalThis, 'Record', {
    find: () => ({ meta: () => ({ limit: () => waterlineQuery([...rows]) }) }),
    updateOne: (criteria: Record<string, unknown>) => ({
      set: (values: Record<string, unknown>) => {
        recordUpdates.push({ criteria: { ...criteria }, values: { ...values } });
        const match = rows.find(row => String(row.redboxOid) === String(criteria?.redboxOid));
        return waterlineQuery(match === undefined ? undefined : { ...match, ...values });
      },
    }),
  });
  Reflect.deleteProperty(globalThis, 'UserLinkOperation');
  return { recordUpdates, linkCreates };
}

function singleRecord(): Record<string, unknown> {
  return {
    redboxOid: 'record-1',
    revision: 7,
    metaMetadata: { brandId: 'brand-1' },
    authorization: { edit: ['secondary-1'], view: [], editPending: [], viewPending: [] },
  };
}

async function completedLinkFixture(): Promise<{
  service: Services.RoleAdministrationService;
  audits: CapturedAudits;
  writes: { recordUpdates: unknown[]; linkCreates: unknown[] };
  operationId: string;
  primaryExpectedVersion: number;
  secondaryExpectedVersion: number;
  linkConfirmationToken: string;
}> {
  const writes = stubAtomicLinkGlobals(singleRecord());
  const audits = capturedAudits();
  const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
  const preview = await service.previewLinkAccounts({
    actor: await brandActor(),
    brandId: 'brand-1',
    primaryUserId: 'primary-1',
    secondaryUserId: 'secondary-1',
    requestId: `proof-preview-${proofNonce}`,
  });
  const linked = await service.linkUserAccounts({
    actor: await brandActor(),
    brandId: 'brand-1',
    primaryUserId: 'primary-1',
    secondaryUserId: 'secondary-1',
    primaryExpectedVersion: preview.primaryExpectedVersion,
    secondaryExpectedVersion: preview.secondaryExpectedVersion,
    linkConfirmationToken: preview.confirmationToken,
    linkOperationId: preview.linkOperationId,
    requestId: `proof-apply-${proofNonce}`,
  });
  assert.equal(linked.data.recordsPending, false);
  assert.equal(linked.changed, true);
  return {
    service,
    audits,
    writes,
    operationId: preview.linkOperationId,
    primaryExpectedVersion: preview.primaryExpectedVersion,
    secondaryExpectedVersion: preview.secondaryExpectedVersion,
    linkConfirmationToken: preview.confirmationToken,
  };
}

function expiredDeps(audits: CapturedAudits): Record<string, unknown> {
  return serviceDependencies(audits, testRegistry(), { now: () => new Date(EXPIRED_NOW) });
}

afterEach(() => {
  for (const name of [
    'Role',
    'RoleAssignment',
    'RoleTemplate',
    'RoleTemplateRevision',
    'RoleScopeOverride',
    'User',
    'UserAudit',
    'UserLink',
    'UserLinkOperation',
    'Record',
    'DeletedRecord',
  ]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('Phase 5 completed-operation proof enforcement (AUTH-P5-009 runtime behavior)', () => {
  it('linkUserAccounts resumes a completed operation without re-executing writes', async () => {
    const fixture = await completedLinkFixture();
    const linkCreatesBefore = fixture.writes.linkCreates.length;
    assert.equal(linkCreatesBefore, 1);
    const resumed = await fixture.service.linkUserAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: fixture.primaryExpectedVersion,
      secondaryExpectedVersion: fixture.secondaryExpectedVersion,
      linkConfirmationToken: fixture.linkConfirmationToken,
      linkOperationId: fixture.operationId,
      requestId: `proof-resume-${proofNonce}`,
    });
    assert.equal(resumed.changed, false);
    assert.equal(resumed.data.linkOperationId, fixture.operationId);
    assert.equal(resumed.data.recordsPending, false);
    assert.equal(fixture.writes.linkCreates.length, linkCreatesBefore);
  });

  it('retryLinkOperation resumes a completed operation without re-executing writes', async () => {
    const fixture = await completedLinkFixture();
    const resumed = await fixture.service.retryLinkOperation({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: fixture.primaryExpectedVersion,
      secondaryExpectedVersion: fixture.secondaryExpectedVersion,
      linkConfirmationToken: fixture.linkConfirmationToken,
      linkOperationId: fixture.operationId,
      requestId: `proof-retry-${proofNonce}`,
    });
    assert.equal(resumed.changed, false);
    assert.equal(resumed.data.linkOperationId, fixture.operationId);
    assert.equal(resumed.data.recordsPending, false);
  });

  it('linkUserAccounts completed resume binds the current caller actor (different operator fails closed)', async () => {
    const fixture = await completedLinkFixture();
    await assert.rejects(
      fixture.service.linkUserAccounts({
        actor: await brandActorAs('operator-2'),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: fixture.primaryExpectedVersion,
        secondaryExpectedVersion: fixture.secondaryExpectedVersion,
        linkConfirmationToken: fixture.linkConfirmationToken,
        linkOperationId: fixture.operationId,
        requestId: `proof-resume-foreign-${proofNonce}`,
      }),
      hasCode('authorization.version-conflict')
    );
  });

  it('retryLinkOperation completed resume binds the current caller actor (different operator fails closed)', async () => {
    const fixture = await completedLinkFixture();
    await assert.rejects(
      fixture.service.retryLinkOperation({
        actor: await brandActorAs('operator-2'),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: fixture.primaryExpectedVersion,
        secondaryExpectedVersion: fixture.secondaryExpectedVersion,
        linkConfirmationToken: fixture.linkConfirmationToken,
        linkOperationId: fixture.operationId,
        requestId: `proof-retry-foreign-${proofNonce}`,
      }),
      hasCode('authorization.version-conflict')
    );
  });

  it('linkUserAccounts completed resume rejects caller version drift (early path binds versions)', async () => {
    const fixture = await completedLinkFixture();
    await assert.rejects(
      fixture.service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: fixture.primaryExpectedVersion + 1,
        secondaryExpectedVersion: fixture.secondaryExpectedVersion,
        linkConfirmationToken: fixture.linkConfirmationToken,
        linkOperationId: fixture.operationId,
        requestId: `proof-resume-drift-${proofNonce}`,
      }),
      hasCode('authorization.version-conflict')
    );
  });

  it('the initial record pass consumes the stored plan and never writes outside it', async () => {
    const planned = singleRecord();
    const lateArrival: Record<string, unknown> = {
      redboxOid: 'record-late',
      revision: 1,
      metaMetadata: { brandId: 'brand-1' },
      authorization: { edit: ['secondary-1'], view: [], editPending: [], viewPending: [] },
    };
    // First Record.find call (Commit 1 plan discovery) sees only the planned
    // row; the second call (Commit 2 rewrite) also sees a late arrival. The
    // authoritative stored plan must win: the late row is never rewritten.
    const writes = stubAtomicLinkGlobals([planned]);
    let findCalls = 0;
    Reflect.set(globalThis, 'Record', {
      find: () => ({
        meta: () => ({
          limit: () => {
            findCalls += 1;
            return waterlineQuery(findCalls === 1 ? [planned] : [planned, lateArrival]);
          },
        }),
      }),
      updateOne: (criteria: Record<string, unknown>) => ({
        set: (values: Record<string, unknown>) => {
          (writes.recordUpdates as { criteria: Record<string, unknown>; values: Record<string, unknown> }[]).push({
            criteria: { ...criteria },
            values: { ...values },
          });
          return waterlineQuery({ ...planned, ...values });
        },
      }),
    });
    const audits = capturedAudits();
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
    const preview = await service.previewLinkAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      requestId: `proof-plan-preview-${proofNonce}`,
    });
    const linked = await service.linkUserAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: preview.primaryExpectedVersion,
      secondaryExpectedVersion: preview.secondaryExpectedVersion,
      linkConfirmationToken: preview.confirmationToken,
      linkOperationId: preview.linkOperationId,
      requestId: `proof-plan-apply-${proofNonce}`,
    });
    assert.equal(linked.data.recordsPending, false);
    assert.equal(linked.data.recordsRewritten, 1);
    assert.ok(
      (writes.recordUpdates as { criteria: Record<string, unknown> }[]).every(
        update => String(update.criteria.redboxOid) !== 'record-late'
      )
    );
  });

  it('linkUserAccounts rejects a tampered confirmation token on the completed path', async () => {
    const fixture = await completedLinkFixture();
    await assert.rejects(
      fixture.service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: fixture.primaryExpectedVersion,
        secondaryExpectedVersion: fixture.secondaryExpectedVersion,
        linkConfirmationToken: `${fixture.linkConfirmationToken}tampered`,
        linkOperationId: fixture.operationId,
        requestId: `proof-tamper-${proofNonce}`,
      }),
      hasCode('authorization.preview-stale')
    );
  });

  it('retryLinkOperation rejects a tampered confirmation token on the completed path', async () => {
    const fixture = await completedLinkFixture();
    await assert.rejects(
      fixture.service.retryLinkOperation({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: fixture.primaryExpectedVersion,
        secondaryExpectedVersion: fixture.secondaryExpectedVersion,
        linkConfirmationToken: `${fixture.linkConfirmationToken}tampered`,
        linkOperationId: fixture.operationId,
        requestId: `proof-retry-tamper-${proofNonce}`,
      }),
      hasCode('authorization.preview-stale')
    );
  });

  it('both completed paths surface the deliberate expired-token error', async () => {
    const fixture = await completedLinkFixture();
    const expiredAudits = capturedAudits();
    const expiredService = new Services.RoleAdministrationService(expiredDeps(expiredAudits) as never);
    const resumeArgs = {
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: fixture.primaryExpectedVersion,
      secondaryExpectedVersion: fixture.secondaryExpectedVersion,
      linkConfirmationToken: fixture.linkConfirmationToken,
      linkOperationId: fixture.operationId,
    } as const;
    const linkError = await expiredService
      .linkUserAccounts({ ...resumeArgs, requestId: `proof-expired-link-${proofNonce}` })
      .then(
        () => undefined,
        (error: unknown) => error
      );
    assert.ok(hasCode('authorization.preview-stale')(linkError));
    assert.match(String((linkError as Error)?.message ?? ''), /expired|preview/i);
    const retryError = await expiredService
      .retryLinkOperation({ ...resumeArgs, requestId: `proof-expired-retry-${proofNonce}` })
      .then(
        () => undefined,
        (error: unknown) => error
      );
    assert.ok(hasCode('authorization.preview-stale')(retryError));
    assert.match(String((retryError as Error)?.message ?? ''), /expired|preview/i);
  });

  it('completed paths reject a missing token and version drift instead of bypassing', async () => {
    const fixture = await completedLinkFixture();
    await assert.rejects(
      fixture.service.linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: fixture.primaryExpectedVersion,
        secondaryExpectedVersion: fixture.secondaryExpectedVersion,
        linkOperationId: fixture.operationId,
        requestId: `proof-missing-token-${proofNonce}`,
      }),
      hasCode('authorization.preview-stale')
    );
    await assert.rejects(
      fixture.service.retryLinkOperation({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: 999,
        secondaryExpectedVersion: fixture.secondaryExpectedVersion,
        linkConfirmationToken: fixture.linkConfirmationToken,
        linkOperationId: fixture.operationId,
        requestId: `proof-drift-${proofNonce}`,
      }),
      hasCode('authorization.version-conflict')
    );
  });

  it('a brand+pair-only re-link does not return the completed result', async () => {
    const fixture = await completedLinkFixture();
    // Same brand+pair but no proof (no versions, token, or operation ID):
    // the writer must fail closed on the mandatory DTO, never return the
    // stored completed result via a brand+pair shortcut.
    const error = await fixture.service
      .linkUserAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: `proof-pair-only-${proofNonce}`,
      })
      .then(
        () => undefined,
        (caught: unknown) => caught
      );
    assert.ok(
      hasCode('authorization.preview-stale')(error) || hasCode('authorization.version-conflict')(error),
      `brand+pair-only re-link must fail closed, got ${String(error)}`
    );
  });

  it('retry of an unknown operation is 404 and does not fabricate proof', async () => {
    stubAtomicLinkGlobals(singleRecord());
    const audits = capturedAudits();
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
    await assert.rejects(
      service.retryLinkOperation({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: 1,
        secondaryExpectedVersion: 1,
        linkConfirmationToken: 'token',
        linkOperationId: `missing-${proofNonce}`,
        requestId: `proof-missing-${proofNonce}`,
      }),
      hasCode('authorization.not-found')
    );
  });

  it('an incomplete durable completed row fails closed on both completed paths', async () => {
    stubAtomicLinkGlobals(singleRecord());
    const store = new Map<string, Record<string, unknown>>();
    const audits = capturedAudits();
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
    const preview = await service.previewLinkAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      requestId: `proof-incomplete-preview-${proofNonce}`,
    });
    await service.linkUserAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: preview.primaryExpectedVersion,
      secondaryExpectedVersion: preview.secondaryExpectedVersion,
      linkConfirmationToken: preview.confirmationToken,
      linkOperationId: preview.linkOperationId,
      requestId: `proof-incomplete-apply-${proofNonce}`,
    });
    const durable = {
      findOne: (criteria: Record<string, unknown>) => {
        const row = store.get(String(criteria?.operationId));
        if (row === undefined) {
          const incomplete = {
            operationId: preview.linkOperationId,
            brandId: 'brand-1',
            primaryUserId: 'primary-1',
            secondaryUserId: 'secondary-1',
            primaryUsername: 'primary-1',
            secondaryUsername: 'secondary-1',
            secondaryEmail: 'secondary@example.com',
            status: 'completed',
            recordsPending: false,
            recordsRewritten: 1,
            rolesAdopted: 1,
            rolesRetired: 1,
            attemptCount: 1,
            recordOids: ['record-1'],
            recordsCompletedOids: ['record-1'],
            primaryExpectedVersion: preview.primaryExpectedVersion,
            secondaryExpectedVersion: preview.secondaryExpectedVersion,
          };
          return waterlineQuery(incomplete);
        }
        return waterlineQuery(row);
      },
      create: (values: Record<string, unknown>) => {
        store.set(String(values.operationId), { ...values });
        return waterlineQuery({ ...values });
      },
      updateOne: () => ({ set: () => waterlineQuery(undefined) }),
      find: () => ({ limit: () => waterlineQuery([]) }),
    };
    Reflect.set(globalThis, 'UserLinkOperation', durable);
    const args = {
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: preview.primaryExpectedVersion,
      secondaryExpectedVersion: preview.secondaryExpectedVersion,
      linkConfirmationToken: preview.confirmationToken,
      linkOperationId: preview.linkOperationId,
    } as const;
    await assert.rejects(
      service.linkUserAccounts({ ...args, requestId: `proof-incomplete-link-${proofNonce}` }),
      hasCode('authorization.version-conflict')
    );
    await assert.rejects(
      service.retryLinkOperation({ ...args, requestId: `proof-incomplete-retry-${proofNonce}` }),
      hasCode('authorization.version-conflict')
    );
  });

  it('durable read failures fail closed with 503 and never fall back to memory', async () => {
    stubAtomicLinkGlobals(singleRecord());
    Reflect.set(globalThis, 'UserLinkOperation', {
      findOne: () => {
        throw new Error('durable outage');
      },
      create: () => waterlineQuery({}),
      updateOne: () => ({ set: () => waterlineQuery({}) }),
      find: () => ({ limit: () => waterlineQuery([]) }),
    });
    const audits = capturedAudits();
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
    await assert.rejects(
      service.retryLinkOperation({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: 1,
        secondaryExpectedVersion: 1,
        linkConfirmationToken: 'token',
        linkOperationId: `outage-${proofNonce}`,
        requestId: `proof-outage-${proofNonce}`,
      }),
      hasCode('authorization.audit-unavailable')
    );
  });

  it('a durable miss is authoritative absence even when memory holds the operation', async () => {
    const fixture = await completedLinkFixture();
    Reflect.set(globalThis, 'UserLinkOperation', {
      findOne: () => waterlineQuery(undefined),
      create: () => waterlineQuery({}),
      updateOne: () => ({ set: () => waterlineQuery({}) }),
      find: () => ({ limit: () => waterlineQuery([]) }),
    });
    await assert.rejects(
      fixture.service.retryLinkOperation({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: fixture.primaryExpectedVersion,
        secondaryExpectedVersion: fixture.secondaryExpectedVersion,
        linkConfirmationToken: fixture.linkConfirmationToken,
        linkOperationId: fixture.operationId,
        requestId: `proof-authoritative-miss-${proofNonce}`,
      }),
      hasCode('authorization.not-found')
    );
  });

  it('status+attempt CAS conflicts fail closed instead of overwriting', async () => {
    stubAtomicLinkGlobals(singleRecord());
    const stored: Record<string, unknown> = {
      operationId: `cas-${proofNonce}`,
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryUsername: 'primary-1',
      secondaryUsername: 'secondary-1',
      secondaryEmail: 'secondary@example.com',
      status: 'pending',
      recordsPending: true,
      recordsRewritten: 0,
      rolesAdopted: 0,
      rolesRetired: 0,
      attemptCount: 1,
      recordOids: [],
      recordsCompletedOids: [],
    };
    Reflect.set(globalThis, 'UserLinkOperation', {
      findOne: () => waterlineQuery({ ...stored }),
      create: () => waterlineQuery({}),
      updateOne: () => ({ set: () => waterlineQuery(undefined) }),
      find: () => ({ limit: () => waterlineQuery([]) }),
    });
    const audits = capturedAudits();
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
    const preview = await service.previewLinkAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      requestId: `proof-cas-preview-${proofNonce}`,
    });
    void preview;
    const recordGlobal = Reflect.get(globalThis, 'Record') as Record<string, unknown>;
    recordGlobal.find = () => ({ meta: () => ({ limit: () => waterlineQuery([]) }) });
    await assert.rejects(
      service.retryLinkOperation({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        primaryExpectedVersion: 1,
        secondaryExpectedVersion: 1,
        linkConfirmationToken: 'token',
        linkOperationId: `cas-${proofNonce}`,
        requestId: `proof-cas-${proofNonce}`,
      }),
      hasCode('authorization.version-conflict')
    );
  });

  it('partial per-record progress is durable and unions across retries', async () => {
    const recordA = {
      redboxOid: 'record-1',
      revision: 7,
      metaMetadata: { brandId: 'brand-1' },
      authorization: { edit: ['secondary-1'], view: [], editPending: [], viewPending: [] },
    };
    const recordB = {
      redboxOid: 'record-2',
      revision: 3,
      metaMetadata: { brandId: 'brand-1' },
      authorization: { edit: ['secondary-1'], view: [], editPending: [], viewPending: [] },
    };
    stubAtomicLinkGlobals([recordA, recordB]);
    const recordGlobal = Reflect.get(globalThis, 'Record') as Record<string, unknown>;
    const realUpdateOne = recordGlobal.updateOne as (criteria: Record<string, unknown>) => unknown;
    let failSecond = true;
    recordGlobal.updateOne = (criteria: Record<string, unknown>) => ({
      set: (values: Record<string, unknown>) => {
        if (failSecond && String(criteria?.redboxOid) === 'record-2') {
          throw new Error('record-2 outage');
        }
        return (realUpdateOne(criteria) as { set: (values: Record<string, unknown>) => unknown }).set(values);
      },
    });
    const audits = capturedAudits();
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
    const preview = await service.previewLinkAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      requestId: `proof-partial-preview-${proofNonce}`,
    });
    const partial = await service.linkUserAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: preview.primaryExpectedVersion,
      secondaryExpectedVersion: preview.secondaryExpectedVersion,
      linkConfirmationToken: preview.confirmationToken,
      linkOperationId: preview.linkOperationId,
      requestId: `proof-partial-apply-${proofNonce}`,
    });
    assert.equal(partial.data.recordsPending, true);
    const pendingState = await service.getLinkOperation(await brandActor(), 'brand-1', preview.linkOperationId);
    assert.ok(pendingState.recordsCompletedOids.includes('record-1'));
    failSecond = false;
    const resumed = await service.retryLinkOperation({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: preview.primaryExpectedVersion,
      secondaryExpectedVersion: preview.secondaryExpectedVersion,
      linkConfirmationToken: preview.confirmationToken,
      linkOperationId: preview.linkOperationId,
      requestId: `proof-partial-retry-${proofNonce}`,
    });
    assert.equal(resumed.data.recordsPending, false);
    assert.equal(resumed.data.recordsRewritten, 2);
    const completedState = await service.getLinkOperation(await brandActor(), 'brand-1', preview.linkOperationId);
    assert.ok(completedState.recordsCompletedOids.includes('record-1'));
    assert.ok(completedState.recordsCompletedOids.includes('record-2'));
  });

  it('all-brand authority rejects foreign-brand tuples at preview', async () => {
    stubAtomicLinkGlobals(singleRecord());
    stubRoleGlobals(roleRow(), [
      roleRow({ id: 'role-foreign', key: 'foreign-role', name: 'foreign-role', branding: 'brand-2' }),
    ]);
    const assignmentGlobal = Reflect.get(globalThis, 'RoleAssignment') as Record<string, unknown>;
    const baseFind = assignmentGlobal.find as (criteria: Record<string, unknown>) => unknown;
    assignmentGlobal.find = (criteria: Record<string, unknown>) => {
      if (String(criteria?.principalId) === 'secondary-1') {
        return waterlineQuery([
          {
            id: 'assignment-secondary-1',
            principalType: 'user',
            principalId: 'secondary-1',
            role: 'role-1',
            branding: 'brand-1',
            source: 'manual',
            sourceKey: 'manual',
            status: 'active',
            sourcePresent: true,
            assignedBy: 'operator-1',
            assignedAt: NOW,
            expiresAt: null,
            version: 1,
          },
          {
            id: 'assignment-secondary-foreign',
            principalType: 'user',
            principalId: 'secondary-1',
            role: 'role-foreign',
            branding: 'brand-2',
            source: 'manual',
            sourceKey: 'manual',
            status: 'active',
            sourcePresent: true,
            assignedBy: 'operator-1',
            assignedAt: NOW,
            expiresAt: null,
            version: 1,
          },
        ]);
      }
      return baseFind(criteria);
    };
    const audits = capturedAudits();
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
    await assert.rejects(
      service.previewLinkAccounts({
        actor: await brandActor(),
        brandId: 'brand-1',
        primaryUserId: 'primary-1',
        secondaryUserId: 'secondary-1',
        requestId: `proof-foreign-${proofNonce}`,
      }),
      hasCode('authorization.not-found')
    );
    assert.equal(audits.succeeded.length, 0);
  });

  it('preview/get/retry round trip exposes the stored proof and converges', async () => {
    stubAtomicLinkGlobals(singleRecord());
    const audits = capturedAudits();
    const service = new Services.RoleAdministrationService(serviceDependencies(audits, testRegistry()) as never);
    const preview = await service.previewLinkAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      requestId: `proof-roundtrip-preview-${proofNonce}`,
    });
    assert.ok(preview.confirmationToken.length > 0);
    assert.ok(preview.linkOperationId.length > 0);
    const linked = await service.linkUserAccounts({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: preview.primaryExpectedVersion,
      secondaryExpectedVersion: preview.secondaryExpectedVersion,
      linkConfirmationToken: preview.confirmationToken,
      linkOperationId: preview.linkOperationId,
      requestId: `proof-roundtrip-apply-${proofNonce}`,
    });
    assert.equal(linked.data.linkOperationId, preview.linkOperationId);
    const stored = await service.getLinkOperation(await brandActor(), 'brand-1', preview.linkOperationId);
    assert.equal(stored.operationId, preview.linkOperationId);
    assert.equal(stored.brandId, 'brand-1');
    assert.equal(stored.primaryUserId, 'primary-1');
    assert.equal(stored.secondaryUserId, 'secondary-1');
    assert.equal(stored.status, 'completed');
    assert.equal(stored.recordsPending, false);
    assert.ok(stored.proofHash !== undefined && stored.proofHash.length > 0);
    assert.ok(Array.isArray(stored.assignmentSnapshot));
    assert.equal(stored.primaryExpectedVersion, preview.primaryExpectedVersion);
    assert.equal(stored.secondaryExpectedVersion, preview.secondaryExpectedVersion);
    assert.ok(stored.proofActorId !== undefined && stored.proofActorId.length > 0);
    const retried = await service.retryLinkOperation({
      actor: await brandActor(),
      brandId: 'brand-1',
      primaryUserId: 'primary-1',
      secondaryUserId: 'secondary-1',
      primaryExpectedVersion: preview.primaryExpectedVersion,
      secondaryExpectedVersion: preview.secondaryExpectedVersion,
      linkConfirmationToken: preview.confirmationToken,
      linkOperationId: preview.linkOperationId,
      requestId: `proof-roundtrip-retry-${proofNonce}`,
    });
    assert.equal(retried.changed, false);
    assert.equal(retried.data.linkOperationId, preview.linkOperationId);
  });
});

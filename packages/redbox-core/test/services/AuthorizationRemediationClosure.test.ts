import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { createScopeRegistry, createShadowFingerprint } from '../../src/authorization';
import { Services, persistShadowMismatch } from '../../src/services/AuthorizationRolloutService';
import {
  createAuthorizationAuditEvent,
  type AuthorizationAuditEventInput,
} from '../../src/services/AuthorizationAuditService';
import { validateRemediationEvidence } from '../../src/authorization/shadow-remediation';

const { match } = require('@sailshq/nedb/lib/model') as { match(row: object, filter: object): boolean };
const registry = createScopeRegistry([]);
const observation = {
  routeId: 'GET /records',
  principalCategory: 'authenticated' as const,
  legacyAllowed: true,
  decision: { allowed: false, reasonCode: 'scope-missing' as const },
  requestId: 'request',
};
const fingerprint = createShadowFingerprint(observation);
const evidence = {
  fingerprint,
  observedCount: 3,
  lastSeenAt: '2026-01-01T00:00:00.000Z',
  buildVersion: 'verified-build',
  registryGeneration: registry.generation,
  repairReference: 'change:repair-123',
  verificationReference: 'artifact:regression-and-shadow-123',
  startedAt: '2026-01-02T00:00:00.000Z',
  completedAt: '2026-01-03T00:00:00.000Z',
  result: 'passed',
};

describe('audited remediation closure', () => {
  let saved: PropertyDescriptor | undefined;
  let row: Record<string, unknown>;
  let audits: AuthorizationAuditEventInput[];
  let failAudit: boolean;
  let race: boolean;
  let service: Services.AuthorizationRolloutService;
  beforeEach(() => {
    saved = Object.getOwnPropertyDescriptor(globalThis, 'AuthorizationShadowMismatch');
    row = {
      fingerprint,
      routeId: observation.routeId,
      resolutionClassification: 'mapping-defect',
      resolvedAt: null,
      resolutionReason: 'original defect triage',
      resolvedBy: 'triager',
      count: 3,
      firstSeenAt: '2025-12-01T00:00:00.000Z',
      lastSeenAt: evidence.lastSeenAt,
    };
    audits = [];
    failAudit = false;
    race = false;
    const collection = {
      deleteMany: async () => {
        throw new Error('Defect history must not be deleted');
      },
      find: (filter: object) => ({
        limit: (limit: number) => ({ toArray: async () => (match(row, filter) ? [{ ...row }].slice(0, limit) : []) }),
      }),
      updateOne: async (filter: object, update: { $set?: object; $unset?: object; $inc?: { count: number } }) => {
        if (race) {
          row.count = Number(row.count) + 1;
          race = false;
        }
        if (!match(row, filter)) return { matchedCount: 0 };
        Object.assign(row, update.$set);
        for (const field of Object.keys(update.$unset ?? {})) delete row[field];
        if (update.$inc) row.count = Number(row.count) + update.$inc.count;
        return { matchedCount: 1 };
      },
    };
    const connection = { collection: () => collection } as unknown as Sails.Connection;
    Reflect.set(globalThis, 'AuthorizationShadowMismatch', {
      tableName: 'mismatches',
      getDatastore: () => ({ manager: connection }),
    });
    service = new Services.AuthorizationRolloutService({
      getBuildVersion: () => 'verified-build',
      getRegistry: () => registry,
      runAtomic: async work => {
        const before = structuredClone(row);
        try {
          return await work(connection);
        } catch (error) {
          row = before;
          throw error;
        }
      },
      appendAuditEvent: async (input, outcome, auditConnection) => {
        assert.equal(outcome, 'succeeded');
        assert.equal(auditConnection, connection);
        if (failAudit) throw new Error('audit unavailable');
        audits.push(input);
      },
    });
  });
  afterEach(() => {
    if (saved) Object.defineProperty(globalThis, 'AuthorizationShadowMismatch', saved);
    else Reflect.deleteProperty(globalThis, 'AuthorizationShadowMismatch');
  });
  const input = () => ({ remediatedBy: 'operator', reason: 'repaired and verified', evidence });

  it('closes a verified repair separately from approval while retaining triage and observation history', async () => {
    const before = { ...row };
    const result = await service.closeRemediatedShadowMismatch(input());
    assert.match(result.remediationEvidenceFingerprint, /^[a-f0-9]{64}$/u);
    for (const [key, value] of Object.entries(before)) assert.deepEqual(row[key], value);
    assert.equal(row.remediationStatus, 'verified');
    assert.deepEqual((await service.listUnresolvedShadowMismatches()).items, []);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].eventType, 'shadow.mismatch-remediated');
    assert.equal(audits[0].actorType, 'operator');
    assert.equal(audits[0].actorId, 'operator');
    const persistedAudit = createAuthorizationAuditEvent(audits[0], 'succeeded');
    assert.deepEqual(
      persistedAudit.after,
      audits[0].after,
      'full bounded verification evidence survives production audit normalization'
    );
    assert.deepEqual((audits[0].after as Record<string, unknown>).evidence, evidence);
    await assert.rejects(service.closeRemediatedShadowMismatch(input()), /already closed/);
    assert.equal(audits.length, 1);
  });

  it('retains closed defect aggregates and appends the zero-deletion retention audit', async () => {
    await service.closeRemediatedShadowMismatch(input());
    const before = { ...row };
    assert.deepEqual(
      await service.retainResolvedShadowMismatches({ olderThanDays: 1, retainedBy: 'op', reason: 'retention' }),
      { deleted: 0, truncated: false }
    );
    assert.deepEqual(row, before);
    assert.equal(audits[1].eventType, 'shadow.retention.completed');
  });

  it('rolls back closure if the same-transaction audit fails', async () => {
    failAudit = true;
    const before = { ...row };
    await assert.rejects(service.closeRemediatedShadowMismatch(input()), /audit unavailable/);
    assert.deepEqual(row, before);
    assert.equal((await service.listUnresolvedShadowMismatches()).items.length, 1);
  });

  it('rejects stale observations and recurrence racing verification', async () => {
    row.count = 4;
    await assert.rejects(service.closeRemediatedShadowMismatch(input()), /observation changed/);
    row.count = 3;
    row.lastSeenAt = '2026-01-01T01:00:00.000Z';
    await assert.rejects(service.closeRemediatedShadowMismatch(input()), /observation changed/);
    row.lastSeenAt = evidence.lastSeenAt;
    race = true;
    await assert.rejects(service.closeRemediatedShadowMismatch(input()), /observation changed/);
    assert.equal(audits.length, 0);
  });

  it('reopens remediation on recurrence, preserves audit evidence, and requires new triage and verification', async () => {
    await service.closeRemediatedShadowMismatch(input());
    const originalAudit = structuredClone(audits[0]);
    await persistShadowMismatch(observation, new Date('2026-01-04T00:00:00.000Z'));
    assert.equal(row.count, 4);
    assert.equal(row.firstSeenAt, '2025-12-01T00:00:00.000Z');
    for (const field of ['remediationStatus', 'remediationEvidenceFingerprint', 'remediationVerifiedAt'])
      assert.equal(Object.hasOwn(row, field), false);
    assert.equal((await service.listUnresolvedShadowMismatches()).items.length, 1);
    assert.deepEqual(audits[0], originalAudit);
    await assert.rejects(service.closeRemediatedShadowMismatch(input()), /classified defect/);
    await service.acknowledgeShadowMismatch({
      fingerprint,
      acknowledgedBy: 'triager',
      reason: 'recurring defect',
      classification: 'mapping-defect',
    });
    await assert.rejects(service.closeRemediatedShadowMismatch(input()), /observation changed/);
  });

  for (const classification of [undefined, 'unknown', 'approved-legacy-security-bug', 'intentional-product-change']) {
    it(`rejects closure without a classified defect (${classification})`, async () => {
      row.resolutionClassification = classification;
      await assert.rejects(service.closeRemediatedShadowMismatch(input()), /classified defect/);
      assert.equal(audits.length, 0);
    });
  }
  for (const patch of [
    { result: 'failed' },
    { result: 'unverified' },
    { observedCount: 0 },
    { observedCount: 1.2 },
    { startedAt: evidence.lastSeenAt },
    { completedAt: '2999-01-01T00:00:00.000Z' },
    { verificationReference: '' },
    { repairReference: '' },
    { buildVersion: 'other-build' },
    { registryGeneration: 'other-registry' },
    { extra: 'unknown' },
  ]) {
    it(`keeps unverified evidence blocking (${JSON.stringify(patch)})`, async () => {
      await assert.rejects(service.closeRemediatedShadowMismatch({ ...input(), evidence: { ...evidence, ...patch } }));
      assert.equal((await service.listUnresolvedShadowMismatches()).items.length, 1);
      assert.equal(audits.length, 0);
    });
  }
  it('rejects unsafe operator and evidence text before mutation', async () => {
    await assert.rejects(service.closeRemediatedShadowMismatch({ ...input(), remediatedBy: 'operator\nforged' }));
    assert.throws(() =>
      validateRemediationEvidence({ ...evidence, verificationReference: 'Bearer secret-token' }, new Date())
    );
    assert.equal(audits.length, 0);
  });
});

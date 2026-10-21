import assert from 'node:assert/strict';
import { currentPublicationCompletion } from '../../../src/services/publication/workflow';
import { publicationOperationEvidence } from '../../../src/services/publication/operations';
import {
  publicationLiveSummaries,
  publicationOperationalSignals,
  publicationStatusLabels,
} from '../../../src/services/publication/status';
import { statusFixture } from '../../fixtures/publication/status';
import { Services } from '../../../src/services/IntegrationAuditService';
import { IntegrationAuditParams } from '../../../src/IntegrationAuditParams';
import type { StorageService } from '../../../src/StorageService';

describe('Destination status and safe operational signals (PUB-13)', () => {
  for (const consumer of ['status', 'workflow'] as const)
    it(`excludes a confirmed checkpoint gap from current ${consumer} completion`, () => {
      const { state, config, row } = statusFixture();
      state.intents.main.pending = false;
      const current = row();
      current.operations.push({
        id: 'deposit',
        kind: 'deposit',
        approvalId: 'approval',
        approvalEpoch: 1,
        sourceGeneration: 1,
        intendedDigest: 'desired',
        submittedAt: '2026-10-19T00:00:00Z',
        outcome: 'confirmed',
        evidence: { receipt: 'remote' },
      });
      const proof = publicationOperationEvidence(current, current.operations[0], current.binding);
      current.operations[0].confirmation = proof;
      assert.ok(current.completion);
      current.completion.operations = [proof];
      const record = { publicationSource: state };
      if (consumer === 'workflow') {
        assert.equal(currentPublicationCompletion(record, current), false);
        current.operations[0].checkpointed = true;
        assert.equal(currentPublicationCompletion(record, current), true);
      } else {
        const pending = publicationLiveSummaries(state, [current], config, { destinationId: 'main' })[0];
        assert.equal(pending.status, 'pending');
        assert.equal(pending.completion?.current, false);
        current.operations[0].checkpointed = true;
        assert.equal(
          publicationLiveSummaries(state, [current], config, { destinationId: 'main' })[0].status,
          'success'
        );
      }
    });
  it('shows separate same-provider destinations before any work or audit row exists', () => {
    const { state, config } = statusFixture();
    const result = publicationLiveSummaries(state, [], config, { integrationName: 'FIGSHARE' });
    assert.deepEqual(
      result.map(item => [item.destinationId, item.workStatus, item.waitingReason]),
      [
        ['main', 'queued', 'source_import_pending'],
        ['second', 'queued', 'source_import_pending'],
      ]
    );
    assert.equal(result[0].sourceRevision, 1);
    assert.equal(result[0].approvalId, 'approval');
  });
  it('retains destination labels under invalid execution configuration without copying secrets', () => {
    const { state, config } = statusFixture();
    const labels = publicationStatusLabels({ ...config, processing: { enabled: 'invalid', token: 'secret' } });
    const result = publicationLiveSummaries(state, [], labels, {
      configurationErrors: { main: 'configuration_unavailable' },
    });
    assert.equal(result[0].displayName, 'Destination main');
    assert.equal(result[0].waitingReason, 'configuration_unavailable');
    assert.ok(!JSON.stringify(labels).includes('secret'));
    assert.equal(
      publicationOperationalSignals(state, [], result, Date.parse('2026-10-19T00:02:00Z')).sourceLagMs,
      120000
    );
  });
  it('selects a destination with the provider filter and never synthesises an unknown destination', () => {
    const { state, config, row } = statusFixture();
    assert.deepEqual(
      publicationLiveSummaries(state, [row()], config, { destinationId: 'second' }).map(item => item.destinationId),
      ['second']
    );
    assert.deepEqual(
      publicationLiveSummaries(state, [], config, { destinationId: 'second', integrationName: 'oni' }),
      []
    );
    assert.deepEqual(publicationLiveSummaries(state, [], config, { destinationId: 'missing' }), []);
  });
  it('overlays newer ready source work on historical success without claiming current completion', () => {
    const { state, config, row } = statusFixture();
    const previous = row();
    state.revision = 2;
    state.approvals[0].sourceRevision = 2;
    state.intents.main = { ...state.intents.main, generation: 2, sourceRevision: 2 };
    state.saves[0].intents[0] = state.intents.main;
    const result = publicationLiveSummaries(state, [previous], config, { destinationId: 'main' })[0];
    assert.equal(result.workStatus, 'queued');
    assert.equal(result.status, 'pending');
    assert.equal(result.sourceRevision, 2);
    assert.equal(result.completion?.current, false);
    assert.equal(result.completedAt, undefined);
    assert.equal(result.links.public, 'https://repository.example/item');
  });
  it('distinguishes confirmed deposit, ingestion, embargo, accessibility and unverified object visibility', () => {
    const { state, config, row } = statusFixture();
    const result = publicationLiveSummaries(state, [row('oni')], config, { destinationId: 'oni' })[0];
    assert.equal(result.status, 'success');
    assert.deepEqual(result.completion, {
      current: true,
      approvalId: 'approval',
      approvalEpoch: 1,
      sourceGeneration: 1,
      confirmedAt: '2026-10-19T00:01:00Z',
      deposit: 'confirmed',
      publication: 'unverified',
      ingestion: 'confirmed',
      visibility: 'unverified',
      accessible: false,
      embargoed: true,
    });
  });
  it('reports checkpointed deposit separately from incomplete ingestion and preserves the visibility boundary', () => {
    const { state, config, row } = statusFixture();
    const current = row('oni');
    current.status = 'waiting';
    delete current.completion;
    const observation = {
      deposit: 'confirmed' as const,
      publication: 'unverified' as const,
      ingestion: 'pending' as const,
      visibility: 'unverified' as const,
      payload: 'secret-payload',
      token: 'secret-token',
    };
    const result = publicationLiveSummaries(state, [current], config, {
      destinationId: 'oni',
      observations: { oni: observation },
    })[0];
    assert.equal(result.status, 'pending');
    assert.deepEqual(result.observation, {
      current: true,
      deposit: 'confirmed',
      publication: 'unverified',
      ingestion: 'pending',
      visibility: 'unverified',
    });
    assert.ok(!JSON.stringify(result).includes('secret'));
    const stale = publicationLiveSummaries(state, [row()], config, {
      destinationId: 'main',
      configurationErrors: { main: 'material_configuration_changed' },
    })[0];
    assert.equal(stale.status, 'failed');
    assert.equal(stale.completion?.current, false);
  });
  it('does not infer completion from a URL, a row status, a mismatched binding or another approval', () => {
    for (const corrupt of ['evidence', 'binding', 'approval'] as const) {
      const { state, config, row } = statusFixture();
      const current = row();
      if (corrupt === 'evidence') delete current.completion;
      if (corrupt === 'binding') current.binding!.objectId = 'other';
      if (corrupt === 'approval') current.completion!.approvalEpoch++;
      const result = publicationLiveSummaries(state, [current], config, { destinationId: 'main' })[0];
      assert.equal(result.status, 'pending');
      assert.equal(result.waitingReason, 'completion_unverified');
    }
  });
  it('shows initialising, abandoned and quarantined saves without treating them as ready', () => {
    for (const [outcome, expected] of [
      ['initialising', 'waiting'],
      ['abandoned', 'revoked'],
      ['quarantined', 'repair_required'],
    ] as const) {
      const { state, config } = statusFixture();
      state.saves[0].outcome = outcome;
      assert.equal(publicationLiveSummaries(state, [], config)[0].workStatus, expected);
    }
  });
  it('retains disabled/archived obligations, independent preparation failures and explicit revocation', () => {
    const { state, config } = statusFixture();
    config.destinations.main.enabled = false;
    config.destinations.main.archived = true;
    state.preparationFailures = [
      {
        destinationId: 'second',
        policyId: 'policy',
        sourceRevision: 1,
        code: 'mapping_invalid',
        recordedAt: '2026-10-19T00:00:00Z',
      },
    ];
    assert.deepEqual(
      publicationLiveSummaries(state, [], config).map(item => [item.destinationId, item.workStatus]),
      [
        ['main', 'paused'],
        ['oni', 'queued'],
        ['second', 'failed'],
      ]
    );
    state.approvals[0].revokedAt = '2026-10-19T00:01:00Z';
    assert.equal(publicationLiveSummaries(state, [], config)[0].workStatus, 'revoked');
  });
  it('fails closed for missing configuration and does not display provider error text, snapshots, payloads or signed URLs', () => {
    const { state, config, row } = statusFixture();
    const current = row();
    current.waitingReason = 'secret-credential in a provider response';
    current.status = 'repair_required';
    const result = publicationLiveSummaries(state, [current], config);
    const serialized = JSON.stringify(result);
    for (const text of [
      'secret-',
      'private-',
      'payload',
      'requester',
      'approver',
      'lease',
      'operations',
      'providerState',
    ])
      assert.ok(!serialized.includes(text), text);
    assert.equal(publicationLiveSummaries(state, [current], undefined)[0].waitingReason, 'configuration_unavailable');
  });
  it('reports record-scoped lag, leases, waits, retries, repairs and save quarantine; migration is explicitly unknown', () => {
    const { state, config, row } = statusFixture();
    const waiting = row('oni');
    waiting.status = 'waiting';
    waiting.waitingReason = 'repository_indexing';
    const retry = row('second');
    retry.status = 'retrying';
    retry.nextActionAt = Date.parse('2026-10-19T00:00:30Z');
    retry.lease = { owner: 'secret-owner', token: 'secret-token', expiresAt: Date.parse('2026-10-19T00:03:00Z') };
    state.saves.push({ ...state.saves[0], outcome: 'quarantined' });
    const now = Date.parse('2026-10-19T00:02:00Z');
    const summaries = publicationLiveSummaries(state, [waiting, retry], config);
    const signals = publicationOperationalSignals(state, [waiting, retry], summaries, now);
    assert.equal(signals.sourceLagMs, 120000);
    assert.equal(signals.oldestPendingAgeMs, 120000);
    assert.equal(signals.activeLeases, 1);
    assert.equal(signals.waiting, 1);
    assert.equal(signals.retrying, 1);
    assert.equal(signals.waitingReasons.repository_indexing, 1);
    assert.equal(signals.quarantinedSaves, 1);
    assert.equal(signals.migrationQuarantineCount, null);
    assert.ok(!JSON.stringify(signals).includes('secret'));
  });
  it('keeps destination audits distinct, preserves legacy/non-publication summaries and filters brand history', async () => {
    const service = new Services.IntegrationAuditService();
    const audits = [
      { integrationName: 'doi', traceId: 'doi', startedAt: '2026-10-19T00:00:00Z', spanId: 's', status: 'success' },
      {
        brandId: 'brand',
        integrationName: 'doi',
        traceId: 'doi',
        parentSpanId: 's',
        spanId: 'doi-child',
        startedAt: '2026-10-19T00:00:01Z',
        status: 'success',
      },
      ...['main', 'second'].flatMap(destinationId =>
        ['started', 'success'].map(status => ({
          brandId: 'brand',
          destinationId,
          providerId: 'figshare',
          approvalId: 'approval',
          sourceRevision: 1,
          sourceGeneration: 1,
          integrationName: 'figshare',
          traceId: 'same-trace',
          startedAt: '2026-10-19T00:01:00Z',
          spanId: 's',
          status,
          operationId: status === 'success' ? `operation-${destinationId}` : undefined,
        }))
      ),
      {
        brandId: 'other',
        destinationId: 'foreign',
        integrationName: 'figshare',
        traceId: 'foreign',
        startedAt: '2026-10-19T00:02:00Z',
        spanId: 's',
        status: 'failed',
      },
    ];
    const storage: Partial<StorageService> = {
      getIntegrationAudit: async () => audits,
      countIntegrationAudit: async () => audits.length,
    };
    service.storageService = storage as StorageService;
    const params = new IntegrationAuditParams();
    params.oid = 'record';
    params.brandId = 'brand';
    const summaries = await service.getStatusSummaryWithOutcomes(params, {});
    assert.equal(summaries.length, 3);
    assert.deepEqual(
      summaries.filter(item => item.integrationName === 'figshare').map(item => item.destinationId),
      ['main', 'second']
    );
    assert.deepEqual(
      summaries.filter(item => item.integrationName === 'figshare').map(item => item.operationId),
      ['operation-main', 'operation-second']
    );
    assert.equal(summaries.find(item => item.integrationName === 'doi')?.outcome?.state, 'none');
    const history = await service.getTraceAuditLog(params);
    assert.equal(history.total, 3);
    assert.equal(history.rows.find(item => item.integrationName === 'doi')?.eventCount, 2);
    params.destinationId = 'main';
    assert.equal((await service.getStatusSummary(params)).length, 1);
    const trace = (await service.getTraceAuditLog(params)).rows[0];
    assert.equal(trace.destinationId, 'main');
    assert.equal(trace.operationId, 'operation-main');
    assert.equal(audits.length, 7);
  });
});

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'mocha';
import { AuthorizationCollectionHealth } from '../../src/authorization/collection-health';
import { authorizationTelemetry } from '../../src/authorization/observability';
import { Services as Rollout } from '../../src/services/AuthorizationRolloutService';
import { navigationCollectionFixture } from '../fixtures/authorization-navigation-collection.fixtures';
import {
  STABILIZATION_SIGNALS,
  stabilizationPolicyFingerprint,
  verifyAuthorizationStabilization,
  type StabilizationPolicy,
  type StabilizationEvidence,
} from '../../src/authorization/stabilization';

const START = Date.parse('2026-09-08T10:00:00Z');
const iso = (seconds: number) => new Date(START + seconds * 1000).toISOString();
const ref = 'a'.repeat(64);
export function stabilizationFixture() {
  const policy: StabilizationPolicy = {
    version: 1,
    approvedAt: iso(-300),
    approvalRef: ref,
    securityApprovalRef: ref,
    startsAt: iso(0),
    minimumDurationSeconds: 120,
    sampleIntervalSeconds: 60,
    maxAgeSeconds: 60,
    minSamples: 10,
    baselineMaxAgeSeconds: 3600,
    maxSeries: 100,
    buildVersion: 'build-1',
    registryGeneration: 'registry-1',
    instanceIds: ['a', 'b'],
    reportSources: [
      { id: 'support', kind: 'support' },
      { id: 'client-a', kind: 'integrator' },
    ],
    partitions: Object.entries(STABILIZATION_SIGNALS).map(([signal, fields]) => {
      const values = Object.fromEntries(
        fields.map(field => [
          field,
          field === 'p95Ms'
            ? 5
            : field === 'p99Ms'
              ? 9
              : field === 'queriesPerResolution'
                ? 3
                : field === 'seriesCount'
                  ? 10
                  : 0,
        ])
      );
      return {
        signal: signal as keyof typeof STABILIZATION_SIGNALS,
        labels: { route: 'other', reason: 'other', category: 'unknown' },
        baseline: {
          startedAt: iso(-3600),
          endedAt: iso(-1800),
          collectedAt: iso(-1700),
          complete: true,
          samples: 10,
          evidenceRef: ref,
          values,
        },
        thresholds: Object.fromEntries(
          fields.map(field => [
            field,
            { max: field.endsWith('Rate') ? 0.5 : 100, maxIncrease: field.endsWith('Rate') ? 0.1 : 10 },
          ])
        ),
      };
    }),
  };
  const evidence: StabilizationEvidence = {
    version: 1,
    policyFingerprint: stabilizationPolicyFingerprint(policy),
    generatedAt: iso(121),
    endedAt: iso(120),
    inventory: { instanceIds: ['a', 'b'], checkedAt: iso(120), evidenceRef: ref },
    rollback: { occurred: false, checkedAt: iso(120), evidenceRef: ref },
    samples: policy.instanceIds.flatMap((instanceId, i) =>
      [0, 60].map(start => {
        const bootId = `00000000-0000-4000-8000-00000000000${i}`;
        return {
          instanceId,
          bootId,
          mode: 'enforce',
          buildVersion: policy.buildVersion,
          registryGeneration: policy.registryGeneration,
          startedAt: iso(start),
          endedAt: iso(start + 60),
          collectorComplete: true,
          collectorRef: ref,
          metrics: policy.partitions.map(partition => ({
            signal: partition.signal,
            labels: { ...partition.labels },
            complete: true,
            collectedAt: iso(start + 60),
            samples: 10,
            evidenceRef: ref,
            unexplainedHighSeverity: 0,
            values: { ...partition.baseline.values },
          })),
          reports: policy.reportSources.map(source => ({
            sourceId: source.id,
            checkedAt: iso(start + 60),
            evidenceRef: ref,
            disposition: 'no-reports',
            openHighSeverity: 0,
            ownerRef: ref,
            securityRef: ref,
          })),
          health: {
            state: 'healthy',
            durable: true,
            evidenceGap: false,
            bootId,
            startedAt: iso(-2000),
            checkedAt: iso(start + 60),
            lastGapAt: iso(-2000),
            recoveredAt: iso(-1800),
            failures: 1,
            recoveries: 1,
            telemetryFailures: 0,
            telemetryRejections: 0,
          },
        };
      })
    ),
  };
  return {
    policy,
    evidence,
    verify: () => verifyAuthorizationStabilization(policy, evidence, new Date(iso(130))),
    approve: () => {
      evidence.policyFingerprint = stabilizationPolicyFingerprint(policy);
    },
  };
}

describe('Separate Phase 15.2 stabilization closure and read-only probes', () => {
  for (const outcome of ['failed', 'recovered', 'restarted', 'restarted-recovered', 'before-approval'] as const) {
    it(`checks real navigation collection health at closure after ${outcome}`, async () => {
      const directory = mkdtempSync(join(tmpdir(), 'navigation-closure-'));
      const file = join(directory, 'health.json');
      const telemetry = { failures: authorizationTelemetry.failures, rejected: authorizationTelemetry.rejected };
      authorizationTelemetry.failures = 0;
      authorizationTelemetry.rejected = 0;
      let time = Date.parse(iso(-2000));
      let fail = false;
      const createService = () =>
        new Rollout.AuthorizationRolloutService(
          {
            persistMismatch: async () => {
              if (fail) throw new Error('injected navigation outage');
            },
          },
          new AuthorizationCollectionHealth(file, () => new Date(time))
        );
      let service = createService();
      const navigation = navigationCollectionFixture(service);
      try {
        time = Date.parse(iso(-1800));
        assert.equal(await navigation.visible(), true);
        const state = stabilizationFixture();
        const samples = state.evidence.samples.filter(sample => sample.instanceId === 'a');
        const setHealth = (sample: (typeof samples)[number]) => {
          const health = { ...service.getCollectionHealth(), checkedAt: sample.endedAt };
          sample.bootId = health.bootId;
          Reflect.set(sample, 'health', health);
        };
        samples.forEach(setHealth);
        assert.equal(state.verify().closed, true);
        time = Date.parse(iso(outcome === 'before-approval' ? -400 : 61));
        fail = true;
        assert.equal(await navigation.visible(), true);
        assert.equal(service.getCollectionHealth().failures, 1);
        if (outcome !== 'failed') {
          time += 1000;
          fail = false;
          assert.equal(await navigation.visible(), true);
          assert.equal(service.getCollectionHealth().evidenceGap, false);
        }
        if (outcome.startsWith('restarted')) {
          time += 1000;
          service = createService();
          navigation.runtime.services.authorizationrolloutservice = service.exports();
          assert.equal(service.getCollectionHealth().failures, 1);
          assert.equal(service.getCollectionHealth().evidenceGap, true);
          if (outcome === 'restarted-recovered') {
            time += 1000;
            assert.equal(await navigation.visible(), true);
            assert.equal(service.getCollectionHealth().evidenceGap, false);
          }
        }
        if (outcome === 'before-approval') samples.forEach(setHealth);
        else setHealth(samples[1]);
        const persisted = readFileSync(file, 'utf8');
        const result = state.verify();
        assert.equal(result.closed, outcome === 'before-approval', result.blockers.join(','));
        if (outcome === 'recovered' || outcome === 'restarted-recovered') {
          assert.ok(result.blockers.includes('stabilization.collection-gap-or-restart'));
        } else if (outcome !== 'before-approval') {
          assert.ok(result.blockers.includes('stabilization.invalid-or-incomplete-contract'));
        }
        assert.deepEqual(Object.values(result.signals), Array(10).fill(outcome === 'before-approval'));
        assert.equal(readFileSync(file, 'utf8'), persisted, 'closure probes must not change health');
      } finally {
        navigation.restore();
        authorizationTelemetry.failures = telemetry.failures;
        authorizationTelemetry.rejected = telemetry.rejected;
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
  it('requires exactly the independent ten-signal contract and accepts a complete fresh fleet window', () => {
    assert.deepEqual(Object.keys(STABILIZATION_SIGNALS), [
      'responses',
      'denials',
      'transactions',
      'cas',
      'drift',
      'context',
      'orphans',
      'quorum',
      'reports',
      'secrets',
    ]);
    const result = stabilizationFixture().verify();
    assert.equal(result.closed, true, result.blockers.join(','));
    assert.deepEqual(Object.values(result.signals), Array(10).fill(true));
  });
  for (const signal of Object.keys(STABILIZATION_SIGNALS)) {
    for (const defect of [
      'missing',
      'incomplete',
      'zero samples',
      'too few samples',
      'missing values',
      'extra values',
      'future',
      'stale',
      'late',
      'high severity',
      'missing baseline',
      'threshold',
      'missing evidence',
    ]) {
      it(`keeps ${signal} OPEN for ${defect}`, () => {
        const state = stabilizationFixture();
        const sample = state.evidence.samples[3];
        const metric = sample.metrics.find(metric => metric.signal === signal)!;
        const expected = state.policy.partitions.find(metric => metric.signal === signal)!;
        const field = Object.keys(metric.values)[0];
        if (defect === 'missing') sample.metrics = sample.metrics.filter(metric => metric.signal !== signal);
        if (defect === 'incomplete') Reflect.set(metric, 'complete', false);
        if (defect === 'zero samples') metric.samples = 0;
        if (defect === 'too few samples') metric.samples = 9;
        if (defect === 'missing values') delete metric.values[field];
        if (defect === 'extra values') metric.values.unreviewed = 0;
        if (defect === 'future') metric.collectedAt = iso(122);
        if (defect === 'stale') metric.collectedAt = iso(59);
        if (defect === 'late') {
          metric.collectedAt = iso(181);
          state.evidence.generatedAt = iso(181);
        }
        if (defect === 'high severity') Reflect.set(metric, 'unexplainedHighSeverity', 1);
        if (defect === 'missing baseline') {
          delete expected.baseline.values[field];
          state.approve();
        }
        if (defect === 'threshold') metric.values[field] = 1000;
        if (defect === 'missing evidence') Reflect.deleteProperty(metric, 'evidenceRef');
        assert.equal(state.verify().closed, false);
      });
    }
  }
  const defects: ReadonlyArray<readonly [string, (state: ReturnType<typeof stabilizationFixture>) => void]> = [
    [
      'short duration',
      state => {
        state.policy.minimumDurationSeconds = 121;
        state.approve();
      },
    ],
    [
      'future approval',
      state => {
        state.policy.approvedAt = iso(1);
        state.approve();
      },
    ],
    [
      'unapproved changed thresholds',
      state => {
        state.policy.maxSeries = 101;
      },
    ],
    [
      'old window',
      state => {
        state.evidence.endedAt = iso(69);
      },
    ],
    [
      'future report',
      state => {
        state.evidence.generatedAt = iso(131);
      },
    ],
    [
      'stale report',
      state => {
        state.evidence.generatedAt = iso(60);
      },
    ],
    [
      'missing member',
      state => {
        state.evidence.samples = state.evidence.samples.filter(sample => sample.instanceId === 'a');
      },
    ],
    [
      'missing inventory member',
      state => {
        state.evidence.inventory.instanceIds.pop();
      },
    ],
    [
      'stale inventory',
      state => {
        state.evidence.inventory.checkedAt = iso(59);
      },
    ],
    [
      'duplicate interval',
      state => {
        state.evidence.samples.push(state.evidence.samples[0]);
      },
    ],
    [
      'sampling gap',
      state => {
        state.evidence.samples[1].startedAt = iso(61);
      },
    ],
    [
      'excessive sampling interval',
      state => {
        state.policy.sampleIntervalSeconds = 59;
        state.approve();
      },
    ],
    [
      'wrong build',
      state => {
        state.evidence.samples[1].buildVersion = 'old-build';
      },
    ],
    [
      'wrong registry',
      state => {
        state.evidence.samples[1].registryGeneration = 'old-registry';
      },
    ],
    [
      'collector failed',
      state => {
        Reflect.set(state.evidence.samples[1], 'collectorComplete', false);
      },
    ],
    [
      'missing support disposition',
      state => {
        state.evidence.samples[1].reports.shift();
      },
    ],
    [
      'missing integrator disposition',
      state => {
        state.evidence.samples[1].reports.pop();
      },
    ],
    [
      'unreviewed integrator',
      state => {
        state.evidence.samples[1].reports[1].sourceId = 'client-b';
      },
    ],
    [
      'stale disposition',
      state => {
        state.evidence.samples[1].reports[1].checkedAt = iso(59);
      },
    ],
    [
      'future disposition',
      state => {
        state.evidence.samples[1].reports[1].checkedAt = iso(121);
      },
    ],
    [
      'unexplained disposition',
      state => {
        Reflect.set(state.evidence.samples[1].reports[1], 'disposition', 'open');
      },
    ],
    [
      'high severity despite approval',
      state => {
        const report = state.evidence.samples[1].reports[1];
        report.disposition = 'explained-approved';
        Reflect.set(report, 'openHighSeverity', 1);
      },
    ],
    [
      'secret labels',
      state => {
        Reflect.set(state.evidence.samples[1].metrics[0].labels, 'token', 'SECRET');
      },
    ],
    [
      'high cardinality route',
      state => {
        Reflect.set(state.evidence.samples[1].metrics[0].labels, 'route', '/records/secret-id');
      },
    ],
    [
      'extra series',
      state => {
        state.evidence.samples[1].metrics.push(state.evidence.samples[1].metrics[0]);
      },
    ],
    [
      'excessive cardinality',
      state => {
        state.evidence.samples[1].metrics.find(row => row.signal === 'secrets')!.values.seriesCount = 101;
      },
    ],
    [
      'secret scan finding',
      state => {
        state.evidence.samples[1].metrics.find(row => row.signal === 'secrets')!.values.secretFindings = 1;
      },
    ],
    [
      'rejected labels',
      state => {
        state.evidence.samples[1].metrics.find(row => row.signal === 'secrets')!.values.rejectedDimensions = 1;
      },
    ],
    [
      'collection gap',
      state => {
        Reflect.set(state.evidence.samples[1].health, 'evidenceGap', true);
      },
    ],
    [
      'not durable',
      state => {
        Reflect.set(state.evidence.samples[1].health, 'durable', false);
      },
    ],
    [
      'telemetry throw',
      state => {
        Reflect.set(state.evidence.samples[1].health, 'telemetryFailures', 1);
      },
    ],
    [
      'recovered outage inside window',
      state => {
        state.evidence.samples[1].health.lastGapAt = iso(61);
        state.evidence.samples[1].health.recoveredAt = iso(62);
      },
    ],
    [
      'restart',
      state => {
        state.evidence.samples[1].bootId = '00000000-0000-4000-8000-000000000099';
      },
    ],
    [
      'counter reset',
      state => {
        state.evidence.samples[1].health.failures = 0;
      },
    ],
    [
      'recovery after approval',
      state => {
        state.evidence.samples[1].health.recoveredAt = iso(-1);
      },
    ],
    [
      'missing rollback observation',
      state => {
        Reflect.deleteProperty(state.evidence, 'rollback');
      },
    ],
    [
      'rollback during window',
      state => {
        Reflect.set(state.evidence.rollback, 'occurred', true);
      },
    ],
    [
      'future rollback check',
      state => {
        state.evidence.rollback.checkedAt = iso(131);
      },
    ],
    [
      'legacy member after rollback',
      state => {
        Reflect.set(state.evidence.samples[1], 'mode', 'legacy');
      },
    ],
    [
      'shadow member',
      state => {
        Reflect.set(state.evidence.samples[1], 'mode', 'shadow');
      },
    ],
    [
      'baseline after approval',
      state => {
        state.policy.partitions[0].baseline.endedAt = iso(-299);
        state.approve();
      },
    ],
    [
      'stale baseline',
      state => {
        state.policy.partitions[0].baseline.endedAt = iso(-5000);
        state.approve();
      },
    ],
  ];
  for (const [name, mutate] of defects)
    it(`rejects ${name}`, () => {
      const state = stabilizationFixture();
      mutate(state);
      assert.equal(state.verify().closed, false);
    });
  it('rejects impossible baseline distributions, zero exporter series and unordered recovery evidence', () => {
    for (const defect of ['baseline rate', 'baseline percentiles', 'zero series', 'recovery order', 'no recovery']) {
      const state = stabilizationFixture();
      if (defect === 'baseline rate') state.policy.partitions[0].baseline.values.status401Rate = 2;
      if (defect === 'baseline percentiles')
        state.policy.partitions.find(row => row.signal === 'context')!.baseline.values.p95Ms = 10;
      if (defect === 'zero series')
        state.evidence.samples[0].metrics.find(row => row.signal === 'secrets')!.values.seriesCount = 0;
      if (defect === 'recovery order') state.evidence.samples[0].health.lastGapAt = iso(-2001);
      if (defect === 'no recovery') state.evidence.samples[0].health.recoveries = 0;
      state.approve();
      assert.equal(state.verify().closed, false);
    }
  });

  it('bounds inventory and rollback evidence by report time even when verification happens later', () => {
    for (const field of ['inventory', 'rollback'] as const) {
      const state = stabilizationFixture();
      state.evidence[field].checkedAt = iso(122);
      assert.equal(state.verify().closed, false);
    }
  });

  it('uses absolute and additive baseline thresholds with inclusive boundaries and no healthy-zero waiver', () => {
    const state = stabilizationFixture();
    const metric = state.evidence.samples[1].metrics.find(row => row.signal === 'denials')!;
    metric.values.denyRate = 0.1;
    assert.equal(state.verify().closed, true);
    metric.values.denyRate = 0.10001;
    assert.equal(state.verify().closed, false);
    const limit = state.policy.partitions.find(row => row.signal === 'denials')!.thresholds.denyRate;
    limit.maxIncrease = 0.5;
    limit.max = 0.1;
    state.approve();
    assert.equal(state.verify().closed, false);
  });
  it('compares p95 and p99 separately and rejects invalid percentile ordering', () => {
    for (const [field, value] of [
      ['p95Ms', 16],
      ['p99Ms', 20],
      ['p95Ms', 10],
    ] as const) {
      const state = stabilizationFixture();
      state.evidence.samples[1].metrics.find(row => row.signal === 'context')!.values[field] = value;
      assert.equal(state.verify().closed, false);
    }
  });
  it('accepts fresh resolved and explicitly explained reports with both owner dispositions', () => {
    const state = stabilizationFixture();
    state.evidence.samples[1].reports[0].disposition = 'resolved';
    state.evidence.samples[1].reports[1].disposition = 'explained-approved';
    assert.equal(state.verify().closed, true);
  });
  it('probes all ten signals without modifying evidence or exposing invalid payload values', () => {
    const { probe } = require('../../../../scripts/authorization-stabilization.js') as {
      probe(
        policy: string,
        evidence: string,
        verify: typeof verifyAuthorizationStabilization,
        now: Date
      ): ReturnType<typeof verifyAuthorizationStabilization>;
    };
    const directory = mkdtempSync(join(tmpdir(), 'authorization-stabilization-'));
    try {
      const state = stabilizationFixture();
      const policy = join(directory, 'policy.json');
      const evidence = join(directory, 'evidence.json');
      writeFileSync(policy, JSON.stringify(state.policy));
      writeFileSync(evidence, JSON.stringify(state.evidence));
      const original = readFileSync(evidence, 'utf8');
      const result = probe(policy, evidence, verifyAuthorizationStabilization, new Date(iso(130)));
      assert.equal(result.closed, true);
      assert.equal(Object.keys(result.signals).length, 10);
      assert.equal(readFileSync(evidence, 'utf8'), original);
      assert.equal(
        JSON.stringify(verifyAuthorizationStabilization({ token: 'SECRET' }, null)).includes('SECRET'),
        false
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

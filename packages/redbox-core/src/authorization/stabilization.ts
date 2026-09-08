import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AUTHORIZATION_ROUTE_FAMILIES } from './observability';
import { AUTHORIZATION_DECISION_REASON_CODES, AUTHORIZATION_PRINCIPAL_CATEGORIES } from './types';
import { AUTHORIZATION_ADMINISTRATION_ERROR_CODES } from './errors';

/** Separate from pre-enforce readiness: every field is required in every complete sampling interval. */
export const STABILIZATION_SIGNALS = {
  responses: ['status401Rate', 'status403Rate', 'status404Rate'],
  denials: ['denyRate'],
  transactions: ['status503Rate'],
  cas: ['status409Rate'],
  drift: ['issueCount'],
  context: ['queriesPerResolution', 'p95Ms', 'p99Ms', 'errorRate'],
  orphans: ['observationCount'],
  quorum: ['rejectionCount'],
  reports: ['openHighSeverity'],
  secrets: ['secretFindings', 'rejectedDimensions', 'seriesCount'],
} as const;
export type StabilizationSignal = keyof typeof STABILIZATION_SIGNALS;
const signal = z.enum(Object.keys(STABILIZATION_SIGNALS) as [StabilizationSignal, ...StabilizationSignal[]]);
const timestamp = z.string().datetime({ offset: true });
const reference = z.string().regex(/^[a-f0-9]{64}$/u);
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u);
const nonnegative = z.number().finite().nonnegative();
const positiveInteger = z.number().int().positive().max(1_000_000);
const labels = z.strictObject({
  route: z.enum(AUTHORIZATION_ROUTE_FAMILIES),
  reason: z.enum([
    ...AUTHORIZATION_DECISION_REASON_CODES,
    ...AUTHORIZATION_ADMINISTRATION_ERROR_CODES,
    'authorization.invalid-credential',
    'authorization.scope-denied',
    'authorization.csrf-required',
    'authorization.internal-error',
    'authorization.transaction-unavailable',
    'authorization.resource-denied',
    'other',
  ]),
  category: z.enum([...AUTHORIZATION_PRINCIPAL_CATEGORIES, 'unknown']),
});
const values = z.record(z.string().max(40), nonnegative);
const partition = z.strictObject({ signal, labels });
const baseline = z.strictObject({
  startedAt: timestamp,
  endedAt: timestamp,
  collectedAt: timestamp,
  complete: z.literal(true),
  samples: positiveInteger,
  evidenceRef: reference,
  values,
});
const policySchema = z.strictObject({
  version: z.literal(1),
  approvedAt: timestamp,
  approvalRef: reference,
  securityApprovalRef: reference,
  startsAt: timestamp,
  minimumDurationSeconds: positiveInteger,
  sampleIntervalSeconds: positiveInteger,
  maxAgeSeconds: positiveInteger,
  minSamples: positiveInteger,
  baselineMaxAgeSeconds: positiveInteger,
  maxSeries: positiveInteger,
  buildVersion: identifier,
  registryGeneration: identifier,
  instanceIds: z.array(identifier).min(1).max(256),
  reportSources: z
    .array(z.strictObject({ id: identifier, kind: z.enum(['support', 'integrator']) }))
    .min(2)
    .max(256),
  partitions: z
    .array(
      partition.extend({
        baseline,
        thresholds: z.record(z.string().max(40), z.strictObject({ max: nonnegative, maxIncrease: nonnegative })),
      })
    )
    .min(10)
    .max(512),
});
const metricSample = partition.extend({
  complete: z.literal(true),
  collectedAt: timestamp,
  samples: positiveInteger,
  evidenceRef: reference,
  unexplainedHighSeverity: z.literal(0),
  values,
});
const reportDisposition = z.strictObject({
  sourceId: identifier,
  checkedAt: timestamp,
  evidenceRef: reference,
  disposition: z.enum(['no-reports', 'resolved', 'explained-approved']),
  openHighSeverity: z.literal(0),
  ownerRef: reference,
  // Both operational and security dispositions must be present even for explicit zero reports.
  securityRef: reference,
});
const sampleSchema = z.strictObject({
  instanceId: identifier,
  bootId: z.string().uuid(),
  buildVersion: identifier,
  registryGeneration: identifier,
  mode: z.literal('enforce'),
  startedAt: timestamp,
  endedAt: timestamp,
  // Collector/exporter acknowledgment is independent of the application's best-effort emit calls.
  collectorComplete: z.literal(true),
  collectorRef: reference,
  metrics: z.array(metricSample).min(10).max(512),
  reports: z.array(reportDisposition).min(2).max(256),
  health: z.strictObject({
    state: z.literal('healthy'),
    durable: z.literal(true),
    evidenceGap: z.literal(false),
    bootId: z.string().uuid(),
    startedAt: timestamp,
    checkedAt: timestamp,
    lastGapAt: timestamp,
    recoveredAt: timestamp,
    failures: nonnegative.int(),
    recoveries: nonnegative.int(),
    telemetryFailures: z.literal(0),
    telemetryRejections: z.literal(0),
  }),
});
const evidenceSchema = z.strictObject({
  version: z.literal(1),
  policyFingerprint: reference,
  generatedAt: timestamp,
  endedAt: timestamp,
  inventory: z.strictObject({
    instanceIds: z.array(identifier).min(1).max(256),
    checkedAt: timestamp,
    evidenceRef: reference,
  }),
  rollback: z.strictObject({ occurred: z.literal(false), checkedAt: timestamp, evidenceRef: reference }),
  samples: z.array(sampleSchema).min(1).max(100_000),
});
export type StabilizationPolicy = z.infer<typeof policySchema>;
export type StabilizationEvidence = z.infer<typeof evidenceSchema>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  return value;
}
/** Fingerprint the exact reviewed policy, including baselines, thresholds, fleet and source inventories. */
export function stabilizationPolicyFingerprint(policy: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(policy)))
    .digest('hex');
}
function key(value: z.infer<typeof partition>): string {
  return [value.signal, value.labels.route, value.labels.reason, value.labels.category].join('|');
}
function exact(left: readonly string[], right: readonly string[]): boolean {
  return (
    new Set(left).size === left.length &&
    left.length === right.length &&
    [...left].sort().join('|') === [...right].sort().join('|')
  );
}
export interface StabilizationResult {
  readonly closed: boolean;
  readonly blockers: readonly string[];
  readonly signals: Readonly<Record<StabilizationSignal, boolean>>;
}

/** Read-only offline probe. Malformed evidence returns bounded codes, never submitted data or Zod errors. */
export function verifyAuthorizationStabilization(
  policyInput: unknown,
  evidenceInput: unknown,
  now = new Date()
): StabilizationResult {
  const blockers = new Set<string>();
  const checks = Object.fromEntries(Object.keys(STABILIZATION_SIGNALS).map(name => [name, true])) as Record<
    StabilizationSignal,
    boolean
  >;
  const block = (code: string, name?: StabilizationSignal) => {
    blockers.add(code);
    if (name) checks[name] = false;
    else for (const name of Object.keys(checks) as StabilizationSignal[]) checks[name] = false;
  };
  const policyResult = policySchema.safeParse(policyInput);
  const evidenceResult = evidenceSchema.safeParse(evidenceInput);
  if (!policyResult.success || !evidenceResult.success) {
    block('stabilization.invalid-or-incomplete-contract');
    return { closed: false, blockers: [...blockers], signals: checks };
  }
  const policy = policyResult.data;
  const evidence = evidenceResult.data;
  const at = now.getTime();
  const start = Date.parse(policy.startsAt);
  const end = Date.parse(evidence.endedAt);
  const generated = Date.parse(evidence.generatedAt);
  const fresh = (time: string, lower: number, upper: number, maxAge: number) => {
    const parsed = Date.parse(time);
    return parsed >= lower && parsed <= upper && upper - parsed <= maxAge * 1000;
  };
  if (
    !Number.isFinite(at) ||
    Date.parse(policy.approvedAt) > start ||
    start >= end ||
    end > generated ||
    generated > at ||
    at - end > policy.maxAgeSeconds * 1000 ||
    at - generated > policy.maxAgeSeconds * 1000 ||
    end - start < policy.minimumDurationSeconds * 1000
  )
    block('stabilization.window-or-freshness');
  if (stabilizationPolicyFingerprint(policyInput) !== evidence.policyFingerprint)
    block('stabilization.unapproved-policy');
  if (
    !exact(evidence.inventory.instanceIds, policy.instanceIds) ||
    !exact(policy.instanceIds, policy.instanceIds) ||
    !fresh(evidence.inventory.checkedAt, end, generated, policy.maxAgeSeconds)
  )
    block('stabilization.fleet-coverage');
  if (!fresh(evidence.rollback.checkedAt, end, generated, policy.maxAgeSeconds))
    block('stabilization.rollback-evidence');
  if (
    !exact(
      policy.reportSources.map(source => source.id),
      policy.reportSources.map(source => source.id)
    ) ||
    !policy.reportSources.some(source => source.kind === 'support') ||
    !policy.reportSources.some(source => source.kind === 'integrator')
  )
    block('stabilization.report-inventory');
  const expectedKeys = policy.partitions.map(key);
  if (
    new Set(expectedKeys).size !== expectedKeys.length ||
    expectedKeys.length > policy.maxSeries ||
    !exact([...new Set(policy.partitions.map(item => item.signal))], Object.keys(STABILIZATION_SIGNALS))
  )
    block('stabilization.signal-coverage');
  for (const expected of policy.partitions) {
    const fields = STABILIZATION_SIGNALS[expected.signal];
    if (
      !exact(Object.keys(expected.thresholds), fields) ||
      !exact(Object.keys(expected.baseline.values), fields) ||
      expected.baseline.samples < policy.minSamples ||
      Object.entries(expected.baseline.values).some(([field, value]) => field.endsWith('Rate') && value > 1) ||
      (expected.signal === 'context' && expected.baseline.values.p95Ms > expected.baseline.values.p99Ms) ||
      Date.parse(expected.baseline.startedAt) >= Date.parse(expected.baseline.endedAt) ||
      !fresh(
        expected.baseline.endedAt,
        Date.parse(expected.baseline.startedAt),
        Date.parse(policy.approvedAt),
        policy.baselineMaxAgeSeconds
      ) ||
      !fresh(
        expected.baseline.collectedAt,
        Date.parse(expected.baseline.endedAt),
        Date.parse(policy.approvedAt),
        policy.baselineMaxAgeSeconds
      )
    )
      block('stabilization.baseline-incomplete-or-stale', expected.signal);
  }
  const seenInstances = new Set(evidence.samples.map(sample => sample.instanceId));
  if (!exact([...seenInstances], policy.instanceIds)) block('stabilization.fleet-coverage');
  for (const instanceId of policy.instanceIds) {
    const samples = evidence.samples
      .filter(sample => sample.instanceId === instanceId)
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    let cursor = start;
    let bootId: string | undefined;
    let failures: number | undefined;
    let recoveries: number | undefined;
    for (const sample of samples) {
      const sampleStart = Date.parse(sample.startedAt);
      const sampleEnd = Date.parse(sample.endedAt);
      if (
        sampleStart !== cursor ||
        sampleEnd <= sampleStart ||
        sampleEnd > end ||
        sampleEnd - sampleStart > policy.sampleIntervalSeconds * 1000
      )
        block('stabilization.sampling-gap');
      cursor = sampleEnd;
      if (sample.buildVersion !== policy.buildVersion || sample.registryGeneration !== policy.registryGeneration)
        block('stabilization.fleet-identity');
      const health = sample.health;
      if (
        (bootId !== undefined && bootId !== sample.bootId) ||
        sample.bootId !== health.bootId ||
        (failures !== undefined && failures !== health.failures) ||
        (recoveries !== undefined && recoveries !== health.recoveries) ||
        Date.parse(health.startedAt) > start ||
        Date.parse(health.lastGapAt) < Date.parse(health.startedAt) ||
        health.recoveries < 1 ||
        Date.parse(health.lastGapAt) >= start ||
        Date.parse(health.recoveredAt) < Date.parse(health.lastGapAt) ||
        Date.parse(health.recoveredAt) > Date.parse(policy.approvedAt) ||
        !fresh(
          health.checkedAt,
          sampleEnd,
          Math.min(generated, sampleEnd + policy.maxAgeSeconds * 1000),
          policy.maxAgeSeconds
        )
      )
        block('stabilization.collection-gap-or-restart');
      bootId = sample.bootId;
      failures = health.failures;
      recoveries = health.recoveries;
      if (!exact(sample.metrics.map(key), expectedKeys)) block('stabilization.missing-or-excessive-series');
      if (
        !exact(
          sample.reports.map(report => report.sourceId),
          policy.reportSources.map(source => source.id)
        )
      )
        block('stabilization.report-dispositions', 'reports');
      for (const report of sample.reports) {
        if (!fresh(report.checkedAt, sampleStart, sampleEnd, policy.sampleIntervalSeconds))
          block('stabilization.report-dispositions', 'reports');
      }
      for (const actual of sample.metrics) {
        const name = actual.signal;
        const expected = policy.partitions.find(partition => key(partition) === key(actual));
        if (
          !expected ||
          !exact(Object.keys(actual.values), STABILIZATION_SIGNALS[name]) ||
          actual.samples < policy.minSamples ||
          !fresh(
            actual.collectedAt,
            sampleEnd,
            Math.min(generated, sampleEnd + policy.maxAgeSeconds * 1000),
            policy.maxAgeSeconds
          )
        ) {
          block('stabilization.metric-incomplete-or-stale', name);
          continue;
        }
        for (const [field, value] of Object.entries(actual.values)) {
          const limit = expected.thresholds[field];
          const baselineValue = expected.baseline.values[field];
          // Additive increases are defined at a healthy zero baseline; no divide-by-zero waiver.
          if (
            !limit ||
            baselineValue === undefined ||
            value > limit.max ||
            value - baselineValue > limit.maxIncrease ||
            (field.endsWith('Rate') && value > 1)
          )
            block('stabilization.threshold-exceeded', name);
        }
        if (name === 'context' && actual.values.p95Ms > actual.values.p99Ms)
          block('stabilization.invalid-percentiles', name);
        if (name === 'reports' && actual.values.openHighSeverity !== 0) block('stabilization.unresolved-reports', name);
        if (
          name === 'secrets' &&
          (actual.values.secretFindings !== 0 ||
            actual.values.rejectedDimensions !== 0 ||
            actual.values.seriesCount > policy.maxSeries ||
            actual.values.seriesCount < expectedKeys.length)
        )
          block('stabilization.secret-or-cardinality', name);
      }
    }
    if (cursor !== end) block('stabilization.sampling-gap');
  }
  return Object.freeze({
    closed: blockers.size === 0,
    blockers: Object.freeze([...blockers].sort()),
    signals: Object.freeze(checks),
  });
}

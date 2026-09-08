import { createHash } from 'node:crypto';
import { assertAuthorizationFreeTextSafe } from './persistence-contracts';

export interface AuthorizationRemediationEvidence {
  readonly fingerprint: string;
  readonly observedCount: number;
  readonly lastSeenAt: string;
  readonly buildVersion: string;
  readonly registryGeneration: string;
  readonly repairReference: string;
  readonly verificationReference: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly result: 'passed';
}

/** Operator attests to a completed, durable verification artifact, never mere triage. */
export function validateRemediationEvidence(value: unknown, now: Date): AuthorizationRemediationEvidence {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Remediation evidence is required.');
  const row = value as Record<string, unknown>;
  const fields = [
    'fingerprint',
    'observedCount',
    'lastSeenAt',
    'buildVersion',
    'registryGeneration',
    'repairReference',
    'verificationReference',
    'startedAt',
    'completedAt',
    'result',
  ];
  if (Object.keys(row).some(key => !fields.includes(key))) throw new Error('Unknown remediation evidence field.');
  const text = (key: string, max: number): string => {
    const entry = row[key];
    if (
      typeof entry !== 'string' ||
      entry.trim() !== entry ||
      entry.length === 0 ||
      entry.length > max ||
      Array.from(entry).some(character => {
        const code = character.codePointAt(0);
        return code !== undefined && (code <= 0x1f || code === 0x7f);
      })
    ) {
      throw new Error(`Remediation evidence ${key} is invalid.`);
    }
    assertAuthorizationFreeTextSafe(entry, key);
    return entry;
  };
  const fingerprint = text('fingerprint', 64);
  if (!/^[a-f0-9]{64}$/u.test(fingerprint)) throw new Error('Remediation fingerprint is invalid.');
  const observedCount = row.observedCount;
  if (typeof observedCount !== 'number' || !Number.isSafeInteger(observedCount) || observedCount < 1)
    throw new Error('Remediation observedCount is invalid.');
  const lastSeenAt = text('lastSeenAt', 24);
  const startedAt = text('startedAt', 24);
  const completedAt = text('completedAt', 24);
  for (const date of [lastSeenAt, startedAt, completedAt]) {
    if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date)
      throw new Error('Remediation timestamps must be canonical ISO dates.');
  }
  if (
    Date.parse(startedAt) <= Date.parse(lastSeenAt) ||
    Date.parse(completedAt) <= Date.parse(startedAt) ||
    Date.parse(completedAt) > now.getTime()
  ) {
    throw new Error('Remediation verification must finish after the latest observation and before closure.');
  }
  if (row.result !== 'passed') throw new Error('Only passed remediation verification can close a defect.');
  return Object.freeze({
    fingerprint,
    observedCount,
    lastSeenAt,
    startedAt,
    completedAt,
    result: 'passed',
    buildVersion: text('buildVersion', 128),
    registryGeneration: text('registryGeneration', 128),
    repairReference: text('repairReference', 256),
    verificationReference: text('verificationReference', 256),
  });
}

export function remediationEvidenceFingerprint(evidence: AuthorizationRemediationEvidence): string {
  return createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
}

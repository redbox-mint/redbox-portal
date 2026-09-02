import { RECORD_SCHEMA_PROBLEM_CODES } from '../record-contract/codes';
import type { RecordContractSchemaKind } from '../record-contract/types';

export type RecordSchemaUnknownProperties = 'allow' | 'declared';

export interface RecordSchemaLimitsConfig {
  readonly maxDepth: number;
  readonly maxProperties: number;
  readonly maxDocumentBytes: number;
  readonly maxDiagnostics: number;
  readonly contributorTimeoutMs: number;
}

export interface RecordSchemaRetentionConfig {
  readonly minimumAgeDays: number;
}

export interface RecordSchemaIntegrationPinConfig {
  readonly digest: string;
  readonly brand: string;
  readonly portal: string;
  readonly schemaKind: RecordContractSchemaKind;
  readonly recordType: string;
  readonly operation: string;
  readonly owner: string;
  readonly purpose: string;
  readonly expiresAt?: string;
}

export interface RecordSchemaConfig {
  readonly enabled: boolean;
  readonly unknownProperties: RecordSchemaUnknownProperties;
  readonly cacheMaxEntries: number;
  readonly limits: RecordSchemaLimitsConfig;
  readonly retention: RecordSchemaRetentionConfig;
  readonly integrationPins?: readonly RecordSchemaIntegrationPinConfig[];
}

export interface RecordTypeRecordSchemaConfig {
  readonly unknownProperties?: RecordSchemaUnknownProperties;
}

export type RecordSchemaConfigurationProblemReason =
  | 'required'
  | 'type'
  | 'positive-integer'
  | 'unsupported-value'
  | 'maximum-items';

export interface RecordSchemaConfigurationProblem {
  readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID;
  readonly path: string;
  readonly reason: RecordSchemaConfigurationProblemReason;
}

export type RecordSchemaConfigValidationResult =
  | { readonly valid: true; readonly config: RecordSchemaConfig }
  | { readonly valid: false; readonly problems: readonly RecordSchemaConfigurationProblem[] };

export const DEFAULT_RECORD_SCHEMA_CACHE_MAX_ENTRIES = 128;
export const DEFAULT_RECORD_SCHEMA_MAX_DEPTH = 64;
export const DEFAULT_RECORD_SCHEMA_MAX_PROPERTIES = 10_000;
export const DEFAULT_RECORD_SCHEMA_MAX_DOCUMENT_BYTES = 1_048_576;
export const DEFAULT_RECORD_SCHEMA_MAX_DIAGNOSTICS = 1_000;
export const DEFAULT_RECORD_SCHEMA_CONTRIBUTOR_TIMEOUT_MS = 1_000;
export const DEFAULT_RECORD_SCHEMA_MINIMUM_AGE_DAYS = 365;
/** Bounds deterministic startup and maintenance work before any pin is hashed or persisted. */
export const MAX_RECORD_SCHEMA_INTEGRATION_PINS = 100;

export const recordSchema: RecordSchemaConfig = {
  enabled: false,
  unknownProperties: 'allow',
  cacheMaxEntries: DEFAULT_RECORD_SCHEMA_CACHE_MAX_ENTRIES,
  limits: {
    maxDepth: DEFAULT_RECORD_SCHEMA_MAX_DEPTH,
    maxProperties: DEFAULT_RECORD_SCHEMA_MAX_PROPERTIES,
    maxDocumentBytes: DEFAULT_RECORD_SCHEMA_MAX_DOCUMENT_BYTES,
    maxDiagnostics: DEFAULT_RECORD_SCHEMA_MAX_DIAGNOSTICS,
    contributorTimeoutMs: DEFAULT_RECORD_SCHEMA_CONTRIBUTOR_TIMEOUT_MS,
  },
  retention: {
    minimumAgeDays: DEFAULT_RECORD_SCHEMA_MINIMUM_AGE_DAYS,
  },
};

export function isRecordSchemaUnknownProperties(value: unknown): value is RecordSchemaUnknownProperties {
  return value === 'allow' || value === 'declared';
}

export function resolveRecordSchemaUnknownProperties(
  globalValue: RecordSchemaUnknownProperties,
  recordTypeOverride?: RecordTypeRecordSchemaConfig
): RecordSchemaUnknownProperties {
  return recordTypeOverride?.unknownProperties ?? globalValue;
}

function configurationProblem(
  path: string,
  reason: RecordSchemaConfigurationProblemReason
): RecordSchemaConfigurationProblem {
  return { code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID, path, reason };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Normalizes boolean strings supplied by environment-backed Sails configuration. */
export function normalizeRecordSchemaConfig(value: unknown): unknown {
  if (!isObjectRecord(value) || typeof value.enabled !== 'string') {
    return value;
  }
  const enabled = value.enabled.trim().toLowerCase();
  if (enabled !== 'true' && enabled !== 'false') {
    return value;
  }
  return { ...value, enabled: enabled === 'true' };
}

/** Resolve the environment-normalized feature flag at record write boundaries. */
export function isRecordSchemaEnabled(value: unknown): boolean {
  const normalized = normalizeRecordSchemaConfig(value);
  return isObjectRecord(normalized) && normalized.enabled === true;
}

function isRecordSchemaIntegrationPinConfig(value: unknown): value is RecordSchemaIntegrationPinConfig {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.digest === 'string' &&
    typeof value.brand === 'string' &&
    typeof value.portal === 'string' &&
    (value.schemaKind === 'create' || value.schemaKind === 'update') &&
    typeof value.recordType === 'string' &&
    typeof value.operation === 'string' &&
    typeof value.owner === 'string' &&
    typeof value.purpose === 'string' &&
    (value.expiresAt === undefined || typeof value.expiresAt === 'string')
  );
}

function validatePositiveInteger(
  parent: Record<string, unknown> | undefined,
  property: string,
  path: string,
  problems: RecordSchemaConfigurationProblem[]
): void {
  if (!parent || !(property in parent)) {
    problems.push(configurationProblem(path, 'required'));
    return;
  }
  const value = parent[property];
  if (typeof value !== 'number') {
    problems.push(configurationProblem(path, 'type'));
    return;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    problems.push(configurationProblem(path, 'positive-integer'));
  }
}

export function validateRecordTypeRecordSchemaConfig(
  value: unknown,
  path = 'recordSchema'
): readonly RecordSchemaConfigurationProblem[] {
  if (!isObjectRecord(value)) {
    return [configurationProblem(path, 'type')];
  }
  if (value.unknownProperties !== undefined && !isRecordSchemaUnknownProperties(value.unknownProperties)) {
    return [configurationProblem(`${path}.unknownProperties`, 'unsupported-value')];
  }
  return [];
}

/** Validates startup configuration after normalizing environment boolean strings. */
export function validateRecordSchemaConfig(value: unknown): RecordSchemaConfigValidationResult {
  value = normalizeRecordSchemaConfig(value);
  const problems: RecordSchemaConfigurationProblem[] = [];
  if (!isObjectRecord(value)) {
    return { valid: false, problems: [configurationProblem('recordSchema', 'type')] };
  }

  if (typeof value.enabled !== 'boolean') {
    problems.push(configurationProblem('recordSchema.enabled', value.enabled === undefined ? 'required' : 'type'));
  }
  if (!isRecordSchemaUnknownProperties(value.unknownProperties)) {
    problems.push(
      configurationProblem(
        'recordSchema.unknownProperties',
        value.unknownProperties === undefined ? 'required' : 'unsupported-value'
      )
    );
  }
  validatePositiveInteger(value, 'cacheMaxEntries', 'recordSchema.cacheMaxEntries', problems);
  const limits = isObjectRecord(value.limits) ? value.limits : undefined;
  if (!limits) {
    problems.push(configurationProblem('recordSchema.limits', value.limits === undefined ? 'required' : 'type'));
  } else {
    validatePositiveInteger(limits, 'maxDepth', 'recordSchema.limits.maxDepth', problems);
    validatePositiveInteger(limits, 'maxProperties', 'recordSchema.limits.maxProperties', problems);
    validatePositiveInteger(limits, 'maxDocumentBytes', 'recordSchema.limits.maxDocumentBytes', problems);
    validatePositiveInteger(limits, 'maxDiagnostics', 'recordSchema.limits.maxDiagnostics', problems);
    validatePositiveInteger(limits, 'contributorTimeoutMs', 'recordSchema.limits.contributorTimeoutMs', problems);
  }

  const retention = isObjectRecord(value.retention) ? value.retention : undefined;
  if (!retention) {
    problems.push(configurationProblem('recordSchema.retention', value.retention === undefined ? 'required' : 'type'));
  } else {
    validatePositiveInteger(retention, 'minimumAgeDays', 'recordSchema.retention.minimumAgeDays', problems);
  }

  if (value.integrationPins !== undefined) {
    if (!Array.isArray(value.integrationPins)) {
      problems.push(configurationProblem('recordSchema.integrationPins', 'type'));
    } else if (value.integrationPins.length > MAX_RECORD_SCHEMA_INTEGRATION_PINS) {
      problems.push(configurationProblem('recordSchema.integrationPins', 'maximum-items'));
    } else {
      value.integrationPins.forEach((pin, index) => {
        if (!isRecordSchemaIntegrationPinConfig(pin)) {
          problems.push(configurationProblem(`recordSchema.integrationPins.${index}`, 'type'));
        }
      });
    }
  }

  if (problems.length > 0) {
    return {
      valid: false,
      problems: problems.sort((left, right) => left.path.localeCompare(right.path)),
    };
  }
  return {
    valid: true,
    config: {
      enabled: value.enabled as boolean,
      unknownProperties: value.unknownProperties as RecordSchemaUnknownProperties,
      cacheMaxEntries: value.cacheMaxEntries as number,
      limits: {
        maxDepth: limits?.maxDepth as number,
        maxProperties: limits?.maxProperties as number,
        maxDocumentBytes: limits?.maxDocumentBytes as number,
        maxDiagnostics: limits?.maxDiagnostics as number,
        contributorTimeoutMs: limits?.contributorTimeoutMs as number,
      },
      retention: { minimumAgeDays: retention?.minimumAgeDays as number },
      ...(value.integrationPins === undefined
        ? {}
        : { integrationPins: value.integrationPins as unknown as readonly RecordSchemaIntegrationPinConfig[] }),
    },
  };
}

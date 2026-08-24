import { RECORD_SCHEMA_PROBLEM_CODES } from '../record-contract/codes';
import {
  RECORD_CONTRACT_FORMAT_V1,
  type RecordContractFormat,
  type RecordContractSchemaKind,
} from '../record-contract/types';

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
  readonly contractFormat: RecordContractFormat;
  readonly cacheMaxEntries: number;
  readonly limits: RecordSchemaLimitsConfig;
  readonly retention: RecordSchemaRetentionConfig;
  readonly integrationPins?: readonly RecordSchemaIntegrationPinConfig[];
}

export interface RecordTypeRecordSchemaConfig {
  readonly unknownProperties?: RecordSchemaUnknownProperties;
}

export type RecordSchemaConfigurationProblemReason = 'required' | 'type' | 'positive-integer' | 'unsupported-value';

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

export const recordSchema: RecordSchemaConfig = {
  enabled: false,
  unknownProperties: 'allow',
  contractFormat: RECORD_CONTRACT_FORMAT_V1,
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;
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

function isValidatedRecordSchemaConfig(
  value: Record<string, unknown>
): value is Record<string, unknown> & RecordSchemaConfig {
  const limits = value.limits;
  const retention = value.retention;
  return (
    typeof value.enabled === 'boolean' &&
    isRecordSchemaUnknownProperties(value.unknownProperties) &&
    value.contractFormat === RECORD_CONTRACT_FORMAT_V1 &&
    isPositiveInteger(value.cacheMaxEntries) &&
    isObjectRecord(limits) &&
    isPositiveInteger(limits.maxDepth) &&
    isPositiveInteger(limits.maxProperties) &&
    isPositiveInteger(limits.maxDocumentBytes) &&
    isPositiveInteger(limits.maxDiagnostics) &&
    isPositiveInteger(limits.contributorTimeoutMs) &&
    isObjectRecord(retention) &&
    isPositiveInteger(retention.minimumAgeDays) &&
    (value.integrationPins === undefined ||
      (Array.isArray(value.integrationPins) && value.integrationPins.every(isRecordSchemaIntegrationPinConfig)))
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

/** Validates startup configuration without coercing or silently clamping values. */
export function validateRecordSchemaConfig(value: unknown): RecordSchemaConfigValidationResult {
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
  if (value.contractFormat !== RECORD_CONTRACT_FORMAT_V1) {
    problems.push(
      configurationProblem(
        'recordSchema.contractFormat',
        value.contractFormat === undefined ? 'required' : 'unsupported-value'
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
  if (!isValidatedRecordSchemaConfig(value)) {
    throw new Error('Record schema configuration validation completed without a typed configuration.');
  }
  return { valid: true, config: value };
}

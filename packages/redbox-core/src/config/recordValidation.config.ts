import type { ValidationMode } from '@researchdatabox/sails-ng-common';

/** Global authoritative record-validation rollout configuration. */
export interface RecordValidationConfig {
  /** Global rollout default. More-specific record-type/operation modes may override it. */
  mode: ValidationMode;
  /** Whole-run timeout covering blocking expressions and validators. */
  timeoutMs: number;
  /** Optional global rollout overrides keyed by validation operation name. */
  operations?: Record<string, RecordValidationOperationRolloutConfig>;
  /** Server-owned names that expressions may read from sanitized request parameters. */
  allowedRequestParameters?: string[];
  /** Maximum distinct record-type/operation/form/code rows retained in the process-local shadow report. */
  shadowReportMaxSeries: number;
}

export interface RecordValidationOperationRolloutConfig {
  mode?: ValidationMode;
}

export const DEFAULT_RECORD_VALIDATION_TIMEOUT_MS = 5_000;
export const DEFAULT_RECORD_VALIDATION_SHADOW_REPORT_MAX_SERIES = 1_000;

/** Enforcement is intentionally opt-in after shadow evidence has been reviewed. */
export const recordValidation: RecordValidationConfig = {
  mode: 'shadow',
  timeoutMs: DEFAULT_RECORD_VALIDATION_TIMEOUT_MS,
  shadowReportMaxSeries: DEFAULT_RECORD_VALIDATION_SHADOW_REPORT_MAX_SERIES,
};

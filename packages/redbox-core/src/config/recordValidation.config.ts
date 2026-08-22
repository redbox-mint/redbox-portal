import type { ValidationMode } from '@researchdatabox/sails-ng-common';

/** Global authoritative record-validation rollout configuration. */
export interface RecordValidationConfig {
  /** Global rollout default. More-specific record-type/operation modes may override it. */
  mode: ValidationMode;
  /** Whole-run timeout covering blocking expressions and validators. */
  timeoutMs: number;
  /** Optional global rollout overrides keyed by validation operation name. */
  operations?: Record<string, RecordValidationOperationRolloutConfig>;
}

export interface RecordValidationOperationRolloutConfig {
  mode?: ValidationMode;
}

export const DEFAULT_RECORD_VALIDATION_TIMEOUT_MS = 5_000;

/** Enforcement is intentionally opt-in after shadow evidence has been reviewed. */
export const recordValidation: RecordValidationConfig = {
  mode: 'shadow',
  timeoutMs: DEFAULT_RECORD_VALIDATION_TIMEOUT_MS,
};

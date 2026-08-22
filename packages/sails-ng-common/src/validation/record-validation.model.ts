/**
 * A server-owned validation intent and its form-level defaults.
 *
 * Operation names are configuration keys (for example `draft` or `publish`),
 * rather than values from a fixed framework enum.
 */
export interface ValidationOperationDefinition {
  /** The exact validation-group set to use for this operation. */
  enabledValidationGroups: string[];
  /** Optional safe display label. */
  label?: string;
  /** Optional safe display description. */
  description?: string;
  /** Roles allowed to use the operation. Omission adds no role restriction. */
  roles?: string[];
  /** Workflow targets allowed for the operation. Omission adds no target restriction. */
  allowedTargetSteps?: string[];
}

/**
 * A more-specific operation layer. Defined properties replace or restrict the
 * corresponding form-level defaults; omitted properties inherit them.
 */
export interface ValidationOperationOverride extends Partial<ValidationOperationDefinition> {
  /** Optional rollout-mode override for this operation. */
  mode?: ValidationMode;
}

/** Safe operation metadata suitable for discovery responses. */
export interface ValidationOperationDiscovery {
  name: string;
  label?: string;
  description?: string;
  allowedTargetSteps?: string[];
}

/** Whether authoritative validation observes or rejects a failed save. */
export type ValidationMode = 'shadow' | 'enforce';

/** Safe diagnostic severity shared by group resolution and server validation. */
export type RecordValidationDiagnosticSeverity = 'info' | 'warning' | 'error';

/**
 * A safe diagnostic from validation configuration or execution.
 *
 * This contract intentionally has no arbitrary details bag: raw records,
 * requests, users, parameters, and exceptions must not enter diagnostics.
 */
export interface RecordValidationDiagnostic {
  code: string;
  severity: RecordValidationDiagnosticSeverity;
  message: string;
  formName?: string;
  operation?: string;
  group?: string;
  field?: string;
  pointer?: string;
  validatorClass?: string;
}

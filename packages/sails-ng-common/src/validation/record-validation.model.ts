/** Public operation names are small, case-sensitive identifiers. */
export const VALIDATION_OPERATION_NAME_MAX_LENGTH = 64;
export const VALIDATION_OPERATION_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

/** Bounded display metadata limits used at the public discovery boundary. */
export const VALIDATION_OPERATION_LABEL_MAX_LENGTH = 256;
export const VALIDATION_OPERATION_DESCRIPTION_MAX_LENGTH = 1024;

/** Safe server-owned references used by validation workflow/form discovery. */
export const RECORD_VALIDATION_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Deterministic ordering for public validation identifiers. */
export function compareRecordValidationIdentifiers(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Normalize bounded public display text without coercing hostile values. */
export function safeValidationDiscoveryText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

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

/**
 * Workflow stages may refine operation policy, but rollout mode is deliberately
 * not stage-scoped. Enforcement remains a `(record type, operation)` decision.
 */
export type ValidationOperationPolicyOverride = Omit<ValidationOperationOverride, 'mode'> & {
  mode?: never;
};

/** Safe operation metadata suitable for discovery responses. */
export interface ValidationOperationDiscovery {
  name: string;
  label?: string;
  description?: string;
  /**
   * Actor-authorized transition targets applicable to this operation. An
   * unrestricted operation receives every actor-authorized target.
   */
  allowedTargetSteps?: string[];
}

/**
 * Project an untrusted service result onto the complete public discovery
 * contract. Optional target authorization can only narrow reported targets.
 */
export function sanitizeValidationOperationDiscovery(
  value: unknown,
  authorizedTargetSteps?: ReadonlySet<string>
): ValidationOperationDiscovery | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (!VALIDATION_OPERATION_NAME_PATTERN.test(name)) return undefined;
  const label = safeValidationDiscoveryText(candidate.label, VALIDATION_OPERATION_LABEL_MAX_LENGTH);
  const description = safeValidationDiscoveryText(
    candidate.description,
    VALIDATION_OPERATION_DESCRIPTION_MAX_LENGTH
  );
  const allowedTargetSteps = Array.isArray(candidate.allowedTargetSteps)
    ? [...new Set(candidate.allowedTargetSteps
        .filter((step): step is string => typeof step === 'string')
        .map(step => step.trim())
        .filter(step =>
          RECORD_VALIDATION_REFERENCE_PATTERN.test(step) &&
          (authorizedTargetSteps === undefined || authorizedTargetSteps.has(step))
        ))].sort(compareRecordValidationIdentifiers)
    : [];
  return {
    name,
    ...(label ? { label } : {}),
    ...(description ? { description } : {}),
    ...(allowedTargetSteps.length > 0 ? { allowedTargetSteps } : {}),
  };
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
  /** Safe configured expression name; never an expression source or value. */
  expressionName?: string;
  validatorClass?: string;
}

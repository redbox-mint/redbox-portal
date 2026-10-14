import {
  FormFieldValidationGroup,
  FormValidationGroups,
  formValidationGroupMembership,
} from './form.model';
import { RecordValidationDiagnostic } from './record-validation.model';

/** Initial source used by a validation-group change. */
export const formValidationGroupsChangeInitial = [...formValidationGroupMembership, 'current', 'empty'] as const;

/**
 * `empty` is retained as a deprecated alias for `none` so stored legacy form
 * expressions continue to work while producing an observable diagnostic.
 */
export type FormValidationGroupsChangeInitial = (typeof formValidationGroupsChangeInitial)[number];

export interface ValidationGroupCalculationResult {
  enabledValidationGroups: string[];
  diagnostics: RecordValidationDiagnostic[];
}

export const VALIDATION_GROUP_EMPTY_INITIAL_DIAGNOSTIC = 'validation-group-initial-empty-deprecated' as const;
export const VALIDATION_GROUP_UNKNOWN_INITIAL_DIAGNOSTIC = 'validation-group-initial-unknown' as const;

function describeUnknownInitial(value: unknown): string {
  if (typeof value === 'string') {
    const maxLength = 64;
    const bounded = value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
    return JSON.stringify(bounded);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return `[${Array.isArray(value) ? 'array' : typeof value}]`;
}

/**
 * Fold one validation-group change using the historical Angular semantics.
 *
 * Important compatibility behavior:
 * - an empty resulting array is preserved (ValidatorsSupport interprets it as
 *   all validators);
 * - `none`/legacy `empty` start from an empty array, while the configured
 *   `none` group is represented by the literal group name `none`;
 * - includes append only missing names and excludes remove the first present
 *   occurrence, matching the original client implementation;
 * - unknown names are retained for the authoritative caller to diagnose;
 * - an operation group array, when supplied, replaces the folded array last.
 */
export function calculateValidationGroups(
  currentValidationGroups: readonly string[],
  validationGroups: Readonly<FormValidationGroups>,
  initial: FormValidationGroupsChangeInitial = 'current',
  groups?: FormFieldValidationGroup,
  operationEnabledValidationGroups?: readonly string[]
): ValidationGroupCalculationResult {
  let enabledNames = [...currentValidationGroups];
  const diagnostics: RecordValidationDiagnostic[] = [];

  switch (initial) {
    case 'all':
      enabledNames = Object.keys(validationGroups);
      break;
    case 'none':
      enabledNames = [];
      break;
    case 'empty':
      enabledNames = [];
      diagnostics.push({
        code: VALIDATION_GROUP_EMPTY_INITIAL_DIAGNOSTIC,
        severity: 'warning',
        message: "Validation-group initial state 'empty' is deprecated; use 'none'.",
      });
      break;
    case 'current':
      break;
    default:
      diagnostics.push({
        code: VALIDATION_GROUP_UNKNOWN_INITIAL_DIAGNOSTIC,
        severity: 'error',
        message: `The validation-group initial state ${describeUnknownInitial(initial)} is not supported.`,
      });
  }

  for (const name of groups?.include ?? []) {
    if (!enabledNames.includes(name)) {
      enabledNames.push(name);
    }
  }

  for (const name of groups?.exclude ?? []) {
    const index = enabledNames.indexOf(name);
    if (index >= 0) {
      enabledNames.splice(index, 1);
    }
  }

  if (operationEnabledValidationGroups !== undefined) {
    enabledNames = [];
    for (const name of operationEnabledValidationGroups) {
      if (!enabledNames.includes(name)) {
        enabledNames.push(name);
      }
    }
  }

  return { enabledValidationGroups: enabledNames, diagnostics };
}

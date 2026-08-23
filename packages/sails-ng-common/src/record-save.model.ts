/**
 * Contracts shared by the browser and server for record-save operations.
 *
 * These are deliberately data-only contracts.  The server and Angular
 * packages provide their own runtime response classes while this package
 * remains safe to consume from either side of the application.
 */

import { LineagePath, LineagePathsOptional, LineagePathsPartial } from './config/names/naming-helpers';

export interface ActionResult {
  /** True when the requested primary action was completed. */
  success: boolean;
  /** The record identifier, when one is known. */
  oid: string;
  /** Compatibility summary for legacy callers. */
  message: string;
  /** Action-specific response data. */
  data?: unknown;
  /** Authoritative server-projected metadata, or null when unavailable. */
  metadata: Record<string, unknown> | null;
}

export type RecordSaveOutcome = 'saved' | 'saved-with-warnings' | 'not-saved' | 'unknown';

export type RecordSaveProblemKind =
  | 'validation'
  | 'processing'
  | 'authorization'
  | 'system'
  | 'network';

export type RecordSavePhase =
  | 'pre-save'
  | 'persistence'
  | 'attachments'
  | 'post-save'
  | 'response'
  | 'transport';

export type RecordSaveValidatorParameterPrimitive = string | number | boolean | null;
export type RecordSaveValidatorParameterValue =
  | RecordSaveValidatorParameterPrimitive
  | RecordSaveValidatorParameterPrimitive[];
export type RecordSaveValidatorParameters = Record<string, RecordSaveValidatorParameterValue>;

export const RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS = {
  maxEntries: 16,
  maxKeyLength: 64,
  maxStringLength: 256,
  maxArrayLength: 16,
  maxSerializedLength: 4_096,
} as const;

export const RECORD_SAVE_VALIDATOR_CLASS_MAX_LENGTH = 128;
export const RECORD_SAVE_MESSAGE_MAX_LENGTH = 1_024;
export const RECORD_SAVE_VALIDATOR_PARAMETER_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;
export const RECORD_SAVE_PUBLIC_FIELD_LIMITS = {
  maxCodeLength: 128,
  maxFieldLength: 128,
  maxPointerLength: 2_048,
  maxAttachmentIdLength: 128,
} as const;
export const RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const RECORD_SAVE_LINEAGE_LIMITS = {
  maxSegments: 64,
  maxSegmentLength: 128,
  maxPointerLength: 2_048,
} as const;

export interface RecordSaveIssue {
  /** A safe, stable identifier suitable for translation or support lookup. */
  code?: string;
  /** Safe user-facing text. Raw provider/exception text must not be placed here. */
  message: string;
  /** Configured form field name, when the issue maps unambiguously. */
  field?: string;
  /** JSON pointer into Angular or record metadata, when available. */
  pointer?: string;
  /** Logical attachment identity, never a storage key or path. */
  attachmentId?: string;
  /** Validator implementation class, when this is a validator failure. */
  class?: string;
  /** Bounded scalar parameters used to render a configured validator message. */
  params?: RecordSaveValidatorParameters;
  /** Validator-configured field ownership override. */
  targetField?: LineagePathsPartial;
  /** Lineage of the field or form control that produced the issue. */
  lineagePaths?: LineagePathsOptional;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

type PublicValidatorParameterRule = 'boolean' | 'number' | 'source-type';

/**
 * Validator parameters are not a generic public bag. This allowlist contains
 * only bounded derived facts needed by shipped translations; submitted values,
 * configured patterns/expressions/descriptions, and provider details stay
 * server-side.
 */
const PUBLIC_VALIDATOR_PARAMETER_RULES: Readonly<Record<string, Readonly<Record<string, PublicValidatorParameterRule>>>> = {
  min: { requiredThreshold: 'number' },
  max: { requiredThreshold: 'number' },
  minLength: { actualLength: 'number', requiredLength: 'number' },
  maxLength: { actualLength: 'number', requiredLength: 'number' },
  required: { required: 'boolean' },
  requiredTrue: { required: 'boolean' },
  'different-values': { controlCount: 'number', valueCount: 'number' },
  'typeahead-source': { multiSelect: 'boolean', sourceType: 'source-type' },
};

function safeValidatorParameterForRule(
  value: unknown,
  rule: PublicValidatorParameterRule
): RecordSaveValidatorParameterPrimitive | undefined {
  if (rule === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  if (rule === 'boolean') return typeof value === 'boolean' ? value : undefined;
  return value === 'static' || value === 'vocabulary' || value === 'query' || value === 'service'
    ? value
    : undefined;
}

/** Remove non-allowlisted, executable, excessive, and otherwise unsafe validator parameters. */
export function sanitizeRecordSaveValidatorParameters(
  value: unknown,
  validatorClass?: unknown
): RecordSaveValidatorParameters | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const rules = typeof validatorClass === 'string' ? PUBLIC_VALIDATOR_PARAMETER_RULES[validatorClass] : undefined;
  if (!rules) return undefined;
  const result: RecordSaveValidatorParameters = {};
  let acceptedEntries = 0;
  for (const [key, rawValue] of Object.entries(value)) {
    if (acceptedEntries >= RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS.maxEntries) {
      break;
    }
    if (
      !RECORD_SAVE_VALIDATOR_PARAMETER_KEY_PATTERN.test(key) ||
      key.length > RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS.maxKeyLength
    ) {
      continue;
    }
    const rule = rules[key];
    const safeValue = rule ? safeValidatorParameterForRule(rawValue, rule) : undefined;

    if (safeValue === undefined) {
      continue;
    }
    const candidate = { ...result, [key]: safeValue };
    if (JSON.stringify(candidate).length <= RECORD_SAVE_VALIDATOR_PARAMETER_LIMITS.maxSerializedLength) {
      result[key] = safeValue;
      acceptedEntries += 1;
    }
  }
  return acceptedEntries > 0 ? result : undefined;
}

function sanitizeLineagePath(value: unknown): LineagePath | undefined {
  if (!Array.isArray(value) || value.length > RECORD_SAVE_LINEAGE_LIMITS.maxSegments) {
    return undefined;
  }
  const result: LineagePath = [];
  for (const segment of value) {
    if (typeof segment === 'string') {
      if (segment.length > RECORD_SAVE_LINEAGE_LIMITS.maxSegmentLength) {
        return undefined;
      }
      result.push(segment);
    } else if (typeof segment === 'number' && Number.isSafeInteger(segment) && segment >= 0) {
      result.push(segment);
    } else {
      return undefined;
    }
  }
  return result;
}

function sanitizeLineagePathProperties(value: unknown): LineagePathsPartial | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const result: LineagePathsPartial = {};
  for (const key of ['formConfig', 'dataModel', 'angularComponents', 'layout'] as const) {
    if (value[key] !== undefined) {
      const path = sanitizeLineagePath(value[key]);
      if (path !== undefined) {
        result[key] = path;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeLineagePaths(value: unknown): LineagePathsOptional | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const result: LineagePathsOptional = sanitizeLineagePathProperties(value) ?? {};
  for (const key of ['angularComponentsJsonPointer', 'layoutJsonPointer'] as const) {
    const pointer = value[key];
    if (typeof pointer === 'string' && pointer.length <= RECORD_SAVE_LINEAGE_LIMITS.maxPointerLength) {
      result[key] = pointer;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Copy only the public issue allowlist and normalize bounded validator/lineage
 * metadata. This is suitable for a response serialization boundary.
 */
export function sanitizeRecordSaveIssue(value: unknown): RecordSaveIssue {
  const item = isPlainRecord(value) ? value : {};
  const issue: RecordSaveIssue = {
    message: typeof item.message === 'string' ? item.message.slice(0, RECORD_SAVE_MESSAGE_MAX_LENGTH) : '',
  };
  const code = item.code;
  if (
    typeof code === 'string' &&
    code.length <= RECORD_SAVE_PUBLIC_FIELD_LIMITS.maxCodeLength &&
    RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN.test(code)
  ) issue.code = code;
  const field = item.field;
  if (
    typeof field === 'string' &&
    field.length <= RECORD_SAVE_PUBLIC_FIELD_LIMITS.maxFieldLength &&
    RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN.test(field)
  ) issue.field = field;
  const pointer = item.pointer;
  if (
    typeof pointer === 'string' &&
    pointer.startsWith('/') &&
    pointer.length <= RECORD_SAVE_PUBLIC_FIELD_LIMITS.maxPointerLength
  ) issue.pointer = pointer;
  const attachmentId = item.attachmentId;
  if (
    typeof attachmentId === 'string' &&
    attachmentId.length <= RECORD_SAVE_PUBLIC_FIELD_LIMITS.maxAttachmentIdLength &&
    RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN.test(attachmentId)
  ) issue.attachmentId = attachmentId;
  if (
    typeof item.class === 'string' &&
    item.class.length <= RECORD_SAVE_VALIDATOR_CLASS_MAX_LENGTH &&
    RECORD_SAVE_PUBLIC_IDENTIFIER_PATTERN.test(item.class)
  ) {
    issue.class = item.class;
  }
  const params = sanitizeRecordSaveValidatorParameters(item.params, issue.class);
  if (params !== undefined) {
    issue.params = params;
  }
  const targetField = sanitizeLineagePathProperties(item.targetField);
  if (targetField !== undefined) {
    issue.targetField = targetField;
  }
  const lineagePaths = sanitizeLineagePaths(item.lineagePaths);
  if (lineagePaths !== undefined) {
    issue.lineagePaths = lineagePaths;
  }
  return issue;
}

export interface RecordSaveProblem {
  kind: RecordSaveProblemKind;
  phase: RecordSavePhase;
  issues: RecordSaveIssue[];
}

export type RecordAttachmentOperation = 'add' | 'finalize' | 'delete';
export type RecordAttachmentItemStatus = 'completed' | 'incomplete' | 'unknown';
export type RecordAttachmentCompletionStatus = 'not-required' | 'completed' | 'incomplete' | 'unknown';

export interface RecordAttachmentCompletionItem {
  field: string;
  attachmentId: string;
  fileId?: string;
  operation: RecordAttachmentOperation;
  status: RecordAttachmentItemStatus;
  /** A safe, bounded code such as attachment-reupload-required. */
  code?: string;
}

export interface RecordAttachmentCompletion {
  status: RecordAttachmentCompletionStatus;
  items: RecordAttachmentCompletionItem[];
}

export interface RecordSaveCompletion {
  attachments: RecordAttachmentCompletion;
}

export interface RecordSaveResult extends ActionResult {
  outcome: RecordSaveOutcome;
  problems: RecordSaveProblem[];
  completion: RecordSaveCompletion;
  requestId: string;
}

export type StorageMutationApplicationState = 'applied' | 'not-applied' | 'unknown';

export function emptyRecordSaveCompletion(): RecordSaveCompletion {
  return {
    attachments: {
      status: 'not-required',
      items: [],
    },
  };
}

/**
 * Reduce item-level attachment facts into the public aggregate status.
 * Unknown takes precedence over incomplete because it represents less
 * certainty about the physical operation.
 */
export function reduceAttachmentStatus(
  items: readonly RecordAttachmentCompletionItem[],
): RecordAttachmentCompletionStatus {
  if (items.length === 0) {
    return 'not-required';
  }
  if (items.some((item) => item.status === 'unknown')) {
    return 'unknown';
  }
  if (items.some((item) => item.status === 'incomplete')) {
    return 'incomplete';
  }
  return 'completed';
}

export function isRecordSaveOutcome(value: unknown): value is RecordSaveOutcome {
  return value === 'saved'
    || value === 'saved-with-warnings'
    || value === 'not-saved'
    || value === 'unknown';
}

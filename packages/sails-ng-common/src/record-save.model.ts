/**
 * Contracts shared by the browser and server for record-save operations.
 *
 * These are deliberately data-only contracts.  The server and Angular
 * packages provide their own runtime response classes while this package
 * remains safe to consume from either side of the application.
 */

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

export interface RecordSaveIssue {
  /** A safe, stable identifier suitable for translation or support lookup. */
  code?: string;
  /** Safe user-facing text. Raw provider/exception text must not be placed here. */
  message: string;
  /** Configured form field name, when the issue maps unambiguously. */
  field?: string;
  /** JSON pointer into Angular or record metadata, when available. */
  pointer?: string;
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


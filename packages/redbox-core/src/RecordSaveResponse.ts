import { randomUUID } from 'node:crypto';
import {
  emptyRecordSaveCompletion,
  reduceAttachmentStatus,
  sanitizeRecordSaveIssue,
  RecordAttachmentCompletionItem,
  RecordSaveIssue,
  RecordSavePhase,
  RecordSaveProblem,
  RecordSaveProblemKind,
  RecordSaveResult,
  RecordSaveOutcome,
  StorageMutationApplicationState,
  RECORD_VALIDATION_REFERENCE_PATTERN,
  VALIDATION_OPERATION_NAME_PATTERN,
} from '@researchdatabox/sails-ng-common';
import { StorageServiceResponse } from './StorageServiceResponse';

export type RecordSaveRouteFamily = 'browser' | 'api' | 'internal';
export type RecordSaveOperation = 'create' | 'update' | 'transition';
export type RecordValidationContextJSONValue =
  | string
  | number
  | boolean
  | null
  | readonly RecordValidationContextJSONValue[]
  | { readonly [key: string]: RecordValidationContextJSONValue };

/** Reasons approved for the narrowly scoped internal validation bypass. */
export const RECORD_VALIDATION_BYPASS_REASONS = [
  'historical-record-repair',
  'trusted-data-migration',
  'configuration-recovery',
] as const;

export type RecordValidationBypassReason = (typeof RECORD_VALIDATION_BYPASS_REASONS)[number];

const SAFE_VALIDATION_BYPASS_SERVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

export function isRecordValidationBypassReason(value: unknown): value is RecordValidationBypassReason {
  return typeof value === 'string' && (RECORD_VALIDATION_BYPASS_REASONS as readonly string[]).includes(value);
}

/**
 * Deliberately awkward internal-only capability.  A string flag is not a
 * bypass: callers must identify the responsible service and use an approved
 * reason so the decision can be durably audited.
 */
export interface InternalRecordValidationBypass {
  readonly mode: 'bypass';
  readonly reason: RecordValidationBypassReason;
  readonly actor: {
    readonly kind: 'service';
    readonly id: string;
  };
}

/** Runtime guard for JavaScript callers crossing the internal capability boundary. */
export function isInternalRecordValidationBypass(value: unknown): value is InternalRecordValidationBypass {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const actor = candidate.actor;
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) return false;
  const actorCandidate = actor as Record<string, unknown>;
  return (
    candidate.mode === 'bypass' &&
    isRecordValidationBypassReason(candidate.reason) &&
    actorCandidate.kind === 'service' &&
    typeof actorCandidate.id === 'string' &&
    SAFE_VALIDATION_BYPASS_SERVICE_ID.test(actorCandidate.id.trim())
  );
}

export interface RecordSaveContext {
  requestId: string;
  routeFamily?: RecordSaveRouteFamily;
  operation?: RecordSaveOperation;
  /** Server-owned workflow target copied from the matched route, not inferred from a resolved step object. */
  targetStep?: string;
  /** Server-owned business intent; never conflated with the CRUD operation. */
  validationOperation?: string;
  /** Explicit, JSON-only request facts; the validation config allowlist narrows these again. */
  validationRequestParameters?: Readonly<Record<string, RecordValidationContextJSONValue>>;
  /** Server-owned, JSON-only execution facts. Never place sessions, headers, or tokens here. */
  validationRuntimeContext?: Readonly<Record<string, RecordValidationContextJSONValue>>;
  /** Accepted only when routeFamily is explicitly `internal`. */
  validationBypass?: InternalRecordValidationBypass;
}

export const RECORD_VALIDATION_REQUEST_FACT_NAMES = [
  'recordType',
  'targetStep',
  'merge',
  'datastreams',
] as const;

/**
 * Project the same bounded request facts for browser and API transports.
 * Sources are checked in order and accessors are never invoked.
 */
export function normalizeRecordValidationRequestFacts(
  ...sources: readonly unknown[]
): Readonly<Record<string, RecordValidationContextJSONValue>> {
  const result: Record<string, RecordValidationContextJSONValue> = {};
  for (const name of RECORD_VALIDATION_REQUEST_FACT_NAMES) {
    for (const source of sources) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(source, name);
      if (!descriptor || !('value' in descriptor) || descriptor.value === undefined) continue;
      const value = descriptor.value;
      if (name === 'recordType' || name === 'targetStep') {
        const normalized = typeof value === 'string' ? value.trim() : '';
        if (RECORD_VALIDATION_REFERENCE_PATTERN.test(normalized)) {
          result[name] = normalized;
          break;
        }
      } else if (value === true || value === false) {
        result[name] = value;
        break;
      } else if (value === 'true' || value === 'false') {
        result[name] = value === 'true';
        break;
      }
    }
  }
  return result;
}

/** Shared transport-neutral runtime facts; public callers cannot add objects. */
export function recordValidationRuntimeFacts(
  context: Pick<RecordSaveContext, 'routeFamily' | 'operation' | 'validationRuntimeContext'>,
  writeKind: RecordSaveOperation
): Readonly<Record<string, RecordValidationContextJSONValue>> {
  const routeFamily = context.routeFamily ?? 'internal';
  return {
    ...(routeFamily === 'internal' ? context.validationRuntimeContext ?? {} : {}),
    routeFamily,
    writeKind,
    saveOperation: context.operation ?? writeKind,
  };
}

export type PublicValidationOperationParseResult =
  | { readonly valid: true; readonly value?: string }
  | { readonly valid: false };

/** Narrow and trim the public operation field before it enters save context. */
export function parsePublicValidationOperation(value: unknown): PublicValidationOperationParseResult {
  if (value === undefined || value === null) return { valid: true };
  if (typeof value !== 'string') return { valid: false };
  const normalized = value.trim();
  return VALIDATION_OPERATION_NAME_PATTERN.test(normalized)
    ? { valid: true, value: normalized }
    : { valid: false };
}

/** A typed response for record metadata save operations. */
export class RecordSaveResponse extends StorageServiceResponse implements RecordSaveResult {
  outcome: RecordSaveOutcome = 'not-saved';
  problems: RecordSaveProblem[] = [];
  completion = emptyRecordSaveCompletion();
  requestId: string;
  readonly context: RecordSaveContext;
  /** Legacy API v1 fields populated by the RDMP workspace post-save hook. */
  workspaceOid?: string;
  workspaceData?: unknown;

  constructor(context: RecordSaveContext = createRecordSaveContext()) {
    super();
    this.context = context;
    this.requestId = context.requestId;
  }

  /** True when the primary metadata mutation is known to have been applied. */
  public wasPersisted(): boolean {
    return this.outcome === 'saved' || this.outcome === 'saved-with-warnings';
  }

  public addProblem(problem: RecordSaveProblem): void {
    this.problems.push(cloneProblem(problem));
    this.downgradeCompleteSave();
  }

  public setAttachmentItems(items: readonly RecordAttachmentCompletionItem[]): void {
    const copiedItems = items.map((item) => ({ ...item }));
    this.completion = {
      attachments: {
        status: reduceAttachmentStatus(copiedItems),
        items: copiedItems,
      },
    };
    if (this.completion.attachments.status === 'incomplete' || this.completion.attachments.status === 'unknown') {
      this.downgradeCompleteSave();
    }
  }

  public setProjectedMetadata(metadata: Record<string, unknown> | null): void {
    this.metadata = metadata;
  }

  public confirmPrimaryPersistence(oid: string, source?: StorageServiceResponse): void {
    if (this.outcome === 'unknown') return;
    this.oid = oid ?? '';
    if (source) {
      this.message = typeof source.message === 'string' ? source.message : '';
      this.data = source.data;
      this.metadata = source.metadata ?? null;
      this.totalItems = source.totalItems;
      this.items = Array.isArray(source.items) ? source.items.map((item) => ({ ...item })) : [];
    }
    this.outcome = 'saved';
    this.success = true;
  }

  public recordPrimaryNotApplied(problem?: RecordSaveProblem): void {
    this.recordPrimaryFailure('not-saved', problem);
  }

  public recordPrimaryUnknown(problem?: RecordSaveProblem): void {
    this.recordPrimaryFailure('unknown', problem);
  }

  public recordPostPersistenceProblem(problem: RecordSaveProblem): void {
    this.addProblem(problem);
  }

  public mergeLegacyHookFields(source: unknown): void {
    if (!source || typeof source !== 'object') return;
    const fields = source as Record<string, unknown>;
    if (typeof fields.workspaceOid === 'string' && fields.workspaceOid.trim()) this.workspaceOid = fields.workspaceOid;
    if (Object.hasOwn(fields, 'workspaceData')) this.workspaceData = fields.workspaceData;
  }

  /**
   * A persisted save can only ever move from `saved` to `saved-with-warnings`.
   * Non-persisted outcomes are left untouched so a later warning cannot
   * manufacture a commit that never happened.
   */
  private downgradeCompleteSave(): void {
    if (this.outcome === 'saved') {
      this.outcome = 'saved-with-warnings';
    }
  }

  private recordPrimaryFailure(outcome: Extract<RecordSaveOutcome, 'not-saved' | 'unknown'>, problem?: RecordSaveProblem): void {
    if (this.wasPersisted()) {
      return;
    }
    this.outcome = outcome;
    this.success = false;
    if (problem) {
      this.addProblem(problem);
    }
  }
}

function cloneProblem(problem: RecordSaveProblem): RecordSaveProblem {
  return { ...problem, issues: problem.issues.map(sanitizeRecordSaveIssue) };
}

export function isCanonicalSaveRequestId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createRecordSaveContext(context: Partial<RecordSaveContext> = {}): RecordSaveContext {
  return {
    requestId: isCanonicalSaveRequestId(context.requestId) ? context.requestId : randomUUID(),
    routeFamily: context.routeFamily,
    operation: context.operation,
    targetStep: context.targetStep,
    validationOperation: context.validationOperation,
    validationRequestParameters: context.validationRequestParameters,
    validationRuntimeContext: context.validationRuntimeContext,
    validationBypass: context.validationBypass,
  };
}

/**
 * Read the client-supplied save request ID from request headers.  Node
 * lower-cases incoming header names, and anything that is not a single
 * canonical UUID is replaced by a server-generated value.
 */
export function readSaveRequestId(headers: Record<string, unknown> | undefined): string | undefined {
  const header = headers?.['x-redbox-save-request-id'];
  return isCanonicalSaveRequestId(header) ? header : undefined;
}

export function recordSaveContextFromHeaders(
  headers: Record<string, unknown> | undefined,
  routeFamily: RecordSaveRouteFamily,
  operation: RecordSaveOperation,
  context: Partial<Pick<
    RecordSaveContext,
    'targetStep' | 'validationOperation' | 'validationRequestParameters'
  >> = {},
): RecordSaveContext {
  return createRecordSaveContext({
    requestId: readSaveRequestId(headers),
    routeFamily,
    operation,
    ...context,
  });
}

export function legacyRecordSaveBody(result: RecordSaveResponse): Record<string, unknown> {
  return {
    success: result.success,
    oid: result.oid,
    message: result.message,
    data: result.data,
    metadata: result.metadata,
    details: result.details,
    totalItems: result.totalItems,
    items: result.items,
    ...(result.workspaceOid ? { workspaceOid: result.workspaceOid } : {}),
    ...(result.workspaceData !== undefined ? { workspaceData: result.workspaceData } : {}),
  };
}

/**
 * HTTP status for a save that did not persist.  Persisted outcomes never
 * reach here: once primary metadata is applied the route family decides the
 * success status and the warnings travel in the typed result.
 */
export function recordSaveFailureStatus(result: Pick<RecordSaveResult, 'outcome' | 'problems'> | null | undefined): number {
  if (result?.outcome !== 'not-saved') {
    // `unknown` is deliberately a 5xx: the client must not assume a non-write.
    return 500;
  }
  // Select the most severe transport classification independently of problem
  // insertion order: system-like failures outrank authorization, which
  // outranks ordinary validation failures.
  if (result.problems.some(problem => problem.kind !== 'validation' && problem.kind !== 'authorization')) return 500;
  if (result.problems.some(problem => problem.kind === 'authorization')) return 403;
  if (result.problems.some(problem => problem.kind === 'validation')) return 400;
  return 500;
}

export function recordSaveFailureStatusForVersion(
  apiVersion: string,
  result: Pick<RecordSaveResult, 'outcome' | 'problems'> | null | undefined,
): number {
  return apiVersion === '2.0' ? recordSaveFailureStatus(result) : 500;
}

export type StorageMutationLogger = (message: string, details?: Record<string, unknown>) => void;

/**
 * Normalize old and new adapter responses at one boundary.  Legacy success
 * is trusted temporarily for compatibility; legacy false is ambiguous
 * because a failed call is not proof that nothing was written.
 */
export function resolveStorageMutationState(
  response: StorageServiceResponse | null | undefined,
  logDeprecation?: StorageMutationLogger,
): StorageMutationApplicationState {
  const explicit = response?.applicationState;
  if (explicit === 'applied' || explicit === 'not-applied' || explicit === 'unknown') {
    return explicit;
  }
  if (response?.success === true) {
    logDeprecation?.('Legacy storage mutation response omitted application state', { oid: response.oid });
    return 'applied';
  }
  return 'unknown';
}

export function recordSaveProblem(
  kind: RecordSaveProblemKind,
  phase: RecordSavePhase,
  message: string,
  code?: string,
  issue: Partial<RecordSaveIssue> = {},
): RecordSaveProblem {
  return {
    kind,
    phase,
    issues: [sanitizeRecordSaveIssue({ ...issue, ...(code ? { code } : {}), message })],
  };
}

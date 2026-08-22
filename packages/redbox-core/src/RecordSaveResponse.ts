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
} from '@researchdatabox/sails-ng-common';
import { StorageMutationResponse, StorageServiceResponse } from './StorageServiceResponse';

export type RecordSaveRouteFamily = 'browser' | 'api' | 'internal';
export type RecordSaveOperation = 'create' | 'update' | 'transition';

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
  /** Server-owned business intent; never conflated with the CRUD operation. */
  validationOperation?: string;
  /** Accepted only when routeFamily is explicitly `internal`. */
  validationBypass?: InternalRecordValidationBypass;
}

/** A typed response for record metadata save operations. */
export class RecordSaveResponse extends StorageServiceResponse implements RecordSaveResult {
  outcome: RecordSaveOutcome = 'not-saved';
  problems: RecordSaveProblem[] = [];
  completion = emptyRecordSaveCompletion();
  requestId: string;
  /** Legacy API v1 fields populated by the RDMP workspace post-save hook. */
  workspaceOid?: string;
  workspaceData?: unknown;

  constructor(requestId: string = randomUUID()) {
    super();
    this.requestId = requestId;
  }

  /** True when the primary metadata mutation is known to have been applied. */
  public wasPersisted(): boolean {
    return this.outcome === 'saved' || this.outcome === 'saved-with-warnings';
  }

  /** True only when all required awaited save phases completed. */
  public isComplete(): boolean {
    return this.outcome === 'saved';
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
}

/**
 * Small state owner used by RecordsService.  Callers cannot accidentally
 * downgrade a confirmed commit while handling a later warning.
 */
export class RecordSaveTracker {
  private readonly response: RecordSaveResponse;

  constructor(public readonly context: RecordSaveContext) {
    this.response = new RecordSaveResponse(context.requestId);
  }

  public get result(): RecordSaveResponse {
    return this.response;
  }

  public confirmPrimaryPersistence(oid: string, source?: StorageServiceResponse): void {
    if (this.response.outcome === 'unknown') {
      return;
    }
    this.response.oid = oid ?? '';
    if (source) {
      // Preserve only compatibility-safe action fields.  Adapter diagnostics
      // stay in logs rather than crossing the save-result boundary.
      this.response.message = typeof source.message === 'string' ? source.message : '';
      this.response.data = source.data;
      this.response.metadata = source.metadata ?? null;
      this.response.totalItems = source.totalItems;
      this.response.items = Array.isArray(source.items) ? source.items.map((item) => ({ ...item })) : [];
    }
    this.response.outcome = 'saved';
    this.response.success = true;
  }

  public recordPrimaryNotApplied(problem?: RecordSaveProblem): void {
    this.recordPrimaryFailure('not-saved', problem);
  }

  public recordPrimaryUnknown(problem?: RecordSaveProblem): void {
    this.recordPrimaryFailure('unknown', problem);
  }

  public recordPostPersistenceProblem(problem: RecordSaveProblem): void {
    this.response.addProblem(problem);
  }

  public setAttachmentItems(items: readonly RecordAttachmentCompletionItem[]): void {
    this.response.setAttachmentItems(items);
  }

  public setProjectedMetadata(metadata: Record<string, unknown> | null): void {
    this.response.setProjectedMetadata(metadata);
  }

  /** Preserve the narrowly scoped legacy fields without exposing tracked save state to hooks. */
  public mergeLegacyHookFields(source: unknown): void {
    if (!source || typeof source !== 'object') {
      return;
    }
    const hookFields = source as Record<string, unknown>;
    if (typeof hookFields.workspaceOid === 'string' && hookFields.workspaceOid.trim()) {
      this.response.workspaceOid = hookFields.workspaceOid;
    }
    if (Object.hasOwn(hookFields, 'workspaceData')) {
      this.response.workspaceData = hookFields.workspaceData;
    }
  }

  /** A detached copy, so callers cannot mutate tracked state after the fact. */
  public toResponse(): RecordSaveResponse {
    const copy = new RecordSaveResponse(this.response.requestId);
    copy.success = this.response.success;
    copy.oid = this.response.oid;
    copy.message = this.response.message;
    copy.data = this.response.data;
    copy.metadata = this.response.metadata;
    copy.details = this.response.details;
    copy.totalItems = this.response.totalItems;
    copy.items = this.response.items.map((item) => ({ ...item }));
    copy.outcome = this.response.outcome;
    copy.problems = this.response.problems.map(cloneProblem);
    copy.completion = {
      attachments: {
        status: this.response.completion.attachments.status,
        items: this.response.completion.attachments.items.map((item) => ({ ...item })),
      },
    };
    copy.workspaceOid = this.response.workspaceOid;
    copy.workspaceData = this.response.workspaceData;
    return copy;
  }

  private recordPrimaryFailure(outcome: Extract<RecordSaveOutcome, 'not-saved' | 'unknown'>, problem?: RecordSaveProblem): void {
    if (this.response.wasPersisted()) {
      return;
    }
    this.response.outcome = outcome;
    this.response.success = false;
    if (problem) {
      this.response.addProblem(problem);
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
    validationOperation: context.validationOperation,
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
  switch (result.problems[0]?.kind) {
    case 'validation':
      return 400;
    case 'authorization':
      return 403;
    default:
      return 500;
  }
}

export type StorageMutationLogger = (message: string, details?: Record<string, unknown>) => void;

/**
 * Normalize old and new adapter responses at one boundary.  Legacy success
 * is trusted temporarily for compatibility; legacy false is ambiguous
 * because a failed call is not proof that nothing was written.
 */
export function resolveStorageMutationState(
  response: StorageServiceResponse | StorageMutationResponse | null | undefined,
  logDeprecation?: StorageMutationLogger,
): StorageMutationApplicationState {
  const explicit = (response as StorageMutationResponse | null | undefined)?.applicationState;
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

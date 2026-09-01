import { randomUUID } from 'node:crypto';
import {
  emptyRecordSaveCompletion,
  reduceAttachmentStatus,
  RecordAttachmentCompletionItem,
  RecordSaveIssue,
  RecordSavePhase,
  RecordSaveProblem,
  RecordSaveProblemKind,
  RecordSaveResult,
  RecordSaveOutcome,
  StorageMutationApplicationState,
} from '@researchdatabox/sails-ng-common';
import { StorageServiceResponse } from './StorageServiceResponse';

export type RecordSaveRouteFamily = 'browser' | 'api' | 'internal';
export type RecordSaveOperation = 'create' | 'update' | 'transition';

export interface RecordSaveContext {
  requestId: string;
  routeFamily?: RecordSaveRouteFamily;
  operation?: RecordSaveOperation;
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
  return { ...problem, issues: problem.issues.map((issue) => ({ ...issue })) };
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
): RecordSaveContext {
  return createRecordSaveContext({ requestId: readSaveRequestId(headers), routeFamily, operation });
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
  switch (result.problems[0]?.kind) {
    case 'validation':
      return 400;
    case 'authorization':
      return 403;
    default:
      return 500;
  }
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
    issues: [{ ...issue, ...(code ? { code } : {}), message }],
  };
}

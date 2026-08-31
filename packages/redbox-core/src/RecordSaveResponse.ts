import { randomUUID } from 'node:crypto';
import { cloneDeep as _cloneDeep } from 'lodash';
import {
  emptyRecordSaveCompletion,
  isRecordConcurrencyResolution,
  isRecordFormFingerprint,
  isRecordRevision,
  isRecordSaveRequestId,
  reduceAttachmentStatus,
  sanitizeRecordConcurrencyMetadata,
  sanitizeRecordSaveIssue,
  RecordAttachmentCompletionItem,
  RecordConcurrencyMetadata,
  RecordConcurrencyProblemCode,
  RecordConcurrencyResolution,
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
import { StorageMutationResponse, StorageServiceResponse } from './StorageServiceResponse';

export type RecordSaveRouteFamily = 'browser' | 'api' | 'internal';
export type RecordSaveOperation = 'create' | 'update' | 'transition' | 'delete' | 'restore' | 'purge';
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
  /** Trusted transport-neutral optimistic-concurrency facts. */
  concurrency?: RecordConcurrencyContext;
}

/**
 * Normalized concurrency facts supplied by a controller or trusted internal
 * helper. Raw requests, headers, users, and record candidates must not cross
 * this boundary.
 */
export interface RecordConcurrencyContext {
  readonly expectedRevision?: number;
  readonly entityTagSupplied: boolean;
  readonly formFingerprint?: string;
  readonly resolution?: RecordConcurrencyResolution;
  /** Diagnostic linkage only; this is not an idempotency key. */
  readonly resolutionOfRequestId?: string;
}

export const RECORD_VALIDATION_REQUEST_FACT_NAMES = ['recordType', 'targetStep', 'merge', 'datastreams'] as const;

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
    ...(routeFamily === 'internal' ? (context.validationRuntimeContext ?? {}) : {}),
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
  return VALIDATION_OPERATION_NAME_PATTERN.test(normalized) ? { valid: true, value: normalized } : { valid: false };
}

/** A typed response for record metadata save operations. */
export class RecordSaveResponse extends StorageServiceResponse implements RecordSaveResult {
  outcome: RecordSaveOutcome = 'not-saved';
  problems: RecordSaveProblem[] = [];
  completion = emptyRecordSaveCompletion();
  requestId: string;
  readonly context: RecordSaveContext;
  concurrency?: RecordConcurrencyMetadata;
  /** Legacy API v1 fields populated by the RDMP workspace post-save hook. */
  workspaceOid?: string;
  workspaceData?: unknown;

  constructor(context: RecordSaveContext | string = createRecordSaveContext()) {
    super();
    this.context = typeof context === 'string' ? createRecordSaveContext({ requestId: context }) : context;
    this.requestId = this.context.requestId;
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
    const copiedItems = _cloneDeep(items) as RecordAttachmentCompletionItem[];
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
    this.metadata = _cloneDeep(metadata);
  }

  /** Retain only bounded server-owned concurrency diagnostics. */
  public setConcurrencyMetadata(metadata: unknown): void {
    this.concurrency = sanitizeRecordConcurrencyMetadata(metadata);
  }

  /** Compatibility view used by save-pipeline code while the response owns its state directly. */
  public get result(): RecordSaveResponse {
    return this;
  }

  public confirmPrimaryPersistence(oid: string, source?: StorageServiceResponse): void {
    if (this.outcome === 'unknown') return;
    this.oid = oid ?? '';
    if (source) {
      this.message = typeof source.message === 'string' ? source.message : '';
      this.data = _cloneDeep(source.data);
      this.metadata = _cloneDeep(source.metadata ?? null);
      this.totalItems = source.totalItems;
      this.items = Array.isArray(source.items) ? _cloneDeep(source.items) : [];
    }
    this.outcome = this.problems.length > 0 ? 'saved-with-warnings' : 'saved';
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

  public recordWarning(problem: RecordSaveProblem): void {
    this.addProblem(problem);
  }

  public mergeLegacyHookFields(source: unknown): void {
    if (!source || typeof source !== 'object') return;
    const fields = source as Record<string, unknown>;
    if (typeof fields.workspaceOid === 'string' && fields.workspaceOid.trim()) this.workspaceOid = fields.workspaceOid;
    if (Object.hasOwn(fields, 'workspaceData')) this.workspaceData = _cloneDeep(fields.workspaceData);
  }

  public toResponse(): RecordSaveResponse {
    const copy = new RecordSaveResponse(this.context);
    copy.success = this.success;
    copy.oid = this.oid;
    copy.message = this.message;
    copy.data = _cloneDeep(this.data);
    copy.metadata = _cloneDeep(this.metadata);
    copy.details = _cloneDeep(this.details);
    copy.totalItems = this.totalItems;
    copy.items = _cloneDeep(this.items);
    copy.outcome = this.outcome;
    copy.problems = this.problems.map(cloneProblem);
    copy.completion = _cloneDeep(this.completion);
    copy.setConcurrencyMetadata(this.concurrency);
    copy.workspaceOid = this.workspaceOid;
    copy.workspaceData = _cloneDeep(this.workspaceData);
    return copy;
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

  private recordPrimaryFailure(
    outcome: Extract<RecordSaveOutcome, 'not-saved' | 'unknown'>,
    problem?: RecordSaveProblem
  ): void {
    if (this.wasPersisted()) return;
    this.outcome = outcome;
    this.success = false;
    if (problem) this.addProblem(problem);
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
      this.response.data = _cloneDeep(source.data);
      this.response.metadata = _cloneDeep(source.metadata ?? null);
      this.response.totalItems = source.totalItems;
      this.response.items = Array.isArray(source.items) ? _cloneDeep(source.items) : [];
    }
    this.response.outcome = this.response.problems.length > 0 ? 'saved-with-warnings' : 'saved';
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

  /** Track a nonblocking warning before or after the primary commit. */
  public recordWarning(problem: RecordSaveProblem): void {
    this.response.addProblem(problem);
  }

  public setAttachmentItems(items: readonly RecordAttachmentCompletionItem[]): void {
    this.response.setAttachmentItems(items);
  }

  public setProjectedMetadata(metadata: Record<string, unknown> | null): void {
    this.response.setProjectedMetadata(metadata);
  }

  public setConcurrencyMetadata(metadata: unknown): void {
    this.response.setConcurrencyMetadata(metadata);
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
      this.response.workspaceData = _cloneDeep(hookFields.workspaceData);
    }
  }

  /** A detached copy, so callers cannot mutate tracked state after the fact. */
  public toResponse(): RecordSaveResponse {
    const copy = new RecordSaveResponse(this.response.requestId);
    copy.success = this.response.success;
    copy.oid = this.response.oid;
    copy.message = this.response.message;
    copy.data = _cloneDeep(this.response.data);
    copy.metadata = _cloneDeep(this.response.metadata);
    copy.details = _cloneDeep(this.response.details);
    copy.totalItems = this.response.totalItems;
    copy.items = _cloneDeep(this.response.items);
    copy.outcome = this.response.outcome;
    copy.problems = this.response.problems.map(cloneProblem);
    copy.completion = {
      attachments: {
        status: this.response.completion.attachments.status,
        items: _cloneDeep(this.response.completion.attachments.items),
      },
    };
    copy.setConcurrencyMetadata(this.response.concurrency);
    copy.workspaceOid = this.response.workspaceOid;
    copy.workspaceData = _cloneDeep(this.response.workspaceData);
    return copy;
  }

  private recordPrimaryFailure(
    outcome: Extract<RecordSaveOutcome, 'not-saved' | 'unknown'>,
    problem?: RecordSaveProblem
  ): void {
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

/**
 * One canonical save request-correlation UUID. The format lives in the shared
 * package so browser, controller, and concurrency diagnostics agree.
 */
export const isCanonicalSaveRequestId = isRecordSaveRequestId;

export function createRecordSaveContext(context: Partial<RecordSaveContext> = {}): RecordSaveContext {
  const concurrency = normalizeRecordConcurrencyContext(context.concurrency);
  return {
    requestId: isCanonicalSaveRequestId(context.requestId) ? context.requestId : randomUUID(),
    routeFamily: context.routeFamily,
    operation: context.operation,
    targetStep: context.targetStep,
    validationOperation: context.validationOperation,
    validationRequestParameters: context.validationRequestParameters,
    validationRuntimeContext: context.validationRuntimeContext,
    validationBypass: context.validationBypass,
    ...(concurrency ? { concurrency } : {}),
  };
}

/** Drop every field outside the bounded server-owned concurrency allowlist. */
export function normalizeRecordConcurrencyContext(value: unknown): RecordConcurrencyContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownValue = (name: string): unknown => {
    const descriptor = descriptors[name];
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  };
  const expectedRevisionValue = ownValue('expectedRevision');
  const formFingerprintValue = ownValue('formFingerprint');
  const resolutionValue = ownValue('resolution');
  const resolutionOfRequestIdValue = ownValue('resolutionOfRequestId');
  const expectedRevision = isRecordRevision(expectedRevisionValue) ? expectedRevisionValue : undefined;
  const formFingerprint = isRecordFormFingerprint(formFingerprintValue) ? formFingerprintValue : undefined;
  const resolution = isRecordConcurrencyResolution(resolutionValue) ? resolutionValue : undefined;
  const resolutionOfRequestId = isRecordSaveRequestId(resolutionOfRequestIdValue)
    ? resolutionOfRequestIdValue
    : undefined;
  return {
    entityTagSupplied: ownValue('entityTagSupplied') === true,
    ...(expectedRevision !== undefined ? { expectedRevision } : {}),
    ...(formFingerprint ? { formFingerprint } : {}),
    ...(resolution ? { resolution } : {}),
    ...(resolutionOfRequestId ? { resolutionOfRequestId } : {}),
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
 * Transport status for each certified concurrency failure, in the precedence
 * the service resolves them.  A conflict is a definitive non-write, so it must
 * never be reported as a generic 500: the browser treats a 5xx as an ambiguous
 * `unknown` result that may not be rebased or retried.
 */
const RECORD_CONFLICT_STATUS_PRECEDENCE: ReadonlyArray<readonly [RecordConcurrencyProblemCode, number]> = [
  ['record-precondition-required', 428],
  ['record-revision-stale', 412],
  ['record-deleted', 412],
  ['form-definition-changed', 409],
  ['record-lifecycle-operation-conflict', 409],
];

/** Generic conflict status for a conflict problem without a recognised code. */
const RECORD_CONFLICT_DEFAULT_STATUS = 409;

/**
 * The statuses a certified concurrency refusal uses. API v1 keeps its legacy
 * body but must not collapse these to 500: a strict record type is an
 * intentional opt-in status change, and a 5xx would read as an ambiguous
 * `unknown` result that a client may retry.
 */
const RECORD_CONFLICT_HTTP_STATUSES: ReadonlySet<number> = new Set([409, 412, 428]);

export function isRecordConflictStatus(status: number): boolean {
  return RECORD_CONFLICT_HTTP_STATUSES.has(status);
}

/** Kinds that certify no write occurred, and therefore map below a 5xx. */
const CERTIFIED_NON_WRITE_KINDS: ReadonlySet<RecordSaveProblemKind> = new Set([
  'validation',
  'authorization',
  'conflict',
]);

function conflictFailureStatus(problems: readonly RecordSaveProblem[]): number | undefined {
  const conflicts = problems.filter(problem => problem.kind === 'conflict');
  if (conflicts.length === 0) {
    return undefined;
  }
  const codes = new Set(conflicts.flatMap(problem => problem.issues.map(issue => issue.code)));
  const match = RECORD_CONFLICT_STATUS_PRECEDENCE.find(([code]) => codes.has(code));
  return match ? match[1] : RECORD_CONFLICT_DEFAULT_STATUS;
}

/**
 * HTTP status for a save that did not persist.  Persisted outcomes never
 * reach here: once primary metadata is applied the route family decides the
 * success status and the warnings travel in the typed result.
 */
export function recordSaveFailureStatus(
  result: Pick<RecordSaveResult, 'outcome' | 'problems'> | null | undefined
): number {
  if (result?.outcome !== 'not-saved') {
    // `unknown` is deliberately a 5xx: the client must not assume a non-write.
    return 500;
  }
  // Select the most severe transport classification independently of problem
  // insertion order: system-like failures outrank authorization, which outranks
  // a certified conflict, which outranks ordinary validation failures.
  if (result.problems.some(problem => !CERTIFIED_NON_WRITE_KINDS.has(problem.kind))) return 500;
  if (result.problems.some(problem => problem.kind === 'authorization')) return 403;
  const conflictStatus = conflictFailureStatus(result.problems);
  if (conflictStatus !== undefined) return conflictStatus;
  if (result.problems.some(problem => problem.kind === 'validation')) return 400;
  return 500;
}

export interface RecordSaveDisplayError {
  readonly code?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly source?: { readonly pointer?: string };
}

/**
 * Project only the safe issue contract into the v2 JSON:API error array. The
 * complete typed result remains in `meta`; raw exceptions and candidates are
 * never used to infer a conflict.
 */
export function recordSaveDisplayErrors(
  result: Pick<RecordSaveResult, 'problems'> | null | undefined,
  fallbackDetail: string
): RecordSaveDisplayError[] {
  const errors = (result?.problems ?? []).flatMap(problem =>
    problem.issues.map(issue => ({
      ...(issue.code ? { code: issue.code } : {}),
      title: issue.message,
      ...(issue.pointer ? { source: { pointer: issue.pointer } } : {}),
    }))
  );
  return errors.length > 0 ? errors : [{ detail: fallbackDetail }];
}

export type StorageMutationLogger = (message: string, details?: Record<string, unknown>) => void;

/**
 * Normalize old and new adapter responses at one boundary.  Legacy success
 * is trusted temporarily for compatibility; legacy false is ambiguous
 * because a failed call is not proof that nothing was written.
 */
export function resolveStorageMutationState(
  response: StorageServiceResponse | StorageMutationResponse | null | undefined,
  logDeprecation?: StorageMutationLogger
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
  issue: Partial<RecordSaveIssue> = {}
): RecordSaveProblem {
  return {
    kind,
    phase,
    issues: [sanitizeRecordSaveIssue({ ...issue, ...(code ? { code } : {}), message })],
  };
}

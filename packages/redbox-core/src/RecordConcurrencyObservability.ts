import { metrics, type Attributes } from '@opentelemetry/api';
import {
  RECORD_CONCURRENCY_PROBLEM_CODES,
  RECORD_CONCURRENCY_RESOLUTIONS,
  RECORD_CONCURRENT_MODIFICATION_MODES,
  type RecordConcurrencyProblemCode,
  type RecordConcurrencyResolution,
  type RecordConcurrentModificationMode,
  type RecordSaveOutcome,
  type RecordSavePhase,
} from '@researchdatabox/sails-ng-common';
import type { RecordSaveOperation, RecordSaveRouteFamily } from './RecordSaveResponse';

export type RecordConcurrencyEventKind = 'save-outcome' | 'internal-retry' | 'lifecycle-recovery';
export type RecordConcurrencyPreconditionResult = 'not-applicable' | 'missing' | 'matching' | 'stale';

export interface RecordConcurrencyEvent {
  readonly kind: RecordConcurrencyEventKind;
  readonly routeFamily: RecordSaveRouteFamily;
  readonly writeKind: RecordSaveOperation;
  /** Configured record-type reference, for protected structured logs only. */
  readonly recordType?: string;
  readonly phase: RecordSavePhase;
  readonly outcome: RecordSaveOutcome | 'attempted' | 'exhausted' | 'completed' | 'cancelled' | 'retained';
  readonly mode?: RecordConcurrentModificationMode;
  readonly expectedRevision?: number;
  readonly currentRevision?: number;
  readonly precondition: RecordConcurrencyPreconditionResult;
  readonly problemKind?: string;
  readonly problemCode?: RecordConcurrencyProblemCode | string;
  readonly resolution?: RecordConcurrencyResolution;
  readonly errorType?: string;
}

export interface SafeRecordConcurrencyEvent {
  readonly kind: string;
  readonly routeFamily: string;
  readonly writeKind: string;
  readonly recordType?: string;
  readonly phase: string;
  readonly outcome: string;
  readonly mode?: string;
  readonly expectedRevision?: number;
  readonly currentRevision?: number;
  readonly precondition: string;
  readonly problemKind?: string;
  readonly problemCode?: string;
  readonly resolution?: string;
  readonly errorType?: string;
}

const conflictCodes = new Set<string>(RECORD_CONCURRENCY_PROBLEM_CODES);
const eventKinds = new Set<string>(['save-outcome', 'internal-retry', 'lifecycle-recovery']);
const routeFamilies = new Set<string>(['browser', 'api', 'internal']);
const writeKinds = new Set<string>(['create', 'update', 'transition', 'delete', 'restore', 'purge']);
const phases = new Set<string>(['pre-save', 'persistence', 'attachments', 'post-save', 'response', 'transport']);
const outcomes = new Set<string>([
  'saved',
  'saved-with-warnings',
  'not-saved',
  'unknown',
  'attempted',
  'exhausted',
  'completed',
  'cancelled',
  'retained',
]);
const preconditions = new Set<string>(['not-applicable', 'missing', 'matching', 'stale']);
const modes = new Set<string>(RECORD_CONCURRENT_MODIFICATION_MODES);
const resolutions = new Set<string>(RECORD_CONCURRENCY_RESOLUTIONS);
const problemKinds = new Set<string>(['validation', 'processing', 'authorization', 'conflict', 'system', 'network']);
const safeLogReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function boundedMetricLabel(value: unknown, allowed: ReadonlySet<string>, fallback: string): string {
  return typeof value === 'string' && allowed.has(value) ? value : fallback;
}

function boundedLogReference(value: unknown, fallback: string): string {
  return typeof value === 'string' && safeLogReferencePattern.test(value.trim()) ? value.trim() : fallback;
}

function boundedRevision(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

const meter = metrics.getMeter('redbox.record-concurrency');
const preconditionCounter = meter.createCounter('record_concurrency_precondition_total', {
  description: 'Record mutation preconditions by bounded policy and result.',
  unit: '{precondition}',
});
const conflictCounter = meter.createCounter('record_concurrency_conflict_total', {
  description: 'Certified record concurrency conflicts by safe code and write kind.',
  unit: '{conflict}',
});
const resolutionCounter = meter.createCounter('record_concurrency_resolution_total', {
  description: 'Record mutation results by normalized concurrency resolution.',
  unit: '{resolution}',
});
const internalRetryCounter = meter.createCounter('record_concurrency_internal_retry_total', {
  description: 'Bounded recomputable internal mutation retries.',
  unit: '{retry}',
});
const lifecycleRecoveryCounter = meter.createCounter('record_concurrency_lifecycle_recovery_total', {
  description: 'Lifecycle recovery results by operation and bounded outcome.',
  unit: '{recovery}',
});

/** Low-cardinality metric labels. Identifiers and revisions are deliberately impossible to add here. */
export function recordConcurrencyMetricLabels(event: RecordConcurrencyEvent): Attributes {
  return {
    event_kind: boundedMetricLabel(event.kind, eventKinds, 'other'),
    route_family: boundedMetricLabel(event.routeFamily, routeFamilies, 'other'),
    write_kind: boundedMetricLabel(event.writeKind, writeKinds, 'other'),
    phase: boundedMetricLabel(event.phase, phases, 'other'),
    outcome: boundedMetricLabel(event.outcome, outcomes, 'other'),
    precondition: boundedMetricLabel(event.precondition, preconditions, 'other'),
    mode: event.mode === undefined ? 'unavailable' : boundedMetricLabel(event.mode, modes, 'other'),
    problem_code: event.problemCode ? (conflictCodes.has(event.problemCode) ? event.problemCode : 'other') : 'none',
    resolution: event.resolution === undefined ? 'direct' : boundedMetricLabel(event.resolution, resolutions, 'other'),
  };
}

/**
 * Emit one value-free structured event and its bounded counters.
 *
 * Revision coordinates are bounded integers, and record type is log-only
 * because deployments may have an unbounded extension set. Identifiers are
 * deliberately absent, these values are never copied to metric labels, and
 * this contract has no fields capable of carrying record values, headers,
 * paths, or exceptions.
 */
export function emitRecordConcurrencyEvent(
  event: RecordConcurrencyEvent,
  logger: Pick<Console, 'info' | 'warn'> = sails.log
): Readonly<SafeRecordConcurrencyEvent> {
  const expectedRevision = boundedRevision(event.expectedRevision);
  const currentRevision = boundedRevision(event.currentRevision);
  const safeEvent = Object.freeze({
    kind: boundedMetricLabel(event.kind, eventKinds, 'other'),
    routeFamily: boundedMetricLabel(event.routeFamily, routeFamilies, 'other'),
    writeKind: boundedMetricLabel(event.writeKind, writeKinds, 'other'),
    ...(event.recordType === undefined ? {} : { recordType: boundedLogReference(event.recordType, 'unavailable') }),
    phase: boundedMetricLabel(event.phase, phases, 'other'),
    outcome: boundedMetricLabel(event.outcome, outcomes, 'other'),
    ...(event.mode === undefined ? {} : { mode: boundedMetricLabel(event.mode, modes, 'other') }),
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
    ...(currentRevision === undefined ? {} : { currentRevision }),
    precondition: boundedMetricLabel(event.precondition, preconditions, 'other'),
    ...(event.problemKind === undefined
      ? {}
      : { problemKind: boundedMetricLabel(event.problemKind, problemKinds, 'other') }),
    ...(event.problemCode === undefined
      ? {}
      : { problemCode: conflictCodes.has(event.problemCode) ? event.problemCode : 'other' }),
    ...(event.resolution === undefined
      ? {}
      : { resolution: boundedMetricLabel(event.resolution, resolutions, 'other') }),
    ...(event.errorType === undefined ? {} : { errorType: boundedLogReference(event.errorType, 'other') }),
  });
  const logDetails = Object.freeze({ event: 'record_concurrency_event', ...safeEvent });
  const isWarning =
    Boolean(safeEvent.errorType || safeEvent.problemKind || safeEvent.problemCode) ||
    safeEvent.outcome === 'not-saved' ||
    safeEvent.outcome === 'unknown' ||
    safeEvent.outcome === 'saved-with-warnings' ||
    safeEvent.outcome === 'exhausted' ||
    safeEvent.outcome === 'retained';
  if (isWarning) {
    logger.warn('record_concurrency_event', logDetails);
  } else {
    logger.info('record_concurrency_event', logDetails);
  }
  const labels = recordConcurrencyMetricLabels(event);
  if (safeEvent.kind === 'save-outcome') {
    if (safeEvent.writeKind !== 'create') preconditionCounter.add(1, labels);
    if (safeEvent.problemCode && conflictCodes.has(safeEvent.problemCode)) conflictCounter.add(1, labels);
    if (safeEvent.resolution) resolutionCounter.add(1, labels);
  } else if (safeEvent.kind === 'internal-retry') {
    internalRetryCounter.add(1, labels);
  } else if (safeEvent.kind === 'lifecycle-recovery') {
    lifecycleRecoveryCounter.add(1, labels);
  }
  return safeEvent;
}

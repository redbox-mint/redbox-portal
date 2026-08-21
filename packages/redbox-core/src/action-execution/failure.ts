import { RBValidationError } from '../model/RBValidationError';
import type { ActionFailureKind, SafeActionFailure } from './types';

interface TaggedActionFailure {
  _tag?: string;
  code?: unknown;
  message?: unknown;
  safeSummary?: unknown;
  cancellationCooperative?: unknown;
}

export class ActionConfigurationError extends Error {
  readonly _tag = 'ActionConfigurationError';
  readonly code = 'invalid-hook-execution-policy';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this._tag;
  }
}

export class ActionValidationFailure extends Error {
  readonly _tag = 'ActionValidationFailure';
  readonly code = 'action-validation-failed';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this._tag;
  }
}

export class ActionDomainFailure extends Error {
  readonly _tag = 'ActionDomainFailure';
  readonly code: string;
  readonly safeSummary?: string;

  constructor(message: string, code = 'action-domain-failed', safeSummary?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this._tag;
    this.code = code;
    this.safeSummary = safeSummary;
  }
}

export class ActionTransientFailure extends Error {
  readonly _tag = 'ActionTransientFailure';
  readonly code: string;
  readonly safeSummary?: string;

  constructor(message: string, code = 'action-transient-failed', safeSummary?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this._tag;
    this.code = code;
    this.safeSummary = safeSummary;
  }
}

export class ActionTimeoutFailure extends Error {
  readonly _tag = 'ActionTimeoutFailure';
  readonly code = 'action-timeout';
  readonly cancellationCooperative: boolean;

  constructor(cancellationCooperative: boolean) {
    super('Action execution timed out');
    this.name = this._tag;
    this.cancellationCooperative = cancellationCooperative;
  }
}

export class ActionInterruptedFailure extends Error {
  readonly _tag = 'ActionInterruptedFailure';
  readonly code = 'action-interrupted';
  readonly cancellationCooperative: boolean;

  constructor(cancellationCooperative: boolean) {
    super('Action execution was interrupted');
    this.name = this._tag;
    this.cancellationCooperative = cancellationCooperative;
  }
}

const ACTION_FAILURE_KINDS: readonly ActionFailureKind[] = [
  'configuration',
  'validation',
  'domain',
  'transient',
  'timeout',
  'interrupted',
  'unexpected',
];

export function isActionFailureKind(value: unknown): value is ActionFailureKind {
  return ACTION_FAILURE_KINDS.includes(value as ActionFailureKind);
}

const MAX_SUMMARY_LENGTH = 160;

/**
 * A summary is only carried through when a failure deliberately provided one.
 * Arbitrary thrown text never reaches a serialized result.
 */
function boundedSafeSummary(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const summary = value.trim();
  if (!summary || summary.length > MAX_SUMMARY_LENGTH || /[\r\n]/.test(summary)) {
    return undefined;
  }
  return summary;
}

function fields(value: unknown): TaggedActionFailure {
  return value !== null && typeof value === 'object' ? (value as TaggedActionFailure) : {};
}

/** True for both a real instance and a structurally tagged look-alike. */
function hasTag(value: unknown, tag: string): boolean {
  return fields(value)._tag === tag;
}

function safeCode(value: unknown, fallback: string): string {
  const code = fields(value).code;
  return typeof code === 'string' && code.trim() ? code : fallback;
}

function cooperative(value: unknown, fallback?: boolean): boolean | undefined {
  const flag = fields(value).cancellationCooperative;
  return typeof flag === 'boolean' ? flag : fallback;
}

/**
 * Normalization order is fixed by the design: configuration, validation,
 * branded domain/transient, executor timeout, interruption, then everything
 * else as unexpected. Message text is never inspected.
 */
export function normalizeActionFailure(cause: unknown, fallbackCancellationCooperative?: boolean): SafeActionFailure {
  if (hasTag(cause, 'ActionConfigurationError')) {
    return { kind: 'configuration', code: 'invalid-hook-execution-policy' };
  }
  if (RBValidationError.isRBValidationError(cause)) {
    return { kind: 'validation', code: 'record-validation-failed' };
  }
  if (hasTag(cause, 'ActionValidationFailure')) {
    return { kind: 'validation', code: 'action-validation-failed' };
  }
  if (hasTag(cause, 'ActionDomainFailure')) {
    return {
      kind: 'domain',
      code: safeCode(cause, 'action-domain-failed'),
      summary: boundedSafeSummary(fields(cause).safeSummary),
    };
  }
  if (hasTag(cause, 'ActionTransientFailure')) {
    return {
      kind: 'transient',
      code: safeCode(cause, 'action-transient-failed'),
      summary: boundedSafeSummary(fields(cause).safeSummary),
    };
  }
  if (hasTag(cause, 'ActionTimeoutFailure')) {
    return {
      kind: 'timeout',
      code: 'action-timeout',
      cancellationCooperative: cooperative(cause, fallbackCancellationCooperative),
    };
  }
  if (hasTag(cause, 'ActionInterruptedFailure')) {
    return {
      kind: 'interrupted',
      code: 'action-interrupted',
      cancellationCooperative: cooperative(cause, fallbackCancellationCooperative),
    };
  }
  return { kind: 'unexpected', code: 'action-unexpected-failure' };
}

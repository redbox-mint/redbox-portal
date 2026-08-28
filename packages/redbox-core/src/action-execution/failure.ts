import { isNativeError } from 'node:util/types';
import type { RuntimeValue } from '../runtimeValues';
import type { ActionFailureKind, SafeActionFailure } from './types';

export class ActionConfigurationError extends Error {
  readonly _tag = 'ActionConfigurationError';
  readonly code = 'invalid-hook-execution-policy';

  constructor(message: string, options?: { cause?: RuntimeValue }) {
    super(message, options);
    this.name = this._tag;
  }
}

export class ActionValidationFailure extends Error {
  readonly _tag = 'ActionValidationFailure';
  readonly code = 'action-validation-failed';

  constructor(message: string, options?: { cause?: RuntimeValue }) {
    super(message, options);
    this.name = this._tag;
  }
}

export class ActionDomainFailure extends Error {
  readonly _tag = 'ActionDomainFailure';
  readonly code: string;
  readonly safeSummary?: string;

  constructor(
    message: string,
    code = 'action-domain-failed',
    safeSummary?: string,
    options?: { cause?: RuntimeValue }
  ) {
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

  constructor(
    message: string,
    code = 'action-transient-failed',
    safeSummary?: string,
    options?: { cause?: RuntimeValue }
  ) {
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

export function isActionFailureKind(value: RuntimeValue): value is ActionFailureKind {
  return typeof value === 'string' && ACTION_FAILURE_KINDS.some(kind => kind === value);
}

const MAX_SUMMARY_LENGTH = 160;
const MAX_FAILURE_CODE_LENGTH = 64;
const SAFE_FAILURE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const UNSAFE_SUMMARY_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u;
const RB_VALIDATION_ERROR_NAME = 'RBValidationError';

interface MissingOwnProperty {
  readonly kind: 'missing';
}

interface UnsafeOwnProperty {
  readonly kind: 'unsafe';
}

interface OwnDataProperty {
  readonly kind: 'data';
  readonly value: RuntimeValue;
}

type OwnPropertyInspection = MissingOwnProperty | UnsafeOwnProperty | OwnDataProperty;

function unexpectedFailure(): SafeActionFailure {
  return { kind: 'unexpected', code: 'action-unexpected-failure' };
}

/**
 * Inspect only own data properties. Accessors are rejected without invocation,
 * and proxy descriptor traps are contained by the normalization boundary.
 */
function inspectOwnDataProperty(value: RuntimeValue, property: string): OwnPropertyInspection {
  if (value === null || typeof value !== 'object') {
    return { kind: 'missing' };
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, property);
    if (descriptor === undefined) {
      return { kind: 'missing' };
    }
    if (!Object.hasOwn(descriptor, 'value')) {
      return { kind: 'unsafe' };
    }
    const dataValue: RuntimeValue = descriptor.value;
    return { kind: 'data', value: dataValue };
  } catch {
    return { kind: 'unsafe' };
  }
}

/**
 * Walk Unicode code points, not UTF-16 code units, and stop after the public
 * bound. Controls, formatting characters, line/paragraph separators, and
 * unpaired surrogates are never safe report text.
 */
function isUnsafeOrOversizedSummary(value: string): boolean {
  let characterCount = 0;
  for (const character of value) {
    characterCount += 1;
    if (characterCount > MAX_SUMMARY_LENGTH || UNSAFE_SUMMARY_CHARACTER_PATTERN.test(character)) {
      return true;
    }
  }
  return false;
}

/**
 * A summary is only carried through when a failure deliberately provided one.
 * Arbitrary thrown text never reaches a serialized result.
 */
function boundedSafeSummary(value: RuntimeValue): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    if (isUnsafeOrOversizedSummary(value)) {
      return undefined;
    }
    const summary = value.trim();
    return summary || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Failure codes enter reports and structured logs, so their public alphabet is
 * limited to action identifiers and their length is capped at 64 characters.
 */
function safeCode(value: RuntimeValue, fallback: string): string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_FAILURE_CODE_LENGTH &&
    SAFE_FAILURE_CODE_PATTERN.test(value)
    ? value
    : fallback;
}

function inspectedValue(inspection: MissingOwnProperty | OwnDataProperty): RuntimeValue {
  return inspection.kind === 'data' ? inspection.value : undefined;
}

function inspectedTaggedFailure(cause: RuntimeValue, fallbackCancellationCooperative?: boolean): SafeActionFailure {
  const tag = inspectOwnDataProperty(cause, '_tag');
  if (tag.kind === 'unsafe') {
    return unexpectedFailure();
  }
  if (tag.kind === 'data' && tag.value === 'ActionConfigurationError') {
    return { kind: 'configuration', code: 'invalid-hook-execution-policy' };
  }

  const name = inspectOwnDataProperty(cause, 'name');
  if (name.kind === 'unsafe') {
    return unexpectedFailure();
  }
  if (isNativeError(cause) && name.kind === 'data' && name.value === RB_VALIDATION_ERROR_NAME) {
    return { kind: 'validation', code: 'record-validation-failed' };
  }
  if (tag.kind !== 'data' || typeof tag.value !== 'string') {
    return unexpectedFailure();
  }

  if (tag.value === 'ActionValidationFailure') {
    return { kind: 'validation', code: 'action-validation-failed' };
  }
  if (tag.value === 'ActionDomainFailure' || tag.value === 'ActionTransientFailure') {
    const code = inspectOwnDataProperty(cause, 'code');
    const safeSummary = inspectOwnDataProperty(cause, 'safeSummary');
    if (code.kind === 'unsafe' || safeSummary.kind === 'unsafe') {
      return unexpectedFailure();
    }
    const domain = tag.value === 'ActionDomainFailure';
    return {
      kind: domain ? 'domain' : 'transient',
      code: safeCode(inspectedValue(code), domain ? 'action-domain-failed' : 'action-transient-failed'),
      summary: boundedSafeSummary(inspectedValue(safeSummary)),
    };
  }
  if (tag.value === 'ActionTimeoutFailure' || tag.value === 'ActionInterruptedFailure') {
    const cancellation = inspectOwnDataProperty(cause, 'cancellationCooperative');
    if (cancellation.kind === 'unsafe') {
      return unexpectedFailure();
    }
    const flag = inspectedValue(cancellation);
    const cancellationCooperative = typeof flag === 'boolean' ? flag : fallbackCancellationCooperative;
    if (tag.value === 'ActionTimeoutFailure') {
      return { kind: 'timeout', code: 'action-timeout', cancellationCooperative };
    }
    return { kind: 'interrupted', code: 'action-interrupted', cancellationCooperative };
  }
  return unexpectedFailure();
}

/**
 * Normalization order is fixed by the design: configuration, validation,
 * branded domain/transient, executor timeout, interruption, then everything
 * else as unexpected. Message text is never inspected.
 */
export function normalizeActionFailure(
  cause: RuntimeValue,
  fallbackCancellationCooperative?: boolean
): SafeActionFailure {
  try {
    return inspectedTaggedFailure(cause, fallbackCancellationCooperative);
  } catch {
    return unexpectedFailure();
  }
}

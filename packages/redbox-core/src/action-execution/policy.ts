import { createHash } from 'node:crypto';
import { ActionConfigurationError, isActionFailureKind } from './failure';
import type {
  ActionExecutionMode,
  ActionExecutionPhase,
  ActionExecutionPolicy,
  ActionFailureKind,
  RetryScheduleConfig,
} from './types';

const MAX_TIMEOUT_MS = 600_000;
const MAX_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 5;
const ACTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function configurationError(message: string): never {
  throw new ActionConfigurationError(message);
}

function validateJitter(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    configurationError('Retry jitter must be a boolean.');
  }
  return value;
}

function validateSchedule(schedule: unknown): RetryScheduleConfig {
  if (!schedule || typeof schedule !== 'object') {
    configurationError('Retry schedule must be an object.');
  }
  const value = schedule as Record<string, unknown>;
  if (value.type !== 'fixed' && value.type !== 'exponential') {
    configurationError('Retry schedule type must be fixed or exponential.');
  }
  if (!isIntegerInRange(value.delayMs, 0, MAX_DELAY_MS)) {
    configurationError('Retry delayMs must be an integer from 0 through 60000.');
  }
  const jitter = validateJitter(value.jitter);

  if (value.type === 'fixed') {
    const result: RetryScheduleConfig = { type: 'fixed', delayMs: value.delayMs };
    if (jitter !== undefined) {
      result.jitter = jitter;
    }
    return result;
  }

  if (!isIntegerInRange(value.maxDelayMs, 0, MAX_DELAY_MS) || value.maxDelayMs < value.delayMs) {
    configurationError('Exponential maxDelayMs must be an integer no smaller than delayMs and no greater than 60000.');
  }
  const result: RetryScheduleConfig = {
    type: 'exponential',
    delayMs: value.delayMs,
    maxDelayMs: value.maxDelayMs,
  };
  if (jitter !== undefined) {
    result.jitter = jitter;
  }
  return result;
}

export function validateActionId(id: unknown): string {
  if (typeof id !== 'string' || !ACTION_ID_PATTERN.test(id.trim())) {
    configurationError('Action id must be a non-empty string of at most 128 safe characters.');
  }
  return id.trim();
}

export function deriveActionId(
  mode: ActionExecutionMode | string,
  phase: ActionExecutionPhase | string,
  index: number,
  functionExpression: string
): string {
  const digest = createHash('sha256').update(functionExpression).digest('hex').slice(0, 12);
  return `${mode}.${phase}.${index}.${digest}`;
}

export function resolveActionId(
  configuredId: unknown,
  mode: ActionExecutionMode | string,
  phase: ActionExecutionPhase | string,
  index: number,
  functionExpression: string
): string {
  if (configuredId === undefined) {
    return deriveActionId(mode, phase, index, functionExpression);
  }
  return validateActionId(configuredId);
}

export function validateActionExecutionPolicy(policy: unknown): ActionExecutionPolicy | undefined {
  if (policy === undefined || policy === null) {
    return undefined;
  }
  if (typeof policy !== 'object' || Array.isArray(policy)) {
    configurationError('Action execution policy must be an object.');
  }
  const value = policy as Record<string, unknown>;
  const result: ActionExecutionPolicy = {};
  if (value.timeoutMs !== undefined) {
    if (!isIntegerInRange(value.timeoutMs, 1, MAX_TIMEOUT_MS)) {
      configurationError('Action timeoutMs must be an integer from 1 through 600000.');
    }
    result.timeoutMs = value.timeoutMs;
  }
  if (value.retry !== undefined) {
    if (!value.retry || typeof value.retry !== 'object' || Array.isArray(value.retry)) {
      configurationError('Retry policy must be an object.');
    }
    const retry = value.retry as Record<string, unknown>;
    if (retry.idempotent !== true) {
      configurationError('Retry policy requires idempotent: true.');
    }
    if (!isIntegerInRange(retry.maxAttempts, 1, MAX_ATTEMPTS)) {
      configurationError('Retry maxAttempts must be an integer from 1 through 5.');
    }
    let retryOn: ActionFailureKind[] | undefined;
    if (retry.retryOn !== undefined) {
      if (!Array.isArray(retry.retryOn) || retry.retryOn.some(kind => !isActionFailureKind(kind))) {
        configurationError('Retry retryOn contains an unknown failure kind.');
      }
      retryOn = Array.from(new Set(retry.retryOn)) as ActionFailureKind[];
    }
    result.retry = {
      maxAttempts: retry.maxAttempts,
      retryOn: retryOn ?? ['transient'],
      schedule: retry.schedule === undefined ? undefined : validateSchedule(retry.schedule),
      idempotent: true,
    };
  }
  return result;
}

/**
 * Delay before retry number `retryNumber` (1 is the delay after the first
 * failed attempt). Jitter spreads the delay over 50%-150% of the base and is
 * still capped at the configured maximum delay.
 */
export function retryDelayMs(
  schedule: RetryScheduleConfig | undefined,
  retryNumber: number,
  random: () => number = Math.random
): number {
  if (!schedule) {
    return 0;
  }
  let base = schedule.delayMs;
  if (schedule.type === 'exponential') {
    base = Math.min(schedule.maxDelayMs, schedule.delayMs * 2 ** Math.max(0, retryNumber - 1));
  }
  if (!schedule.jitter || base === 0) {
    return base;
  }
  const sample = Math.min(1, Math.max(0, random()));
  return Math.min(MAX_DELAY_MS, Math.round(base * (0.5 + sample)));
}

export const ACTION_EXECUTION_LIMITS = {
  maxTimeoutMs: MAX_TIMEOUT_MS,
  maxDelayMs: MAX_DELAY_MS,
  maxAttempts: MAX_ATTEMPTS,
} as const;

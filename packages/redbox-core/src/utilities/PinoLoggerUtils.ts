import type { Logger } from 'pino';

/**
 * Check that a value can be used as a parent pino logger for namespace loggers.
 *
 * This module has no side effects, so it can be imported without creating a logger.
 * @param value The value to check.
 */
export function isPinoLogger(value: unknown): value is Logger {
  if (value === undefined || value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.level === 'string' && typeof record.child === 'function' && typeof record.info === 'function';
}

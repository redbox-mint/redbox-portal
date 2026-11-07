import type { Logger } from 'pino';

/** Additive destination provenance; compatible with any Pino copy. No listeners
 * are installed until Fastify explicitly borrows the concrete destination. */
const destinations = new WeakMap<object, unknown>();
export function rememberPinoLoggerDestination(logger: object, destination: unknown): void {
  destinations.set(logger, destination);
}
export function pinoLoggerDestinations(logger: object): readonly unknown[] {
  for (let current: object | null = logger; current; current = Object.getPrototypeOf(current)) {
    if (destinations.has(current)) return [destinations.get(current)];
  }
  return [];
}

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

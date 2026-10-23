import { InvalidCacheEntryError } from './validation';
import { PersistenceError } from '../errors';

/** Safe operator diagnostics. Never attach connection errors containing credentials. */
export class CachePersistenceError extends PersistenceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'CachePersistenceError';
  }
}

/** Native duplicate details are retained for internal diagnostics only. */
export class DuplicateCacheEntryError extends Error {
  readonly code = 'duplicate-cache-entry';

  constructor(cause: unknown) {
    super('A cache entry with that name already exists', { cause });
    this.name = 'DuplicateCacheEntryError';
  }
}

function* errorCauses(error: unknown): Generator<object> {
  const seen = new Set<object>();
  let current = error;
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    yield current;
    current = 'cause' in current ? current.cause : undefined;
  }
}

/** Keep cached payloads in native causes out of logs, including wrapped startup errors. */
export function cachePersistenceFailureForLog(error: unknown): { name: string; message: string } | undefined {
  for (const current of errorCauses(error)) {
    if (
      current instanceof InvalidCacheEntryError ||
      current instanceof DuplicateCacheEntryError ||
      current instanceof PersistenceError
    ) {
      return { name: current.name, message: current.message };
    }
    // A retained repository can predate Sails' module-cache invalidation.
    if ('code' in current && current.code === 'invalid-cache-entry') {
      return { name: 'InvalidCacheEntryError', message: 'Cache persistence rejected an invalid entry.' };
    }
    if ('code' in current && current.code === 'duplicate-cache-entry') {
      return { name: 'DuplicateCacheEntryError', message: 'A cache entry with that name already exists' };
    }
  }
  return undefined;
}

// Diagnostic identifiers need no driver catalog. Messages/details can contain payloads.
const diagnosticIdentifier = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Best-effort writes need a useful diagnostic even for unrecognized native/hook failures. */
export function cacheOperationFailureForLog(error: unknown): {
  name: string;
  message: string;
  code?: string | number;
  errorLabels?: string[];
} {
  const controlled = cachePersistenceFailureForLog(error);
  if (controlled) return controlled;
  const native = typeof error === 'object' && error !== null ? error : {};
  const name = 'name' in native ? native.name : native.constructor?.name;
  // MongoNetworkError retains the Node connection code in its cause.
  const code = Array.from(errorCauses(error), cause => ('code' in cause ? cause.code : undefined)).find(
    (value): value is string | number =>
      (typeof value === 'number' && Number.isSafeInteger(value)) ||
      (typeof value === 'string' && /^E[A-Z0-9_]+$/.test(value))
  );
  const labels =
    'errorLabels' in native && Array.isArray(native.errorLabels)
      ? native.errorLabels.filter(
          (label: unknown): label is string => typeof label === 'string' && diagnosticIdentifier.test(label)
        )
      : [];
  return {
    name: typeof name === 'string' && diagnosticIdentifier.test(name) ? name : 'CachePersistenceError',
    message: 'Cache persistence operation failed.',
    ...(code !== undefined ? { code } : {}),
    ...(labels.length ? { errorLabels: labels } : {}),
  };
}

export function safePersistenceFailure(error: unknown): CachePersistenceError {
  if (error instanceof CachePersistenceError) return error;
  if (error instanceof PersistenceError && !['authentication', 'connection'].includes(error.code))
    return new CachePersistenceError(error.code, error.message);
  if (
    (error instanceof PersistenceError && error.code === 'authentication') ||
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 18)
  ) {
    return new CachePersistenceError(
      'authentication',
      'Cache persistence authentication failed. Check the application datastore credentials and authSource.'
    );
  }
  return new CachePersistenceError(
    'connection',
    'Cache persistence initialization failed. Check application datastore connectivity, credentials, TLS/options and permissions. No fallback is available.'
  );
}

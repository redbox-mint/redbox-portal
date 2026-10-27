/** Controlled diagnostics only. Never attach native errors, payloads or connection settings. */
export class PersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'PersistenceError';
  }
}

export function safePersistenceFailure(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) return error;
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 18)
    return new PersistenceError(
      'authentication',
      'Persistence authentication failed. Check application datastore credentials and authSource.'
    );
  return new PersistenceError(
    'connection',
    'Persistence initialization failed. Check application datastore connectivity, credentials, TLS/options and permissions. No fallback is available.'
  );
}

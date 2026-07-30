import { Data } from 'effect';

export class RaidConfigurationError extends Data.TaggedError('RaidConfigurationError')<{ message: string; cause?: unknown }> {}
export class RaidMappingError extends Data.TaggedError('RaidMappingError')<{ message: string; field?: string; engine?: string; cause?: unknown }> {}
export class RaidSourceRecordError extends Data.TaggedError('RaidSourceRecordError')<{ message: string; cause?: unknown }> {}
export class RaidAuthenticationError extends Data.TaggedError('RaidAuthenticationError')<{ message: string; statusCode?: number; retryable?: boolean; cause?: unknown }> {}
export class RaidHttpError extends Data.TaggedError('RaidHttpError')<{ message: string; statusCode?: number; responseBody?: unknown; method: string; path: string; retryable: boolean; cause?: unknown }> {}
export class RaidTimeoutError extends Data.TaggedError('RaidTimeoutError')<{ message: string; operation: string; retryable: boolean }> {}
export class RaidPersistenceError extends Data.TaggedError('RaidPersistenceError')<{ message: string; mintedIdentifier?: string; cause?: unknown }> {}
export class RaidQueueError extends Data.TaggedError('RaidQueueError')<{ message: string; cause?: unknown }> {}
export class RaidInterruptedError extends Data.TaggedError('RaidInterruptedError')<{ message: string }> {}

export function isRetryable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'retryable' in error && (error as { retryable?: boolean }).retryable === true;
}

import { Effect, Either, Schedule } from 'effect';

export interface AuditWritePolicy {
  writeTimeoutMs?: number;
  maxConcurrentWrites?: number;
  writeAttempts?: number;
  retryDelayMs?: number;
}

export function positiveInteger(value: unknown, fallback: number, maximum = 2147483647): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximum ? value : fallback;
}

export class AuditWriteTimeout extends Error {
  constructor(timeoutMs: number) { super(`Record audit write timed out after ${timeoutMs}ms`); }
}

/** A retained payload needs operator correction before another delivery can succeed. */
export class PermanentAuditWriteError extends Error {}

/** Caller deadlines retain permits until storage settles; Mongo datastores also need finite driver timeouts. */
export class AuditWriter {
  private readonly permits = Effect.unsafeMakeSemaphore(8);

  async run(write: () => Promise<void>, policy: AuditWritePolicy, attempts = positiveInteger(policy.writeAttempts, 3, 10)): Promise<void> {
    const timeoutMs = positiveInteger(policy.writeTimeoutMs, 5000);
    const schedule = Schedule.exponential(positiveInteger(policy.retryDelayMs, 100)).pipe(
      Schedule.jittered,
      Schedule.intersect(Schedule.recurs(attempts - 1))
    );
    const operation = Effect.tryPromise({ try: write, catch: error => error }).pipe(
      // Mongo/Agenda promises cannot be cancelled. Keep the permit until the promise really settles.
      Effect.uninterruptible,
      Effect.retry({ schedule, while: error => !(error instanceof PermanentAuditWriteError) }),
      this.permits.withPermits(1),
      Effect.disconnect,
      Effect.timeoutFail({ duration: timeoutMs, onTimeout: () => new AuditWriteTimeout(timeoutMs) })
    );
    const result = await Effect.runPromise(
      this.permits.resize(positiveInteger(policy.maxConcurrentWrites, 8, 1024)).pipe(
        Effect.zipRight(operation),
        Effect.either
      )
    );
    if (Either.isLeft(result)) throw result.left;
  }
}

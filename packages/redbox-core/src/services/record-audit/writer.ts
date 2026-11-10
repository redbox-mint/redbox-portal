import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';
import * as Semaphore from 'effect/Semaphore';

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
  constructor(timeoutMs: number) {
    super(`Record audit write timed out after ${timeoutMs}ms`);
  }
}

/** A retained payload needs operator correction before another delivery can succeed. */
export class PermanentAuditWriteError extends Error {}

/** Caller deadlines retain permits until storage settles; Mongo datastores also need finite driver timeouts. */
export class AuditWriter {
  private readonly permits = Semaphore.makeUnsafe(8);

  async run(
    write: () => Promise<void>,
    policy: AuditWritePolicy,
    attempts = positiveInteger(policy.writeAttempts, 3, 10)
  ): Promise<void> {
    const timeoutMs = positiveInteger(policy.writeTimeoutMs, 5000);
    const schedule = Schedule.exponential(positiveInteger(policy.retryDelayMs, 100)).pipe(Schedule.jittered);
    const operation = Effect.tryPromise({ try: write, catch: error => error }).pipe(
      // Mongo/Agenda promises cannot be cancelled. Keep the permit until the promise really settles.
      Effect.uninterruptible,
      Effect.retry({ schedule, times: attempts - 1, while: error => !(error instanceof PermanentAuditWriteError) }),
      this.permits.withPermits(1)
    );
    const fiber = Effect.runFork(
      this.permits.resize(positiveInteger(policy.maxConcurrentWrites, 8, 1024)).pipe(Effect.andThen(operation))
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AuditWriteTimeout(timeoutMs));
        fiber.interruptUnsafe();
      }, timeoutMs);
      fiber.addObserver(exit => {
        clearTimeout(timer);
        if (exit._tag === 'Success') resolve();
        else {
          const failure = Cause.findErrorOption(exit.cause);
          reject(failure._tag === 'Some' ? failure.value : Cause.squash(exit.cause));
        }
      });
    });
  }
}

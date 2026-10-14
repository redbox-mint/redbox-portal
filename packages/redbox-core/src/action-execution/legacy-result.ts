import { Effect } from 'effect';
import { isObservable, Observable } from 'rxjs';

/**
 * A mutable cell reporting whether the value a hook returned can genuinely be
 * cancelled. It is only known after the hook has been invoked, which is later
 * than the point where the action is described.
 */
export interface CancellationCell {
  value: boolean;
}

export interface LegacyEffectAdaptation {
  effect: Effect.Effect<unknown, unknown, never>;
  cooperativeCancellation: boolean;
}

/** Legacy Observable hooks are first-value: later emissions are ignored. */
function observableEffect(observable: Observable<unknown>): Effect.Effect<unknown, unknown, never> {
  return Effect.async((resume, signal) => {
    let settled = false;

    const settle = (effect: Effect.Effect<unknown, unknown, never>): void => {
      if (settled) {
        return;
      }
      settled = true;
      resume(effect);
      // A synchronous Observable settles while `subscribe` is still running,
      // so unsubscribing waits until `subscription` has been assigned.
      queueMicrotask(() => subscription.unsubscribe());
    };

    const subscription = observable.subscribe({
      next: value => settle(Effect.succeed(value)),
      error: (error: unknown) => settle(Effect.fail(error)),
      complete: () => settle(Effect.fail(new Error('Observable hook completed without a value'))),
    });

    signal.addEventListener(
      'abort',
      () => {
        settled = true;
        subscription.unsubscribe();
      },
      { once: true }
    );
  });
}

/**
 * There is deliberately no attempt to abort the Promise. Effect stops waiting
 * once the fiber is interrupted, but an opaque Promise side effect continues,
 * which is why Promise-backed hooks report non-cooperative cancellation.
 */
function promiseEffect(promise: PromiseLike<unknown>): Effect.Effect<unknown, unknown, never> {
  return Effect.tryPromise({ try: () => promise, catch: error => error });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  return typeof (value as PromiseLike<unknown>).then === 'function';
}

/** Adapt whatever a legacy hook returned to an Effect. */
export function adaptLegacyHookResult(value: unknown): LegacyEffectAdaptation {
  if (Effect.isEffect(value)) {
    return { effect: value as Effect.Effect<unknown, unknown, never>, cooperativeCancellation: true };
  }
  if (isObservable(value)) {
    return { effect: observableEffect(value), cooperativeCancellation: true };
  }
  if (isThenable(value)) {
    return { effect: promiseEffect(value), cooperativeCancellation: false };
  }
  return { effect: Effect.succeed(value), cooperativeCancellation: true };
}

/**
 * Wrap a legacy hook call so a synchronous throw is captured as a failure and
 * the call itself is deferred until the attempt starts.
 */
export function legacyHookToEffect(
  invoke: () => unknown,
  cancellation: CancellationCell = { value: true }
): Effect.Effect<unknown, unknown, never> {
  return Effect.suspend(() => {
    const adaptation = adaptLegacyHookResult(invoke());
    cancellation.value = adaptation.cooperativeCancellation;
    return adaptation.effect;
  });
}

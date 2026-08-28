import { Effect } from 'effect';
import { isObservable, Observable } from 'rxjs';
import type { RuntimeValue } from '../runtimeValues';

/**
 * A mutable cell reporting whether the value a hook returned can genuinely be
 * cancelled. It is only known after the hook has been invoked, which is later
 * than the point where the action is described.
 */
export interface CancellationCell {
  value: boolean;
}

export interface LegacyEffectAdaptation {
  effect: Effect.Effect<RuntimeValue, RuntimeValue, never>;
  cooperativeCancellation: boolean;
}

/** Legacy Observable hooks are first-value: later emissions are ignored. */
function observableEffect(observable: Observable<RuntimeValue>): Effect.Effect<RuntimeValue, RuntimeValue, never> {
  return Effect.async((resume, signal) => {
    let settled = false;

    const settle = (effect: Effect.Effect<RuntimeValue, RuntimeValue, never>): void => {
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
      error: (error: RuntimeValue) => settle(Effect.fail(error)),
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
function promiseEffect(promise: PromiseLike<RuntimeValue>): Effect.Effect<RuntimeValue, RuntimeValue, never> {
  return Effect.async((resume, signal) => {
    let interrupted = false;
    signal.addEventListener(
      'abort',
      () => {
        interrupted = true;
      },
      { once: true }
    );
    Promise.resolve(promise).then(
      value => {
        if (!interrupted) {
          resume(Effect.succeed(value));
        }
      },
      (error: RuntimeValue) => {
        if (!interrupted) {
          resume(Effect.fail(error));
        }
      }
    );
  });
}

function isThenable(value: RuntimeValue): value is PromiseLike<RuntimeValue> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  return typeof (value as PromiseLike<RuntimeValue>).then === 'function';
}

/** Adapt whatever a legacy hook returned to an Effect. */
export function adaptLegacyHookResult(value: RuntimeValue): LegacyEffectAdaptation {
  if (Effect.isEffect(value)) {
    return { effect: value as Effect.Effect<RuntimeValue, RuntimeValue, never>, cooperativeCancellation: true };
  }
  if (isObservable(value)) {
    return { effect: observableEffect(value as Observable<RuntimeValue>), cooperativeCancellation: true };
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
  invoke: () => RuntimeValue,
  cancellation: CancellationCell = { value: true }
): Effect.Effect<RuntimeValue, RuntimeValue, never> {
  return Effect.suspend(() => {
    const adaptation = adaptLegacyHookResult(invoke());
    cancellation.value = adaptation.cooperativeCancellation;
    return adaptation.effect;
  });
}

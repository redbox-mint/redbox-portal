import type { AbstractControl } from '@angular/forms';
import type { FormComponentEventBase } from './events/form-component-event.types';

/** Handlers that caused a value notification, used to stop feedback loops. */
export type ValueNotificationCause = Pick<FormComponentEventBase, 'behaviourChain' | 'expressionChain'>;

/** Runs a synchronous change as part of an expression write, attributing its notifications to that write. */
export type AttributeWrite = <T>(change: () => T) => T;

type ExpressionWrite = { writers: number; refreshed: boolean; value?: unknown };
const expressionWrites = new WeakMap<AbstractControl, ExpressionWrite>();

/**
 * The write whose code is currently executing synchronously. Notifications are
 * attributed only while it is set, so independent edits made while an
 * asynchronous write awaits start a fresh causal chain.
 */
let activeCause: ValueNotificationCause | undefined;

/** Keep aggregate form values current while expression writes notify dependants. */
export async function withExpressionValueNotifications(
  control: AbstractControl,
  write: () => Promise<void>,
  cause: ValueNotificationCause = {}
): Promise<void> {
  const pending = expressionWrites.get(control) ?? { writers: 0, refreshed: false };
  expressionWrites.set(control, pending);
  pending.writers++;
  try {
    // Synchronous setters notify before write() returns its promise.
    await attributeTo(cause, write);
  } finally {
    if (--pending.writers === 0) expressionWrites.delete(control);
    // Controls without a bound event producer still need an ancestor refresh.
    if (!pending.refreshed || pending.value !== control.value) {
      control.parent?.updateValueAndValidity({ emitEvent: false });
      pending.refreshed = true;
      pending.value = control.value;
    }
  }
}

/**
 * Capture the expression write that is calling an asynchronous custom setter.
 * Call before the setter's first `await`; the returned function attributes a
 * later change to that write.
 */
export function captureWriteAttribution(): AttributeWrite {
  const cause = activeCause;
  return change => (cause ? attributeTo(cause, change) : change());
}

/** Publish every change against its current form state, including edits during async writes. */
export function publishControlValueNotification(
  control: AbstractControl,
  publish: (cause: ValueNotificationCause) => void
): void {
  let writingControl: AbstractControl | null = control;
  while (writingControl && !expressionWrites.has(writingControl)) {
    writingControl = writingControl.parent;
  }
  if (writingControl) {
    // Angular emits child valueChanges before refreshing its ancestors. Refresh
    // them silently before a behaviour reads form.value, without revalidating
    // the changed control or postponing notifications across an async write.
    control.parent?.updateValueAndValidity({ emitEvent: false });
    const pending = expressionWrites.get(writingControl)!;
    pending.refreshed = true;
    pending.value = writingControl.value;
  }
  publish(activeCause ?? {});
}

function attributeTo<T>(cause: ValueNotificationCause, change: () => T): T {
  const previous = activeCause;
  activeCause = cause;
  try {
    return change();
  } finally {
    activeCause = previous;
  }
}

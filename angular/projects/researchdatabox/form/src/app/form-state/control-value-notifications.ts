import type { AbstractControl } from '@angular/forms';
import { isEqual } from 'lodash-es';
import type { FormComponentEventBase } from './events/form-component-event.types';

/** Handlers that caused a value notification, used to stop feedback loops. */
export type ValueNotificationCause = Pick<FormComponentEventBase, 'behaviourChain' | 'expressionChain'>;

/** Runs a synchronous change as part of an expression write, attributing its notifications to that write. */
export type AttributeWrite = <T>(change: () => T) => T;

/** The value an in-progress write is setting, and the handlers that caused it. */
type WriteAttribution = { cause: ValueNotificationCause; target?: { value: unknown } };
type ExpressionWrite = { writes: WriteAttribution[]; refreshed: boolean; value?: unknown };
const expressionWrites = new WeakMap<AbstractControl, ExpressionWrite>();

/**
 * The write whose code is currently executing synchronously. Notifications are
 * attributed to it while it is set. Afterwards only a change to a pending
 * write's target value is attributed, so independent edits made while an
 * asynchronous write awaits start a fresh causal chain.
 */
let activeCause: ValueNotificationCause | undefined;

/** Keep aggregate form values current while expression writes notify dependants. */
export async function withExpressionValueNotifications(
  control: AbstractControl,
  write: () => Promise<void>,
  cause: ValueNotificationCause = {},
  target?: { value: unknown }
): Promise<void> {
  const pending = expressionWrites.get(control) ?? { writes: [], refreshed: false };
  const attribution: WriteAttribution = { cause, target };
  expressionWrites.set(control, pending);
  pending.writes.push(attribution);
  try {
    // Synchronous setters notify before write() returns its promise.
    await attributeTo(cause, write);
  } finally {
    pending.writes.splice(pending.writes.indexOf(attribution), 1);
    if (pending.writes.length === 0) expressionWrites.delete(control);
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
 * later change to that write. Needed only when the setter's resulting value
 * can differ from the value it was asked to set, such as a repeatable filling
 * in a required default row.
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
  if (!writingControl) {
    publish(activeCause ?? {});
    return;
  }
  // Angular emits child valueChanges before refreshing its ancestors. Refresh
  // them silently before a behaviour reads form.value, without revalidating
  // the changed control or postponing notifications across an async write.
  control.parent?.updateValueAndValidity({ emitEvent: false });
  const writtenValue = writingControl.value;
  const pending = expressionWrites.get(writingControl)!;
  pending.refreshed = true;
  pending.value = writtenValue;
  // An async setter that changes the control after awaiting is recognised by its target value.
  const settled = pending.writes.find(write => write.target && isEqual(write.target.value, writtenValue));
  publish(activeCause ?? settled?.cause ?? {});
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

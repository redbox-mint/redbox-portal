import type { AbstractControl } from '@angular/forms';
import type { FormComponentEventBase } from './events/form-component-event.types';

/** Handlers that caused a value notification, used to stop feedback loops. */
export type ValueNotificationCause = Pick<FormComponentEventBase, 'behaviourChain' | 'expressionChain'>;

type ExpressionWrite = { writers: number; refreshed: boolean; value?: unknown; cause: ValueNotificationCause };
const expressionWrites = new WeakMap<AbstractControl, ExpressionWrite>();

/** Keep aggregate form values current while expression writes notify dependants. */
export async function withExpressionValueNotifications(
  control: AbstractControl,
  write: () => Promise<void>,
  cause: ValueNotificationCause = {}
): Promise<void> {
  const pending = expressionWrites.get(control) ?? { writers: 0, refreshed: false, cause: {} };
  // Overlapping writes share one attribution, so keep every handler in the chain.
  pending.cause = mergeCauses(pending.cause, cause);
  expressionWrites.set(control, pending);
  pending.writers++;
  try {
    await write();
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
    publish({});
    return;
  }
  // Angular emits child valueChanges before refreshing its ancestors. Refresh
  // them silently before a behaviour reads form.value, without revalidating
  // the changed control or postponing notifications across an async write.
  control.parent?.updateValueAndValidity({ emitEvent: false });
  const pending = expressionWrites.get(writingControl)!;
  pending.refreshed = true;
  pending.value = writingControl.value;
  publish(pending.cause);
}

function mergeCauses(a: ValueNotificationCause, b: ValueNotificationCause): ValueNotificationCause {
  const behaviourChain = [...new Set([...(a.behaviourChain ?? []), ...(b.behaviourChain ?? [])])];
  const expressionChain = [...new Set([...(a.expressionChain ?? []), ...(b.expressionChain ?? [])])];
  return {
    ...(behaviourChain.length > 0 ? { behaviourChain } : {}),
    ...(expressionChain.length > 0 ? { expressionChain } : {}),
  };
}

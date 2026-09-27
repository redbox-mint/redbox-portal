import type { AbstractControl } from '@angular/forms';

type ExpressionWrite = { writers: number; refreshed: boolean; value?: unknown };
const expressionWrites = new WeakMap<AbstractControl, ExpressionWrite>();

/** Keep aggregate form values current while expression writes notify dependants. */
export async function withExpressionValueNotifications(
  control: AbstractControl,
  write: () => Promise<void>
): Promise<void> {
  const pending = expressionWrites.get(control) ?? { writers: 0, refreshed: false };
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
export function publishControlValueNotification(control: AbstractControl, publish: () => void): void {
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
  publish();
}

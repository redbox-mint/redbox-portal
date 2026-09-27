import type { AbstractControl } from '@angular/forms';

type DeferredNotifications = { writers: number; publishers: Array<() => void> };
const deferred = new WeakMap<AbstractControl, DeferredNotifications>();

/** Delay ReDBox field events until an expression write has refreshed its ancestors.
 * Angular's own value/status events and asynchronous validation remain active.
 */
export async function deferControlValueNotifications(
  control: AbstractControl,
  write: () => Promise<void>
): Promise<void> {
  const pending = deferred.get(control) ?? { writers: 0, publishers: [] };
  deferred.set(control, pending);
  pending.writers++;
  try {
    await write();
  } finally {
    if (--pending.writers === 0) {
      deferred.delete(control);
      for (const publish of pending.publishers) publish();
    }
  }
}

/** Each callback retains the value from its own change, including intervening user edits. */
export function publishControlValueNotification(control: AbstractControl, publish: () => void): void {
  const pending = deferred.get(control);
  if (pending) {
    pending.publishers.push(publish);
  } else {
    publish();
  }
}

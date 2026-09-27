import type { AbstractControl } from '@angular/forms';
import type { FormComponentEventBase } from './events/form-component-event.types';
import type { ControlSetValueOptions } from './custom-set-value.control';

/** Handlers that caused a value notification, used to stop feedback loops. */
export type ValueNotificationCause = Pick<FormComponentEventBase, 'behaviourChain' | 'expressionChain'>;

type ExpressionWrite = { writers: number; refreshed: boolean; value?: unknown };
const expressionWrites = new WeakMap<AbstractControl, ExpressionWrite>();

/**
 * Control methods that change a value. While a write is pending, a call that
 * receives the write's options object is attributed to that write.
 */
const ATTRIBUTED_METHODS = [
  'setValue',
  'patchValue',
  'reset',
  'push',
  'insert',
  'removeAt',
  'setControl',
  'addControl',
  'removeControl',
  'clear',
  'updateValueAndValidity',
] as const;

type ControlMethods = Record<string, ((...args: unknown[]) => unknown) | undefined>;
/** Causes of pending writes, keyed by each write's options object. */
const writeCauses = new WeakMap<object, ValueNotificationCause>();
type AttributedControl = { writes: Map<object, ValueNotificationCause>; restore: () => void };
const attributedControls = new WeakMap<AbstractControl, AttributedControl>();

/**
 * The write whose change is currently executing synchronously. Only these
 * changes are attributed, so independent edits made while an asynchronous
 * write awaits start a fresh causal chain.
 */
let activeCause: ValueNotificationCause | undefined;

/**
 * Keep aggregate form values current while expression writes notify dependants.
 *
 * `write` receives the options for this write. Changes made synchronously, or
 * later by passing these options to the control's own methods, are attributed
 * to `cause`.
 */
export async function withExpressionValueNotifications(
  control: AbstractControl,
  write: (options: ControlSetValueOptions) => Promise<void>,
  cause: ValueNotificationCause = {}
): Promise<void> {
  // A fresh object identifies this write's changes after the setter awaits.
  const options: ControlSetValueOptions = { emitEvent: true, onlySelf: true };
  const pending = expressionWrites.get(control) ?? { writers: 0, refreshed: false };
  expressionWrites.set(control, pending);
  pending.writers++;
  const release = attributeOptions(control, options, cause);
  writeCauses.set(options, cause);
  try {
    // Synchronous setters notify before write() returns its promise.
    await attributeTo(cause, () => write(options));
  } finally {
    writeCauses.delete(options);
    release();
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

/**
 * Run a change to another control, such as a row being added to the target, as
 * part of the pending write that `options` identifies. Without a pending write
 * the change runs unattributed.
 */
export function withWriteOptions<T>(options: object | undefined, change: () => T): T {
  const cause = options ? writeCauses.get(options) : undefined;
  return cause ? attributeTo(cause, change) : change();
}

/** Attribute the control's changes made with `options` until the returned release runs. */
function attributeOptions(control: AbstractControl, options: object, cause: ValueNotificationCause): () => void {
  let attributed = attributedControls.get(control);
  if (!attributed) {
    const writes = new Map<object, ValueNotificationCause>();
    const methods = control as unknown as ControlMethods;
    const ownMethods = new Map<string, ControlMethods[string]>();
    for (const name of ATTRIBUTED_METHODS) {
      const original = methods[name];
      if (typeof original !== 'function') continue;
      if (Object.prototype.hasOwnProperty.call(control, name)) ownMethods.set(name, original);
      methods[name] = function (this: unknown, ...args: unknown[]) {
        const token = args.find(arg => typeof arg === 'object' && arg !== null && writes.has(arg));
        const call = () => original.apply(this, args);
        return token ? attributeTo(writes.get(token)!, call) : call();
      };
    }
    attributed = {
      writes,
      restore: () => {
        for (const name of ATTRIBUTED_METHODS) {
          if (ownMethods.has(name)) methods[name] = ownMethods.get(name);
          else delete methods[name];
        }
      },
    };
    attributedControls.set(control, attributed);
  }
  const current = attributed;
  current.writes.set(options, cause);
  return () => {
    current.writes.delete(options);
    if (current.writes.size === 0) {
      current.restore();
      attributedControls.delete(control);
    }
  };
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

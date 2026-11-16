import type { ControllerFactory, ControllerRegistration } from './contracts';

/** Check callable action names without erasing the factory's concrete input/output inference.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export function defineController<Input, C extends object>(
  factory: ControllerFactory<Input, C>
): ControllerFactory<Input, C> {
  return factory;
}

/** BoundControllerFactory authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface BoundControllerFactory<C extends object = object> {
  (): C;
  /** Exact descriptor identity prevents accidentally binding a replaced factory's input. */
  readonly factory: ControllerRegistration;
}

/** Offline binding only: construction belongs to HTTP preparation after initialization.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export function bindControllerFactory<Input, C extends object>(
  factory: ControllerFactory<Input, C>,
  input: NoInfer<Input>
): BoundControllerFactory<C> {
  return Object.assign(() => factory.create(input), { factory });
}

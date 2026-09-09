import { ACTION_SECRET_LIMITS } from '../../action-registry/secrets';
import type { RuntimeValue } from '../../runtimeValues';

/** @internal */
export function isProtectedActionSecretEnvelope(value: RuntimeValue): value is string {
  return (
    typeof value === 'string' &&
    value.length <= ACTION_SECRET_LIMITS.maxSecretBytes * 2 + 61 &&
    /^v1:[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})+$/.test(value)
  );
}

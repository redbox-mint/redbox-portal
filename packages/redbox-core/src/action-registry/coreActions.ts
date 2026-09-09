import type { ActionRegistrationDescriptor } from './registration';
import { builtInActionRegistrations } from './builtInActions';

/**
 * Explicit core action registration entry point.
 */
export function registerRedboxActions(): readonly ActionRegistrationDescriptor[] {
  return builtInActionRegistrations();
}

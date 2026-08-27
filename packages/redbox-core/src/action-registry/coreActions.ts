import type { ActionRegistrationDescriptor } from './registration';

/**
 * Explicit core action registration entry point. Shipped legacy actions are
 * added here as they are migrated in A07.
 */
export function registerRedboxActions(): readonly ActionRegistrationDescriptor[] {
  return [];
}

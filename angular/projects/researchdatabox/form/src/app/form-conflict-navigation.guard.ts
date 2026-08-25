import type { CanDeactivateFn } from '@angular/router';

/** Contract implemented by forms that retain unresolved conflict work in memory. */
export interface ConflictNavigationAwareForm {
  canDeactivate(): boolean;
}

/**
 * Host integration contract for an SPA route whose component is a ReDBox form.
 *
 * The form application shipped by this repository is bootstrapped directly in
 * server-rendered pages and does not register Angular routes. Exporting this
 * guard therefore does not activate it: an SPA host must add it to that form
 * route's `canDeactivate` array. The form owns the prompt and memory-only
 * conflict state; the guard remains stateless so route teardown cannot leave
 * subscriptions or navigation locks.
 */
export const formConflictCanDeactivateGuard: CanDeactivateFn<ConflictNavigationAwareForm> = component =>
  component.canDeactivate();

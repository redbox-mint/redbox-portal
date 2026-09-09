import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import type { ConflictNavigationAwareForm } from './form-conflict-navigation.guard';
import { formConflictCanDeactivateGuard } from './form-conflict-navigation.guard';

describe('formConflictCanDeactivateGuard host contract', () => {
  const invoke = (component: ConflictNavigationAwareForm): boolean => {
    const result = formConflictCanDeactivateGuard(
      component,
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot,
      {} as RouterStateSnapshot
    );
    if (typeof result !== 'boolean') {
      throw new TypeError('The form conflict guard contract must resolve synchronously.');
    }
    return result;
  };

  it('delegates a blocked navigation when an SPA host invokes the guard', () => {
    const canDeactivate = jasmine.createSpy('canDeactivate').and.returnValue(false);

    expect(invoke({ canDeactivate })).toBeFalse();
    expect(canDeactivate).toHaveBeenCalledTimes(1);
  });

  it('delegates an allowed host navigation without retaining guard state', () => {
    const canDeactivate = jasmine.createSpy('canDeactivate').and.returnValues(true, false);

    expect(invoke({ canDeactivate })).toBeTrue();
    expect(invoke({ canDeactivate })).toBeFalse();
    expect(canDeactivate).toHaveBeenCalledTimes(2);
  });
});

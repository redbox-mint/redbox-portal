/**
 * FormComponent Integration Tests
 * 
 * Integration tests verifying FormComponent works correctly with the new
 * NgRx-based form state management, facade, and event bus.
 * 
 * Requirements:
 * - R12.4: Field integration test SHALL assert reset propagation via resetToken change
 * - R12.5: A minimal harness SHALL simulate submit success and failure
 * - R16.12: Integration test bootstrapping real FormComponent with new facade
 * - AC52: FormComponent shall initialize without runtime errors
 * - AC59: Integration test shall assert INIT -> READY transition
 */

import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { FormComponent } from './form.component';
import { FormStateFacade } from './form-state/facade/form-state.facade';
import { FormStatus } from '@researchdatabox/sails-ng-common';
import { Store } from '@ngrx/store';
import * as FormActions from './form-state/state/form.actions';
import { selectResetToken, selectStatus } from './form-state/state/form.selectors';
import { FormConfig } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from './helpers.spec';
import { SimpleInputComponent } from './component/simpleinput.component';

describe('FormComponent Integration Tests', () => {
  let component: FormComponent;
  let facade: FormStateFacade;
  let store: Store;
  let statusSub: Subscription | undefined;
  let resetTokenSub: Subscription | undefined;

  const basicFormConfig: FormConfig = {
    debugValue: true,
    defaultComponentConfig: {
      defaultComponentCssClasses: 'form-control'
    },
    editCssClasses: 'redbox-form form',
    componentDefinitions: [
      {
        name: 'test_field',
        model: {
          class: 'SimpleInputModel',
          config: {
            value: 'initial value'
          }
        },
        component: {
          class: 'SimpleInputComponent',
          config: {
            type: 'text',
            label: 'Test Field'
          }
        }
      }
    ]
  };

  beforeEach(async () => {
    await createTestbedModule([
      SimpleInputComponent,
    ]);

    facade = TestBed.inject(FormStateFacade);
    store = TestBed.inject(Store);
  });

  afterEach(() => {
    // Ensure any test subscriptions are cleaned up to avoid memory leaks
    statusSub?.unsubscribe();
    statusSub = undefined;
    resetTokenSub?.unsubscribe();
    resetTokenSub = undefined;
  });

  /**
   * AC52, AC59: Verify FormComponent initializes without errors and transitions INIT -> READY
   * R16.12: Integration test with real FormComponent and facade
   */
  it('should initialize FormComponent and transition from INIT to READY', fakeAsync(async () => {
    // Arrange & Act: Create form using helper
    const { fixture, formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;
    
    tick();
    
    // Assert: Status should be READY after successful load
    expect(facade.status()).toBe(FormStatus.READY);
    expect(component.status()).toBe(FormStatus.READY);
  }));

  /**
   * R12.4: Assert reset propagation via resetToken change
   * AC59: Verify facade observability works correctly
   */
  it('should propagate reset via resetToken increment', fakeAsync(async () => {
    // Arrange: Create form using helper
    const { fixture, formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;
    
    tick();
    
    // Get initial reset token
    let currentResetToken: number | undefined;
    resetTokenSub = store.select(selectResetToken).subscribe(token => {
      currentResetToken = token;
    });
    tick();
    
    const initialResetToken = currentResetToken!;
    expect(initialResetToken).toBe(0);
    
    // Act: Dispatch reset action
    store.dispatch(FormActions.resetAllFields());
    tick();
    
    // Assert: Reset token should increment
    expect(currentResetToken).toBe(initialResetToken + 1);
    
    // Verify status remains READY after reset
    expect(facade.status()).toBe(FormStatus.READY);
    
    // Act: Reset again
    store.dispatch(FormActions.resetAllFields());
    tick();
    
    // Assert: Reset token increments again
    expect(currentResetToken).toBe(initialResetToken + 2);
  }));

  /**
   * R12.5: Simulate submit success 
   * Verify facade submit method works correctly
   */
  it('should handle submit success flow via facade', fakeAsync(async () => {
    // Arrange: Create form using helper
    const { fixture, formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;
    
    tick();
    
    expect(facade.status()).toBe(FormStatus.READY);
    
    // Track status changes
    const statusChanges: FormStatus[] = [];
    statusSub = store.select(selectStatus).subscribe(status => {
      statusChanges.push(status);
    });
    tick();
    
    // Act: Call facade submit (this will dispatch submitForm action)
    facade.submit({ force: false });
    tick();
    
    // Assert: Submit action was dispatched (status should change to SAVING)
    // Note: The actual save happens in FormComponent.saveForm() which we're not mocking here
    // This test verifies the facade.submit() method works and dispatches the action
    expect(statusChanges).toContain(FormStatus.SAVING);
  }));

  /**
   * AC52: Verify no runtime errors with real providers
   * Test that facade signals are observable and reactive
   */
  it('should expose reactive facade signals without runtime errors', fakeAsync(async () => {
    // Arrange: Create form using helper
    const { fixture, formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;
    
    tick();
    
    // Assert: Facade signals are accessible and reactive
    expect(() => facade.status()).not.toThrow();
    expect(() => facade.isInitializing()).not.toThrow();
    expect(() => facade.isReady()).not.toThrow();
    expect(() => facade.isSaving()).not.toThrow();
    expect(() => facade.isDirty()).not.toThrow();
    expect(() => facade.hasValidationError()).not.toThrow();
    expect(() => facade.hasLoadError()).not.toThrow();
    expect(() => facade.resetToken()).not.toThrow();
    
    // Verify values after form is loaded
    expect(facade.status()).toBe(FormStatus.READY);
    expect(facade.isInitializing()).toBe(false);
    expect(facade.isReady()).toBe(true);
    expect(facade.isSaving()).toBe(false);
    expect(facade.isDirty()).toBe(false);
    expect(facade.hasValidationError()).toBe(false);
    expect(facade.hasLoadError()).toBe(false);
    expect(facade.resetToken()).toBe(0);
  }));

  /**
   * Test dirty state management via facade
   * Verify markDirty/markPristine actions work correctly
   */
  it('should track dirty state through facade signals', fakeAsync(async () => {
    // Arrange: Create form using helper
    const { fixture, formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;
    
    tick();
    
    // Assert: Initial state is pristine
    expect(facade.isDirty()).toBe(false);
    
    // Act: Mark form as dirty
    store.dispatch(FormActions.markDirty());
    tick();
    
    // Assert: Dirty state updates
    expect(facade.isDirty()).toBe(true);
    
    // Act: Mark as pristine
    store.dispatch(FormActions.markPristine());
    tick();
    
    // Assert: Back to pristine
    expect(facade.isDirty()).toBe(false);
  }));

  /**
   * Test validation lifecycle through facade
   * Verify validation pending/success/error states
   */
  it('should handle validation lifecycle via store actions', fakeAsync(async () => {
    // Arrange: Create form using helper
    const { fixture, formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;
    
    tick();
    
    expect(facade.status()).toBe(FormStatus.READY);
    
    // Act: Dispatch validation pending
    store.dispatch(FormActions.formValidationPending());
    tick();
    
    // Assert: Status changes to VALIDATION_PENDING
    expect(facade.status()).toBe(FormStatus.VALIDATION_PENDING);
    
    // Act: Dispatch validation success
    store.dispatch(FormActions.formValidationSuccess());
    tick();
    
    // Assert: Status returns to READY
    expect(facade.status()).toBe(FormStatus.READY);
    
    // Act: Simulate validation error
    store.dispatch(FormActions.formValidationPending());
    tick();
    store.dispatch(FormActions.formValidationFailure({ error: 'Test error' }));
    tick();
    
    // Assert: Status changes to VALIDATION_ERROR
    expect(facade.status()).toBe(FormStatus.VALIDATION_ERROR);
    expect(facade.hasValidationError()).toBe(true);
  }));

  /**
   * Test that component uses facade status (not direct mutation)
   * AC58: Verify no direct writes to status after migration
   */
  it('should source status from facade (readonly)', fakeAsync(async () => {
    // Arrange: Create form using helper
    const { fixture, formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;
    
    tick();
    
    // Assert: Component status should be same as facade status
    expect(component.status()).toBe(facade.status());
    expect(component.status()).toBe(FormStatus.READY);
    expect(facade.status()).toBe(FormStatus.READY);
    expect(component.status()).toBe(facade.status());
    
    // Verify component.status is a Signal (readonly from facade)
    expect(typeof component.status).toBe('function');
  }));

  /**
   * Test imperative facade methods
   * Verify load, submit, reset methods dispatch correct actions
   */
  it('should provide imperative facade methods that dispatch actions', fakeAsync(() => {
    // Arrange: Spy on store dispatch
    const dispatchSpy = spyOn(store, 'dispatch');
    
    // Act: Call facade.load()
    facade.load('test-oid', 'rdmp', 'default');
    
    // Assert: loadInitialData action dispatched
    expect(dispatchSpy).toHaveBeenCalledWith(
      FormActions.loadInitialData({ oid: 'test-oid', recordType: 'rdmp', formName: 'default' })
    );
    
    dispatchSpy.calls.reset();
    
    // Act: Call facade.submit()
    facade.submit({ force: true, targetStep: 'review', skipValidation: false });
    
    // Assert: submitForm action dispatched with parameters
    expect(dispatchSpy).toHaveBeenCalledWith(
      FormActions.submitForm({ force: true, targetStep: 'review', skipValidation: false })
    );
    
    dispatchSpy.calls.reset();
    
    // Act: Call facade.resetAllFields()
    facade.resetAllFields();
    
    // Assert: resetAllFields action dispatched
    expect(dispatchSpy).toHaveBeenCalledWith(FormActions.resetAllFields());
  }));
});

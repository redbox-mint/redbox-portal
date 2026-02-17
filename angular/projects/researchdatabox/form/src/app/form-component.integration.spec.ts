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

import { TestBed, waitForAsync } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { FormComponent } from './form.component';
import { FormStateFacade } from './form-state/facade/form-state.facade';
import {FormComponentEventBus, createFormSaveSuccessEvent, createFormSaveRequestedEvent} from './form-state/events';
import { FormStatus } from '@researchdatabox/sails-ng-common';
import { Store } from '@ngrx/store';
import * as FormActions from './form-state/state/form.actions';
import { selectResetToken, selectStatus } from './form-state/state/form.selectors';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from './helpers.spec';
import { SimpleInputComponent } from './component/simple-input.component';
import { FormEventBusAdapterEffects } from './form-state/effects/form-event-bus-adapter.effects';
import { TypeaheadInputComponent } from './component/typeahead-input.component';
import { TypeaheadModule } from 'ngx-bootstrap/typeahead';

describe('FormComponent Integration Tests', () => {
  let component: FormComponent;
  let facade: FormStateFacade;
  let store: Store;
  let statusSub: Subscription | undefined;
  let resetTokenSub: Subscription | undefined;
  let eventBus: FormComponentEventBus;
  let busEffects: FormEventBusAdapterEffects;

  const basicFormConfig: FormConfigFrame = {
    name: 'testing',
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
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "TypeaheadInputComponent": TypeaheadInputComponent
      },
      imports: {
        "TypeaheadModule": TypeaheadModule.forRoot()
      },
    });

    facade = TestBed.inject(FormStateFacade);
    store = TestBed.inject(Store);
    eventBus = TestBed.inject(FormComponentEventBus);
    busEffects = TestBed.inject(FormEventBusAdapterEffects);
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
  it('should initialize FormComponent and transition from INIT to READY', waitForAsync(async () => {
    // Arrange & Act: Create form using helper
    const { formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;

    // Assert: Status should be READY after successful load
    expect(facade.status()).toBe(FormStatus.READY);
    expect(component.status()).toBe(FormStatus.READY);
  }));

  /**
   * R12.4: Assert reset propagation via resetToken change
   * AC59: Verify facade observability works correctly
   */
  it('should propagate reset via resetToken increment', waitForAsync(async () => {
    // Arrange: Create form using helper
    const { formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;

    // Get initial reset token
    let currentResetToken: number | undefined;
    resetTokenSub = store.select(selectResetToken).subscribe(token => {
      currentResetToken = token;
    });

    const initialResetToken = currentResetToken!;
    expect(initialResetToken).toBe(0);

    // Act: Dispatch reset action
    store.dispatch(FormActions.resetAllFields());

    // Assert: Reset token should increment
    expect(currentResetToken).toBe(initialResetToken + 1);

    // Verify status remains READY after reset
    expect(facade.status()).toBe(FormStatus.READY);

    // Act: Reset again
    store.dispatch(FormActions.resetAllFields());

    // Assert: Reset token increments again
    expect(currentResetToken).toBe(initialResetToken + 2);
  }));

  /**
   * R12.5: Simulate submit success
   * Verify facade submit method works correctly
   */
  it('should handle submit success flow via facade', waitForAsync(async () => {
    // Arrange: Create form using helper
    const { formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;

    expect(facade.status()).toBe(FormStatus.READY);

    // Track status changes
    const statusChanges: FormStatus[] = [];
    statusSub = store.select(selectStatus).subscribe(status => {
      statusChanges.push(status);
    });
    // Act: Call facade submit (this will dispatch submitForm action)
    facade.submit({ force: false });

    expect(statusChanges).toContain(FormStatus.SAVING);

  }));

  it('should handle submit success flow via event bus', waitForAsync(async () => {
    // Arrange: Create form using helper
    const { fixture, formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;

    expect(facade.status()).toBe(FormStatus.READY);

    // Track status changes
    const statusChanges: FormStatus[] = [];
    statusSub = store.select(selectStatus).subscribe(status => {
      statusChanges.push(status);
    });
    eventBus.publish(createFormSaveRequestedEvent({ force: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(statusChanges).toContain(FormStatus.SAVING);
    // Goes from READY -> SAVING -> READY
    expect(statusChanges).toEqual([
      FormStatus.READY,
      FormStatus.SAVING,
    ]);
    eventBus.publish(createFormSaveSuccessEvent({savedData: {test: 'data'}}));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(statusChanges).toEqual([
      FormStatus.READY,
      FormStatus.SAVING,
      FormStatus.READY,
    ]);
    expect(facade.status()).toBe(FormStatus.READY);

  }));

  /**
   * AC52: Verify no runtime errors with real providers
   * Test that facade signals are observable and reactive
   */
  it('should expose reactive facade signals without runtime errors', waitForAsync(async () => {
    // Arrange: Create form using helper
    const { formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;

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
  it('should track dirty state through facade signals', waitForAsync(async () => {
    // Arrange: Create form using helper
    const { formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;

    // Assert: Initial state is pristine
    expect(facade.isDirty()).toBe(false);

    // Act: Mark form as dirty
    store.dispatch(FormActions.markDirty());

    // Assert: Dirty state updates
    expect(facade.isDirty()).toBe(true);

    // Act: Mark as pristine
    store.dispatch(FormActions.markPristine());

    // Assert: Back to pristine
    expect(facade.isDirty()).toBe(false);
  }));

  /**
   * Test validation lifecycle through facade
   * Verify validation pending/success/error states
   */
  it('should handle validation lifecycle via store actions', waitForAsync(async () => {
    // Arrange: Create form using helper
    const { formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;

    expect(facade.status()).toBe(FormStatus.READY);

    // Act: Dispatch validation pending
    store.dispatch(FormActions.formValidationPending());

    // Assert: Status changes to VALIDATION_PENDING
    expect(facade.status()).toBe(FormStatus.VALIDATION_PENDING);

    // Act: Dispatch validation success
    store.dispatch(FormActions.formValidationSuccess());

    // Assert: Status returns to READY
    expect(facade.status()).toBe(FormStatus.READY);

    // Act: Simulate validation error
    store.dispatch(FormActions.formValidationPending());
    store.dispatch(FormActions.formValidationFailure({ error: 'Test error' }));

    // Assert: Status changes to VALIDATION_ERROR
    expect(facade.status()).toBe(FormStatus.VALIDATION_ERROR);
    expect(facade.hasValidationError()).toBe(true);
  }));

  /**
   * Test that component uses facade status (not direct mutation)
   * AC58: Verify no direct writes to status after migration
   */
  it('should source status from facade (readonly)', waitForAsync(async () => {
    // Arrange: Create form using helper
    const { formComponent } = await createFormAndWaitForReady(basicFormConfig);
    component = formComponent;

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
  it('should provide imperative facade methods that dispatch actions', waitForAsync( async () => {
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
    facade.submit({ force: true, targetStep: 'review', enabledValidationGroups: ["all"] });

    // Assert: submitForm action dispatched with parameters
    expect(dispatchSpy).toHaveBeenCalledWith(
      FormActions.submitForm({ force: true, targetStep: 'review', enabledValidationGroups: ["all"] })
    );

    dispatchSpy.calls.reset();

    // Act: Call facade.resetAllFields()
    facade.resetAllFields();

    // Assert: resetAllFields action dispatched
    expect(dispatchSpy).toHaveBeenCalledWith(FormActions.resetAllFields());
  }));

  it('renders typeahead input from form config', waitForAsync(async () => {
    const formConfig: FormConfigFrame = {
      name: 'typeahead-integration',
      componentDefinitions: [
        {
          name: 'person_lookup',
          component: {
            class: 'TypeaheadInputComponent',
            config: {
              sourceType: 'static',
              staticOptions: [{ label: 'Jane Doe', value: 'jane' }]
            }
          },
          model: { class: 'TypeaheadInputModel', config: {} }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute('role')).toBe('combobox');
  }));
});

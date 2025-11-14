/**
 * Form State Facade Tests
 *
 * Validates facade signal outputs, imperative API dispatch paths, and facade behavior.
 * Per Task 7 (R7.1–R7.7, AC18–AC21)
 */

import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { FormStateFacade } from './form-state.facade';
import { FormStatus } from '@researchdatabox/sails-ng-common';
import * as FormActions from '../state/form.actions';
import * as FormSelectors from '../state/form.selectors';
import { FormFeatureState } from '../state/form.state';

describe('FormStateFacade', () => {
  let facade: FormStateFacade;
  let store: MockStore<{ form: FormFeatureState }>;

  const initialState: FormFeatureState = {
    status: FormStatus.INIT,
    isDirty: false,
    error: null,
    resetToken: 0,
    submissionAttempt: 0,
    pendingActions: [],
    lastSavedAt: null,
    modelSnapshot: null,
    initialDataLoaded: false,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FormStateFacade,
        provideMockStore({ initialState: { form: initialState } }),
      ],
    });

    facade = TestBed.inject(FormStateFacade);
    store = TestBed.inject(MockStore);

    spyOn(store, 'dispatch');
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('Signal API', () => {
    /**
     * AC18: The facade shall expose read-only Signals for core selectors
     */

    it('should expose status signal (AC18, R7.1)', () => {
      expect(facade.status()).toBe(FormStatus.INIT);

      store.overrideSelector(FormSelectors.selectStatus, FormStatus.READY);
      store.refreshState();

      expect(facade.status()).toBe(FormStatus.READY);
    });

    it('should expose isDirty signal (AC18, R7.1)', () => {
      expect(facade.isDirty()).toBe(false);

      store.overrideSelector(FormSelectors.selectIsDirty, true);
      store.refreshState();

      expect(facade.isDirty()).toBe(true);
    });

    it('should expose resetToken signal (AC18, R7.1)', () => {
      expect(facade.resetToken()).toBe(0);

      store.overrideSelector(FormSelectors.selectResetToken, 3);
      store.refreshState();

      expect(facade.resetToken()).toBe(3);
    });

    it('should expose error signal (AC18, R7.1)', () => {
      expect(facade.error()).toBeNull();

      store.overrideSelector(FormSelectors.selectError, 'Load failed');
      store.refreshState();

      expect(facade.error()).toBe('Load failed');
    });

    it('should expose isSaving signal (AC18, R7.1)', () => {
      expect(facade.isSaving()).toBe(false);

      store.overrideSelector(FormSelectors.selectIsSaving, true);
      store.refreshState();

      expect(facade.isSaving()).toBe(true);
    });

    it('should expose isValidationPending signal (AC18, R7.1)', () => {
      expect(facade.isValidationPending()).toBe(false);

      store.overrideSelector(FormSelectors.selectIsValidationPending, true);
      store.refreshState();

      expect(facade.isValidationPending()).toBe(true);
    });

    it('should expose hasValidationError signal (AC18, R7.1)', () => {
      expect(facade.hasValidationError()).toBe(false);

      store.overrideSelector(FormSelectors.selectHasValidationError, true);
      store.refreshState();

      expect(facade.hasValidationError()).toBe(true);
    });

    it('should expose hasLoadError signal (AC18, R7.1)', () => {
      expect(facade.hasLoadError()).toBe(false);

      store.overrideSelector(FormSelectors.selectHasLoadError, true);
      store.refreshState();

      expect(facade.hasLoadError()).toBe(true);
    });

    it('should expose isInitializing signal (AC18, R7.1)', () => {
      expect(facade.isInitializing()).toBe(true);

      store.overrideSelector(FormSelectors.selectIsInitializing, false);
      store.refreshState();

      expect(facade.isInitializing()).toBe(false);
    });

    it('should expose isReady signal (AC18, R7.1)', () => {
      expect(facade.isReady()).toBe(false);

      store.overrideSelector(FormSelectors.selectIsReady, true);
      store.refreshState();

      expect(facade.isReady()).toBe(true);
    });

    it('should expose lastSavedAt signal (R7.1)', () => {
      expect(facade.lastSavedAt()).toBeNull();

      const nowIso = new Date().toISOString();
      store.overrideSelector(FormSelectors.selectLastSavedAt, nowIso);
      store.refreshState();

      expect(facade.lastSavedAt()).toBe(nowIso);
    });
  });

  describe('Imperative API', () => {
    /**
     * AC19: When facade.resetAllFields() is invoked, it shall dispatch resetAllFields
     * AC20: Facade methods shall dispatch corresponding actions
     */

    it('should dispatch loadInitialData on load() (AC20, R7.1)', () => {
      facade.load('oid-123', 'rdmp', 'default');

      expect(store.dispatch).toHaveBeenCalledWith(
        FormActions.loadInitialData({
          oid: 'oid-123',
          recordType: 'rdmp',
          formName: 'default',
        })
      );
    });

    it('should dispatch loadInitialData on reload() (AC20, R7.1)', () => {
      facade.reload('oid-456', 'dataset', 'custom');

      expect(store.dispatch).toHaveBeenCalledWith(
        FormActions.loadInitialData({
          oid: 'oid-456',
          recordType: 'dataset',
          formName: 'custom',
        })
      );
    });

    it('should dispatch submitForm on submit() with default options (AC20, R7.1)', () => {
      facade.submit();

      expect(store.dispatch).toHaveBeenCalledWith(
        FormActions.submitForm({
          force: false,
          targetStep: undefined,
          enabledValidationGroups: ["all"],
        })
      );
    });

    it('should dispatch submitForm on submit() with custom options (AC20, R7.1)', () => {
      facade.submit({ force: true, targetStep: 'review', enabledValidationGroups: ["all"],});

      expect(store.dispatch).toHaveBeenCalledWith(
        FormActions.submitForm({
          force: true,
          targetStep: 'review',
          enabledValidationGroups: ["all"],
        })
      );
    });

    it('should dispatch markDirty on markDirty() (AC20, R7.1)', () => {
      facade.markDirty();

      expect(store.dispatch).toHaveBeenCalledWith(FormActions.markDirty());
    });

    it('should dispatch markPristine on markPristine() (AC20, R7.1)', () => {
      facade.markPristine();

      expect(store.dispatch).toHaveBeenCalledWith(FormActions.markPristine());
    });

    it('should dispatch resetAllFields on resetAllFields() (AC19, R7.1, R8.4)', () => {
      facade.resetAllFields();

      expect(store.dispatch).toHaveBeenCalledWith(FormActions.resetAllFields());
    });

    it('should dispatch ackError on ackError() (AC20, R7.1)', () => {
      facade.ackError();

      expect(store.dispatch).toHaveBeenCalledWith(FormActions.ackError());
    });

    it('should dispatch syncModelSnapshot on syncModelSnapshot() (R7.1)', () => {
      const snapshot = { field1: 'value1', field2: 'value2' };
      facade.syncModelSnapshot(snapshot);

      expect(store.dispatch).toHaveBeenCalledWith(
        FormActions.syncModelSnapshot({ snapshot })
      );
    });
  });

  describe('Signal Reactivity', () => {
    /**
     * AC21: Signals shall react to store updates
     * R7.2: Facade shall internally convert selector Observables into Signals
     */

    it('should update signals when store state changes (AC21, R7.2)', () => {
      // Initial state
      expect(facade.status()).toBe(FormStatus.INIT);
      expect(facade.isDirty()).toBe(false);
      expect(facade.resetToken()).toBe(0);

      // Update state
      store.overrideSelector(FormSelectors.selectStatus, FormStatus.SAVING);
      store.overrideSelector(FormSelectors.selectIsDirty, true);
      store.overrideSelector(FormSelectors.selectResetToken, 5);
      store.refreshState();

      // Signals should reflect new state
      expect(facade.status()).toBe(FormStatus.SAVING);
      expect(facade.isDirty()).toBe(true);
      expect(facade.resetToken()).toBe(5);
    });

    it('should update derived signals when store state changes (AC21, R7.2)', () => {
      // Initial state
      expect(facade.isSaving()).toBe(false);
      expect(facade.hasValidationError()).toBe(false);

      // Simulate status change to SAVING
      store.overrideSelector(FormSelectors.selectStatus, FormStatus.SAVING);
      store.overrideSelector(FormSelectors.selectIsSaving, true);
      store.refreshState();

      expect(facade.isSaving()).toBe(true);

      // Simulate status change to VALIDATION_ERROR
      store.overrideSelector(FormSelectors.selectStatus, FormStatus.VALIDATION_ERROR);
      store.overrideSelector(FormSelectors.selectIsSaving, false);
      store.overrideSelector(FormSelectors.selectHasValidationError, true);
      store.refreshState();

      expect(facade.isSaving()).toBe(false);
      expect(facade.hasValidationError()).toBe(true);
    });
  });

  describe('No Direct Store Access', () => {
    /**
     * R7.5: No field component shall import NGRX store, actions, or selectors directly
     * (This test verifies the facade provides everything needed)
     */

    it('should provide all necessary signals without exposing store (R7.5)', () => {
      // Verify all critical signals are available
      expect(facade.status).toBeDefined();
      expect(facade.isDirty).toBeDefined();
      expect(facade.resetToken).toBeDefined();
      expect(facade.error).toBeDefined();
      expect(facade.isSaving).toBeDefined();
      expect(facade.isValidationPending).toBeDefined();
      expect(facade.hasValidationError).toBeDefined();
      expect(facade.hasLoadError).toBeDefined();
      expect(facade.isInitializing).toBeDefined();
      expect(facade.isReady).toBeDefined();
    });

    it('should provide all necessary methods without exposing store (R7.5)', () => {
      // Verify all critical methods are available
      expect(typeof facade.load).toBe('function');
      expect(typeof facade.reload).toBe('function');
      expect(typeof facade.submit).toBe('function');
      expect(typeof facade.markDirty).toBe('function');
      expect(typeof facade.markPristine).toBe('function');
      expect(typeof facade.resetAllFields).toBe('function');
      expect(typeof facade.ackError).toBe('function');
      expect(typeof facade.syncModelSnapshot).toBe('function');
    });

    it('should allow usage of observeFormStatus', () => {
      let isReady = false;

      const subscription = facade.observeFormStatus(FormStatus.READY).subscribe(value => {
        isReady = value as boolean;
      });

      // Initial state is INIT
      expect(isReady).toBe(false);

      // Change to READY
      store.overrideSelector(FormSelectors.selectStatus, FormStatus.READY);
      store.refreshState();
      expect(isReady).toBe(true);

      // Change to SAVING
      store.overrideSelector(FormSelectors.selectStatus, FormStatus.SAVING);
      store.refreshState();
      expect(isReady).toBe(false);

      subscription.unsubscribe();
    });
  });
});

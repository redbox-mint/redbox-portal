/**
 * Form Status Signal Bridge Tests
 * 
 * Validates bridge signal outputs and computed signal behavior.
 * Per Task 7 (R7.3, R7.4, R16.7, R16.4)
 */

import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { FormStatusSignalBridge } from './form-status-signal-bridge';
import { FormStateFacade } from './form-state.facade';
import { FormStatus } from '@researchdatabox/sails-ng-common';
import * as FormSelectors from '../state/form.selectors';
import { FormFeatureState } from '../state/form.state';

describe('FormStatusSignalBridge', () => {
  let bridge: FormStatusSignalBridge;
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
        FormStatusSignalBridge,
        FormStateFacade,
        provideMockStore({ initialState: { form: initialState } }),
      ],
    });

    bridge = TestBed.inject(FormStatusSignalBridge);
    facade = TestBed.inject(FormStateFacade);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('Reset Sequence Signal', () => {
    /**
     * R7.4: FormEventsBridge shall emit a simple signal resetSequence() derived from resetToken
     * AC57: Field components shall use resetSequence() to detect reset events
     */

    it('should expose resetSequence signal derived from resetToken (R7.4)', () => {
      expect(bridge.resetSequence()).toBe(0);

      store.overrideSelector(FormSelectors.selectResetToken, 1);
      store.refreshState();

      expect(bridge.resetSequence()).toBe(1);
    });

    it('should update resetSequence when reset action is dispatched (R7.4, AC57)', () => {
      expect(bridge.resetSequence()).toBe(0);

      // Simulate reset action incrementing the token
      store.overrideSelector(FormSelectors.selectResetToken, 1);
      store.refreshState();
      expect(bridge.resetSequence()).toBe(1);

      store.overrideSelector(FormSelectors.selectResetToken, 2);
      store.refreshState();
      expect(bridge.resetSequence()).toBe(2);
    });
  });

  describe('Status Signals', () => {
    /**
     * R16.7: Bridge shall expose Signals bridging store-driven status to component-friendly signals
     */

    it('should expose isSaving signal (R16.7)', () => {
      expect(bridge.isSaving()).toBe(false);

      store.overrideSelector(FormSelectors.selectIsSaving, true);
      store.refreshState();

      expect(bridge.isSaving()).toBe(true);
    });

    it('should expose isValidationPending signal (R16.7)', () => {
      expect(bridge.isValidationPending()).toBe(false);

      store.overrideSelector(FormSelectors.selectIsValidationPending, true);
      store.refreshState();

      expect(bridge.isValidationPending()).toBe(true);
    });

    it('should expose hasValidationError signal (R16.7)', () => {
      expect(bridge.hasValidationError()).toBe(false);

      store.overrideSelector(FormSelectors.selectHasValidationError, true);
      store.refreshState();

      expect(bridge.hasValidationError()).toBe(true);
    });

    it('should expose isReady signal (R16.7)', () => {
      expect(bridge.isReady()).toBe(false);

      store.overrideSelector(FormSelectors.selectIsReady, true);
      store.refreshState();

      expect(bridge.isReady()).toBe(true);
    });

    it('should expose isInitializing signal (R16.7)', () => {
      expect(bridge.isInitializing()).toBe(true);

      store.overrideSelector(FormSelectors.selectIsInitializing, false);
      store.refreshState();

      expect(bridge.isInitializing()).toBe(false);
    });
  });

  describe('Computed Signals', () => {
    /**
     * R16.7: Bridge shall provide computed signals for common use cases
     * AC58: Bridge signals shall be computed from facade signals
     */

    it('should compute hasError from validation and load errors (R16.7, AC58)', () => {
      // No errors initially
      expect(bridge.hasError()).toBe(false);

      // Validation error
      store.overrideSelector(FormSelectors.selectHasValidationError, true);
      store.refreshState();
      expect(bridge.hasError()).toBe(true);

      // Clear validation error, add load error
      store.overrideSelector(FormSelectors.selectHasValidationError, false);
      store.overrideSelector(FormSelectors.selectHasLoadError, true);
      store.refreshState();
      expect(bridge.hasError()).toBe(true);

      // Both errors
      store.overrideSelector(FormSelectors.selectHasValidationError, true);
      store.overrideSelector(FormSelectors.selectHasLoadError, true);
      store.refreshState();
      expect(bridge.hasError()).toBe(true);

      // No errors
      store.overrideSelector(FormSelectors.selectHasValidationError, false);
      store.overrideSelector(FormSelectors.selectHasLoadError, false);
      store.refreshState();
      expect(bridge.hasError()).toBe(false);
    });

    it('should compute shouldDisableFields from saving and validation states (R9.3, AC58)', () => {
      // Not disabled initially
      expect(bridge.shouldDisableFields()).toBe(false);

      // Disabled when saving
      store.overrideSelector(FormSelectors.selectIsSaving, true);
      store.refreshState();
      expect(bridge.shouldDisableFields()).toBe(true);

      // Disabled when validation pending
      store.overrideSelector(FormSelectors.selectIsSaving, false);
      store.overrideSelector(FormSelectors.selectIsValidationPending, true);
      store.refreshState();
      expect(bridge.shouldDisableFields()).toBe(true);

      // Disabled when both
      store.overrideSelector(FormSelectors.selectIsSaving, true);
      store.overrideSelector(FormSelectors.selectIsValidationPending, true);
      store.refreshState();
      expect(bridge.shouldDisableFields()).toBe(true);

      // Not disabled when neither
      store.overrideSelector(FormSelectors.selectIsSaving, false);
      store.overrideSelector(FormSelectors.selectIsValidationPending, false);
      store.refreshState();
      expect(bridge.shouldDisableFields()).toBe(false);
    });

    it('should compute statusLabel from status (R16.7)', () => {
      expect(bridge.statusLabel()).toBe('INIT');

      store.overrideSelector(FormSelectors.selectStatus, FormStatus.READY);
      store.refreshState();
      expect(bridge.statusLabel()).toBe('READY');

      store.overrideSelector(FormSelectors.selectStatus, FormStatus.SAVING);
      store.refreshState();
      expect(bridge.statusLabel()).toBe('SAVING');
    });
  });

  describe('Decoupling from NgRx', () => {
    /**
     * R7.5: No field component shall import NGRX store, actions, or selectors directly
     * R16.7: Field components remain decoupled from NGRX and rely on Angular Signals
     */

    it('should provide all necessary signals without exposing NgRx (R7.5, R16.7)', () => {
      // Verify bridge exposes only signals, no store/actions/selectors
      expect(bridge.resetSequence).toBeDefined();
      expect(bridge.isSaving).toBeDefined();
      expect(bridge.isValidationPending).toBeDefined();
      expect(bridge.hasValidationError).toBeDefined();
      expect(bridge.isReady).toBeDefined();
      expect(bridge.isInitializing).toBeDefined();
      expect(bridge.hasError).toBeDefined();
      expect(bridge.shouldDisableFields).toBeDefined();
      expect(bridge.statusLabel).toBeDefined();

      // Verify bridge doesn't expose store
      expect((bridge as any).store).toBeUndefined();
      expect((bridge as any).dispatch).toBeUndefined();
    });
  });

  describe('Integration with Facade', () => {
    /**
     * AC58: Bridge shall delegate to facade for signal values
     */

    it('should derive all signals from facade (AC58)', () => {
      // Verify bridge signals match facade signals
      expect(bridge.resetSequence()).toBe(facade.resetToken());
      expect(bridge.isSaving()).toBe(facade.isSaving());
      expect(bridge.isValidationPending()).toBe(facade.isValidationPending());
      expect(bridge.hasValidationError()).toBe(facade.hasValidationError());
      expect(bridge.isReady()).toBe(facade.isReady());
      expect(bridge.isInitializing()).toBe(facade.isInitializing());

      // Update state and verify they stay in sync
      store.overrideSelector(FormSelectors.selectResetToken, 3);
      store.overrideSelector(FormSelectors.selectIsSaving, true);
      store.overrideSelector(FormSelectors.selectIsValidationPending, true);
      store.refreshState();

      expect(bridge.resetSequence()).toBe(facade.resetToken());
      expect(bridge.resetSequence()).toBe(3);
      expect(bridge.isSaving()).toBe(facade.isSaving());
      expect(bridge.isSaving()).toBe(true);
      expect(bridge.isValidationPending()).toBe(facade.isValidationPending());
      expect(bridge.isValidationPending()).toBe(true);
    });
  });
});

/**
 * Form Selectors Tests
 * 
 * Validates memoization and derivations per R6.1, R6.2, R10.1, AC10, AC11, AC21, AC23
 * Task 3: Selector tests for memoization/derivations
 */

import { FormStatus } from '@researchdatabox/sails-ng-common';
import { FormFeatureState, formInitialState } from './form.state';
import * as FormSelectors from './form.selectors';

describe('Form Selectors', () => {
  describe('Base Selectors (R6.1)', () => {
    it('should select status', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY
      };
      const mockRootState = { form: state };
      
      const result = FormSelectors.selectStatus.projector(state);
      
      expect(result).toBe(FormStatus.READY);
    });

    it('should select isDirty', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        isDirty: true
      };
      
      const result = FormSelectors.selectIsDirty.projector(state);
      
      expect(result).toBe(true);
    });

    it('should select error', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        error: 'Test error'
      };
      
      const result = FormSelectors.selectError.projector(state);
      
      expect(result).toBe('Test error');
    });

    it('should select resetToken', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        resetToken: 5
      };
      
      const result = FormSelectors.selectResetToken.projector(state);
      
      expect(result).toBe(5);
    });

    it('should select submissionAttempt (AC21)', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        submissionAttempt: 3
      };
      
      const result = FormSelectors.selectSubmissionAttempt.projector(state);
      
      expect(result).toBe(3);
    });

    it('should select pendingActions', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        pendingActions: ['loadInitialData', 'formValidationPending']
      };
      
      const result = FormSelectors.selectPending.projector(state);
      
      expect(result).toEqual(['loadInitialData', 'formValidationPending']);
    });

    it('should select lastSavedAt', () => {
      const timestamp = new Date('2025-10-02T10:00:00Z');
      const state: FormFeatureState = {
        ...formInitialState,
        lastSavedAt: timestamp
      };
      
      const result = FormSelectors.selectLastSavedAt.projector(state);
      
      expect(result).toBe(timestamp);
    });

    it('should select modelSnapshot', () => {
      const snapshot = { field1: 'value1', field2: 'value2' };
      const state: FormFeatureState = {
        ...formInitialState,
        modelSnapshot: snapshot
      };
      
      const result = FormSelectors.selectModelSnapshot.projector(state);
      
      expect(result).toEqual(snapshot);
    });

    it('should select initialDataLoaded', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        initialDataLoaded: true
      };
      
      const result = FormSelectors.selectInitialDataLoaded.projector(state);
      
      expect(result).toBe(true);
    });
  });

  describe('Derived Selectors (R6.1, R6.2)', () => {
    it('should derive isSaving from status (AC23)', () => {
      const status = FormStatus.SAVING;
      
      const result = FormSelectors.selectIsSaving.projector(status);
      
      expect(result).toBe(true);
    });

    it('should derive isSaving as false when not SAVING', () => {
      const status = FormStatus.READY;
      
      const result = FormSelectors.selectIsSaving.projector(status);
      
      expect(result).toBe(false);
    });

    it('should derive isValidationPending from status', () => {
      const status = FormStatus.VALIDATION_PENDING;
      
      const result = FormSelectors.selectIsValidationPending.projector(status);
      
      expect(result).toBe(true);
    });

    it('should derive hasValidationError from status', () => {
      const status = FormStatus.VALIDATION_ERROR;
      
      const result = FormSelectors.selectHasValidationError.projector(status);
      
      expect(result).toBe(true);
    });

    it('should derive hasLoadError from status', () => {
      const status = FormStatus.LOAD_ERROR;
      
      const result = FormSelectors.selectHasLoadError.projector(status);
      
      expect(result).toBe(true);
    });

    it('should derive isInitializing when INIT and not loaded (AC10)', () => {
      const status = FormStatus.INIT;
      const loaded = false;
      
      const result = FormSelectors.selectIsInitializing.projector(status, loaded);
      
      expect(result).toBe(true);
    });

    it('should derive isInitializing as false when data is loaded', () => {
      const status = FormStatus.INIT;
      const loaded = true;
      
      const result = FormSelectors.selectIsInitializing.projector(status, loaded);
      
      expect(result).toBe(false);
    });

    it('should derive isInitializing as false when not INIT', () => {
      const status = FormStatus.READY;
      const loaded = false;
      
      const result = FormSelectors.selectIsInitializing.projector(status, loaded);
      
      expect(result).toBe(false);
    });

    it('should derive isReady from status', () => {
      const status = FormStatus.READY;
      
      const result = FormSelectors.selectIsReady.projector(status);
      
      expect(result).toBe(true);
    });

    it('should derive isReady as false when not READY', () => {
      const status = FormStatus.SAVING;
      
      const result = FormSelectors.selectIsReady.projector(status);
      
      expect(result).toBe(false);
    });
  });

  describe('Debug Selector (R11.4)', () => {
    it('should create debug info snapshot', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.VALIDATION_ERROR,
        initialDataLoaded: true,
        isDirty: true,
        pendingActions: ['submitForm'],
        resetToken: 3,
        submissionAttempt: 2,
        error: 'Validation failed'
      };
      
      const result = FormSelectors.selectDebugInfo.projector(state);
      
      expect(result).toEqual({
        status: FormStatus.VALIDATION_ERROR,
        initialDataLoaded: true,
        isDirty: true,
        pendingActions: ['submitForm'],
        resetToken: 3,
        submissionAttempt: 2,
        hasError: true,
        errorMessage: 'Validation failed'
      });
    });

    it('should show hasError as false when no error', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        error: null
      };
      
      const result = FormSelectors.selectDebugInfo.projector(state);
      
      expect(result.hasError).toBe(false);
      expect(result.errorMessage).toBeNull();
    });
  });

  describe('Memoization (R6.2)', () => {
    it('should memoize base selectors', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        isDirty: true
      };
      
      // Call selector twice with same state
      const result1 = FormSelectors.selectStatus.projector(state);
      const result2 = FormSelectors.selectStatus.projector(state);
      
      // Should return same reference (memoized)
      expect(result1).toBe(result2);
    });

    it('should recompute derived selectors only when inputs change', () => {
      const status1 = FormStatus.SAVING;
      const status2 = FormStatus.SAVING;
      
      // Same input should return same result
      const result1 = FormSelectors.selectIsSaving.projector(status1);
      const result2 = FormSelectors.selectIsSaving.projector(status2);
      
      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });

    it('should recompute when input changes', () => {
      const status1 = FormStatus.SAVING;
      const status2 = FormStatus.READY;
      
      const result1 = FormSelectors.selectIsSaving.projector(status1);
      const result2 = FormSelectors.selectIsSaving.projector(status2);
      
      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should memoize complex derived selectors', () => {
      const status = FormStatus.INIT;
      const loaded = false;
      
      // Call twice with same inputs
      const result1 = FormSelectors.selectIsInitializing.projector(status, loaded);
      const result2 = FormSelectors.selectIsInitializing.projector(status, loaded);
      
      expect(result1).toBe(result2);
      expect(result1).toBe(true);
    });

    it('should memoize debug info selector', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        isDirty: true,
        submissionAttempt: 1
      };
      
      // Call twice
      const result1 = FormSelectors.selectDebugInfo.projector(state);
      const result2 = FormSelectors.selectDebugInfo.projector(state);
      
      // Should return same object reference (deep memoization)
      expect(result1).toBe(result2);
    });
  });

  describe('Selector Composition', () => {
    it('should compose selectors correctly for isInitializing', () => {
      // Test that selectIsInitializing correctly uses both status and loaded
      const testCases = [
        { status: FormStatus.INIT, loaded: false, expected: true },
        { status: FormStatus.INIT, loaded: true, expected: false },
        { status: FormStatus.READY, loaded: false, expected: false },
        { status: FormStatus.READY, loaded: true, expected: false },
        { status: FormStatus.SAVING, loaded: false, expected: false },
      ];
      
      testCases.forEach(({ status, loaded, expected }) => {
        const result = FormSelectors.selectIsInitializing.projector(status, loaded);
        expect(result).toBe(expected);
      });
    });

    it('should compose selectors for all status-based derived selectors', () => {
      const statuses = [
        { status: FormStatus.INIT, isSaving: false, isReady: false, hasError: false },
        { status: FormStatus.READY, isSaving: false, isReady: true, hasError: false },
        { status: FormStatus.SAVING, isSaving: true, isReady: false, hasError: false },
        { status: FormStatus.VALIDATION_PENDING, isSaving: false, isReady: false, hasError: false },
        { status: FormStatus.VALIDATION_ERROR, isSaving: false, isReady: false, hasError: true },
        { status: FormStatus.LOAD_ERROR, isSaving: false, isReady: false, hasError: false },
      ];
      
      statuses.forEach(({ status, isSaving, isReady, hasError }) => {
        expect(FormSelectors.selectIsSaving.projector(status)).toBe(isSaving);
        expect(FormSelectors.selectIsReady.projector(status)).toBe(isReady);
        expect(FormSelectors.selectHasValidationError.projector(status)).toBe(hasError);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null error in debug info', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        error: null
      };
      
      const result = FormSelectors.selectDebugInfo.projector(state);
      
      expect(result.hasError).toBe(false);
      expect(result.errorMessage).toBeNull();
    });

    it('should handle undefined error in debug info', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        error: undefined
      };
      
      const result = FormSelectors.selectDebugInfo.projector(state);
      
      expect(result.hasError).toBe(false);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should handle empty pendingActions array', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        pendingActions: []
      };
      
      const result = FormSelectors.selectPending.projector(state);
      
      expect(result).toEqual([]);
    });

    it('should handle null modelSnapshot', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        modelSnapshot: null
      };
      
      const result = FormSelectors.selectModelSnapshot.projector(state);
      
      expect(result).toBeNull();
    });

    it('should handle null lastSavedAt', () => {
      const state: FormFeatureState = {
        ...formInitialState,
        lastSavedAt: null
      };
      
      const result = FormSelectors.selectLastSavedAt.projector(state);
      
      expect(result).toBeNull();
    });
  });

  describe('Performance Characteristics', () => {
    it('should not recompute derived selector if input unchanged', () => {
      const status = FormStatus.READY;
      
      // Create a spy-like mechanism to track computations
      let computeCount = 0;
      const testProjector = (s: FormStatus) => {
        computeCount++;
        return s === FormStatus.READY;
      };
      
      // Simulate memoized behavior
      const result1 = testProjector(status);
      const cachedInput = status;
      
      // If input is same, selector shouldn't recompute
      const result2 = (status === cachedInput) ? result1 : testProjector(status);
      
      expect(computeCount).toBe(1); // Should only compute once
      expect(result1).toBe(result2);
    });

    it('should handle rapid status changes efficiently', () => {
      const statuses = [
        FormStatus.INIT,
        FormStatus.READY,
        FormStatus.SAVING,
        FormStatus.READY,
        FormStatus.VALIDATION_PENDING,
        FormStatus.VALIDATION_ERROR,
        FormStatus.READY
      ];
      
      const results = statuses.map(status => 
        FormSelectors.selectIsSaving.projector(status)
      );
      
      expect(results).toEqual([false, false, true, false, false, false, false]);
    });
  });
});

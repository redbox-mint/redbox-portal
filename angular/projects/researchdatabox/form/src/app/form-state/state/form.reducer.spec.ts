/**
 * Form Reducer Tests
 * 
 * Validates state transitions per R2.1-R2.14, R3.1, R4.1, AC1-AC17, AC22
 * Task 2: Reducer tests for default state, each transition, and unknown actions
 */

import { FormStatus } from '@researchdatabox/sails-ng-common';
import { formReducer } from './form.reducer';
import { formInitialState, FormFeatureState } from './form.state';
import * as FormActions from './form.actions';

describe('formReducer', () => {
  describe('default state', () => {
    it('should return formInitialState when undefined state is passed', () => {
      const action = { type: 'NOOP' };
      const result = formReducer(undefined, action);
      
      expect(result).toEqual(formInitialState);
    });

    it('should have correct initial values per R2.2', () => {
      expect(formInitialState.status).toBe(FormStatus.INIT);
      expect(formInitialState.initialDataLoaded).toBe(false);
      expect(formInitialState.isDirty).toBe(false);
      expect(formInitialState.lastSavedAt).toBeNull();
      expect(formInitialState.error).toBeNull();
      expect(formInitialState.pendingActions).toEqual([]);
      expect(formInitialState.resetToken).toBe(0);
      expect(formInitialState.submissionAttempt).toBe(0);
      expect(formInitialState.meta).toEqual({});
      expect(formInitialState.modelSnapshot).toBeNull();
    });
  });

  describe('unknown actions', () => {
    it('should return current state for unknown action types', () => {
      const currentState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        isDirty: true,
      };
      const unknownAction = { type: 'UNKNOWN_ACTION' };
      
      const result = formReducer(currentState, unknownAction);
      
      expect(result).toEqual(currentState);
    });
  });

  describe('Load transitions (R4.1, AC1-AC5)', () => {
    it('should handle loadInitialData action (AC1)', () => {
      const action = FormActions.loadInitialData({
        oid: 'test-123',
        recordType: 'rdmp',
        formName: 'default'
      });
      
      const result = formReducer(formInitialState, action);
      
      expect(result.status).toBe(FormStatus.INIT);
      expect(result.pendingActions).toContain('loadInitialData');
    });

    it('should transition INIT → READY on loadInitialDataSuccess (AC2, R4.4)', () => {
      const loadingState: FormFeatureState = {
        ...formInitialState,
        pendingActions: ['loadInitialData']
      };
      const mockData = { title: 'Test Record' };
      const action = FormActions.loadInitialDataSuccess({ data: mockData });
      
      const result = formReducer(loadingState, action);
      
      expect(result.status).toBe(FormStatus.READY);
      expect(result.initialDataLoaded).toBe(true);
      expect(result.pendingActions).toEqual([]);
      expect(result.modelSnapshot).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should transition INIT → LOAD_ERROR on loadInitialDataFailure (AC3, R4.4)', () => {
      const loadingState: FormFeatureState = {
        ...formInitialState,
        pendingActions: ['loadInitialData']
      };
      const action = FormActions.loadInitialDataFailure({ 
        error: 'Network error' 
      });
      
      const result = formReducer(loadingState, action);
      
      expect(result.status).toBe(FormStatus.LOAD_ERROR);
      expect(result.error).toBe('Network error');
      expect(result.pendingActions).toEqual([]);
    });
  });

  describe('Submit transitions (R4.1, R4.5, AC6-AC9)', () => {
    it('should handle submitForm from READY → SAVING (AC6, R4.4)', () => {
      const readyState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        initialDataLoaded: true,
        isDirty: true
      };
      const action = FormActions.submitForm({
        force: false,
        targetStep: 'metadata',
        skipValidation: false
      });
      
      const result = formReducer(readyState, action);
      
      expect(result.status).toBe(FormStatus.SAVING);
      expect(result.pendingActions).toContain('submitForm');
      expect(result.submissionAttempt).toBe(1); // R4.5
    });

    it('should increment submissionAttempt on each submitForm (R4.5)', () => {
      let state: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        initialDataLoaded: true
      };
      
      // First submission
      state = formReducer(state, FormActions.submitForm({
        force: false,
        skipValidation: false
      }));
      expect(state.submissionAttempt).toBe(1);
      
      // Return to READY
      state = formReducer(state, FormActions.submitFormSuccess({ 
        savedData: {},
        lastSavedAt: new Date().toISOString()
      }));
      
      // Second submission
      state = formReducer(state, FormActions.submitForm({
        force: false,
        skipValidation: false
      }));
      expect(state.submissionAttempt).toBe(2);
    });

    it('should transition SAVING → READY on submitFormSuccess (AC7, R4.4)', () => {
      const savingState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.SAVING,
        initialDataLoaded: true,
        isDirty: true,
        submissionAttempt: 1,
        pendingActions: ['submitForm']
      };
      const savedData = { id: '123', title: 'Saved' };
      const action = FormActions.submitFormSuccess({ savedData,
        lastSavedAt: new Date().toISOString() });
      
      const result = formReducer(savingState, action);
      
      expect(result.status).toBe(FormStatus.READY);
      expect(result.isDirty).toBe(false);
      expect(result.lastSavedAt).not.toBeNull();
      expect(result.modelSnapshot).toEqual(savedData);
      expect(result.pendingActions).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should transition SAVING → VALIDATION_ERROR on submitFormFailure (AC8, R4.4)', () => {
      const savingState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.SAVING,
        initialDataLoaded: true,
        submissionAttempt: 1,
        pendingActions: ['submitForm']
      };
      const action = FormActions.submitFormFailure({ 
        error: 'Validation failed' 
      });
      
      const result = formReducer(savingState, action);
      
      expect(result.status).toBe(FormStatus.VALIDATION_ERROR);
      expect(result.error).toBe('Validation failed');
      expect(result.pendingActions).toEqual([]);
    });

    it('should preserve lastSavedAt timestamp on submitFormSuccess', () => {
      const savingState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.SAVING,
        initialDataLoaded: true,
        pendingActions: ['submitForm']
      };
      const action = FormActions.submitFormSuccess({ 
        savedData: {},
        lastSavedAt: new Date().toISOString() 
      });
      
      const result = formReducer(savingState, action);
      
  expect(result.lastSavedAt).not.toBeNull();
  // lastSavedAt should be an ISO string
  expect(typeof result.lastSavedAt).toBe('string');
  // Parse back to Date only at UI boundary; here we verify it is a valid ISO string
  expect(() => new Date(result.lastSavedAt as string).toISOString()).not.toThrow();
    });
  });

  describe('Reset transitions (R2.10, R4.1, AC10-AC12)', () => {
    it('should handle resetAllFields from READY (AC10, R4.4)', () => {
      const readyState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        initialDataLoaded: true,
        isDirty: true,
        resetToken: 5
      };
      const action = FormActions.resetAllFields();
      
      const result = formReducer(readyState, action);
      
      expect(result.status).toBe(FormStatus.READY);
      expect(result.pendingActions).toContain('resetAllFields');
      expect(result.resetToken).toBe(6); // R2.10
    });

    it('should ignore resetAllFields when status is SAVING (R2.10)', () => {
      const savingState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.SAVING,
        initialDataLoaded: true,
        resetToken: 3,
        pendingActions: ['submitForm']
      };
      const action = FormActions.resetAllFields();
      
      const result = formReducer(savingState, action);
      
      expect(result.status).toBe(FormStatus.SAVING);
      expect(result.resetToken).toBe(3); // No increment
      expect(result.pendingActions).toEqual(['submitForm']); // Unchanged
    });

    it('should handle resetAllFieldsComplete (AC11)', () => {
      const resetState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        initialDataLoaded: true,
        isDirty: true,
        resetToken: 8,
        pendingActions: ['resetAllFields']
      };
      const action = FormActions.resetAllFieldsComplete();
      
      const result = formReducer(resetState, action);
      
      expect(result.isDirty).toBe(false);
      expect(result.pendingActions).toEqual([]);
      expect(result.resetToken).toBe(8); // Preserved
    });

    it('should clear error state on resetAllFieldsComplete', () => {
      const errorState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.VALIDATION_ERROR,
        initialDataLoaded: true,
        error: 'Previous error',
        resetToken: 2,
        pendingActions: ['resetAllFields']
      };
      const action = FormActions.resetAllFieldsComplete();
      
      const result = formReducer(errorState, action);
      
      expect(result.status).toBe(FormStatus.READY);
      expect(result.error).toBeNull();
    });
  });

  describe('Dirty tracking (R2.1, AC13-AC14)', () => {
    it('should mark form as dirty (AC13)', () => {
      const pristineState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        isDirty: false
      };
      const action = FormActions.markDirty();
      
      const result = formReducer(pristineState, action);
      
      expect(result.isDirty).toBe(true);
    });

    it('should mark form as pristine (AC14)', () => {
      const dirtyState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        isDirty: true
      };
      const action = FormActions.markPristine();
      
      const result = formReducer(dirtyState, action);
      
      expect(result.isDirty).toBe(false);
    });
  });

  describe('Validation transitions (R2.14, R4.6, AC15-AC17)', () => {
    it('should transition READY → VALIDATION_PENDING (AC15)', () => {
      const readyState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        initialDataLoaded: true
      };
      const action = FormActions.formValidationPending();
      
      const result = formReducer(readyState, action);
      
      expect(result.status).toBe(FormStatus.VALIDATION_PENDING);
      expect(result.pendingActions).toContain('formValidationPending');
    });

    it('should transition VALIDATION_PENDING → READY on success (AC16)', () => {
      const validatingState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.VALIDATION_PENDING,
        initialDataLoaded: true,
        pendingActions: ['formValidationPending']
      };
      const action = FormActions.formValidationSuccess();
      
      const result = formReducer(validatingState, action);
      
      expect(result.status).toBe(FormStatus.READY);
      expect(result.pendingActions).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should transition VALIDATION_PENDING → VALIDATION_ERROR on failure (AC17)', () => {
      const validatingState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.VALIDATION_PENDING,
        initialDataLoaded: true,
        pendingActions: ['formValidationPending']
      };
      const action = FormActions.formValidationFailure({ 
        error: 'Invalid field values' 
      });
      
      const result = formReducer(validatingState, action);
      
      expect(result.status).toBe(FormStatus.VALIDATION_ERROR);
      expect(result.error).toBe('Invalid field values');
      expect(result.pendingActions).toEqual([]);
    });

    it('should suppress validation transition when SAVING (R2.14, R4.6)', () => {
      const savingState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.SAVING,
        initialDataLoaded: true,
        pendingActions: ['submitForm']
      };
      const action = FormActions.formValidationPending();
      
      const result = formReducer(savingState, action);
      
      // Should remain SAVING, not transition to VALIDATION_PENDING
      expect(result.status).toBe(FormStatus.SAVING);
      expect(result.pendingActions).toEqual(['submitForm']); // Unchanged
    });

    it('should suppress validation failure when SAVING (R4.6)', () => {
      const savingState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.SAVING,
        initialDataLoaded: true,
        pendingActions: ['submitForm']
      };
      const action = FormActions.formValidationFailure({ 
        error: 'Should be ignored' 
      });
      
      const result = formReducer(savingState, action);
      
      expect(result.status).toBe(FormStatus.SAVING);
      expect(result.error).toBeNull(); // Error not applied
    });
  });

  describe('Utility actions (R2.1, AC22)', () => {
    it('should acknowledge error and clear error state (AC22)', () => {
      const errorState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.VALIDATION_ERROR,
        error: 'Previous error message'
      };
      const action = FormActions.ackError();
      
      const result = formReducer(errorState, action);
      
      expect(result.error).toBeNull();
      expect(result.status).toBe(FormStatus.READY);
    });

    it('should sync model snapshot', () => {
      const currentState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        modelSnapshot: null
      };
      const newSnapshot = { field1: 'value1', field2: 'value2' };
      const action = FormActions.syncModelSnapshot({ snapshot: newSnapshot });
      
      const result = formReducer(currentState, action);
      
      expect(result.modelSnapshot).toEqual(newSnapshot);
    });

    it('should handle null snapshot in syncModelSnapshot', () => {
      const currentState: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        modelSnapshot: { old: 'data' }
      };
      const action = FormActions.syncModelSnapshot({ snapshot: null });
      
      const result = formReducer(currentState, action);
      
      expect(result.modelSnapshot).toBeNull();
    });
  });

  describe('Pending actions tracking (R2.1)', () => {
    it('should track multiple pending actions', () => {
      let state = formInitialState;
      
      // Start load
      state = formReducer(state, FormActions.loadInitialData({
        oid: 'test',
        recordType: 'rdmp',
        formName: 'default'
      }));
      expect(state.pendingActions).toEqual(['loadInitialData']);
      
      // Complete load
      state = formReducer(state, FormActions.loadInitialDataSuccess({ 
        data: {} 
      }));
      expect(state.pendingActions).toEqual([]);
      
      // Start validation
      state = formReducer(state, FormActions.formValidationPending());
      expect(state.pendingActions).toEqual(['formValidationPending']);
      
      // Complete validation
      state = formReducer(state, FormActions.formValidationSuccess());
      expect(state.pendingActions).toEqual([]);
    });
  });

  describe('Meta property (R2.4)', () => {
    it('should preserve meta across state transitions', () => {
      const stateWithMeta: FormFeatureState = {
        ...formInitialState,
        meta: { customKey: 'customValue' }
      };
      const action = FormActions.markDirty();
      
      const result = formReducer(stateWithMeta, action);
      
      expect(result.meta).toEqual({ customKey: 'customValue' });
    });
  });

  describe('Complex state transition sequences', () => {
    it('should handle full lifecycle: INIT → READY → SAVING → READY', () => {
      let state = formInitialState;
      expect(state.status).toBe(FormStatus.INIT);
      
      // Load data
      state = formReducer(state, FormActions.loadInitialData({
        oid: 'test',
        recordType: 'rdmp',
        formName: 'default'
      }));
      state = formReducer(state, FormActions.loadInitialDataSuccess({ 
        data: { title: 'Test' } 
      }));
      expect(state.status).toBe(FormStatus.READY);
      expect(state.initialDataLoaded).toBe(true);
      
      // Mark dirty
      state = formReducer(state, FormActions.markDirty());
      expect(state.isDirty).toBe(true);
      
      // Submit
      state = formReducer(state, FormActions.submitForm({
        force: false,
        skipValidation: false
      }));
      expect(state.status).toBe(FormStatus.SAVING);
      expect(state.submissionAttempt).toBe(1);
      
      // Submit success
      state = formReducer(state, FormActions.submitFormSuccess({ 
        savedData: { title: 'Test' },
        lastSavedAt: new Date().toISOString() 
      }));
      expect(state.status).toBe(FormStatus.READY);
      expect(state.isDirty).toBe(false);
      expect(state.lastSavedAt).not.toBeNull();
    });

    it('should handle error recovery flow', () => {
      let state: FormFeatureState = {
        ...formInitialState,
        status: FormStatus.READY,
        initialDataLoaded: true
      };
      
      // Validation fails
      state = formReducer(state, FormActions.formValidationPending());
      state = formReducer(state, FormActions.formValidationFailure({ 
        error: 'Validation error' 
      }));
      expect(state.status).toBe(FormStatus.VALIDATION_ERROR);
      expect(state.error).toBe('Validation error');
      
      // Acknowledge error
      state = formReducer(state, FormActions.ackError());
      expect(state.status).toBe(FormStatus.READY);
      expect(state.error).toBeNull();
    });
  });
});

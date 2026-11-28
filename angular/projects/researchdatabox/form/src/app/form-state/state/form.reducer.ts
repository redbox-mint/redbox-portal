/**
 * Form Reducer
 * 
 * Pure reducer handling form state transitions.
 * Per R4.1-R4.6
 */

import { createReducer, on } from '@ngrx/store';
import { FormStatus } from '@researchdatabox/sails-ng-common';
import { formInitialState } from './form.state';
import * as FormActions from './form.actions';

const clearError = { error: null, errorSource: null };

function isBusyStatus(status: FormStatus): boolean {
  return status === FormStatus.SAVING || status === FormStatus.DELETING;
}
/**
 * Form feature reducer
 * Per R4.1-R4.6
 */
export const formReducer = createReducer(
  formInitialState,
  
  // Load actions
  on(FormActions.loadInitialData, (state) => ({
    ...state,
    status: FormStatus.INIT,
    initialDataLoaded: false,
    ...clearError,
    pendingActions: [...state.pendingActions, 'loadInitialData'],
  })),
  
  on(FormActions.loadInitialDataSuccess, (state, { data }) => ({
    ...state,
    status: FormStatus.READY,
    initialDataLoaded: true,
    modelSnapshot: data,
    ...clearError,
    pendingActions: state.pendingActions.filter(a => a !== 'loadInitialData' && a !== 'submitForm'),
  })),
  
  on(FormActions.loadInitialDataFailure, (state, { error }) => ({
    ...state,
    status: FormStatus.LOAD_ERROR,
    error,
    errorSource: null,
    pendingActions: state.pendingActions.filter(a => a !== 'loadInitialData' && a !== 'submitForm'),
  })),
  
  // Submit actions (R4.5: increment submissionAttempt)
  on(FormActions.submitForm, FormActions.beginFormSubmit, (state) => {
    if (isBusyStatus(state.status)) {
      return state;
    }
    return {
      ...state,
      status: FormStatus.SAVING,
      submissionAttempt: state.submissionAttempt + 1,
      ...clearError,
      pendingActions: [...state.pendingActions, 'submitForm'],
    };
  }),
  
  on(FormActions.submitFormSuccess, (state, { savedData, lastSavedAt }) => ({
    ...state,
    status: FormStatus.READY,
    lastSavedAt,
    modelSnapshot: savedData,
    isDirty: false,
    ...clearError,
    pendingActions: state.pendingActions.filter(a => a !== 'submitForm'),
  })),

  on(FormActions.submitFormFailure, (state, { error }) => ({
    ...state,
    // Preserve the existing status classification independently of the error source.
    status: error?.toLocaleLowerCase().includes('validation') ? FormStatus.VALIDATION_ERROR : FormStatus.READY,
    error,
    errorSource: 'save',
    pendingActions: state.pendingActions.filter(a => a !== 'submitForm'),
  })),

  on(FormActions.deleteRecord, (state) => {
    if (isBusyStatus(state.status)) {
      return state;
    }
    return {
      ...state,
      status: FormStatus.DELETING,
      ...clearError,
      pendingActions: [...state.pendingActions, 'deleteRecord'],
    };
  }),

  on(FormActions.deleteRecordSuccess, (state) => ({
    ...state,
    status: FormStatus.READY,
    ...clearError,
    pendingActions: state.pendingActions.filter(a => a !== 'deleteRecord'),
  })),

  on(FormActions.deleteRecordFailure, (state, { error }) => ({
    ...state,
    status: FormStatus.READY,
    error,
    errorSource: null,
    pendingActions: state.pendingActions.filter(a => a !== 'deleteRecord'),
  })),
  
  // Reset actions (R3.4, R2.10: increment resetToken, ignore if SAVING/DELETING)
  on(FormActions.resetAllFields, (state) => {
    if (isBusyStatus(state.status)) {
      return state; // R2.10: Ignore reset during save
    }
    return {
      ...state,
      resetToken: state.resetToken + 1,
      pendingActions: [...state.pendingActions, 'resetAllFields'],
    };
  }),
  
  on(FormActions.resetAllFieldsComplete, (state) => ({
    ...state,
    status: FormStatus.READY,
    isDirty: false,
    ...clearError,
    pendingActions: state.pendingActions.filter(a => a !== 'resetAllFields'),
  })),
  
  // Dirty tracking (R4.3: explicit actions)
  on(FormActions.markDirty, (state) => ({ ...state, isDirty: true })),
  on(FormActions.markPristine, (state) => ({ ...state, isDirty: false })),
  
  // Validation actions (R2.14, R4.6: ignore during SAVING/DELETING)
  on(FormActions.formValidationPending, (state) => {
    if (isBusyStatus(state.status)) {
      return state; // R2.14, R4.6: Suppress during save
    }
    return { 
      ...state, 
      status: FormStatus.VALIDATION_PENDING,
      pendingActions: [...state.pendingActions, 'formValidationPending']
    };
  }),
  
  on(FormActions.formValidationSuccess, (state) => {
    if (isBusyStatus(state.status)) {
      return state; // R2.14, R4.6: Suppress during save
    }
    if (state.status === FormStatus.VALIDATION_PENDING || state.status === FormStatus.VALIDATION_ERROR) {
      return { 
        ...state, 
        status: FormStatus.READY,
        error: state.errorSource === 'save' ? state.error : null,
        pendingActions: state.pendingActions.filter(a => a !== 'formValidationPending')
      };
    }
    return state;
  }),
  
  on(FormActions.formValidationFailure, (state, { error }) => {
    if (isBusyStatus(state.status)) {
      return state; // R2.14, R4.6: Suppress during save
    }
    return { 
      ...state, 
      status: FormStatus.VALIDATION_ERROR,
      error: state.errorSource === 'save' ? state.error : error,
      pendingActions: state.pendingActions.filter(a => a !== 'formValidationPending')
    };
  }),
  
  // Utility actions
  on(FormActions.ackError, (state) => ({ ...state, status: FormStatus.READY, ...clearError })),
  on(FormActions.syncModelSnapshot, (state, { snapshot }) => ({ ...state, modelSnapshot: snapshot })),
);

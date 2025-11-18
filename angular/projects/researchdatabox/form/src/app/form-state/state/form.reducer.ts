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
    error: null,
    pendingActions: [...state.pendingActions, 'loadInitialData'],
  })),
  
  on(FormActions.loadInitialDataSuccess, (state, { data }) => ({
    ...state,
    status: FormStatus.READY,
    initialDataLoaded: true,
    modelSnapshot: data,
    error: null,
    pendingActions: state.pendingActions.filter(a => a !== 'loadInitialData'),
  })),
  
  on(FormActions.loadInitialDataFailure, (state, { error }) => ({
    ...state,
    status: FormStatus.LOAD_ERROR,
    error,
    pendingActions: state.pendingActions.filter(a => a !== 'loadInitialData'),
  })),
  
  // Submit actions (R4.5: increment submissionAttempt)
  on(FormActions.submitForm, (state) => ({
    ...state,
    status: FormStatus.SAVING,
    submissionAttempt: state.submissionAttempt + 1,
    error: null,
    pendingActions: [...state.pendingActions, 'submitForm'],
  })),
  
  on(FormActions.submitFormSuccess, (state, { savedData, lastSavedAt }) => ({
    ...state,
    status: FormStatus.READY,
    lastSavedAt,
    modelSnapshot: savedData,
    isDirty: false,
    error: null,
    pendingActions: state.pendingActions.filter(a => a !== 'submitForm'),
  })),

  on(FormActions.submitFormFailure, (state, { error }) => {
    // TODO: Condition is a bit loose here, defined a better way to communicate server-side validation failures 
    if (error?.toLocaleLowerCase().includes("validation")) {
      return {
        ...state,
        status: FormStatus.VALIDATION_ERROR,
        error,
        pendingActions: state.pendingActions.filter(a => a !== 'submitForm'),
      };
    } else {
      return {
        ...state,
        status: FormStatus.READY,
        error,
        pendingActions: state.pendingActions.filter(a => a !== 'submitForm'),
      };
    }
  }),
  
  // Reset actions (R3.4, R2.10: increment resetToken, ignore if SAVING)
  on(FormActions.resetAllFields, (state) => {
    if (state.status === FormStatus.SAVING) {
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
    error: null,
    pendingActions: state.pendingActions.filter(a => a !== 'resetAllFields'),
  })),
  
  // Dirty tracking (R4.3: explicit actions)
  on(FormActions.markDirty, (state) => ({ ...state, isDirty: true })),
  on(FormActions.markPristine, (state) => ({ ...state, isDirty: false })),
  
  // Validation actions (R2.14, R4.6: ignore during SAVING)
  on(FormActions.formValidationPending, (state) => {
    if (state.status === FormStatus.SAVING) {
      return state; // R2.14, R4.6: Suppress during save
    }
    return { 
      ...state, 
      status: FormStatus.VALIDATION_PENDING,
      pendingActions: [...state.pendingActions, 'formValidationPending']
    };
  }),
  
  on(FormActions.formValidationSuccess, (state) => {
    if (state.status === FormStatus.SAVING) {
      return state; // R2.14, R4.6: Suppress during save
    }
    if (state.status === FormStatus.VALIDATION_PENDING || state.status === FormStatus.VALIDATION_ERROR) {
      return { 
        ...state, 
        status: FormStatus.READY,
        error: null,
        pendingActions: state.pendingActions.filter(a => a !== 'formValidationPending')
      };
    }
    return state;
  }),
  
  on(FormActions.formValidationFailure, (state, { error }) => {
    if (state.status === FormStatus.SAVING) {
      return state; // R2.14, R4.6: Suppress during save
    }
    return { 
      ...state, 
      status: FormStatus.VALIDATION_ERROR,
      error,
      pendingActions: state.pendingActions.filter(a => a !== 'formValidationPending')
    };
  }),
  
  // Utility actions
  on(FormActions.ackError, (state) => ({ ...state, status: FormStatus.READY, error: null })),
  on(FormActions.syncModelSnapshot, (state, { snapshot }) => ({ ...state, modelSnapshot: snapshot })),
);

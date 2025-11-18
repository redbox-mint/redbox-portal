/**
 * Form Selectors
 * 
 * Memoized selectors for form state.
 * Per R6.1-R6.3
 */

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { FormStatus } from '@researchdatabox/sails-ng-common';
import { FormFeatureState, FORM_FEATURE_KEY } from './form.state';

// Base feature selector
export const selectFormFeature = createFeatureSelector<FormFeatureState>(FORM_FEATURE_KEY);

// Base selectors (R6.1)
export const selectStatus = createSelector(selectFormFeature, state => state.status);
export const selectIsDirty = createSelector(selectFormFeature, state => state.isDirty);
export const selectError = createSelector(selectFormFeature, state => state.error);
export const selectResetToken = createSelector(selectFormFeature, state => state.resetToken);
export const selectSubmissionAttempt = createSelector(selectFormFeature, state => state.submissionAttempt);
export const selectPending = createSelector(selectFormFeature, state => state.pendingActions);
export const selectLastSavedAt = createSelector(selectFormFeature, state => state.lastSavedAt);
export const selectModelSnapshot = createSelector(selectFormFeature, state => state.modelSnapshot);
export const selectInitialDataLoaded = createSelector(selectFormFeature, state => state.initialDataLoaded);

// Derived selectors (R6.1, R6.2)
export const selectIsSaving = createSelector(
  selectStatus,
  status => status === FormStatus.SAVING
);

export const selectIsValidationPending = createSelector(
  selectStatus,
  status => status === FormStatus.VALIDATION_PENDING
);

export const selectHasValidationError = createSelector(
  selectStatus,
  status => status === FormStatus.VALIDATION_ERROR
);

export const selectHasLoadError = createSelector(
  selectStatus,
  status => status === FormStatus.LOAD_ERROR
);

export const selectIsInitializing = createSelector(
  selectStatus,
  selectInitialDataLoaded,
  (status, loaded) => status === FormStatus.INIT && !loaded
);

export const selectIsReady = createSelector(
  selectStatus,
  status => status === FormStatus.READY
);

// Debug selector (R11.4)
export const selectDebugInfo = createSelector(
  selectFormFeature,
  state => ({
    status: state.status,
    initialDataLoaded: state.initialDataLoaded,
    isDirty: state.isDirty,
    pendingActions: state.pendingActions,
    resetToken: state.resetToken,
    submissionAttempt: state.submissionAttempt,
    hasError: !!state.error,
    errorMessage: state.error,
  })
);

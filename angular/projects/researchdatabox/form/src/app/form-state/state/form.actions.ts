/**
 * Form Actions
 * 
 * NgRx actions for form state management.
 * Per R3.1-R3.4
 */

import { createAction, props } from '@ngrx/store';

// Load actions (R3.2, R3.3, R8.2)
export const loadInitialData = createAction(
  '[Form] Load Initial Data',
  props<{ oid: string; recordType: string; formName: string }>()
);

export const loadInitialDataSuccess = createAction(
  '[Form] Load Initial Data Success',
  props<{ data: any }>()
);

export const loadInitialDataFailure = createAction(
  '[Form] Load Initial Data Failure',
  props<{ error: string }>()
);

// Submit actions (R3.2, R3.3, R8.3)
export const submitForm = createAction(
  '[Form] Submit Form',
  props<{ force?: boolean; targetStep?: string; skipValidation?: boolean }>()
);

export const submitFormSuccess = createAction(
  '[Form] Submit Form Success',
  props<{ savedAt: string }>()
);

export const submitFormFailure = createAction(
  '[Form] Submit Form Failure',
  props<{ error: string }>()
);

// Reset actions (R3.2, R3.4)
export const resetAllFields = createAction('[Form] Reset All Fields');
export const resetAllFieldsComplete = createAction('[Form] Reset All Fields Complete');

// Status actions (R3.2)
export const markDirty = createAction('[Form] Mark Dirty');
export const markPristine = createAction('[Form] Mark Pristine');

// Validation actions (R2.13)
export const formValidationPending = createAction('[Form] Validation Pending');
export const formValidationSuccess = createAction('[Form] Validation Success');
export const formValidationFailure = createAction('[Form] Validation Failure');

// Utility actions (R3.2)
export const ackError = createAction('[Form] Acknowledge Error');
export const syncModelSnapshot = createAction(
  '[Form] Sync Model Snapshot',
  props<{ snapshot: any }>()
);

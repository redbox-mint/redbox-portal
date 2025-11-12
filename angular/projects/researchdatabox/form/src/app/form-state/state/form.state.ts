/**
 * Form State Model
 * 
 * Defines the structure of the form feature state.
 * Per R2.1-R2.4
 */

import { FormStatus } from '@researchdatabox/sails-ng-common';

/**
 * Feature key for form state slice
 * Per R1.3
 */
export const FORM_FEATURE_KEY = 'form';

/**
 * Form feature state interface
 * Per R2.2
 */
export interface FormFeatureState {
  /** Canonical form status (R2.2) */
  status: FormStatus;
  
  /** Whether initial data has been loaded (R2.2, R2.5) */
  initialDataLoaded: boolean;
  
  /** Whether form has unsaved changes (R2.2, R2.9) */
  isDirty: boolean;
  
  /** Timestamp of last successful save (R2.2, R2.8) */
  // Note: Use ISO string for serializability; parse to Date only at UI boundary
  lastSavedAt?: string | null;
  
  /** User-safe error message (R2.2, R2.6) */
  error?: string | null;
  
  /** Array of in-flight async operations (R2.2, R4.2) */
  pendingActions: string[];
  
  /** Reset counter for triggering field resets (R2.2, R2.10) */
  resetToken: number;
  
  /** Number of submit attempts (R2.2, R4.5) */
  submissionAttempt: number;
  
  /** Extensible metadata (R2.2, R2.4) */
  meta?: Record<string, any>;
  
  /** Last known good model snapshot (R2.2) */
  modelSnapshot?: any;
}

/**
 * Initial state for form feature
 * Per R2.1-R2.5
 */
export const formInitialState: FormFeatureState = {
  status: FormStatus.INIT,
  initialDataLoaded: false,
  isDirty: false,
  lastSavedAt: null,
  error: null,
  pendingActions: [],
  resetToken: 0,
  submissionAttempt: 0,
  meta: {},
  modelSnapshot: null,
};

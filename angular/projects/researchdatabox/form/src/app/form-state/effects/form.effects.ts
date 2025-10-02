/**
 * Form Effects
 * 
 * Handles side effects for form state operations with error sanitization and diagnostics.
 * Per R4.2–R4.7, R5.1–R5.4, R10.3, R11.1–R11.4
 */

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { map, catchError, switchMap, exhaustMap, tap, withLatestFrom, filter } from 'rxjs/operators';
import * as FormActions from '../state/form.actions';
import * as FormSelectors from '../state/form.selectors';
import { FormStatus } from '@researchdatabox/sails-ng-common';

/**
 * Sanitizes errors into user-safe messages
 * Per R5.4, R11.1–R11.3
 */
function sanitizeError(error: any): string {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  if (error?.error?.message) {
    return error.error.message;
  }
  
  return 'An unexpected error occurred';
}

/**
 * Logs diagnostic information
 * Per R11.4
 */
function logDiagnostics(context: string, data: any): void {
  if (typeof console !== 'undefined' && console.debug) {
    console.debug(`[FormEffects] ${context}`, data);
  }
}

/**
 * FormEffects
 * 
 * Orchestrates load, submit, and reset side effects.
 * Per R5.1–R5.5
 */
@Injectable()
export class FormEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);

  /**
   * Load Initial Data Effect
   * 
   * Handles initial form data loading with INIT guard.
   * Per R5.1, R5.2, R10.3
   * 
   * Note: This is a stub that returns mock success. In production,
   * this would call FormService.getModelData() or similar.
   */
  loadInitialData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FormActions.loadInitialData),
      withLatestFrom(this.store.select(FormSelectors.selectStatus)),
      filter(([action, status]) => {
        // Only proceed if status is INIT (guard)
        if (status !== FormStatus.INIT) {
          logDiagnostics('loadInitialData aborted - not in INIT status', { status });
          return false;
        }
        return true;
      }),
      switchMap(([action]) => {
        logDiagnostics('loadInitialData started', action);
        
        // TODO: Replace with actual service call
        // return this.formService.getModelData(action.oid, action.recordType, action.formName).pipe(
        //   map(data => FormActions.loadInitialDataSuccess({ data })),
        //   catchError(error => {
        //     const sanitized = sanitizeError(error);
        //     logDiagnostics('loadInitialData failed', { error: sanitized });
        //     return of(FormActions.loadInitialDataFailure({ error: sanitized }));
        //   })
        // );
        
        // Stub implementation - returns empty data
        return of(FormActions.loadInitialDataSuccess({ data: {} }));
      }),
      catchError(error => {
        const sanitized = sanitizeError(error);
        logDiagnostics('loadInitialData effect error', { error: sanitized });
        return of(FormActions.loadInitialDataFailure({ error: sanitized }));
      })
    )
  );

  /**
   * Submit Form Effect
   * 
   * Handles form submission with exhaustMap to prevent concurrent saves.
   * Per R5.1, R5.3, R10.3
   * 
   * Note: This is a stub that returns mock success. In production,
   * this would call RecordService.save() or FormService.submit().
   */
  submitForm$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FormActions.submitForm),
      exhaustMap(action => {
        logDiagnostics('submitForm started', action);
        
        // TODO: Replace with actual service call
        // return this.recordService.save(formData, action.force, action.targetStep).pipe(
        //   map(response => FormActions.submitFormSuccess({ savedData: response })),
        //   catchError(error => {
        //     const sanitized = sanitizeError(error);
        //     logDiagnostics('submitForm failed', { error: sanitized });
        //     return of(FormActions.submitFormFailure({ error: sanitized }));
        //   })
        // );
        
        // Stub implementation - returns empty saved data
        return of(FormActions.submitFormSuccess({ savedData: {} }));
      }),
      catchError(error => {
        const sanitized = sanitizeError(error);
        logDiagnostics('submitForm effect error', { error: sanitized });
        return of(FormActions.submitFormFailure({ error: sanitized }));
      })
    )
  );

  /**
   * Reset All Fields Effect
   * 
   * Handles field reset completion.
   * Per R5.1, R2.10 (SAVING status gate handled by reducer)
   * 
   * Note: The reducer already increments resetToken and gates during SAVING.
   * This effect just signals completion after a small delay to allow
   * field components to process the resetToken change.
   */
  resetAllFields$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FormActions.resetAllFields),
      withLatestFrom(this.store.select(FormSelectors.selectStatus)),
      filter(([action, status]) => {
        // The reducer handles SAVING guard, but we double-check here
        if (status === FormStatus.SAVING) {
          logDiagnostics('resetAllFields ignored - form is SAVING', { status });
          return false;
        }
        return true;
      }),
      tap(() => logDiagnostics('resetAllFields triggered', {})),
      // Small delay to allow field components to process resetToken
      switchMap(() => {
        // In production, this might wait for field components to acknowledge reset
        // or emit a form event bus notification
        return of(FormActions.resetAllFieldsComplete());
      }),
      catchError(error => {
        const sanitized = sanitizeError(error);
        logDiagnostics('resetAllFields effect error', { error: sanitized });
        // Reset should always complete even on error
        return of(FormActions.resetAllFieldsComplete());
      })
    )
  );

  /**
   * Log Success Actions
   * 
   * Diagnostics logging for successful operations.
   * Per R11.4
   */
  logSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          FormActions.loadInitialDataSuccess,
          FormActions.submitFormSuccess,
          FormActions.resetAllFieldsComplete
        ),
        tap(action => logDiagnostics('Success action', { type: action.type }))
      ),
    { dispatch: false }
  );

  /**
   * Log Failure Actions
   * 
   * Diagnostics logging for failed operations.
   * Per R11.4
   */
  logFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          FormActions.loadInitialDataFailure,
          FormActions.submitFormFailure,
          FormActions.formValidationFailure
        ),
        tap(action => logDiagnostics('Failure action', { type: action.type, action }))
      ),
    { dispatch: false }
  );
}

/**
 * Form Effects
 * 
 * Handles side effects for form state operations with error sanitization and diagnostics.
 * Per R4.2–R4.7, R5.1–R5.4, R10.3, R11.1–R11.4
 */

import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of, Observable } from 'rxjs';
import { catchError, switchMap, tap, withLatestFrom, filter } from 'rxjs/operators';
import * as FormActions from '../state/form.actions';
import * as FormSelectors from '../state/form.selectors';
import { FormStatus } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { createFormSaveExecuteEvent } from '../events/form-component-event.types';
import { LoggerService } from '@researchdatabox/portal-ng-common';

// Abstraction for submit to allow async mocking in tests
export interface SubmitDriver {
  handler: (action: ReturnType<typeof FormActions.submitForm>) => Observable<any>;
}

/**
 * Sanitizes errors into user-safe messages
 * Per R5.4, R11.1–R11.3
 * 
 * TODO: What is sensitive info? Enhance to remove this.
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
 * FormEffects
 * 
 * Orchestrates load, submit, and reset side effects.
 * Per R5.1–R5.5
 */
@Injectable()
export class FormEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private eventBus = inject(FormComponentEventBus);
  private logger = inject(LoggerService);
  /**
    * Logs diagnostic information
    * Per R11.4
    */
  private logDiagnostics(context: string, data: any): void {
    this.logger.debug(`[FormEffects] ${context}`, data);
  }


  /**
   * Load Initial Data Effect
   * 
   * Handles initial form data loading with INIT guard.
   * Per R5.1, R5.2, R10.3
   * 
   * TODO: This is a stub that returns mock success. In production,
   * this would call FormService.getModelData() or similar.
   */
  loadInitialData$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FormActions.loadInitialData),
      withLatestFrom(this.store.select(FormSelectors.selectStatus)),
      filter(([action, status]) => {
        // Only proceed if status is INIT (guard)
        if (status !== FormStatus.INIT) {
          this.logDiagnostics('loadInitialData aborted - not in INIT status', { status });
          return false;
        }
        return true;
      }),
      switchMap(([action]) => {
        this.logDiagnostics('loadInitialData started', action);

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
        this.logDiagnostics('loadInitialData effect error', { error: sanitized });
        return of(FormActions.loadInitialDataFailure({ error: sanitized }));
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
          this.logDiagnostics('resetAllFields ignored - form is SAVING', { status });
          return false;
        }
        return true;
      }),
      tap(() => this.logDiagnostics('resetAllFields triggered', {})),
      switchMap(() => {
        // In production, this might wait for field components to acknowledge reset
        // or emit a form event bus notification? For now, just proceed immediately.
        return of(FormActions.resetAllFieldsComplete());
      }),
      catchError(error => {
        const sanitized = sanitizeError(error);
        this.logDiagnostics('resetAllFields effect error', { error: sanitized });
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
        tap(action => this.logDiagnostics('Success action', { type: action.type }))
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
        tap(action => this.logDiagnostics('Failure action', { type: action.type, action }))
      ),
    { dispatch: false }
  );

  /**
   * Publish Execute Command on Submit
   *
   * Listens to submitForm and publishes form.save.execute to the EventBus carrying
   * { force, skipValidation, targetStep }. Non-dispatching effect.
   * Per R5.1, R15.3 (Task 14)
   * 
   * TODO: Determine if we need to execute additional pluggable logic here in future.
   */
  publishSaveExecuteOnSubmit$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(FormActions.submitForm),
        tap(action => {
          this.logDiagnostics('publishSaveExecuteOnSubmit', action);
          this.eventBus.publish(
            createFormSaveExecuteEvent({
              force: action.force,
              skipValidation: action.skipValidation,
              targetStep: action.targetStep
            })
          );
        }),
        // Keep stream resilient
        catchError(error => {
          this.logDiagnostics('publishSaveExecuteOnSubmit error', { error });
          return of(void 0);
        })
      ),
    { dispatch: false }
  );
}

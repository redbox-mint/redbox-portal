/**
 * Form State Facade
 * 
 * Provides a Signal-based API over the Form feature store slice.
 * Wraps store dispatches and exposes read-only signals for components.
 * Per R7.1, R7.2, R16.14
 */

import { Injectable, Signal, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { FormStatus } from '@researchdatabox/sails-ng-common';
import * as FormActions from '../state/form.actions';
import * as FormSelectors from '../state/form.selectors';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

/**
 * FormStateFacade
 * 
 * Provides imperative methods to dispatch form actions and
 * read-only signals to observe form state reactively.
 * 
 * Components should inject this facade rather than directly
 * injecting Store, Actions, or Selectors.
 */
@Injectable()
export class FormStateFacade {
  private readonly store = inject(Store);

  // Signal API (R7.1, R7.2)
  // Convert store selectors to signals using toSignal
  
  /** Current form status (INIT, READY, SAVING, etc.) */
  readonly status: Signal<FormStatus> = 
    this.store.selectSignal(FormSelectors.selectStatus);

  /** Whether form has unsaved changes */
  readonly isDirty: Signal<boolean> = this.store.selectSignal(FormSelectors.selectIsDirty);

  /** Reset token incremented on each reset action */
  readonly resetToken: Signal<number> = this.store.selectSignal(FormSelectors.selectResetToken);

  /** Current error message if any */
  readonly error: Signal<string | null | undefined> = this.store.selectSignal(FormSelectors.selectError);

  /** Whether form is currently saving */
  readonly isSaving: Signal<boolean> = this.store.selectSignal(FormSelectors.selectIsSaving);

  /** Whether validation is pending */
  readonly isValidationPending: Signal<boolean> = this.store.selectSignal(FormSelectors.selectIsValidationPending);

  /** Whether form has validation errors */
  readonly hasValidationError: Signal<boolean> = this.store.selectSignal(FormSelectors.selectHasValidationError);

  /** Whether form has load errors */
  readonly hasLoadError: Signal<boolean> = this.store.selectSignal(FormSelectors.selectHasLoadError);

  /** Whether form is initializing (not yet ready) */
  readonly isInitializing: Signal<boolean> = this.store.selectSignal(FormSelectors.selectIsInitializing);

  /** Whether form is ready for user interaction */
  readonly isReady: Signal<boolean> = this.store.selectSignal(FormSelectors.selectIsReady);

  /** Timestamp of last successful save (ISO string); parse at UI boundary if needed */
  readonly lastSavedAt: Signal<string | null | undefined> = this.store.selectSignal(FormSelectors.selectLastSavedAt);

  // Imperative API (R7.1)

  /**
   * Load initial form data
   * @param oid Record identifier
   * @param recordType Type of record to load
   * @param formName Name of the form configuration
   */
  load(oid: string, recordType: string, formName: string): void {
    this.store.dispatch(FormActions.loadInitialData({ oid, recordType, formName }));
  }

  /**
   * Reload form data (re-dispatch load with same params)
   * Note: Requires storing load params in state or passing them again
   */
  reload(oid: string, recordType: string, formName: string): void {
    // TODO: this is just the same as load() for now, but consider use cases where a reload (either full or maybe partial?) is needed
    this.store.dispatch(FormActions.loadInitialData({ oid, recordType, formName }));
  }

  /**
   * Submit form data
   * @param force Force submit even if validation fails
   * @param targetStep Optional target workflow step
   * @param skipValidation Skip validation before submit
   */
  submit(options?: { force?: boolean; targetStep?: string; skipValidation?: boolean }): void {
    this.store.dispatch(
      FormActions.submitForm({
        force: options?.force ?? false,
        targetStep: options?.targetStep,
        skipValidation: options?.skipValidation ?? false,
      })
    );
  }

  /**
   * Mark form as dirty (has unsaved changes)
   */
  markDirty(): void {
    this.store.dispatch(FormActions.markDirty());
  }

  /**
   * Mark form as pristine (no unsaved changes)
   */
  markPristine(): void {
    this.store.dispatch(FormActions.markPristine());
  }

  /**
   * Reset all field values to defaults
   */
  resetAllFields(): void {
    this.store.dispatch(FormActions.resetAllFields());
  }

  /**
   * Acknowledge/clear the current error
   */
  ackError(): void {
    this.store.dispatch(FormActions.ackError());
  }

  /**
   * Sync model snapshot (for dirty diff comparison)
   * @param snapshot Snapshot of current form model
   */
  syncModelSnapshot(snapshot: unknown): void {
    this.store.dispatch(FormActions.syncModelSnapshot({ snapshot }));
  }

  /** Select form status */
  observeFormStatus(status?: FormStatus): Observable<boolean | FormStatus> {
    if (status === undefined) {
      return this.store.select(FormSelectors.selectStatus);
    }
    return this.store.select(FormSelectors.selectStatus).pipe(
      map(currentStatus => currentStatus === status)
    );
  }

}

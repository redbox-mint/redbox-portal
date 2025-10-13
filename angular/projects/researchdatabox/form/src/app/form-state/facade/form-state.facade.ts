/**
 * Form State Facade
 * 
 * Provides a Signal-based API over the Form feature store slice.
 * Wraps store dispatches and exposes read-only signals for components.
 * Per R7.1, R7.2, R16.14
 */

import { Injectable, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { FormStatus } from '@researchdatabox/sails-ng-common';
import * as FormActions from '../state/form.actions';
import * as FormSelectors from '../state/form.selectors';

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
  readonly status: Signal<FormStatus> = toSignal(
    this.store.select(FormSelectors.selectStatus),
    { initialValue: FormStatus.INIT }
  );

  /** Whether form has unsaved changes */
  readonly isDirty: Signal<boolean> = toSignal(
    this.store.select(FormSelectors.selectIsDirty),
    { initialValue: false }
  );

  /** Reset token incremented on each reset action */
  readonly resetToken: Signal<number> = toSignal(
    this.store.select(FormSelectors.selectResetToken),
    { initialValue: 0 }
  );

  /** Current error message if any */
  readonly error: Signal<string | null | undefined> = toSignal(
    this.store.select(FormSelectors.selectError),
    { initialValue: null }
  );

  /** Whether form is currently saving */
  readonly isSaving: Signal<boolean> = toSignal(
    this.store.select(FormSelectors.selectIsSaving),
    { initialValue: false }
  );

  /** Whether validation is pending */
  readonly isValidationPending: Signal<boolean> = toSignal(
    this.store.select(FormSelectors.selectIsValidationPending),
    { initialValue: false }
  );

  /** Whether form has validation errors */
  readonly hasValidationError: Signal<boolean> = toSignal(
    this.store.select(FormSelectors.selectHasValidationError),
    { initialValue: false }
  );

  /** Whether form has load errors */
  readonly hasLoadError: Signal<boolean> = toSignal(
    this.store.select(FormSelectors.selectHasLoadError),
    { initialValue: false }
  );

  /** Whether form is initializing (not yet ready) */
  readonly isInitializing: Signal<boolean> = toSignal(
    this.store.select(FormSelectors.selectIsInitializing),
    { initialValue: true }
  );

  /** Whether form is ready for user interaction */
  readonly isReady: Signal<boolean> = toSignal(
    this.store.select(FormSelectors.selectIsReady),
    { initialValue: false }
  );

  /** Timestamp of last successful save (ISO string); parse at UI boundary if needed */
  readonly lastSavedAt: Signal<string | null | undefined> = toSignal(
    this.store.select(FormSelectors.selectLastSavedAt),
    { initialValue: null }
  );

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
  syncModelSnapshot(snapshot: any): void {
    this.store.dispatch(FormActions.syncModelSnapshot({ snapshot }));
  }
}

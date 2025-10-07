/**
 * Form Status Signal Bridge
 * 
 * Lightweight adapter exposing signals for field components.
 * Bridges store-driven status to component-friendly signals.
 * Per R7.3, R7.4, R16.7
 */

import { Injectable, Signal, computed, inject } from '@angular/core';
import { FormStateFacade } from './form-state.facade';

/**
 * FormStatusSignalBridge
 * 
 * Provides a minimal signal-based API for field components
 * to observe form state without coupling to NgRx.
 * 
 * Field components should inject this bridge to:
 * - Monitor reset events via resetSequence()
 * - Check validation state
 * - Observe form readiness
 */
@Injectable()
export class FormStatusSignalBridge {
  private readonly facade = inject(FormStateFacade);

  /**
   * Reset sequence number (R7.4)
   * 
   * Increments on each reset action. Field components
   * can watch this signal and reset their values when it changes.
   * 
   * @example
   * ```ts
   * effect(() => {
   *   const seq = this.bridge.resetSequence();
   *   // Reset field value when sequence changes
   *   this.resetFieldValue();
   * });
   * ```
   */
  readonly resetSequence: Signal<number> = this.facade.resetToken;

  /**
   * Whether form is currently saving
   */
  readonly isSaving: Signal<boolean> = this.facade.isSaving;

  /**
   * Whether validation is pending
   */
  readonly isValidationPending: Signal<boolean> = this.facade.isValidationPending;

  /**
   * Whether form has validation errors
   */
  readonly hasValidationError: Signal<boolean> = this.facade.hasValidationError;

  /**
   * Whether form is ready for interaction
   */
  readonly isReady: Signal<boolean> = this.facade.isReady;

  /**
   * Whether form is initializing
   */
  readonly isInitializing: Signal<boolean> = this.facade.isInitializing;

  /**
   * Whether form has any error
   */
  readonly hasError: Signal<boolean> = computed(() => 
    this.facade.hasValidationError() || this.facade.hasLoadError()
  );

  /**
   * Whether field should be disabled
   * 
   * Computed from validation state and saving state.
   * Per R9.3, fields should not block UI during save/validation.
   */
  readonly shouldDisableFields: Signal<boolean> = computed(() =>
    this.facade.isSaving() || this.facade.isValidationPending()
  );

  /**
   * Current form status as a string
   * Useful for debugging or display purposes
   */
  readonly statusLabel: Signal<string> = computed(() => 
    String(this.facade.status())
  );
}

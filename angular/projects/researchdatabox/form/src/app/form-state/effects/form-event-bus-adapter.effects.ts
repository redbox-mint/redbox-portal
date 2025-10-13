/**
 * Form Event Bus Adapter Effects
 * 
 * Promotes qualifying ephemeral bus events into persistent NgRx actions.
 * Per R15.20–R15.29, AC37–AC44
 * 
 * Promotion Criteria:
 * (a) Event affects persistent global state
 * (b) Event triggers a side-effect requiring store coordination
 * (c) Event requires replay capability for debugging
 */

import { Injectable, inject, InjectionToken, Optional, Inject } from '@angular/core';
import { Actions, createEffect } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Observable, EMPTY } from 'rxjs';
import { map, throttleTime, tap, filter, catchError } from 'rxjs/operators';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { FormComponentEventType } from '../events/form-component-event.types';
import * as FormActions from '../state/form.actions';
import { LoggerService } from '@researchdatabox/portal-ng-common';

/**
 * Configuration for the adapter
 */
export interface FormEventBusAdapterConfig {
  /** Enable diagnostic logging (R15.26) */
  diagnosticsEnabled?: boolean;
  /** Throttling window in ms to prevent duplicates (R15.22) */
  throttleWindowMs?: number;
  /** Disable all promotions (R15.27) */
  disabled?: boolean;
}

/**
 * Injection token for adapter configuration
 */
export const FORM_EVENT_BUS_ADAPTER_CONFIG = new InjectionToken<FormEventBusAdapterConfig>(
  'FORM_EVENT_BUS_ADAPTER_CONFIG'
);

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<FormEventBusAdapterConfig> = {
  diagnosticsEnabled: false,
  throttleWindowMs: 250,
  disabled: false
};

/**
 * Promotion criterion codes for diagnostics (R15.26)
 */
enum PromotionCriterion {
  AFFECTS_STATE = 'a',        // Affects persistent global state
  TRIGGERS_SIDE_EFFECT = 'b', // Triggers a side-effect
  REQUIRES_REPLAY = 'c'       // Requires replay in debugging
}

/**
 * Logs promotion decisions in diagnostic mode (R15.26)
 */
function logPromotion(logger: LoggerService, eventType: string, criterion: PromotionCriterion, actionType: string): void {
  logger.debug(
    `[FormEventBusAdapter] Promoting event → action`,
    { eventType, criterion, actionType }
  );
}

/**
 * Logs skipped events in diagnostic mode
 */
function logSkipped(logger: LoggerService, eventType: string, reason: string): void {
  logger.debug(
    `[FormEventBusAdapter] Skipped event`,
    { eventType, reason }
  );
}

/**
 * Formats validation errors for readable messages in actions
 * - If errors is an object: "key: message" pairs joined by ", "
 * - If errors is an array: messages joined by "; "
 * - If errors is a string: returned as-is
 * - Otherwise: JSON stringified
 */
function formatErrorsForMessage(errors: any): string {
  if (!errors) return '';
  try {
    if (typeof errors === 'string') return errors;
    if (Array.isArray(errors)) {
      return errors
        .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
        .join('; ');
    }
    if (typeof errors === 'object') {
      const entries = Object.entries(errors as Record<string, any>).map(([key, value]) => {
        if (value == null) return key;
        if (typeof value === 'string') return `${key}: ${value}`;
        if (Array.isArray(value))
          return `${key}: ${value.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('; ')}`;
        return `${key}: ${JSON.stringify(value)}`;
      });
      if (entries.length) return entries.join(', ');
    }
    return JSON.stringify(errors);
  } catch {
    return String(errors);
  }
}

/**
 * FormEventBusAdapterEffects
 * 
 * Subscribes to selected bus events and promotes them to actions when criteria are met.
 * Per R15.21, optional registration via provideFormFeature config.
 */
@Injectable()
export class FormEventBusAdapterEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly eventBus = inject(FormComponentEventBus);
  private readonly logger = inject(LoggerService);
  
  /** Configuration injected via token */
  private readonly config: Required<FormEventBusAdapterConfig> = {
    ...DEFAULT_CONFIG,
    ...(inject(FORM_EVENT_BUS_ADAPTER_CONFIG, { optional: true }) || {})
  };

  /**
   * Promote field dependency trigger events
   * Criterion: (b) Triggers side-effect (dependent field updates)
   * 
   * Per R15.20(b), R15.21, R15.23
   */
  promoteDependencyTrigger$ = createEffect(() =>
    this.createPromotionStream(
      FormComponentEventType.FIELD_DEPENDENCY_TRIGGER,
      PromotionCriterion.TRIGGERS_SIDE_EFFECT,
      (event) => FormActions.dependencyEvaluated({
        fieldId: event.fieldId,
        dependentFields: event.dependentFields,
        reason: event.reason
      })
    )
  );

  /**
   * Promote form validation broadcast events
   * Criterion: (a) Affects persistent global state (validation status)
   * 
   * Per R15.20(a), R15.21, R15.23
   */
  promoteValidationBroadcast$ = createEffect(() =>
    this.createPromotionStream(
      FormComponentEventType.FORM_VALIDATION_BROADCAST,
      PromotionCriterion.AFFECTS_STATE,
      (event) =>
        event.isValid
          ? FormActions.formValidationSuccess()
          : FormActions.formValidationFailure({
              error: formatErrorsForMessage(event.errors)
            })
    )
  );

  /**
   * Promote field value changed events (selective)
   * Criterion: (c) Requires replay for debugging critical field changes
   * 
   * Only promotes for fields marked as critical/replay-worthy.
   * Per R15.20(c), R15.21, R15.23
   * 
   * Note: In production, this would check field metadata or config to determine
   * which fields warrant promotion. For now, we'll skip this to avoid noise.
   */
  promoteFieldValueChanged$ = createEffect(
    () =>
      this.eventBus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).pipe(
        tap((event) => {
          if (this.config.diagnosticsEnabled) {
            logSkipped(this.logger, event.type, 'Field value changes not promoted by default (R15.24)');
          }
        })
      ),
    { dispatch: false } // No promotion by default (R15.24)
  );

  /**
   * Generic promotion stream factory
   * 
   * Creates an observable that:
   * 1. Subscribes to specific event type (R15.21)
   * 2. Throttles duplicates (R15.22)
   * 3. Maps to action (R15.23)
   * 4. Logs diagnostics (R15.26)
   * 5. Respects disabled flag (R15.27)
   * 
   * Per R15.21–R15.28
   */
  private createPromotionStream<T extends keyof any>(
    eventType: string,
    criterion: PromotionCriterion,
    actionMapper: (event: any) => any
  ): Observable<any> {
    return this.eventBus.select$(eventType as any).pipe(
      // R15.27: Disable promotions if configured
      filter(() => {
        if (this.config.disabled) {
          if (this.config.diagnosticsEnabled) {
            logSkipped(this.logger, eventType, 'Adapter disabled');
          }
          return false;
        }
        return true;
      }),
      // R15.22: Throttle to prevent duplicate dispatches
      throttleTime(this.config.throttleWindowMs, undefined, {
        leading: true,
        trailing: false
      }),
      // R15.23 & R15.26: Map to action and (optionally) log promotion in one step
      map((event) => {
        const action = actionMapper(event);
        if (this.config.diagnosticsEnabled) {
          logPromotion(this.logger, eventType, criterion, action.type);
        }
        return action;
      }),
      // Ensure errors in the stream do not terminate the effect
      catchError((err) => {
        if (this.config.diagnosticsEnabled) {
          this.logger.error('[FormEventBusAdapter] Promotion stream error', err);
        }
        return EMPTY; // swallow error to keep effect alive
      })
    );
  }
}

/**
 * Factory function to create adapter effects with config (R15.27)
 * Allows optional registration in provideFormFeature
 */
export function provideFormEventBusAdapter(
  config?: FormEventBusAdapterConfig
): any[] {
  return [
    FormEventBusAdapterEffects,
    ...(config ? [{ provide: FORM_EVENT_BUS_ADAPTER_CONFIG, useValue: config }] : [])
  ];
}

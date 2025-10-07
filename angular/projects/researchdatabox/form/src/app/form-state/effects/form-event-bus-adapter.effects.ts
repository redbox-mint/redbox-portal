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
import { Observable } from 'rxjs';
import { map, throttleTime, tap, filter } from 'rxjs/operators';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { FormComponentEventType } from '../events/form-component-event.types';
import * as FormActions from '../state/form.actions';

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
function logPromotion(eventType: string, criterion: PromotionCriterion, actionType: string): void {
  console.debug(
    `[FormEventBusAdapter] Promoting event → action`,
    { eventType, criterion, actionType }
  );
}

/**
 * Logs skipped events in diagnostic mode
 */
function logSkipped(eventType: string, reason: string): void {
  console.debug(
    `[FormEventBusAdapter] Skipped event`,
    { eventType, reason }
  );
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
              error: Object.keys(event.errors || {}).join(', ')
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
            logSkipped(event.type, 'Field value changes not promoted by default (R15.24)');
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
            logSkipped(eventType, 'Adapter disabled');
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
      // R15.26: Log promotion decision
      tap((event) => {
        if (this.config.diagnosticsEnabled) {
          const action = actionMapper(event);
          logPromotion(eventType, criterion, action.type);
        }
      }),
      // R15.23: Map to clearly named action
      map(actionMapper)
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

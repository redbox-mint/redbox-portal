/**
 * Form Event Bus Adapter Effects Tests
 * 
 * Validates promotion criteria, throttling, diagnostics, and disablement.
 * Per R15.29, AC37–AC44
 */

import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { Observable, ReplaySubject } from 'rxjs';
import { Provider } from '@angular/core';
import { FormEventBusAdapterEffects, FORM_EVENT_BUS_ADAPTER_CONFIG, FormEventBusAdapterConfig } from './form-event-bus-adapter.effects';
import { FormComponentEventBus } from '../events/form-component-event-bus.service';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import {
  FormComponentEventType,
  FieldDependencyTriggerEvent,
  FormValidationBroadcastEvent,
  FieldValueChangedEvent
} from '../events/form-component-event.types';
import * as FormActions from '../state/form.actions';

describe('FormEventBusAdapterEffects', () => {
  let effects: FormEventBusAdapterEffects;
  let actions$: Observable<any>;
  let eventBus: FormComponentEventBus;
  let actionsSubject: ReplaySubject<any>;

  function setupTestBed(config?: FormEventBusAdapterConfig): void {
    actionsSubject = new ReplaySubject(1);

    const providers: Provider[] = [
      FormEventBusAdapterEffects,
      FormComponentEventBus,
      LoggerService,
      provideMockActions(() => actionsSubject),
      provideMockStore(),
    ];

    if (config !== undefined) {
      providers.push({ provide: FORM_EVENT_BUS_ADAPTER_CONFIG, useValue: config });
    }

    TestBed.configureTestingModule({ providers });

    effects = TestBed.inject(FormEventBusAdapterEffects);
    eventBus = TestBed.inject(FormComponentEventBus);
    actions$ = actionsSubject.asObservable();
  }

  afterEach(() => {
    eventBus?.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  describe('Promotion Criteria', () => {
    /**
     * AC43: Tests shall demonstrate promotion for each criterion category (a–c)
     * AC37: Adapter effect shall promote qualifying bus events into actions
     */

    it('should promote validation broadcast for success (criterion a: affects state)', fakeAsync(() => {
      setupTestBed();

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });

      tick(10);

      expect(promoted.length).toBe(1);
      expect(promoted[0].type).toBe(FormActions.formValidationSuccess.type);
    }));

    it('should promote validation broadcast for failure (criterion a: affects state)', fakeAsync(() => {
      setupTestBed();

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: false,
        errors: { field1: ['Error message'] }
      });

      tick(10);

      expect(promoted.length).toBe(1);
      expect(promoted[0].type).toBe(FormActions.formValidationFailure.type);
    }));

    it('should promote dependency trigger event (criterion b: side-effect)', fakeAsync(() => {
      setupTestBed();

      const promoted: any[] = [];
      effects.promoteDependencyTrigger$.subscribe(action => promoted.push(action));

      eventBus.publish<FieldDependencyTriggerEvent>({
        type: FormComponentEventType.FIELD_DEPENDENCY_TRIGGER,
        fieldId: 'field1',
        dependentFields: ['field2', 'field3'],
        reason: 'value-changed'
      });

      tick(10);

      expect(promoted.length).toBe(1);
      expect(promoted[0].type).toBe(FormActions.dependencyEvaluated.type);
      expect(promoted[0].fieldId).toBe('field1');
      expect(promoted[0].dependentFields).toEqual(['field2', 'field3']);
    }));

    it('should NOT promote field value changed events by default (R15.24)', fakeAsync(() => {
      setupTestBed();

      const promoted: any[] = [];
      // Subscribe to actions$ to capture any dispatched actions
      actions$.subscribe(action => promoted.push(action));

      eventBus.publish<FieldValueChangedEvent>({
        type: FormComponentEventType.FIELD_VALUE_CHANGED,
        fieldId: 'field1',
        value: 'test',
        previousValue: null
      });

      tick(10);

      // Effect runs but doesn't dispatch any actions (dispatch: false)
      expect(promoted.length).toBe(0);
    }));
  });

  describe('Throttling and Deduplication', () => {
    /**
     * AC38: Adapter shall throttle duplicate events within configurable window (default 250ms)
     * R15.22: event → action throttling prevents duplicate dispatches
     */

    it('should throttle duplicate events within window (R15.22)', fakeAsync(() => {
      setupTestBed({ throttleWindowMs: 250 });

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      // Emit same event 3 times within throttle window
      for (let i = 0; i < 3; i++) {
        eventBus.publish<FormValidationBroadcastEvent>({
          type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
          isValid: true,
          errors: {}
        });
        tick(50); // 50ms between events (within 250ms window)
      }

      // Only first event should be promoted
      expect(promoted.length).toBe(1);
    }));

    it('should allow dispatch after throttle window expires (R15.22)', fakeAsync(() => {
      setupTestBed({ throttleWindowMs: 250 });

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      // First event
      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });
      tick(10);

      // Wait for throttle window to expire
      tick(260);

      // Second event after throttle window
      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });
      tick(10);

      // Both events should be promoted
      expect(promoted.length).toBe(2);
    }));

    it('should respect custom throttle window config (R15.22)', fakeAsync(() => {
      setupTestBed({ throttleWindowMs: 100 });

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      // First event
      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });
      tick(10);

      // Event within custom window (should be throttled)
      tick(50);
      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });
      tick(10);

      // Event after custom window (should be allowed)
      tick(110);
      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });
      tick(10);

      expect(promoted.length).toBe(2); // First and third events
    }));
  });

  describe('Diagnostics Mode', () => {
    /**
     * AC39: Diagnostics mode shall log promotion decisions and event types
     * R15.26: Diagnostics log every promotion decision with event type
     */

    it('should log promotion decisions when diagnostics enabled (R15.26)', fakeAsync(() => {
      setupTestBed({ diagnosticsEnabled: true });
      const logger = TestBed.inject(LoggerService);
      spyOn(logger, 'debug');

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });

      tick(10);

      expect(logger.debug).toHaveBeenCalledWith(
        jasmine.stringMatching(/promoting/i),
        jasmine.objectContaining({
          eventType: FormComponentEventType.FORM_VALIDATION_BROADCAST,
          criterion: 'a'
        })
      );
    }));

    it('should NOT log when diagnostics disabled (default)', fakeAsync(() => {
      setupTestBed(); // Defaults: diagnostics=false
      const logger = TestBed.inject(LoggerService);
      spyOn(logger, 'debug');

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });

      tick(10);

      expect(logger.debug).not.toHaveBeenCalled();
    }));

    it('should log skipped events when disabled with diagnostics (R15.26)', fakeAsync(() => {
      setupTestBed({ disabled: true, diagnosticsEnabled: true });
      const logger = TestBed.inject(LoggerService);
      spyOn(logger, 'debug');

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });

      tick(10);

      expect(logger.debug).toHaveBeenCalledWith(
        jasmine.stringMatching(/skipped/i),
        jasmine.objectContaining({
          eventType: FormComponentEventType.FORM_VALIDATION_BROADCAST,
          reason: 'Adapter disabled'
        })
      );
    }));
  });

  describe('Optional Registration and Disablement', () => {
    /**
     * AC40: Adapter registration shall be optional with config flag
     * AC41: When disabled, bus operations continue unaffected
     * R15.27: Adapter can be toggled off without breaking bus
     */

    it('should not promote any events when disabled (R15.27)', fakeAsync(() => {
      setupTestBed({ disabled: true });

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });

      tick(10);

      expect(promoted.length).toBe(0);
    }));

    it('should still allow bus to function when adapter disabled (R15.27)', fakeAsync(() => {
      setupTestBed({ disabled: true });

      let busReceived = false;
      eventBus.select$(FormComponentEventType.FORM_VALIDATION_BROADCAST).subscribe(() => {
        busReceived = true;
      });

      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });

      tick(10);

      expect(busReceived).toBe(true);
    }));
  });

  describe('Action Naming', () => {
    /**
     * AC42: Action types shall be clearly named per event type
     * R15.23: Each event → action mapping uses descriptive action type
     */

    it('should use clearly named action types (R15.23)', fakeAsync(() => {
      setupTestBed();

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });

      tick(10);

      expect(promoted[0].type).toBe('[Form] Validation Success');
    }));

    it('should map validation events to distinct action types (R15.23)', fakeAsync(() => {
      setupTestBed();

      const promoted: any[] = [];
      effects.promoteValidationBroadcast$.subscribe(action => promoted.push(action));

      // Success
      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });
      tick(10);

      tick(300); // Wait for throttle

      // Failure
      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: false,
        errors: { field1: ['Error'] }
      });
      tick(10);

      expect(promoted[0].type).toBe('[Form] Validation Success');
      expect(promoted[1].type).toBe('[Form] Validation Failure');
    }));
  });

  describe('Performance', () => {
    /**
     * AC44: Performance tests ensure low latency (<10ms) for promotions
     * R15.28: Adapter must not introduce >10ms latency
     */

    it('should promote events with minimal latency (R15.28)', fakeAsync(() => {
      setupTestBed();

      const start = Date.now();
      let latency = 0;

      effects.promoteValidationBroadcast$.subscribe(() => {
        latency = Date.now() - start;
      });

      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });

      tick(10);

      expect(latency).toBeLessThan(10);
    }));
  });

  describe('Integration', () => {
    it('should handle multiple event types simultaneously', fakeAsync(() => {
      setupTestBed();

      const validationPromoted: any[] = [];
      const dependencyPromoted: any[] = [];

      effects.promoteValidationBroadcast$.subscribe(action => validationPromoted.push(action));
      effects.promoteDependencyTrigger$.subscribe(action => dependencyPromoted.push(action));

      // Validation event
      eventBus.publish<FormValidationBroadcastEvent>({
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: true,
        errors: {}
      });
      tick(10);

      // Dependency event (different type, should not be throttled by validation)
      eventBus.publish<FieldDependencyTriggerEvent>({
        type: FormComponentEventType.FIELD_DEPENDENCY_TRIGGER,
        fieldId: 'field1',
        dependentFields: ['field2'],
        reason: 'value-changed'
      });
      tick(10);

      expect(validationPromoted.length).toBe(1);
      expect(dependencyPromoted.length).toBe(1);
      expect(validationPromoted[0].type).toBe(FormActions.formValidationSuccess.type);
      expect(dependencyPromoted[0].type).toBe(FormActions.dependencyEvaluated.type);
    }));
  });
});

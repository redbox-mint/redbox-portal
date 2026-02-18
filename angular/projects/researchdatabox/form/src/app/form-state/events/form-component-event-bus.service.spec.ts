/**
 * Form Component Event Bus Tests
 *
 * Tests ephemeral pub/sub coordination between field components.
 * Per R15.1–R15.29, AC26–AC36
 */

import { TestBed } from '@angular/core/testing';
import { Injector } from '@angular/core';
import { TestScheduler } from 'rxjs/testing';
import { config as rxjsConfig } from 'rxjs';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { Store } from '@ngrx/store';
import {
  FormComponentEventType,
  FieldMetaChangedEvent,
  FormValidationBroadcastEvent,
  createFieldValueChangedEvent,
  createFieldDependencyTriggerEvent,
  createFieldFocusRequestEvent,
  createLineageFieldFocusRequestEvent,
  createFormSaveRequestedEvent,
  createFormSaveExecuteEvent
} from './form-component-event.types';

describe('FormComponentEventBus', () => {
  let bus: FormComponentEventBus;
  let testScheduler: TestScheduler;
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FormComponentEventBus, LoggerService]
    });

    bus = TestBed.inject(FormComponentEventBus);
    injector = TestBed.inject(Injector);

    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  afterEach(() => {
    bus.ngOnDestroy();
  });

  describe('Event Publishing (R15.2, AC26-AC28)', () => {
    it('should publish field value changed events (AC26)', (done) => {
      const event = createFieldValueChangedEvent({
        fieldId: 'title',
        value: 'New Title',
        previousValue: 'Old Title'
      });

      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: (received) => {
          expect(received.fieldId).toBe('title');
          expect(received.value).toBe('New Title');
          expect(received.previousValue).toBe('Old Title');
          expect(received.timestamp).toBeGreaterThan(0);
          done();
        }
      });

      bus.publish(event);
    });

    it('should publish field focus request events (AC27)', (done) => {
      const event = createFieldFocusRequestEvent({ fieldId: 'email' });

      bus.select$(FormComponentEventType.FIELD_FOCUS_REQUEST).subscribe({
        next: (received) => {
          expect(received.fieldId).toBe('email');
          expect(received.timestamp).toBeGreaterThan(0);
          done();
        }
      });

      bus.publish(event);
    });

    it('should publish field dependency trigger events (AC28)', (done) => {
      const event = createFieldDependencyTriggerEvent({
        fieldId: 'country',
        dependentFields: ['state', 'city'],
        reason: 'country selection changed'
      });

      bus.select$(FormComponentEventType.FIELD_DEPENDENCY_TRIGGER).subscribe({
        next: (received) => {
          expect(received.fieldId).toBe('country');
          expect(received.dependentFields).toEqual(['state', 'city']);
          expect(received.reason).toBe('country selection changed');
          expect(received.timestamp).toBeGreaterThan(0);
          done();
        }
      });

      bus.publish(event);
    });

    it('should publish field meta changed events (R15.17)', (done) => {
      const event: Omit<FieldMetaChangedEvent, 'timestamp'> = {
        type: FormComponentEventType.FIELD_META_CHANGED,
        fieldId: 'description',
        meta: { visible: false, required: true }
      };

      bus.select$(FormComponentEventType.FIELD_META_CHANGED).subscribe({
        next: (received) => {
          expect(received.fieldId).toBe('description');
          expect(received.meta).toEqual({ visible: false, required: true });
          done();
        }
      });

      bus.publish(event);
    });

    it('should publish form validation broadcast events (R15.17)', (done) => {
      const event: Omit<FormValidationBroadcastEvent, 'timestamp'> = {
        type: FormComponentEventType.FORM_VALIDATION_BROADCAST,
        isValid: false,
        errors: { title: ['Required field'] }
      };

      bus.select$(FormComponentEventType.FORM_VALIDATION_BROADCAST).subscribe({
        next: (received) => {
          expect(received.isValid).toBe(false);
          expect(received.errors).toEqual({ title: ['Required field'] });
          done();
        }
      });

      bus.publish(event);
    });

    it('should publish form save requested events (R15.17.1)', (done) => {
      const event = createFormSaveRequestedEvent({
        force: true,
        enabledValidationGroups: ["all"],
        targetStep: 'review',
        sourceId: 'save-button'
      });

      bus.select$(FormComponentEventType.FORM_SAVE_REQUESTED).subscribe({
        next: (received) => {
          expect(received.type).toBe(FormComponentEventType.FORM_SAVE_REQUESTED);
          expect(received.force).toBe(true);
          expect(received.enabledValidationGroups).toEqual(["all"]);
          expect(received.targetStep).toBe('review');
          expect(received.sourceId).toBe('save-button');
          expect(received.timestamp).toBeGreaterThan(0);
          done();
        }
      });

      bus.publish(event);
    });

    it('should publish form save execute events (R15.30)', (done) => {
      const event = createFormSaveExecuteEvent({
        force: false,
        enabledValidationGroups: ["all"],
        targetStep: 'submit',
        sourceId: 'effect'
      });

      bus.select$(FormComponentEventType.FORM_SAVE_EXECUTE).subscribe({
        next: (received) => {
          expect(received.type).toBe(FormComponentEventType.FORM_SAVE_EXECUTE);
          expect(received.force).toBe(false);
          expect(received.enabledValidationGroups).toEqual(["all"]);
          expect(received.targetStep).toBe('submit');
          expect(received.sourceId).toBe('effect');
          expect(received.timestamp).toBeGreaterThan(0);
          done();
        }
      });

      bus.publish(event);
    });

    it('should auto-timestamp published events (R15.2)', (done) => {
      const beforePublish = Date.now();
      const event = createFieldValueChangedEvent({ fieldId: 'test', value: 'test-value' });

      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: (received) => {
          expect(received.timestamp).toBeGreaterThanOrEqual(beforePublish);
          expect(received.timestamp).toBeLessThanOrEqual(Date.now());
          done();
        }
      });

      bus.publish(event);
    });
  });

  describe('Type-Safe Subscriptions (R15.3, R15.16, AC29-AC30)', () => {
    it('should filter events by type (AC29)', () => {
      const valueEvent = createFieldValueChangedEvent({ fieldId: 'field1', value: 'value1' });
      const focusEvent = createFieldFocusRequestEvent({ fieldId: 'field2' });

      let receivedEvents = 0;

      // Subscribe only to value changes
      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: (event) => {
          expect(event.type).toBe(FormComponentEventType.FIELD_VALUE_CHANGED);
          expect(event.fieldId).toBe('field1');
          receivedEvents++;
        }
      });

      // Publish both types
      bus.publish(valueEvent);
      bus.publish(focusEvent);

      // Should only receive one event (value change) — publish is synchronous
      expect(receivedEvents).toBe(1);
    });

    it('should support multiple subscribers to same event type (AC30)', (done) => {
      const event = createFieldValueChangedEvent({ fieldId: 'shared', value: 'shared-value' });

      let subscriber1Received = false;
      let subscriber2Received = false;

      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: () => {
          subscriber1Received = true;
          checkCompletion();
        }
      });

      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: () => {
          subscriber2Received = true;
          checkCompletion();
        }
      });

      function checkCompletion() {
        if (subscriber1Received && subscriber2Received) {
          expect(subscriber1Received).toBe(true);
          expect(subscriber2Received).toBe(true);
          done();
        }
      }

      bus.publish(event);
    });

    it('should not deliver events to unrelated subscribers (R15.11, R15.24)', () => {
      let focusEventReceived = false;

      // Subscribe to focus events only
      bus.select$(FormComponentEventType.FIELD_FOCUS_REQUEST).subscribe({
        next: () => {
          focusEventReceived = true;
        }
      });

      // Publish value change event
      const valueEvent = createFieldValueChangedEvent({ fieldId: 'test', value: 'test' });
      bus.publish(valueEvent);

      // Focus subscriber should not receive value change event (R15.24) — synchronous assertion
      expect(focusEventReceived).toBe(false);
    });
  });

  describe('Signal API (R15.18)', () => {
    it('should provide Signal-based subscriptions for synchronous consumption', () => {
      const signal = bus.selectSignal(FormComponentEventType.FIELD_VALUE_CHANGED, { injector });

      // Initially null (no history)
      expect(signal()).toBeNull();

      const event = createFieldValueChangedEvent({ fieldId: 'test', value: 'value' });
      bus.publish(event);

      // Signal should update synchronously after publish
      const signalValue = signal();
      expect(signalValue).not.toBeNull();
      expect(signalValue?.fieldId).toBe('test');
      expect(signalValue?.value).toBe('value');
    });

    it('should update Signal with latest event only', () => {
      const signal = bus.selectSignal(FormComponentEventType.FIELD_VALUE_CHANGED, { injector });

      const event1 = createFieldValueChangedEvent({ fieldId: 'field1', value: 'value1' });
      const event2 = createFieldValueChangedEvent({ fieldId: 'field2', value: 'value2' });

      bus.publish(event1);
      bus.publish(event2);

      // Signal holds only the latest event (no history - R15.5) synchronously
      const signalValue = signal();
      expect(signalValue?.fieldId).toBe('field2');
      expect(signalValue?.value).toBe('value2');
    });
  });

  describe('Event History and Lifecycle (R15.5, R15.18, AC31)', () => {
    it('should not keep event history (R15.5, R15.18)', () => {
      const event = createFieldValueChangedEvent({ fieldId: 'test', value: 'test-value' });

      // Publish before subscription (fire-and-forget)
      bus.publish(event);

      // Late subscriber should not receive past events
      let received = false;
      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: () => {
          received = true;
        }
      });

      // Since no further events are published, this should remain false synchronously
      expect(received).toBe(false);
    });

    it('should complete stream on destroy (R15.8, AC31)', () => {
      let completed = false;

      bus.selectAll$().subscribe({
        complete: () => {
          completed = true;
        }
      });

      bus.ngOnDestroy();

      // Completion should be synchronous
      expect(completed).toBe(true);
    });
  });

  describe('Multiple Event Types (AC32-AC33)', () => {
    it('should handle rapid event sequences (AC32)', () => {
      const events = [
        createFieldValueChangedEvent({ fieldId: 'f1', value: 'v1' }),
        createFieldValueChangedEvent({ fieldId: 'f2', value: 'v2' }),
        createFieldValueChangedEvent({ fieldId: 'f3', value: 'v3' })
      ];

      const receivedEvents: string[] = [];

      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: (event) => {
          receivedEvents.push(event.fieldId);
        }
      });

      // Publish rapidly
      events.forEach(e => bus.publish(e));

      // Should receive all events in order synchronously
      expect(receivedEvents).toEqual(['f1', 'f2', 'f3']);
    });

    it('should support multiple concurrent event types (AC33)', (done) => {
      const receivedTypes = new Set<string>();

      bus.selectAll$().subscribe({
        next: (event) => {
          receivedTypes.add(event.type);

          if (receivedTypes.size === 3) {
            expect(receivedTypes.has(FormComponentEventType.FIELD_VALUE_CHANGED)).toBe(true);
            expect(receivedTypes.has(FormComponentEventType.FIELD_FOCUS_REQUEST)).toBe(true);
            expect(receivedTypes.has(FormComponentEventType.FIELD_DEPENDENCY_TRIGGER)).toBe(true);
            done();
          }
        }
      });

      bus.publish(createFieldValueChangedEvent({ fieldId: 'f1', value: 'v1' }));
      bus.publish(createFieldFocusRequestEvent({ fieldId: 'f2' }));
      bus.publish(createFieldDependencyTriggerEvent({ fieldId: 'f3', dependentFields: ['f4'], reason: 'test' }));
    });
  });

  describe('Error Resilience (AC34-AC35)', () => {
    let originalOnUnhandledError: typeof rxjsConfig.onUnhandledError;

    beforeAll(() => {
      // Suppress RxJS global unhandled error rethrow for this suite only.
      // We intentionally trigger a subscriber error in AC34 and want to
      // validate bus resilience without failing the entire test run.
      originalOnUnhandledError = rxjsConfig.onUnhandledError;
      rxjsConfig.onUnhandledError = () => {};
    });

    afterAll(() => {
      // Restore original handler to avoid masking issues in other suites.
      rxjsConfig.onUnhandledError = originalOnUnhandledError;
    });

    it('should not crash if subscriber throws error (AC34)', () => {
      let secondSubscriberReceived = false;
      let firstSubscriberReceivedCount = 0;

      // First subscriber throws from next handler; RxJS may unsubscribe this subscriber after the throw.
      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: () => {
          firstSubscriberReceivedCount++;
          // Intentionally throw to simulate subscriber error
          throw new Error('Subscriber error');
        }
      });

      // Second subscriber should still receive events
      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: () => {
          secondSubscriberReceived = true;
        }
      });

      // Publishing should not throw even if one subscriber errors
      expect(() => {
        bus.publish(createFieldValueChangedEvent({ fieldId: 'test', value: 'test' }));
      }).not.toThrow();

      // Assertions are synchronous because publish emits synchronously
      expect(firstSubscriberReceivedCount).toBe(1);
      expect(secondSubscriberReceived).toBe(true);
    });

    it('should handle publish after destroy gracefully (AC35)', () => {
      bus.ngOnDestroy();

      // Should not throw
      expect(() => {
        bus.publish(createFieldValueChangedEvent({ fieldId: 'test', value: 'test' }));
      }).not.toThrow();
    });
  });

  describe('Scoped Channels (R15.10)', () => {
    it('should create scoped event bus for specific channel', (done) => {
      const scopedBus = bus.scoped('field-123');

      scopedBus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: (event) => {
          expect(event.sourceId).toBe('field-123');
          expect(event.fieldId).toBe('test');
          done();
        }
      });

      scopedBus.publish(createFieldValueChangedEvent({ fieldId: 'test', value: 'value' }));
      });

    it('should filter events by channel ID', () => {
      const scopedBus1 = bus.scoped('channel-1');
      const scopedBus2 = bus.scoped('channel-2');

      let channel1Received = false;
      let channel2Received = false;

      scopedBus1.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: (event) => {
          expect(event.sourceId).toBe('channel-1');
          channel1Received = true;
        }
      });

      scopedBus2.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe({
        next: (event) => {
          expect(event.sourceId).toBe('channel-2');
          channel2Received = true;
        }
      });

      // Publish to different channels
      scopedBus1.publish(createFieldValueChangedEvent({ fieldId: 'f1', value: 'v1' }));
      scopedBus2.publish(createFieldValueChangedEvent({ fieldId: 'f2', value: 'v2' }));

      // Should have been received synchronously
      expect(channel1Received).toBe(true);
      expect(channel2Received).toBe(true);
    });

    it('should provide scoped Signal API', () => {
      const scopedBus = bus.scoped('channel-signal');
      const signal = scopedBus.selectSignal(FormComponentEventType.FIELD_VALUE_CHANGED, { injector });

      expect(signal()).toBeNull();

      scopedBus.publish(createFieldValueChangedEvent({ fieldId: 'test', value: 'value' }));

      const signalValue = signal();
      expect(signalValue).not.toBeNull();
      expect(signalValue?.sourceId).toBe('channel-signal');
    });
  });

  describe('Store Isolation (AC36)', () => {
    it('should NOT inject or interact with NgRx Store (AC36)', () => {
      // Verify the bus can be constructed without store
      expect(bus).toBeDefined();

      // Ensure Store is NOT available in this TestBed (isolation from NgRx)
      // and that attempting to inject it throws NullInjectorError
      expect(() => TestBed.inject(Store as any)).toThrow();

      // Ensure the bus itself does not hold any store-like property
      const anyBus = bus as any;
      expect(anyBus.store).toBeUndefined();
      expect(Object.keys(anyBus).some(k => /store/i.test(k))).toBeFalse();

      // Publishing events should not throw and should not require store
      expect(() => {
        bus.publish(createFieldValueChangedEvent({ fieldId: 'test', value: 'test' }));
      }).not.toThrow();
    });
  });

  describe('Helper Factories (R15.15)', () => {
    it('should create field value changed events via helper', () => {
      const event = createFieldValueChangedEvent({
        fieldId: 'title',
        value: 'New',
        previousValue: 'Old',
        sourceId: 'component-1'
      });

      expect(event.type).toBe(FormComponentEventType.FIELD_VALUE_CHANGED);
      expect(event.fieldId).toBe('title');
      expect(event.value).toBe('New');
      expect(event.previousValue).toBe('Old');
      expect(event.sourceId).toBe('component-1');
    });

    it('should create field dependency trigger events via helper', () => {
      const event = createFieldDependencyTriggerEvent({
        fieldId: 'country',
        dependentFields: ['state', 'city'],
        reason: 'selection changed',
        sourceId: 'form-1'
      });

      expect(event.type).toBe(FormComponentEventType.FIELD_DEPENDENCY_TRIGGER);
      expect(event.fieldId).toBe('country');
      expect(event.dependentFields).toEqual(['state', 'city']);
      expect(event.reason).toBe('selection changed');
      expect(event.sourceId).toBe('form-1');
    });

    it('should create field focus request events via helper', () => {
      const event = createFieldFocusRequestEvent({
        fieldId: 'email',
        sourceId: 'validation-component',
        targetElementId: 'form-item-id-email',
        lineagePath: ['tabs', 'email'],
        requestId: 'focus-req-1',
        source: 'validation-summary'
      });

      expect(event.type).toBe(FormComponentEventType.FIELD_FOCUS_REQUEST);
      expect(event.fieldId).toBe('email');
      expect(event.sourceId).toBe('validation-component');
      expect(event.targetElementId).toBe('form-item-id-email');
      expect(event.lineagePath).toEqual(['tabs', 'email']);
      expect(event.requestId).toBe('focus-req-1');
      expect(event.source).toBe('validation-summary');
    });

    it('should create lineage-based focus request events via helper', () => {
      const event = createLineageFieldFocusRequestEvent({
        fieldId: 'email',
        lineagePath: ['email'],
        source: 'validation-summary',
        sourceId: 'form-1'
      });

      expect(event.type).toBe(FormComponentEventType.FIELD_FOCUS_REQUEST);
      expect(event.fieldId).toBe('email');
      expect(event.lineagePath).toEqual(['email']);
      expect(event.source).toBe('validation-summary');
      expect(event.sourceId).toBe('form-1');
    });

    it('should throw when lineage focus request omits lineagePath', () => {
      expect(() => createLineageFieldFocusRequestEvent({
        fieldId: 'email',
        lineagePath: [],
        sourceId: 'form-1'
      })).toThrow();
    });

    it('should create form save requested events via helper', () => {
      const event = createFormSaveRequestedEvent({
        force: true,
        enabledValidationGroups: ["all"],
        targetStep: 'review',
        sourceId: 'button-1'
      });

      expect(event.type).toBe(FormComponentEventType.FORM_SAVE_REQUESTED);
      expect(event.force).toBe(true);
      expect(event.enabledValidationGroups).toEqual(["all"]);
      expect(event.targetStep).toBe('review');
      expect(event.sourceId).toBe('button-1');
    });

    it('should create form save execute events via helper', () => {
      const event = createFormSaveExecuteEvent({
        force: false,
        enabledValidationGroups: ["all"],
        targetStep: 'submit',
        sourceId: 'effect-1'
      });

      expect(event.type).toBe(FormComponentEventType.FORM_SAVE_EXECUTE);
      expect(event.force).toBe(false);
      expect(event.enabledValidationGroups).toEqual(["all"]);
      expect(event.targetStep).toBe('submit');
      expect(event.sourceId).toBe('effect-1');
    });
  });

  describe('Naming Convention (R15.16)', () => {
    it('should follow namespace.domain.action naming pattern', () => {
      expect(FormComponentEventType.FIELD_VALUE_CHANGED).toBe('field.value.changed');
      expect(FormComponentEventType.FIELD_META_CHANGED).toBe('field.meta.changed');
      expect(FormComponentEventType.FIELD_DEPENDENCY_TRIGGER).toBe('field.dependency.trigger');
      expect(FormComponentEventType.FIELD_FOCUS_REQUEST).toBe('field.request.focus');
      expect(FormComponentEventType.FORM_VALIDATION_BROADCAST).toBe('form.validation.broadcast');
      expect(FormComponentEventType.FORM_SAVE_REQUESTED).toBe('form.save.requested');
      expect(FormComponentEventType.FORM_SAVE_EXECUTE).toBe('form.save.execute');
    });
  });

  describe('Performance (R15.11, R15.24)', () => {
    it('should have O(1) publish cost relative to unrelated subscribers', (done) => {
      // Subscribe to different event types
      bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe(() => {});
      bus.select$(FormComponentEventType.FIELD_FOCUS_REQUEST).subscribe(() => {});
      bus.select$(FormComponentEventType.FIELD_META_CHANGED).subscribe(() => {});

      const startTime = performance.now();

      // Publishing to one type should not scan all subscribers
      bus.publish(
        createFieldDependencyTriggerEvent({ fieldId: 'test', dependentFields: [], reason: 'test' })
      );

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should be very fast (< 1ms typically)
      expect(duration).toBeLessThan(10);
      done();
    });
  });
});

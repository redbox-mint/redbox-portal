import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentValueChangeEventConsumer } from './form-component-change-event-consumer';
import {
  createFieldValueChangedEvent,
  FormComponentEventType
} from './form-component-event.types';
import { Subject } from 'rxjs';

describe('FormComponentValueChangeEventConsumer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let consumer: FormComponentValueChangeEventConsumer;
  let eventStream$: Subject<any>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });

    eventStream$ = new Subject();
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['select$', 'scoped']);
    eventBus.select$.and.returnValue(eventStream$.asObservable());
    eventBus.scoped.and.returnValue({} as any); // Mock scoped bus

    consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
  });

  function createOptions(fieldId = 'field-123', initialValue: unknown = 'initial') {
    const control = new FormControl(initialValue);
    const model = { formControl: control };
    const component = {
      model,
      formFieldConfigName: () => fieldId
    } as unknown as FormFieldBaseComponent<unknown>;

    const definition = {
      compConfigJson: { name: fieldId },
      model
    } as unknown as FormFieldCompMapEntry;

    return { control, component, definition };
  }

  it('should update control value when receiving event for this field from another source', () => {
    const { control, component, definition } = createOptions('target-field', 'initial');
    consumer.bind({ component, definition });

    const event = createFieldValueChangedEvent({
      fieldId: 'target-field',
      value: 'updated-value',
      previousValue: 'initial',
      sourceId: 'other-source'
    });

    spyOn(consumer as any, 'consumeEvent');

    eventStream$.next(event);
    
    expect((consumer as any).consumeEvent).toHaveBeenCalledWith(event);
  });

  it('should NOT update control value when receiving event from itself', () => {
    const { control, component, definition } = createOptions('target-field', 'initial');
    consumer.bind({ component, definition });

    const event = createFieldValueChangedEvent({
      fieldId: 'target-field',
      value: 'updated-value',
      previousValue: 'initial',
      sourceId: 'target-field' // Same as fieldId
    });

    spyOn(consumer as any, 'consumeEvent');

    eventStream$.next(event);
    
    expect((consumer as any).consumeEvent).not.toHaveBeenCalled();
  });

  it('should NOT update control value when receiving event for another field', () => {
    const { control, component, definition } = createOptions('target-field', 'initial');
    consumer.bind({ component, definition });

    const event = createFieldValueChangedEvent({
      fieldId: 'other-field',
      value: 'updated-value',
      previousValue: 'initial',
      sourceId: 'other-source'
    });

    eventStream$.next(event);

    expect(control.value).toBe('initial');
  });

  it('should detach subscriptions when destroyed', () => {
    const { control, component, definition } = createOptions('target-field', 'initial');
    consumer.bind({ component, definition });

    consumer.destroy();

    const event = createFieldValueChangedEvent({
      fieldId: 'target-field',
      value: 'updated-value',
      previousValue: 'initial',
      sourceId: 'other-source'
    });

    eventStream$.next(event);

    expect(control.value).toBe('initial');
  });
});

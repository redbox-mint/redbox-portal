import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus, ScopedEventBus } from './form-component-event-bus.service';
import { FormComponentValueChangeEventProducer } from './form-component-change-event-producer';
import {
  FieldValueChangedEvent,
  FormComponentEventResult,
  FormComponentEventType
} from './form-component-event.types';

describe('FormComponentChangeEventProducer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let scopedBus: jasmine.SpyObj<ScopedEventBus>;
  let producer: FormComponentValueChangeEventProducer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });

    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['publish', 'scoped']);
    scopedBus = jasmine.createSpyObj<ScopedEventBus>('ScopedEventBus', ['publish']);
    eventBus.scoped.and.returnValue(scopedBus);

    producer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventProducer(eventBus));
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

  it('should publish value change events to the event bus and scoped channel', () => {
    const { control, component, definition } = createOptions('title', 'original');

    producer.bind({ component, definition });

    control.setValue('updated');

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const eventArgs = eventBus.publish.calls.mostRecent()
      .args[0] as FormComponentEventResult<FieldValueChangedEvent>;
    expect(eventArgs.type).toBe(FormComponentEventType.FIELD_VALUE_CHANGED);
    expect(eventArgs.fieldId).toBe('title');
    expect(eventArgs.value).toBe('updated');
    expect(eventArgs.previousValue).toBe('original');
    expect(eventArgs.sourceId).toBe('*');

    expect(scopedBus.publish).toHaveBeenCalledTimes(1);
    const scopedArgs = scopedBus.publish.calls.mostRecent()
      .args[0] as FormComponentEventResult<FieldValueChangedEvent>;
    expect(scopedArgs.type).toBe(FormComponentEventType.FIELD_VALUE_CHANGED);
    expect(scopedArgs.fieldId).toBe('title');
    expect(scopedArgs.value).toBe('updated');
    expect(scopedArgs.previousValue).toBe('original');
  });

  it('should update the previous value after each change', () => {
    const { control, component, definition } = createOptions('field-a', 'initial');

    producer.bind({ component, definition });

    control.setValue('first-change');
    control.setValue('second-change');

    expect(eventBus.publish).toHaveBeenCalledTimes(2);
    const firstCall = eventBus.publish.calls.argsFor(0)[0] as FormComponentEventResult<FieldValueChangedEvent>;
    const secondCall = eventBus.publish.calls.argsFor(1)[0] as FormComponentEventResult<FieldValueChangedEvent>;
    expect(firstCall.previousValue).toBe('initial');
    expect(firstCall.value).toBe('first-change');
    expect(secondCall.previousValue).toBe('first-change');
    expect(secondCall.value).toBe('second-change');
  });

  it('should detach subscriptions when destroyed', () => {
    const { control, component, definition } = createOptions('field-b', 'initial');

    producer.bind({ component, definition });
    control.setValue('first-change');

    producer.destroy();
    eventBus.publish.calls.reset();
    scopedBus.publish.calls.reset();

    control.setValue('second-change');

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(scopedBus.publish).not.toHaveBeenCalled();
  });

  it('should skip binding when the field id cannot be resolved', () => {
    const { control, component, definition } = createOptions('unused', 'start');

    definition.compConfigJson = {} as any;
    definition.name = undefined;
    (component as any).formFieldConfigName = () => undefined;

    producer.bind({ component, definition });

    expect(eventBus.scoped).not.toHaveBeenCalled();

    control.setValue('updated');

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(scopedBus.publish).not.toHaveBeenCalled();
  });
});

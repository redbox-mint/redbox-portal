import { TestBed } from '@angular/core/testing';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus, ScopedEventBus } from './form-component-event-bus.service';
import { FormComponentValueChangeEventProducer } from './form-component-change-event-producer';
import {
  FieldValueChangedEvent,
  FormComponentEventResult,
  FormComponentEventType
} from './form-component-event.types';
import { EMPTY } from 'rxjs';
import { applyExpressionTarget } from '../apply-expression-target';
import { deferControlValueNotifications } from '../control-value-notifications';
import { ControlSetValueOptions } from '../custom-set-value.control';

describe('FormComponentChangeEventProducer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let scopedBus: jasmine.SpyObj<ScopedEventBus>;
  let producer: FormComponentValueChangeEventProducer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });

    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['publish', 'scoped', 'select$']);
    scopedBus = jasmine.createSpyObj<ScopedEventBus>('ScopedEventBus', ['publish']);
    eventBus.scoped.and.returnValue(scopedBus);
    eventBus.select$.and.returnValue(EMPTY);

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

  it('publishes expression changes only after ancestor values are current', async () => {
    const { control, component, definition } = createOptions('title', 'original');
    const parent = new FormGroup({ title: control });
    const root = new FormGroup({ nested: parent });
    const observed: unknown[] = [];
    eventBus.publish.and.callFake(() => { observed.push(root.value); });
    producer.bind({ component, definition });

    await applyExpressionTarget('model.value', 'updated', { model: definition.model }, {
      eventBus,
      logger: TestBed.inject(LoggerService),
    });

    expect(observed).toEqual([{ nested: { title: 'updated' } }]);
    expect(scopedBus.publish).toHaveBeenCalledTimes(1);
    control.setValue('original');
    expect(eventBus.publish.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      value: 'original', previousValue: 'updated',
    }));
  });

  it('preserves user edits and previous values during an asynchronous repeatable write', async () => {
    const options = createOptions('people');
    const control = new FormArray([new FormControl('original')]);
    options.definition.model!.formControl = control;
    let resume!: () => void;
    const pause = new Promise<void>(resolve => { resume = resolve; });
    Object.assign(control, {
      async setCustomValue(_value: unknown, setOptions?: ControlSetValueOptions): Promise<void> {
        control.setValue(['expression'], setOptions);
        await pause;
        control.push(new FormControl('second'), setOptions);
      },
    });
    producer.bind(options);

    const write = applyExpressionTarget('model.value', ['expression', 'second'], {
      model: options.definition.model,
    }, { eventBus, logger: TestBed.inject(LoggerService) });
    control.at(0).setValue('user edit');
    resume();
    await write;

    expect(eventBus.publish.calls.allArgs().map(([event]) => {
      const change = event as FormComponentEventResult<FieldValueChangedEvent>;
      return { value: change.value, previousValue: change.previousValue };
    })).toEqual([
      { value: ['expression'], previousValue: ['original'] },
      { value: ['user edit'], previousValue: ['expression'] },
      { value: ['user edit', 'second'], previousValue: ['user edit'] },
    ]);
    expect(scopedBus.publish).toHaveBeenCalledTimes(3);
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

  it('discards deferred notifications from a previous binding', async () => {
    const oldField = createOptions('old-field');
    const newField = createOptions('new-field');
    producer.bind(oldField);

    await deferControlValueNotifications(oldField.control, async () => {
      oldField.control.setValue('old update');
      producer.bind(newField);
    });

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(scopedBus.publish).not.toHaveBeenCalled();
    newField.control.setValue('new update');
    expect(eventBus.publish.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      fieldId: 'new-field', value: 'new update', previousValue: 'initial',
    }));
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

  it('should not publish an event when value has not changed', () => {
    const { control, component, definition } = createOptions('title', 'original');

    producer.bind({ component, definition });

    control.setValue('original');

    expect(eventBus.publish).toHaveBeenCalledTimes(0);
    const eventArgs = eventBus.publish.calls.mostRecent();
    expect(eventArgs).toBeFalsy();

    expect(scopedBus.publish).toHaveBeenCalledTimes(0);
    const scopedArgs = scopedBus.publish.calls.mostRecent();
    expect(scopedArgs).toBeFalsy();
  });
});

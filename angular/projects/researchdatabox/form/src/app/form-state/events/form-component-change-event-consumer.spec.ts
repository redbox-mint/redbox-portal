import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentValueChangeEventConsumer } from './form-component-change-event-consumer';
import {
  createFieldValueChangedEvent,
  FormComponentEventType,
  FieldValueChangedEvent
} from './form-component-event.types';
import { ExpressionsConditionKind, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { Subject } from 'rxjs';

describe('FormComponentValueChangeEventConsumer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let consumer: FormComponentValueChangeEventConsumer;
  let eventStream$: Subject<FieldValueChangedEvent>;
  let loggerService: jasmine.SpyObj<LoggerService>;

  beforeEach(() => {
    loggerService = jasmine.createSpyObj<LoggerService>('LoggerService', ['debug', 'warn', 'error']);

    TestBed.configureTestingModule({
      providers: [
        { provide: LoggerService, useValue: loggerService }
      ]
    });

    eventStream$ = new Subject();
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['select$']);
    eventBus.select$.and.returnValue(eventStream$.asObservable());
    
    consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
  });

  afterEach(() => {
    consumer.destroy();
  });

  function createSetup(expressions: FormExpressionsConfigFrame[]) {
    const control = new FormControl('');
    const definition = {
      model: { formControl: control },
      expressions: expressions,
      lineagePaths: { formConfig: ['root'] },
      layout: { componentDefinition: { config: {} } },
      component: { componentDefinition: { config: {} } }
    } as unknown as FormFieldCompMapEntry;
    
    const component = {
      formFieldConfigName: () => 'test-field',
      model: { formControl: control }
    } as unknown as FormFieldBaseComponent<unknown>;

    return { control, definition, component };
  }

  it('should subscribe to FIELD_VALUE_CHANGED events when bound', () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update',
      config: {
        target: 'model.value',
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);

    consumer.bind({ component, definition });

    expect(eventBus.select$).toHaveBeenCalledWith(FormComponentEventType.FIELD_VALUE_CHANGED);
  });

  it('should update model value when target is "model.value"', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update',
      config: {
        target: 'model.value',
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const { control, definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'newValue',
      timestamp: Date.now()
    };

    eventStream$.next(event);
    tick();

    expect(control.value).toBe('newValue');
  }));

  it('should not update model value if unchanged', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update',
      config: {
        target: 'model.value',
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const { control, definition, component } = createSetup([expr]);
    control.setValue('sameValue');

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
    const setValueSpy = spyOn(control, 'setValue').and.callThrough();

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'sameValue',
      timestamp: Date.now()
    };

    eventStream$.next(event);
    tick();

    expect(setValueSpy).not.toHaveBeenCalled();
  }));

  it('should update layout config when target starts with "layout."', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'layout-update',
      config: {
        target: 'layout.someProp',
        condition: 'otherField',
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'red',
      timestamp: Date.now()
    };

    eventStream$.next(event);
    tick();

    const config = definition.layout?.componentDefinition?.config as Record<string, unknown>;
    expect(config['someProp']).toBe('red');
  }));

  it('should update component config when target starts with "component."', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'component-update',
      config: {
        target: 'component.someSetting',
        condition: 'otherField',
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'enabled',
      timestamp: Date.now()
    };

    eventStream$.next(event);
    tick();

    const config = definition.component?.componentDefinition?.config as Record<string, unknown>;
    expect(config['someSetting']).toBe('enabled');
  }));

  it('should use template evaluation when hasTemplate is true', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'template-update',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'otherField',
        template: ''
      }
    };
    const { control, definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
    spyOn<any>(consumer, 'evaluateExpressionJSONata').and.returnValue(Promise.resolve('templatedValue'));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'source',
      sourceId: 'source',
      value: 'orig',
      timestamp: Date.now()
    };

    eventStream$.next(event);
    tick();

    expect(consumer['evaluateExpressionJSONata']).toHaveBeenCalledWith(expr, event, 'template');
    expect(control.value).toBe('templatedValue');
  }));

  it('should warn if target is unknown', fakeAsync(() => {
    const expr = {
      name: 'unknown-target',
      config: {
        target: 'unknown.target',
        condition: 'otherField',
        template: ''
      }
    } as unknown as FormExpressionsConfigFrame;
    const { definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'val',
      timestamp: Date.now()
    };

    eventStream$.next(event);
    tick();

    expect(loggerService.warn).toHaveBeenCalled();
  }));

  it('should not consume events if no expressions are defined', () => {
    const { definition, component } = createSetup([]);

    // No expressions means bind returns without subscribing
    expect(() => consumer.bind({ component, definition })).not.toThrow();
    // Ensure no subscription was attempted
    expect(eventBus.select$).not.toHaveBeenCalled();
  });

  it('should clean up subscriptions on destroy', () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'destroy-test',
      config: {
        target: 'model.value',
        condition: 'otherField',
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);

    consumer.bind({ component, definition });
    consumer.destroy();

    // Subsequent events should not be processed
    spyOn<any>(consumer, 'consumeEvent');
    
    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'val',
      timestamp: Date.now()
    };

    eventStream$.next(event);

    expect(consumer['consumeEvent']).not.toHaveBeenCalled();
  });
});

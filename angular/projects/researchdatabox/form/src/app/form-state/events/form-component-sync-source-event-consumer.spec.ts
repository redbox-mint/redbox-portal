import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentSyncSourceEventConsumer } from './form-component-sync-source-event-consumer';
import { FieldValueChangedEvent, FormComponentEventType } from './form-component-event.types';
import { ExpressionsConditionKind, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { Subject } from 'rxjs';
import { CustomSetValueControl } from '../custom-set-value.control';

describe('FormComponentSyncSourceEventConsumer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let consumer: FormComponentSyncSourceEventConsumer;
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

    consumer = TestBed.runInInjectionContext(() => new FormComponentSyncSourceEventConsumer(eventBus));
  });

  afterEach(() => {
    consumer.destroy();
  });

  function createSetup(expressions: FormExpressionsConfigFrame[]) {
    const control = new FormControl<unknown>('');
    const definition = {
      model: { formControl: control },
      expressions,
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
      name: 'sync-source-subscribe',
      config: {
        target: 'model.value',
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        hasTemplate: true,
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);

    consumer.bind({ component, definition });

    expect(eventBus.select$).toHaveBeenCalledWith(FormComponentEventType.FIELD_VALUE_CHANGED);
  });

  it('should NOT update model value when template returns undefined', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'undefined-guard',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const { control, definition, component } = createSetup([expr]);
    control.setValue(['existing row']);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
    spyOn<any>(consumer, 'evaluateExpressionJSONata').and.returnValue(Promise.resolve(undefined));
    const setValueSpy = spyOn(control, 'setValue').and.callThrough();

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: { name: 'typing...', email: null },
      timestamp: Date.now()
    };

    eventStream$.next(event);
    tick();

    expect(setValueSpy).not.toHaveBeenCalled();
    expect(control.value).toEqual(['existing row']);
  }));

  it('should NOT call custom value setter when template returns undefined', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'undefined-guard-custom-setter',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const control = new FormControl<unknown>(['existing']) as FormControl & CustomSetValueControl<unknown>;
    const customSetter = jasmine.createSpy('customSetter').and.resolveTo(undefined);
    control.setCustomValue = customSetter;

    const definition = {
      model: { formControl: control },
      expressions: [expr],
      lineagePaths: { formConfig: ['root'] },
      layout: { componentDefinition: { config: {} } },
      component: { componentDefinition: { config: {} } }
    } as unknown as FormFieldCompMapEntry;
    const component = {
      formFieldConfigName: () => 'test-field',
      model: { formControl: control }
    } as unknown as FormFieldBaseComponent<unknown>;

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
    spyOn<any>(consumer, 'evaluateExpressionJSONata').and.returnValue(Promise.resolve(undefined));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'irrelevant',
      timestamp: Date.now()
    };

    eventStream$.next(event);
    tick();

    expect(customSetter).not.toHaveBeenCalled();
  }));

  it('should still update when template returns null', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'null-is-valid',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const { control, definition, component } = createSetup([expr]);
    control.setValue('existing');

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
    spyOn<any>(consumer, 'evaluateExpressionJSONata').and.returnValue(Promise.resolve(null));

    consumer.bind({ component, definition });

    eventStream$.next({
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'ignored',
      timestamp: Date.now()
    });
    tick();

    expect(control.value).toBeNull();
  }));

  it('should still update when template returns empty array', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'empty-array-is-valid',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const { control, definition, component } = createSetup([expr]);
    control.setValue(['existing']);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
    spyOn<any>(consumer, 'evaluateExpressionJSONata').and.returnValue(Promise.resolve([]));

    consumer.bind({ component, definition });

    eventStream$.next({
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'ignored',
      timestamp: Date.now()
    });
    tick();

    expect(control.value).toEqual([]);
  }));

  it('should update model value when template returns a defined array', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'defined-array-update',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const { control, definition } = createSetup([expr]);
    const syncDisplayFromModel = jasmine.createSpy('syncDisplayFromModel').and.resolveTo(undefined);
    const component = {
      formFieldConfigName: () => 'test-field',
      model: { formControl: control },
      syncDisplayFromModel
    } as unknown as FormFieldBaseComponent<unknown>;
    const targetValue = [{ email: 'person@example.com', role: ['View&Edit'] }];

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
    spyOn<any>(consumer, 'evaluateExpressionJSONata').and.returnValue(Promise.resolve(targetValue));

    consumer.bind({ component, definition });

    eventStream$.next({
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: { email: 'person@example.com' },
      timestamp: Date.now()
    });
    tick();

    expect(control.value).toEqual(targetValue);
    expect(syncDisplayFromModel).toHaveBeenCalled();
  }));
});

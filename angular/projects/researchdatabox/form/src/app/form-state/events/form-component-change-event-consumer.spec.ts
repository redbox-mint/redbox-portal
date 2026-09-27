import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentValueChangeEventConsumer } from './form-component-change-event-consumer';
import { createFieldValueChangedEvent, FormComponentEventType, FieldValueChangedEvent } from './form-component-event.types';
import { FormComponentValueChangeEventProducer } from './form-component-change-event-producer';
import { ExpressionsConditionKind, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { Subject } from 'rxjs';
import { CustomSetValueControl } from '../custom-set-value.control';
import { createSetup } from './spec-helper';

describe('FormComponentValueChangeEventConsumer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let consumer: FormComponentValueChangeEventConsumer;
  let eventStream$: Subject<FieldValueChangedEvent>;
  let loggerService: jasmine.SpyObj<LoggerService>;

  beforeEach(() => {
    loggerService = jasmine.createSpyObj<LoggerService>('LoggerService', ['debug', 'warn', 'error']);

    TestBed.configureTestingModule({
      providers: [{ provide: LoggerService, useValue: loggerService }],
    });

    eventStream$ = new Subject();
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['select$', 'publish']);
    eventBus.select$.and.returnValue(eventStream$.asObservable());

    consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
  });

  afterEach(() => {
    consumer.destroy();
  });

  it('should subscribe to FIELD_VALUE_CHANGED events when bound', () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update',
      config: {
        target: 'model.value',
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: '',
      },
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
        template: '',
      },
    };
    const { control, definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'newValue',
      timestamp: Date.now(),
    };

    eventStream$.next(event);
    tick();

    expect(control.value).toBe('newValue');
  }));

  it('should broadcast form status after silent model updates', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update-broadcast-status',
      config: {
        target: 'model.value',
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: '',
      },
    };
    const { control, definition, component } = createSetup([expr]);
    control.addValidators(Validators.required);
    control.updateValueAndValidity();
    const formComponent = {
      getQuerySource: () => undefined,
      broadcastFormStatus: jasmine.createSpy('broadcastFormStatus'),
    };

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
    consumer.formComponent = formComponent as any;

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'newValue',
      timestamp: Date.now(),
    };

    eventStream$.next(event);
    tick();

    expect(control.value).toBe('newValue');
    expect(control.valid).toBeTrue();
    expect(formComponent.broadcastFormStatus).toHaveBeenCalledTimes(1);
  }));

  it('should not update model value if unchanged', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update',
      config: {
        target: 'model.value',
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: '',
      },
    };
    const { control, definition, component } = createSetup([expr]);
    control.setValue('sameValue');
    const formComponent = {
      getQuerySource: () => undefined,
      broadcastFormStatus: jasmine.createSpy('broadcastFormStatus'),
    };

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
    const setValueSpy = spyOn(control, 'setValue').and.callThrough();
    consumer.formComponent = formComponent as any;

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'sameValue',
      timestamp: Date.now(),
    };

    eventStream$.next(event);
    tick();

    expect(setValueSpy).not.toHaveBeenCalled();
    expect(formComponent.broadcastFormStatus).not.toHaveBeenCalled();
  }));

  it('should resync component display after silent model updates', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update-display-sync',
      config: {
        target: 'model.value',
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: '',
      },
    };
    const { control, definition } = createSetup([expr]);
    const syncDisplayFromModel = jasmine.createSpy('syncDisplayFromModel').and.resolveTo();
    const component = {
      formFieldConfigName: () => 'test-field',
      model: { formControl: control },
      syncDisplayFromModel,
    } as unknown as FormFieldBaseComponent<unknown>;

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'newValue',
      timestamp: Date.now(),
    };

    eventStream$.next(event);
    tick();

    expect(control.value).toBe('newValue');
    expect(syncDisplayFromModel).toHaveBeenCalled();
  }));

  it('should resync nested child component displays after silent group updates', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'group-model-update-display-sync',
      config: {
        target: 'model.value',
        condition: 'otherField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: '',
      },
    };
    const control = new FormControl({ name: '' });
    const definition = {
      model: { formControl: control },
      expressions: [expr],
      lineagePaths: { formConfig: ['root'] },
      layout: { componentDefinition: { config: {} } },
      component: { componentDefinition: { config: {} } },
    } as unknown as FormFieldCompMapEntry;
    const syncDisplayFromModel = jasmine.createSpy('syncDisplayFromModel').and.resolveTo();
    const component = {
      formFieldConfigName: () => 'test-group',
      model: { formControl: control },
      formFieldBaseComponents: [
        {
          syncDisplayFromModel,
        },
      ],
    } as unknown as FormFieldBaseComponent<unknown>;

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: { name: 'Alice Scott' },
      timestamp: Date.now(),
    };

    eventStream$.next(event);
    tick();

    expect(control.value).toEqual({ name: 'Alice Scott' });
    expect(syncDisplayFromModel).toHaveBeenCalled();
  }));

  describe('target updates', async () => {
    it('should update layout config when target starts with "layout."', fakeAsync(() => {
      const expr: FormExpressionsConfigFrame = {
        name: 'layout-update',
        config: {
          target: 'layout.disabled',
          condition: 'otherField',
          template: '',
        },
      };
      const { definition, component } = createSetup([expr]);

      spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
      const layoutSetPropertySpy = spyOn<any>(definition?.layout, 'setProperty');
      const componentSetPropertySpy = spyOn<any>(definition?.component, 'setProperty');
      const modelSetDisabledSpy = spyOn<any>(component?.model, 'setDisabled');

      consumer.bind({ component, definition });

      const event: FieldValueChangedEvent = {
        type: 'field.value.changed',
        fieldId: 'otherField',
        sourceId: 'otherField',
        value: 'enabled',
        timestamp: Date.now(),
      };

      eventStream$.next(event);
      tick();

      expect(layoutSetPropertySpy).toHaveBeenCalledOnceWith('disabled', 'enabled');
      expect(componentSetPropertySpy).toHaveBeenCalledTimes(0);
      expect(modelSetDisabledSpy).toHaveBeenCalledTimes(0);
    }));

    it('should update component config when target starts with "component."', fakeAsync(() => {
      const expr: FormExpressionsConfigFrame = {
        name: 'component-update',
        config: {
          target: 'component.someSetting',
          condition: 'otherField',
          template: '',
        },
      };
      const { definition, component } = createSetup([expr]);

      spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
      const layoutSetPropertySpy = spyOn<any>(definition?.layout, 'setProperty');
      const componentSetPropertySpy = spyOn<any>(definition?.component, 'setProperty');
      const modelSetDisabledSpy = spyOn<any>(component?.model, 'setDisabled');

      consumer.bind({ component, definition });

      const event: FieldValueChangedEvent = {
        type: 'field.value.changed',
        fieldId: 'otherField',
        sourceId: 'otherField',
        value: 'enabled',
        timestamp: Date.now(),
      };

      eventStream$.next(event);
      tick();

      expect(layoutSetPropertySpy).toHaveBeenCalledTimes(0);
      expect(componentSetPropertySpy).toHaveBeenCalledOnceWith('someSetting', 'enabled');
      expect(modelSetDisabledSpy).toHaveBeenCalledTimes(0);
    }));

    it('should update component config and formControl.disabled when target is "component.disabled"', fakeAsync(() => {
      const expr: FormExpressionsConfigFrame = {
        name: 'component-update',
        config: {
          target: 'component.disabled',
          condition: 'otherField',
          template: '',
        },
      };
      const { control, definition, component } = createSetup([expr]);

      spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
      const layoutSetPropertySpy = spyOn<any>(definition?.layout, 'setProperty');
      const componentSetPropertySpy = spyOn<any>(definition?.component, 'setProperty');
      const modelSetDisabledSpy = spyOn<any>(component?.model, 'setDisabled');

      consumer.bind({ component, definition });

      const event: FieldValueChangedEvent = {
        type: 'field.value.changed',
        fieldId: 'otherField',
        sourceId: 'otherField',
        value: 'enabled',
        timestamp: Date.now(),
      };

      eventStream$.next(event);
      tick();

      expect(layoutSetPropertySpy).toHaveBeenCalledTimes(0);
      // The component.setProperty method has a special case for 'disabled' that also calls model.setDisabled.
      expect(componentSetPropertySpy).toHaveBeenCalledOnceWith('disabled', 'enabled');
      expect(modelSetDisabledSpy).toHaveBeenCalledTimes(0);
    }));
    it('should update model disabled when target is model.disabled', fakeAsync(() => {
      const expr: FormExpressionsConfigFrame = {
        name: 'model-disabled-update',
        config: {
          target: 'model.disabled',
          condition: 'otherField',
          template: '',
        },
      };
      const { definition, component } = createSetup([expr]);

      spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
      const layoutSetPropertySpy = spyOn<any>(definition?.layout, 'setProperty');
      const componentSetPropertySpy = spyOn<any>(definition?.component, 'setProperty');
      const modelSetDisabledSpy = spyOn<any>(component?.model, 'setDisabled');

      consumer.bind({ component, definition });

      const event: FieldValueChangedEvent = {
        type: 'field.value.changed',
        fieldId: 'otherField',
        sourceId: 'otherField',
        value: 'enabled',
        timestamp: Date.now(),
      };

      eventStream$.next(event);
      tick();

      expect(layoutSetPropertySpy).toHaveBeenCalledTimes(0);
      expect(componentSetPropertySpy).toHaveBeenCalledTimes(0);
      expect(modelSetDisabledSpy).toHaveBeenCalledOnceWith(true, { emitEvent: false, onlySelf: true });
    }));
    it('should update component, layout, model disabled when target is field.disabled', fakeAsync(() => {
      const expr: FormExpressionsConfigFrame = {
        name: 'field-disabled-update',
        config: {
          target: 'field.disabled',
          condition: 'otherField',
          template: '',
        },
      };
      const { definition, component } = createSetup([expr]);

      spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
      const layoutSetPropertySpy = spyOn<any>(definition?.layout, 'setProperty');
      const componentSetPropertySpy = spyOn<any>(definition?.component, 'setProperty');
      const modelSetDisabledSpy = spyOn<any>(component?.model, 'setDisabled');

      consumer.bind({ component, definition });

      const event: FieldValueChangedEvent = {
        type: 'field.value.changed',
        fieldId: 'otherField',
        sourceId: 'otherField',
        value: 'enabled',
        timestamp: Date.now(),
      };

      eventStream$.next(event);
      tick();

      expect(layoutSetPropertySpy).toHaveBeenCalledOnceWith('disabled', true);
      expect(componentSetPropertySpy).toHaveBeenCalledOnceWith('disabled', true);
      expect(modelSetDisabledSpy).toHaveBeenCalledOnceWith(true, { emitEvent: false, onlySelf: true });
    }));
    it('should update component and layout visible when target is field.visible', fakeAsync(() => {
      const expr: FormExpressionsConfigFrame = {
        name: 'field-disabled-update',
        config: {
          target: 'field.visible',
          condition: 'otherField',
          template: '',
        },
      };
      const { definition, component } = createSetup([expr]);

      spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));
      const layoutSetPropertySpy = spyOn<any>(definition?.layout, 'setProperty');
      const componentSetPropertySpy = spyOn<any>(definition?.component, 'setProperty');
      const modelSetDisabledSpy = spyOn<any>(component?.model, 'setDisabled');

      consumer.bind({ component, definition });

      const event: FieldValueChangedEvent = {
        type: 'field.value.changed',
        fieldId: 'otherField',
        sourceId: 'otherField',
        value: false,
        timestamp: Date.now(),
      };

      eventStream$.next(event);
      tick();

      expect(layoutSetPropertySpy).toHaveBeenCalledOnceWith('visible', false);
      expect(componentSetPropertySpy).toHaveBeenCalledOnceWith('visible', false);
      expect(modelSetDisabledSpy).toHaveBeenCalledTimes(0);
    }));
  });

  it('should use template evaluation when hasTemplate is true', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'template-update',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'otherField',
        template: '',
      },
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
      timestamp: Date.now(),
    };

    eventStream$.next(event);
    tick();

    expect(consumer['evaluateExpressionJSONata']).toHaveBeenCalledWith(expr, event, 'template');
    expect(control.value).toBe('templatedValue');
  }));

  it('should fall back to original event data when structuredClone fails but still evaluate JSONata', async () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'template-clone-fallback',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'source',
        template: '',
      },
    };
    const { definition, component } = createSetup([expr]);
    const evaluateSpy = jasmine.createSpy('evaluate').and.resolveTo('templatedValue');

    (consumer as any).options = { component, definition };
    (consumer as any).expressions = [expr];
    (consumer as any).formComp = {
      form: {
        value: {
          source: {
            bad: () => 'not cloneable 1',
          },
        },
      },
    };
    spyOn<any>(consumer, 'getCompiledItems').and.resolveTo({ evaluate: evaluateSpy });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'source',
      sourceId: 'source',
      value: {
        bad: () => 'not cloneable 2',
      },
      timestamp: Date.now(),
    };

    const result = await (consumer as any).evaluateExpressionJSONata(expr, event, 'template');

    expect(result).toBe('templatedValue');
    expect(evaluateSpy).toHaveBeenCalled();
    expect(loggerService.warn).toHaveBeenCalledTimes(3);
    expect(loggerService.warn.calls.allArgs().map(args => [args[0], args[1]?.toString()])).toEqual([
      [
        'FormComponentValueChangeEventConsumer: Failed to clone value for JSONata context. Falling back to the original value.',
        "DataCloneError: Failed to execute 'structuredClone' on 'Window': () => 'not cloneable 1' could not be cloned.",
      ],
      [
        'FormComponentValueChangeEventConsumer: Failed to clone event for JSONata context. Falling back to the original value.',
        "DataCloneError: Failed to execute 'structuredClone' on 'Window': () => 'not cloneable 2' could not be cloned.",
      ],
      [
        'FormComponentValueChangeEventConsumer: Failed to clone formData for JSONata context. Falling back to the original value.',
        "DataCloneError: Failed to execute 'structuredClone' on 'Window': () => 'not cloneable 1' could not be cloned.",
      ],
    ]);
    expect(loggerService.error).not.toHaveBeenCalled();

    const [templateKey, context] = evaluateSpy.calls.mostRecent().args;
    expect(templateKey).toEqual(['root', 'expressions', 0, 'config', 'template']);
    expect(context.event).toBe(event);
    expect(context.formData).toBe((consumer as any).formComp.form.value);
    expect(context.value).toBe((consumer as any).formComp.form.value.source);
  });

  it('should evaluate JSONata with raw form values so disabled fields are available', async () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'template-raw-form-value',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'source',
        template: '',
      },
    };
    const { definition, component } = createSetup([expr]);
    const evaluateSpy = jasmine.createSpy('evaluate').and.resolveTo('templatedValue');
    const rawValue = {
      source: 'raw source',
      citation_publication_date: '2026-06-10T00:00:00.000Z',
    };

    (consumer as any).options = { component, definition };
    (consumer as any).expressions = [expr];
    (consumer as any).formComp = {
      form: {
        value: {
          source: 'enabled source',
        },
        getRawValue: () => rawValue,
      },
    };
    spyOn<any>(consumer, 'getCompiledItems').and.resolveTo({ evaluate: evaluateSpy });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'source',
      sourceId: 'source',
      value: 'event source',
      timestamp: Date.now(),
    };

    await (consumer as any).evaluateExpressionJSONata(expr, event, 'template');

    const [, context] = evaluateSpy.calls.mostRecent().args;
    expect(context.formData).toEqual(rawValue);
    expect(context.value).toBe('raw source');
  });

  it('should normalize a plain field name to a JSON Pointer for context.value lookup', async () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'template-plain-field-name',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'source',
        template: '',
      },
    };
    const { definition, component } = createSetup([expr]);
    const evaluateSpy = jasmine.createSpy('evaluate').and.resolveTo('templatedValue');
    const rawValue = {
      source: 'plain-name value',
    };

    (consumer as any).options = { component, definition };
    (consumer as any).expressions = [expr];
    (consumer as any).formComp = {
      form: {
        value: rawValue,
        getRawValue: () => rawValue,
      },
    };
    spyOn<any>(consumer, 'getCompiledItems').and.resolveTo({ evaluate: evaluateSpy });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'source',
      sourceId: 'source',
      value: 'event source',
      timestamp: Date.now(),
    };

    await (consumer as any).evaluateExpressionJSONata(expr, event, 'template');

    const [, context] = evaluateSpy.calls.mostRecent().args;
    expect(context.value).toBe('plain-name value');
  });

  it('should quietly fall back to the flat field value when the event fieldId is a config path', async () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'template-config-path-field-name',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: '/mainTab/about/dataRecord',
        template: '',
      },
    };
    const { definition, component } = createSetup([expr]);
    const evaluateSpy = jasmine.createSpy('evaluate').and.resolveTo('templatedValue');
    const dataRecord = { oid: 'record-1', title: 'Selected record' };
    const rawValue = {
      dataRecord,
    };

    (consumer as any).options = { component, definition };
    (consumer as any).expressions = [expr];
    (consumer as any).formComp = {
      form: {
        value: rawValue,
        getRawValue: () => rawValue,
      },
    };
    spyOn<any>(consumer, 'getCompiledItems').and.resolveTo({ evaluate: evaluateSpy });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: '/mainTab/about/dataRecord',
      sourceId: '/mainTab/about/dataRecord',
      value: dataRecord,
      timestamp: Date.now(),
    };

    await (consumer as any).evaluateExpressionJSONata(expr, event, 'template');

    const [, context] = evaluateSpy.calls.mostRecent().args;
    expect(context.value).toEqual(dataRecord);
    expect(loggerService.error).not.toHaveBeenCalled();
  });

  it('should include requestParams in JSONata evaluation context', async () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'template-request-params',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'source',
        template: '',
      },
    };
    const { definition, component } = createSetup([expr]);
    const evaluateSpy = jasmine.createSpy('evaluate').and.resolveTo('templatedValue');

    (consumer as any).options = { component, definition };
    (consumer as any).expressions = [expr];
    (consumer as any).formComp = {
      form: {
        value: {
          source: 'current',
        },
      },
      requestParams: () => ({
        focusTabId: 'tab2',
      }),
    };
    spyOn<any>(consumer, 'getCompiledItems').and.resolveTo({ evaluate: evaluateSpy });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'source',
      sourceId: '*',
      value: 'orig',
      timestamp: Date.now(),
    };

    await (consumer as any).evaluateExpressionJSONata(expr, event, 'template');

    const [, context] = evaluateSpy.calls.mostRecent().args;
    expect(context.requestParams).toEqual({ focusTabId: 'tab2' });
    expect(context.runtimeContext).toEqual({ requestParams: { focusTabId: 'tab2' } });
  });

  it('should expose JSONataQuery runtime context under named properties', async () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'jsonata-query-request-params',
      config: {
        target: 'model.value',
        condition: '$exists(runtimeContext.requestParams.focusTabId) and querySource[0].name = "parent"',
        conditionKind: ExpressionsConditionKind.JSONataQuery,
        template: '',
      },
    };
    const evaluateExpressionSpy = spyOn<any>(consumer, 'evaluateExpressionJSONata').and.resolveTo(true);
    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'source',
      sourceId: '*',
      value: 'orig',
      timestamp: Date.now(),
    };

    const matched = await (consumer as any).hasMatchedJSONataQueryCondition(
      {
        condition: expr.config.condition || '',
        conditionKind: ExpressionsConditionKind.JSONataQuery,
        expression: expr,
        event,
        querySource: {
          queryOrigSource: [],
          querySource: [{ name: 'parent' }],
          jsonPointerSource: {},
          runtimeContext: {
            requestParams: {
              focusTabId: 'tab2',
            },
          },
          event,
        },
      },
      expr
    );

    expect(matched).toBeTrue();
    expect(evaluateExpressionSpy).toHaveBeenCalledWith(expr, event, 'condition', {
      querySource: [{ name: 'parent' }],
      runtimeContext: {
        requestParams: {
          focusTabId: 'tab2',
        },
      },
    });
  });

  it('should warn if target is unknown', fakeAsync(() => {
    const expr = {
      name: 'unknown-target',
      config: {
        target: 'unknown.target',
        condition: 'otherField',
        template: '',
      },
    } as unknown as FormExpressionsConfigFrame;
    const { definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'val',
      timestamp: Date.now(),
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

  it('should return expression from getMatchedExpressions if condition is undefined or null', async () => {
    const exprUndefined: FormExpressionsConfigFrame = {
      name: 'undefined-condition',
      config: {
        target: 'model.value',
        condition: undefined,
        template: '',
      },
    };
    const exprNull: FormExpressionsConfigFrame = {
      name: 'null-condition',
      config: {
        target: 'model.value',
        condition: null as any,
        template: '',
      },
    };
    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: 'val',
      timestamp: Date.now(),
    };

    const matched = await (consumer as any).getMatchedExpressions(event, [exprUndefined, exprNull]);

    expect(matched).toBeTruthy();
    expect(matched.length).toBe(2);
    expect(matched).toContain(exprUndefined);
    expect(matched).toContain(exprNull);
  });

  it('should clean up subscriptions on destroy', () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'destroy-test',
      config: {
        target: 'model.value',
        condition: 'otherField',
        template: '',
      },
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
      timestamp: Date.now(),
    };

    eventStream$.next(event);

    expect(consumer['consumeEvent']).not.toHaveBeenCalled();
  });

  it('should use a custom control value setter when one is registered', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'custom-control-setter',
      config: {
        target: 'model.value',
        condition: 'otherField',
        template: '',
      },
    };
    const control = new FormControl('existing') as FormControl & CustomSetValueControl<unknown>;
    const customSetter = jasmine.createSpy('customSetter').and.resolveTo(undefined);
    control.setCustomValue = customSetter;
    const setValueSpy = spyOn(control, 'setValue').and.callThrough();
    const definition = {
      model: { formControl: control },
      expressions: [expr],
      lineagePaths: { formConfig: ['root'] },
      layout: { componentDefinition: { config: {} } },
      component: { componentDefinition: { config: {} } },
    } as unknown as FormFieldCompMapEntry;

    const component = {
      formFieldConfigName: () => 'test-field',
      model: { formControl: control },
    } as unknown as FormFieldBaseComponent<unknown>;

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(Promise.resolve([expr]));

    consumer.bind({ component, definition });

    const event: FieldValueChangedEvent = {
      type: 'field.value.changed',
      fieldId: 'otherField',
      sourceId: 'otherField',
      value: [{ name: 'new row' }],
      timestamp: Date.now(),
    };

    eventStream$.next(event);
    tick();

    expect(customSetter).toHaveBeenCalledWith([{ name: 'new row' }], { emitEvent: true, onlySelf: true });
    expect(setValueSpy).not.toHaveBeenCalled();
  }));

  describe('expression feedback loops', () => {
    let bus: FormComponentEventBus;
    const bindings: { destroy(): void }[] = [];
    const expression = (name: string): FormExpressionsConfigFrame => ({
      name,
      config: { target: 'model.value', hasTemplate: true, template: '', condition: 'true', conditionKind: ExpressionsConditionKind.JSONata },
    });

    beforeEach(() => {
      bus = TestBed.inject(FormComponentEventBus);
    });

    afterEach(() => {
      bindings.forEach(binding => binding.destroy());
      bindings.length = 0;
    });

    function bindField(
      name: string,
      initialValue: string,
      matches: (event: FieldValueChangedEvent) => boolean,
      template: (event: FieldValueChangedEvent) => unknown
    ) {
      const setup = createSetup({ expressions: [expression(name)], initialFormControlValue: initialValue });
      (setup.definition as { name?: string }).name = name;
      const producer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventProducer(bus));
      const fieldConsumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(bus));
      spyOn<any>(fieldConsumer, 'getMatchedExpressions').and.callFake(
        async (event: FieldValueChangedEvent, candidates: FormExpressionsConfigFrame[]) =>
          candidates.length > 0 && matches(event) ? candidates : null
      );
      let evaluations = 0;
      const evaluate = spyOn<any>(fieldConsumer, 'evaluateExpressionJSONata').and.callFake(
        async (_expr: FormExpressionsConfigFrame, event: FieldValueChangedEvent) => {
          if (++evaluations > 10) throw new Error('Expression cycle did not settle');
          return template(event);
        }
      );
      producer.bind({ component: setup.component, definition: setup.definition });
      fieldConsumer.bind({ component: setup.component, definition: setup.definition });
      bindings.push(producer, fieldConsumer);
      return { ...setup, evaluate };
    }

    it('does not re-trigger a broadcast-matching expression from its own write', fakeAsync(() => {
      // Mirrors a JSONata condition, which matches every broadcast event.
      const text2 = bindField('text_2', 'start', event => event.sourceId === '*', () => `${text2.control.value}__suffix`);

      bus.publish(createFieldValueChangedEvent({ fieldId: 'text_1', sourceId: '*', value: 'changed' }));
      tick();

      expect(text2.control.value).toBe('start__suffix');
      expect(text2.evaluate).toHaveBeenCalledTimes(1);
    }));

    it('stops cross-field expression cycles after one pass without blocking later edits', fakeAsync(() => {
      const fromOther = (other: string) => (event: FieldValueChangedEvent) => event.sourceId === '*' && event.fieldId === other;
      const a = bindField('a', '', fromOther('b'), event => `${event.value}+`);
      const b = bindField('b', '', fromOther('a'), event => `${event.value}+`);

      a.control.setValue('x');
      tick();
      expect(b.control.value).toBe('x+');
      expect(a.control.value).toBe('x++');

      a.control.setValue('y');
      tick();
      expect(b.control.value).toBe('y+');
      expect(a.control.value).toBe('y++');
    }));

    it('does not re-trigger from a change an asynchronous setter makes after awaiting', fakeAsync(() => {
      const text2 = bindField('text_2', 'start', event => event.sourceId === '*', () => `${text2.control.value}__suffix`);
      const control = text2.control as FormControl & CustomSetValueControl<unknown>;
      const setter = jasmine.createSpy('setCustomValue').and.callFake(async (value: unknown, options?: object) => {
        await Promise.resolve();
        control.setValue(value as string, options);
      });
      control.setCustomValue = setter;

      bus.publish(createFieldValueChangedEvent({ fieldId: 'text_1', sourceId: '*', value: 'changed' }));
      tick();

      expect(control.value).toBe('start__suffix');
      expect(setter).toHaveBeenCalledTimes(1);
    }));

    it('reacts to independent edits made while its asynchronous write is pending', fakeAsync(() => {
      const fromSelf = (event: FieldValueChangedEvent) => event.sourceId === '*' && event.fieldId === 'title';
      const title = bindField('title', '', fromSelf, event => String(event.value).toUpperCase());
      const control = title.control as FormControl & CustomSetValueControl<unknown>;
      const pendingWrites: (() => void)[] = [];
      control.setCustomValue = async (value, options) => {
        control.setValue(value as string, options);
        await new Promise<void>(resolve => pendingWrites.push(resolve));
      };

      control.setValue('first');
      tick();
      expect(control.value).toBe('FIRST');

      // The write is still awaiting; this user edit must not inherit its causal chain.
      control.setValue('second');
      tick();
      expect(control.value).toBe('SECOND');
      pendingWrites.forEach(resume => resume());
      tick();
      expect(control.value).toBe('SECOND');
    }));

    it('processes an independent edit that matches a pending expression target', fakeAsync(() => {
      const fromSelf = (event: FieldValueChangedEvent) => event.sourceId === '*' && event.fieldId === 'title';
      const title = bindField('title', '', fromSelf, event => `${event.value}_suffix`);
      const control = title.control as FormControl & CustomSetValueControl<unknown>;
      let finish!: () => void;
      const pause = new Promise<void>(resolve => { finish = resolve; });
      control.setCustomValue = async (value, options) => {
        await pause;
        control.setValue(value as string, options);
      };
      const published: FieldValueChangedEvent[] = [];
      const sub = bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe(event => {
        if (event.sourceId === '*') published.push(event);
      });

      control.setValue('user');
      tick();
      expect(title.evaluate).toHaveBeenCalledTimes(1);
      // A user edit to the pending write's target, before the setter has resumed.
      control.setValue('user_suffix');
      tick();
      expect(title.evaluate).toHaveBeenCalledTimes(2);
      expect(published.find(event => event.value === 'user_suffix')?.expressionChain).toBeUndefined();
      finish();
      tick();
      sub.unsubscribe();

      expect(control.value).toBe('user_suffix_suffix');
      expect(title.evaluate).toHaveBeenCalledTimes(2);
    }));

    it('does not re-trigger from an asynchronous setter that normalises its input', fakeAsync(() => {
      const fromSelf = (event: FieldValueChangedEvent) => event.sourceId === '*' && event.fieldId === 'title';
      const title = bindField('title', '', fromSelf, event => `${event.value}_suffix`);
      const control = title.control as FormControl & CustomSetValueControl<unknown>;
      let writes = 0;
      control.setCustomValue = async (value, options) => {
        await Promise.resolve();
        writes++;
        control.setValue(String(value).toUpperCase(), options);
      };

      control.setValue('user');
      tick();

      expect(writes).toBe(1);
      expect(control.value).toBe('USER_SUFFIX');
    }));

    it('attributes child notifications from an asynchronous group setter to the write', fakeAsync(() => {
      const a = createSetup({ initialFormControlValue: '' });
      const b = createSetup({ initialFormControlValue: '' });
      (a.definition as { name?: string }).name = 'a';
      (b.definition as { name?: string }).name = 'b';
      const group = new FormGroup({ a: a.control, b: b.control }) as FormGroup & CustomSetValueControl<unknown>;
      let writes = 0;
      group.setCustomValue = async (value, options) => {
        await Promise.resolve();
        writes++;
        group.setValue(value as { a: string; b: string }, options);
      };
      const host = createSetup({ expressions: [expression('group')] });
      (host.definition as { name?: string }).name = 'group';
      Object.assign(host.model, { formControl: group });
      const producers = [a, b, host].map(field => {
        const producer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventProducer(bus));
        producer.bind({ component: field.component, definition: field.definition });
        return producer;
      });
      const groupConsumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(bus));
      // Matches every broadcast, including the children's own notifications.
      spyOn<any>(groupConsumer, 'getMatchedExpressions').and.callFake(
        async (event: FieldValueChangedEvent, candidates: FormExpressionsConfigFrame[]) =>
          candidates.length > 0 && event.sourceId === '*' ? candidates : null
      );
      spyOn<any>(groupConsumer, 'evaluateExpressionJSONata').and.callFake(async () => {
        if (writes > 10) throw new Error('Expression cycle did not settle');
        return { a: `${group.value.a}!`, b: `${group.value.b}!` };
      });
      groupConsumer.bind({ component: host.component, definition: host.definition });
      bindings.push(...producers, groupConsumer);
      const published: FieldValueChangedEvent[] = [];
      const sub = bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe(event => {
        if (event.sourceId === '*') published.push(event);
      });

      bus.publish(createFieldValueChangedEvent({ fieldId: 'source', sourceId: '*', value: 'changed' }));
      tick();
      sub.unsubscribe();

      expect(writes).toBe(1);
      expect(group.value).toEqual({ a: '!', b: '!' });
      const childEvents = published.filter(event => event.fieldId === 'a' || event.fieldId === 'b');
      expect(childEvents.length).toBe(2);
      expect(childEvents.every(event => event.expressionChain?.length === 1)).toBeTrue();
    }));

    it('carries the triggering behaviour chain into expression-driven notifications', fakeAsync(() => {
      const target = bindField('target', '', event => event.fieldId === 'source', event => event.value);
      const published: FieldValueChangedEvent[] = [];
      const sub = bus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe(event => published.push(event));

      bus.publish(createFieldValueChangedEvent({ fieldId: 'source', sourceId: '*', value: 'v', behaviourChain: [7] }));
      tick();
      sub.unsubscribe();

      expect(target.control.value).toBe('v');
      const notification = published.find(event => event.fieldId === 'target' && event.sourceId === '*');
      expect(notification?.behaviourChain).toEqual([7]);
      expect(notification?.expressionChain?.length).toBe(1);
    }));
  });
});

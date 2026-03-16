import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentUIAttributeChangeEventConsumer } from './form-component-ui-attribute-change-event-consumer';
import {
  FormComponentEventType,
  FieldUIAttributeChangedEvent
} from './form-component-event.types';
import { ExpressionsConditionKind, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { Subject } from 'rxjs';

describe('FormComponentUIAttributeChangeEventConsumer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let consumer: FormComponentUIAttributeChangeEventConsumer;
  let eventStream$: Subject<FieldUIAttributeChangedEvent>;
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

    consumer = TestBed.runInInjectionContext(() => new FormComponentUIAttributeChangeEventConsumer(eventBus));
  });

  afterEach(() => {
    consumer.destroy();
  });

  function createSetup(expressions: FormExpressionsConfigFrame[]) {
    const control = new FormControl<any>('');
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

  function createUIEvent(overrides: Partial<FieldUIAttributeChangedEvent> = {}): FieldUIAttributeChangedEvent {
    return {
      type: 'field.ui-attribute.changed',
      fieldId: 'sourceField',
      sourceId: 'sourceField',
      meta: { visible: false, readonly: false, disabled: false },
      timestamp: Date.now(),
      ...overrides
    };
  }

  it('should subscribe to FIELD_UI_ATTRIBUTE_CHANGED events when bound', () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update',
      config: {
        target: 'model.value',
        condition: 'sourceField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);

    consumer.bind({ component, definition });

    expect(eventBus.select$).toHaveBeenCalledWith(FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
  });

  it('should update model value when target is "model.value"', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update',
      config: {
        target: 'model.value',
        condition: 'sourceField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const { control, definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(
      Promise.resolve([expr])
    );

    consumer.bind({ component, definition });

    const meta = { visible: false, readonly: false, disabled: false };
    eventStream$.next(createUIEvent({ meta }));
    tick();

    // Default value is the full meta object
    expect(control.value).toEqual(meta);
  }));

  it('should not update model value if unchanged', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'model-update',
      config: {
        target: 'model.value',
        condition: 'sourceField',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        template: ''
      }
    };
    const meta = { visible: true };
    const { control, definition, component } = createSetup([expr]);
    control.setValue(meta);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(
      Promise.resolve([expr])
    );
    const setValueSpy = spyOn(control, 'setValue').and.callThrough();

    consumer.bind({ component, definition });

    eventStream$.next(createUIEvent({ meta }));
    tick();

    expect(setValueSpy).not.toHaveBeenCalled();
  }));

  it('should update layout config when target starts with "layout."', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'layout-update',
      config: {
        target: 'layout.someProp',
        condition: 'sourceField',
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(
      Promise.resolve([expr])
    );

    consumer.bind({ component, definition });

    const meta = { visible: false };
    eventStream$.next(createUIEvent({ meta }));
    tick();

    const config = definition.layout?.componentDefinition?.config as Record<string, unknown>;
    expect(config['someProp']).toEqual(meta);
  }));

  it('should update component config when target starts with "component."', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'component-update',
      config: {
        target: 'component.someSetting',
        condition: 'sourceField',
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(
      Promise.resolve([expr])
    );

    consumer.bind({ component, definition });

    const meta = { disabled: true };
    eventStream$.next(createUIEvent({ meta }));
    tick();

    const config = definition.component?.componentDefinition?.config as Record<string, unknown>;
    expect(config['someSetting']).toEqual(meta);
  }));

  it('should use template evaluation when hasTemplate is true', fakeAsync(() => {
    const expr: FormExpressionsConfigFrame = {
      name: 'template-update',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'sourceField',
        template: ''
      }
    };
    const { control, definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(
      Promise.resolve([expr])
    );
    spyOn<any>(consumer, 'evaluateExpressionJSONata').and.returnValue(
      Promise.resolve('templatedValue')
    );

    consumer.bind({ component, definition });

    const event = createUIEvent();
    eventStream$.next(event);
    tick();

    expect(consumer['evaluateExpressionJSONata']).toHaveBeenCalledWith(expr, event, 'template');
    expect(control.value).toBe('templatedValue');
  }));

  it('should include requestParams in JSONata evaluation context', async () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'template-request-params',
      config: {
        target: 'model.value',
        hasTemplate: true,
        condition: 'sourceField',
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);
    const evaluateSpy = jasmine.createSpy('evaluate').and.resolveTo('templatedValue');

    (consumer as any).options = { component, definition };
    (consumer as any).expressions = [expr];
    (consumer as any).formComp = {
      form: {
        value: {
          sourceField: 'current'
        }
      },
      requestParams: () => ({
        workspace: 'active'
      })
    };
    spyOn<any>(consumer, 'getCompiledItems').and.resolveTo({ evaluate: evaluateSpy });

    await (consumer as any).evaluateExpressionJSONata(expr, createUIEvent({ sourceId: '*' }), 'template');

    const [, context] = evaluateSpy.calls.mostRecent().args;
    expect(context.requestParams).toEqual({ workspace: 'active' });
    expect(context.runtimeContext).toEqual({ requestParams: { workspace: 'active' } });
  });

  it('should pass JSONataQuery data using named querySource and runtimeContext properties', async () => {
    const expr: FormExpressionsConfigFrame = {
      name: 'jsonata-query-request-params',
      config: {
        target: 'model.value',
        condition: '$exists(runtimeContext.requestParams.workspace) and querySource[0].name = "parent"',
        conditionKind: ExpressionsConditionKind.JSONataQuery,
        template: ''
      }
    };
    const evaluateExpressionSpy = spyOn<any>(consumer, 'evaluateExpressionJSONata').and.resolveTo(true);
    const event = createUIEvent({ sourceId: '*' });

    const matched = await (consumer as any).hasMatchedJSONataQueryCondition({
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
            workspace: 'active'
          }
        },
        event
      }
    }, expr);

    expect(matched).toBeTrue();
    expect(evaluateExpressionSpy).toHaveBeenCalledWith(expr, event, 'condition', {
      querySource: [{ name: 'parent' }],
      runtimeContext: {
        requestParams: {
          workspace: 'active'
        }
      }
    });
  });

  it('should warn if target is unknown', fakeAsync(() => {
    const expr = {
      name: 'unknown-target',
      config: {
        target: 'unknown.target',
        condition: 'sourceField',
        template: ''
      }
    } as unknown as FormExpressionsConfigFrame;
    const { definition, component } = createSetup([expr]);

    spyOn<any>(consumer, 'getMatchedExpressions').and.returnValue(
      Promise.resolve([expr])
    );

    consumer.bind({ component, definition });

    eventStream$.next(createUIEvent());
    tick();

    expect(loggerService.warn).toHaveBeenCalled();
  }));

  it('should not consume events if no expressions are defined', () => {
    const { definition, component } = createSetup([]);

    expect(() => consumer.bind({ component, definition })).not.toThrow();
    expect(eventBus.select$).not.toHaveBeenCalled();
  });

  it('should return expressions from getMatchedExpressions if condition is undefined or null', async () => {
    const exprUndefined: FormExpressionsConfigFrame = {
      name: 'undefined-condition',
      config: {
        target: 'model.value',
        condition: undefined,
        template: ''
      }
    };
    const exprNull: FormExpressionsConfigFrame = {
      name: 'null-condition',
      config: {
        target: 'model.value',
        condition: null as any,
        template: ''
      }
    };
    const event = createUIEvent();

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
        condition: 'sourceField',
        template: ''
      }
    };
    const { definition, component } = createSetup([expr]);

    consumer.bind({ component, definition });
    consumer.destroy();

    spyOn<any>(consumer, 'consumeEvent');

    eventStream$.next(createUIEvent());

    expect(consumer['consumeEvent']).not.toHaveBeenCalled();
  });
});

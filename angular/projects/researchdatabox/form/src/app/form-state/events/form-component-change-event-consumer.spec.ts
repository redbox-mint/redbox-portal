import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';

import { FormComponentValueChangeEventConsumer } from './form-component-change-event-consumer';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FieldValueChangedEvent, FormComponentEventType } from './form-component-event.types';
import { ExpressionsConditionKind, FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService, FormFieldModel } from '@researchdatabox/portal-ng-common';
import { FormComponent } from '../../form.component';

describe('FormComponentValueChangeEventConsumer', () => {
  let eventBus: FormComponentEventBus;
  let eventStream$: Subject<FieldValueChangedEvent>;
  let mockLoggerService: jasmine.SpyObj<LoggerService>;

  beforeEach(() => {
    eventStream$ = new Subject<FieldValueChangedEvent>();
    
    mockLoggerService = jasmine.createSpyObj('LoggerService', ['debug', 'warn', 'error', 'info']);

    TestBed.configureTestingModule({
      providers: [
        FormComponentEventBus,
        { provide: LoggerService, useValue: mockLoggerService }
      ]
    });

    eventBus = TestBed.inject(FormComponentEventBus);
    
    // Spy on the select$ method to return our test subject
    spyOn(eventBus, 'select$').and.returnValue(eventStream$.asObservable());
  });

  afterEach(() => {
    eventStream$.complete();
  });

  /**
   * Helper to create a FieldValueChangedEvent
   */
  function createFieldValueChangedEvent(overrides: Partial<FieldValueChangedEvent> = {}): FieldValueChangedEvent {
    return {
      type: 'field.value.changed',
      timestamp: Date.now(),
      fieldId: 'test-field',
      value: 'test-value',
      sourceId: 'test-field',
      ...overrides
    };
  }

  /**
   * Helper to create a mock FormComponent with getCompiledItem
   */
  function createMockFormComponent(evaluateFn?: (key: (string | number)[], context: unknown) => unknown): FormComponent {
    const defaultEvaluateFn = evaluateFn || ((key, context: any) => context.value);
    
    return {
      getCompiledItem: jasmine.createSpy('getCompiledItem').and.returnValue(
        Promise.resolve({
          evaluate: defaultEvaluateFn
        })
      ),
      form: new FormGroup({
        testField: new FormControl('testValue')
      }),
      componentQuerySource: {
        queryOrigSource: {},
        querySource: [],
        jsonPointerSource: {}
      }
    } as unknown as FormComponent;
  }

  /**
   * Helper to create test options with expressions
   */
  function createOptionsWithExpressions(
    fieldName: string, 
    initialValue: unknown, 
    expressions: FormExpressionsConfigFrame[]
  ): {
    control: FormControl;
    component: FormFieldBaseComponent<unknown>;
    definition: FormFieldCompMapEntry;
    layout: FormFieldBaseComponent<unknown>;
    componentQuerySource: any;
  } {
    const control = new FormControl(initialValue);
    const model = { formControl: control } as unknown as FormFieldModel<unknown>;
    
    const layout = {
      componentDefinition: {
        config: {
          label: 'Original Label',
          visible: true
        }
      }
    } as unknown as FormFieldBaseComponent<unknown>;

    const component = {
      model,
      formFieldConfigName: () => fieldName
    } as unknown as FormFieldBaseComponent<unknown>;

    const definition = {
      compConfigJson: { name: fieldName },
      model,
      expressions,
      layout,
      lineagePaths: {
        formConfig: ['form', 'fields', 0]
      }
    } as unknown as FormFieldCompMapEntry;

    const componentQuerySource = {
      queryOrigSource: {},
      querySource: [],
      jsonPointerSource: {
        'source-field': { name: 'source-field', key: 'source-field' }
      }
    };

    return { control, component, definition, layout, componentQuerySource };
  }

  describe('constructor', () => {
    it('should create an instance', () => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      expect(consumer).toBeTruthy();
    });
  });

  describe('bind()', () => {
    it('should subscribe to field value changed events when expressions are defined', () => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'testExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: '$value'
        }
      }];

      const { component, definition } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      consumer.bind({ component, definition });

      expect(eventBus.select$).toHaveBeenCalledWith(FormComponentEventType.FIELD_VALUE_CHANGED);
    });

    it('should not throw when no expressions are defined', () => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const control = new FormControl('initial');
      const model = { formControl: control } as unknown as FormFieldModel<unknown>;
      
      const component = {
        model,
        formFieldConfigName: () => 'target-field'
      } as unknown as FormFieldBaseComponent<unknown>;

      const definition = {
        compConfigJson: { name: 'target-field' },
        model,
        expressions: undefined
      } as unknown as FormFieldCompMapEntry;

      // Should not throw, just return early
      expect(() => consumer.bind({ component, definition })).not.toThrow();
    });

    it('should destroy previous subscriptions when rebinding', () => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'testExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: '$value'
        }
      }];

      const { component, definition } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      consumer.bind({ component, definition });
      
      // Rebind should call destroy internally
      spyOn(consumer, 'destroy').and.callThrough();
      consumer.bind({ component, definition });
      
      expect(consumer.destroy).toHaveBeenCalled();
    });
  });

  describe('destroy()', () => {
    it('should clear subscriptions and cache when destroyed', () => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'testExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: '$value'
        }
      }];

      const { component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      
      consumer.destroy();
      
      // After destroy, internal state should be cleared
      expect((consumer as any).subscriptions.size).toBe(0);
      expect((consumer as any).compiledItemsCache).toBeUndefined();
    });
  });

  describe('Event Consumption', () => {
    it('should not process events when condition does not match', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'testExpression',
        config: {
          condition: '/other-field', // Different from source-field
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: '$value'
        }
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'new-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      // Value should remain unchanged
      expect(control.value).toBe('initial');
    }));

    it('should process events when JSON Pointer condition matches', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'testExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: '' // Empty template means use event value directly
        }
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'new-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      expect(control.value).toBe('new-value');
    }));

    it('should not update control when value is the same', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'testExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: ''
        }
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'same-value', expressions);
      
      const setValueSpy = spyOn(control, 'setValue').and.callThrough();
      
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'same-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      // setValue should not be called when value is the same
      expect(setValueSpy).not.toHaveBeenCalled();
    }));
  });

  describe('Compiled Expression Execution', () => {
    it('should evaluate compiled JSONata template when hasTemplate is true', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'testExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = createMockFormComponent((key, context: any) => {
        return context.value + ' - transformed';
      });

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'new-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      expect(mockFormComponent.getCompiledItem).toHaveBeenCalled();
      expect(control.value).toBe('new-value - transformed');
    }));

    it('should pass correct context to compiled evaluate function', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'contextTestExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      let capturedContext: unknown;
      let capturedKey: (string | number)[] | undefined;
      
      const mockFormComponent = createMockFormComponent((key, context) => {
        capturedKey = key;
        capturedContext = context;
        return 'evaluated-result';
      });

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'test-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      // Verify the key is built correctly
      expect(capturedKey).toEqual(['form', 'fields', 0, 'expressions', 0, 'config', 'template']);

      // Verify the context includes required properties
      expect(capturedContext).toEqual(jasmine.objectContaining({
        value: 'test-value',
        event: jasmine.objectContaining({
          type: 'field.value.changed',
          fieldId: 'source-field',
          value: 'test-value'
        })
      }));
    }));

    it('should set layout property when target is layout.*', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'layoutExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'layout.componentDefinition.config.label',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, layout, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = createMockFormComponent(() => 'Dynamic Label');

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'trigger-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      expect(layout.componentDefinition!.config!.label).toBe('Dynamic Label');
    }));

    it('should set component property when target is component.*', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'componentExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'component.customProp',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = createMockFormComponent(() => 'computed-custom-value');

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'trigger-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      expect((component as any).customProp).toBe('computed-custom-value');
    }));

    it('should use event value directly when hasTemplate is not set', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'noTemplateExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: ''
        }
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = createMockFormComponent();
      
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'direct-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      // Should NOT call getCompiledItem when hasTemplate is not set
      expect(mockFormComponent.getCompiledItem).not.toHaveBeenCalled();
      expect(control.value).toBe('direct-value');
    }));

    it('should fall back to event value when formComponent is not available', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'noFormCompExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      // Don't set formComponent
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'fallback-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      // Should use the event value as fallback
      expect(control.value).toBe('fallback-value');
    }));

    it('should fall back to event value when lineagePaths is not available', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'noLineageExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          hasTemplate: true
        } as any
      }];

      const control = new FormControl('initial');
      const model = { formControl: control } as unknown as FormFieldModel<unknown>;
      const component = {
        model,
        formFieldConfigName: () => 'target-field'
      } as unknown as FormFieldBaseComponent<unknown>;

      const definition = {
        compConfigJson: { name: 'target-field' },
        model,
        expressions
        // No lineagePaths defined
      } as unknown as FormFieldCompMapEntry;

      const componentQuerySource = {
        queryOrigSource: {},
        querySource: [],
        jsonPointerSource: {
          'source-field': { name: 'source-field', key: 'source-field' }
        }
      };

      const mockFormComponent = createMockFormComponent();

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'fallback-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      // Should use the event value as fallback when key cannot be built
      expect(control.value).toBe('fallback-value');
    }));

    it('should cache compiled items across multiple events', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'cacheTestExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = createMockFormComponent((key, context: any) => context.value + '-cached');

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      // First event
      eventStream$.next(createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'first',
        sourceId: 'source-field'
      }));
      tick();

      // Second event
      eventStream$.next(createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'second',
        sourceId: 'source-field'
      }));
      tick();

      // getCompiledItem should only be called once due to caching
      expect(mockFormComponent.getCompiledItem).toHaveBeenCalledTimes(1);
      expect(control.value).toBe('second-cached');
    }));

    it('should clear cache when destroyed', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'cacheClearExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = {
        getCompiledItem: jasmine.createSpy('getCompiledItem').and.returnValue(Promise.resolve({
          evaluate: (key: (string | number)[], context: any) => context.value
        })),
        form: new FormGroup({})
      } as unknown as FormComponent;

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      // Verify subscription was created
      expect((consumer as any).subscriptions.size).toBeGreaterThan(0);

      // Trigger first event
      eventStream$.next(createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'test1',
        sourceId: 'source-field'
      }));
      flush();

      expect(mockFormComponent.getCompiledItem).toHaveBeenCalledTimes(1);
      
      // Destroy - this should clear the cache and subscriptions
      consumer.destroy();
      
      // Verify cache was cleared
      expect((consumer as any).compiledItemsCache).toBeUndefined();
      expect((consumer as any).subscriptions.size).toBe(0);
    }));

    it('should handle evaluate function throwing an error gracefully', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'errorExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = createMockFormComponent(() => {
        throw new Error('JSONata evaluation error');
      });

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'error-trigger',
        sourceId: 'source-field'
      });

      // Should not throw
      expect(() => {
        eventStream$.next(event);
        tick();
      }).not.toThrow();

      // Should fall back to event value
      expect(control.value).toBe('error-trigger');
    }));

    it('should handle getCompiledItem rejection gracefully', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'rejectedExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = {
        getCompiledItem: jasmine.createSpy('getCompiledItem').and.callFake(() => {
          const rejectPromise = Promise.reject(new Error('Failed to load compiled items'));
          rejectPromise.catch(() => {}); // Prevent unhandled rejection
          return rejectPromise;
        }),
        form: new FormGroup({})
      } as unknown as FormComponent;

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'rejection-test',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      flush();

      // Should fall back to event value
      expect(control.value).toBe('rejection-test');
    }));

    it('should process multiple expressions in order', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [
        {
          name: 'firstExpression',
          config: {
            condition: '/source-field',
            conditionKind: ExpressionsConditionKind.JSONPointer,
            target: 'model.value',
            hasTemplate: true
          } as any
        },
        {
          name: 'secondExpression',
          config: {
            condition: '/source-field',
            conditionKind: ExpressionsConditionKind.JSONPointer,
            target: 'layout.componentDefinition.config.visible',
            hasTemplate: true
          } as any
        }
      ];

      const { control, component, definition, layout, componentQuerySource } = createOptionsWithExpressions('target-field', 0, expressions);
      
      let evaluationOrder: number[] = [];
      const mockFormComponent = createMockFormComponent((key: (string | number)[]) => {
        const expressionIndex = key[key.indexOf('expressions') + 1] as number;
        evaluationOrder.push(expressionIndex);
        
        if (expressionIndex === 0) {
          return 42; // First expression result
        }
        return true; // Second expression result
      });

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      eventStream$.next(createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 10,
        sourceId: 'source-field'
      }));
      tick();

      expect(evaluationOrder).toEqual([0, 1]);
      expect(control.value).toBe(42);
      expect(layout.componentDefinition!.config!.visible).toBe(true);
    }));

    it('should include formData in evaluation context', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'formDataExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          hasTemplate: true
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      let capturedContext: any;
      const mockFormComponent = {
        getCompiledItem: jasmine.createSpy('getCompiledItem').and.returnValue(
          Promise.resolve({
            evaluate: (key: (string | number)[], context: any) => {
              capturedContext = context;
              return context.formData?.otherField ?? 'no-data';
            }
          })
        ),
        form: new FormGroup({
          testField: new FormControl('testValue'),
          otherField: new FormControl('otherValue')
        })
      } as unknown as FormComponent;

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      eventStream$.next(createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'trigger',
        sourceId: 'source-field'
      }));
      tick();

      // Verify formData is included in context
      expect(capturedContext.formData).toBeDefined();
      expect(capturedContext.formData.testField).toBe('testValue');
      expect(capturedContext.formData.otherField).toBe('otherValue');
    }));
  });

  describe('Target Handling', () => {
    it('should log warning for unknown target type', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'unknownTargetExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'unknown.path',
          template: ''
        } as any
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'test-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        jasmine.stringContaining('Unknown target'),
        jasmine.anything()
      );
    }));
  });
});

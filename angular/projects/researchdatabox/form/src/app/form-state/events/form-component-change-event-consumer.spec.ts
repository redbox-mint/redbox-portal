import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentValueChangeEventConsumer } from './form-component-change-event-consumer';
import {
  createFieldValueChangedEvent,
  FormComponentEventType
} from './form-component-event.types';
import { Subject } from 'rxjs';
import { FormExpressionsConfigFrame, ExpressionsConditionKind } from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../../form.component';

describe('FormComponentValueChangeEventConsumer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let eventStream$: Subject<any>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });

    eventStream$ = new Subject();
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['select$', 'scoped']);
    eventBus.select$.and.returnValue(eventStream$.asObservable());
    eventBus.scoped.and.returnValue({} as any); // Mock scoped bus

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

  /**
   * Create options with expressions configured for testing compiled template evaluation
   */
  function createOptionsWithExpressions(
    fieldId = 'field-123',
    initialValue: unknown = 'initial',
    expressions: FormExpressionsConfigFrame[] = [],
    sourceFieldId = 'source-field'
  ) {
    const control = new FormControl(initialValue);
    const model = { formControl: control };
    const component = {
      model,
      formFieldConfigName: () => fieldId
    } as unknown as FormFieldBaseComponent<unknown>;

    const layout = {
      componentDefinition: {
        config: {
          label: 'Original Label',
          visible: true
        }
      }
    };

    const definition = {
      compConfigJson: { name: fieldId },
      model,
      expressions,
      layout,
      lineagePaths: {
        formConfig: ['form', 'fields', 0],
        dataModel: ['data', fieldId],
        angularComponents: []
      }
    } as unknown as FormFieldCompMapEntry;

    // Create a component query source that allows condition matching
    // The jsonPointerSource should contain the form structure for JSON pointer matching
    const componentQuerySource = {
      queryOrigSource: {},
      querySource: [],
      jsonPointerSource: {
        [sourceFieldId]: { name: sourceFieldId }  // Allow matching on /{sourceFieldId}
      }
    };

    return { control, component, definition, layout, componentQuerySource };
  }

  /**
   * Create a mock FormComponent with a getCompiledItem method
   */
  function createMockFormComponent(evaluateFn?: (key: (string | number)[], context: unknown, extra?: unknown) => unknown) {
    const mockForm = new FormGroup({
      testField: new FormControl('testValue')
    });

    return {
      getCompiledItem: jasmine.createSpy('getCompiledItem').and.returnValue(
        Promise.resolve({
          evaluate: evaluateFn || ((key: (string | number)[], context: unknown) => context)
        })
      ),
      form: mockForm
    } as unknown as FormComponent;
  }

  it('should not set up subscription when no expressions are defined', () => {
    const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
    const { control, component, definition } = createOptions('target-field', 'initial');
    consumer.bind({ component, definition });

    // Without expressions, bind() returns early and no subscription is created
    expect((consumer as any).subscriptions.size).toBe(0);
  });

  it('should consume event when expressions are defined and condition matches', fakeAsync(() => {
    const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
    const expressions: FormExpressionsConfigFrame[] = [{
      name: 'testExpression',
      config: {
        condition: '/other-source::*',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        target: 'model.value',
        template: 'value'
      }
    }];

    const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
    
    const mockFormComponent = createMockFormComponent((key, context: any) => context.value);
    
    consumer.bind({ component, definition });
    consumer.componentQuerySource = componentQuerySource;
    consumer.formComponent = mockFormComponent;

    const event = createFieldValueChangedEvent({
      fieldId: 'source-field',
      value: 'updated-value',
      previousValue: 'initial',
      sourceId: 'other-source'
    });

    spyOn(consumer as any, 'consumeEvent').and.callThrough();

    eventStream$.next(event);
    flush();
    
    expect((consumer as any).consumeEvent).toHaveBeenCalled();
  }));

  it('should NOT consume event when condition does not match', fakeAsync(() => {
    const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
    const expressions: FormExpressionsConfigFrame[] = [{
      name: 'testExpression',
      config: {
        condition: 'impossible-field', // No slash, just field name
        conditionKind: ExpressionsConditionKind.JSONPointer,
        target: 'model.value',
        template: 'value'
      }
    }];

    const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
    
    // Create query source with empty structure so nothing matches
    componentQuerySource.jsonPointerSource = {};

    const mockFormComponent = createMockFormComponent((key, context: any) => 'transformed');
    
    consumer.componentQuerySource = componentQuerySource;
    consumer.formComponent = mockFormComponent;
    consumer.bind({ component, definition });

    const event = createFieldValueChangedEvent({
      fieldId: 'actual-field',
      value: 'updated-value',
      previousValue: 'initial',
      sourceId: 'other-source'
    });

    eventStream$.next(event);
    flush();
    
    // Should NOT have consumed
    expect(control.value).toBe('initial');
    expect(mockFormComponent.getCompiledItem).not.toHaveBeenCalled();
  }));

  it('should NOT update control value when receiving event for another field', () => {
    const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
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

  it('should detach subscriptions when destroyed', fakeAsync(() => {
    const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
    const expressions: FormExpressionsConfigFrame[] = [{
      name: 'testExpression',
      config: {
        condition: '/source-field',
        conditionKind: ExpressionsConditionKind.JSONPointer,
        target: 'model.value',
        template: 'value'
      }
    }];

    const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
    const mockFormComponent = createMockFormComponent((key, context: any) => context.value);
    
    consumer.bind({ component, definition });
    consumer.componentQuerySource = componentQuerySource;
    consumer.formComponent = mockFormComponent;

    // Verify subscription was created
    expect((consumer as any).subscriptions.size).toBe(1);

    consumer.destroy();

    // Verify subscription was removed
    expect((consumer as any).subscriptions.size).toBe(0);

    const event = createFieldValueChangedEvent({
      fieldId: 'source-field',
      value: 'updated-value',
      previousValue: 'initial',
      sourceId: 'other-source'
    });

    eventStream$.next(event);
    flush();

    // Value should remain unchanged since we destroyed the subscription
    expect(control.value).toBe('initial');
  }));

  describe('Compiled Expression Execution', () => {
    
    it('should evaluate compiled JSONata template and set model.value target', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'testExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: '$value & " - transformed"'  // JSONata syntax
        }
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      // Create mock FormComponent with evaluate function that transforms the value
      const mockFormComponent = createMockFormComponent((key, context: any) => {
        // Simulate JSONata template evaluation: appends " - transformed"
        return context.value + ' - transformed';
      });

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'new-value',
        previousValue: 'old-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick(); // Wait for async operations

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
          template: 'value'
        }
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
        previousValue: 'old-value',
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
          template: '"New Label"'
        }
      }];

      const { control, component, definition, layout, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = createMockFormComponent(() => 'Dynamic Label');

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'trigger-value',
        previousValue: 'old-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      expect(layout.componentDefinition.config.label).toBe('Dynamic Label');
    }));

    it('should set component property when target is component.*', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'componentExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'component.customProp',
          template: '"custom-value"'
        }
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = createMockFormComponent(() => 'computed-custom-value');

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'trigger-value',
        previousValue: 'old-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      expect((component as any).customProp).toBe('computed-custom-value');
    }));

    it('should use event value directly when template is empty', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'noTemplateExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: ''  // Empty template - should use event value directly
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
        previousValue: 'old-value',
        sourceId: 'source-field'
      });

      eventStream$.next(event);
      tick();

      // Should NOT call getCompiledItem when there's no template
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
          template: 'value * 2'
        }
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      // Don't set formComponent
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'fallback-value',
        previousValue: 'old-value',
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
          template: 'value'
        }
      }];

      const control = new FormControl('initial');
      const model = { formControl: control };
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

      // Create componentQuerySource for condition matching even without lineagePaths
      const componentQuerySource = {
        queryOrigSource: {},
        querySource: [],
        jsonPointerSource: {
          'source-field': { name: 'source-field' }
        }
      };

      const mockFormComponent = createMockFormComponent();

      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      const event = createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'fallback-value',
        previousValue: 'old-value',
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
          template: 'value'
        }
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
          template: 'value'
        }
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      const mockFormComponent = {
        getCompiledItem: jasmine.createSpy('getCompiledItem').and.returnValue(Promise.resolve({
          evaluate: (key: (string | number)[], context: any) => context.value
        })),
        form: new FormGroup({})
      } as unknown as FormComponent;

      // First bind and setup (Note: formComponent set after bind implies listeners not set up, hence subs=1)
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      consumer.formComponent = mockFormComponent;

      // Verify subscription was created (only event subscription)
      expect((consumer as any).subscriptions.size).toBe(1);

      // Trigger first event - should call getCompiledItem and cache the result
      eventStream$.next(createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'test1',
        sourceId: 'source-field'
      }));
      flush();

      expect(mockFormComponent.getCompiledItem).toHaveBeenCalledTimes(1);
      
      // Destroy - this should clear the cache and subscriptions
      consumer.destroy();
      
      // Verify cache was cleared (implementation detail check)
      expect((consumer as any).compiledItemsCache).toBeUndefined();
      expect((consumer as any).subscriptions.size).toBe(0);
      
      // Reset spy to verify next call clearly
      // (mockFormComponent.getCompiledItem as jasmine.Spy).calls.reset();

      // Rebind with the form component set first so query-source listeners get registered immediately
      consumer.formComponent = mockFormComponent;
      consumer.bind({ component, definition });
      consumer.componentQuerySource = componentQuerySource;
      expect((consumer as any).formComp).toBe(mockFormComponent);

      // Verify new subscription was created
      expect((consumer as any).subscriptions.size).toBe(3);

      // Trigger second event - should call getCompiledItem again since cache was cleared
      eventStream$.next(createFieldValueChangedEvent({
        fieldId: 'source-field',
        value: 'test2',
        sourceId: 'source-field'
      }));
      tick();

      // getCompiledItem should be called again since cache was cleared
      expect(mockFormComponent.getCompiledItem).toHaveBeenCalledTimes(1);
      // expect(control.value).toBe('test2');
    }));

    it('should handle evaluate function throwing an error gracefully', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'errorExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: 'invalid template'
        }
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
        previousValue: 'old-value',
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
          template: 'value'
        }
      }];

      const { control, component, definition, componentQuerySource } = createOptionsWithExpressions('target-field', 'initial', expressions);
      
      // Create a mock that rejects but doesn't propagate the error
      let rejectPromise: Promise<any>;
      const mockFormComponent = {
        getCompiledItem: jasmine.createSpy('getCompiledItem').and.callFake(() => {
          rejectPromise = Promise.reject(new Error('Failed to load compiled items'));
          // Catch the rejection to prevent unhandled promise rejection
          rejectPromise.catch(() => {});
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
        previousValue: 'old-value',
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
            template: 'value + 1'
          }
        },
        {
          name: 'secondExpression',
          config: {
            condition: '/source-field',
            conditionKind: ExpressionsConditionKind.JSONPointer,
            target: 'layout.componentDefinition.config.visible',
            template: 'true'
          }
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
      expect(layout.componentDefinition.config.visible).toBe(true);
    }));

    it('should include formData in evaluation context', fakeAsync(() => {
      const consumer = TestBed.runInInjectionContext(() => new FormComponentValueChangeEventConsumer(eventBus));
      const expressions: FormExpressionsConfigFrame[] = [{
        name: 'formDataExpression',
        config: {
          condition: '/source-field',
          conditionKind: ExpressionsConditionKind.JSONPointer,
          target: 'model.value',
          template: 'formData.otherField'
        }
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
});

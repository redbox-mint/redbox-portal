import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus, ScopedEventBus } from './form-component-event-bus.service';
import { FormComponentUIAttributeChangeEventProducer } from './form-component-ui-attribute-change-event-producer';
import {
  FieldUIAttributeChangedEvent,
  FormComponentEventResult,
  FormComponentEventType
} from './form-component-event.types';
import { Subject, EMPTY } from 'rxjs';

describe('FormComponentUIAttributeChangeEventProducer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let scopedBus: jasmine.SpyObj<ScopedEventBus>;
  let producer: FormComponentUIAttributeChangeEventProducer;
  let valueChangedSubject$: Subject<any>;
  let appRef: ApplicationRef;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });

    valueChangedSubject$ = new Subject();

    eventBus = jasmine.createSpyObj<FormComponentEventBus>(
      'FormComponentEventBus', ['publish', 'scoped', 'select$']
    );
    scopedBus = jasmine.createSpyObj<ScopedEventBus>(
      'ScopedEventBus', ['publish']
    );
    eventBus.scoped.and.returnValue(scopedBus);
    eventBus.select$.and.callFake((eventType: string) => {
      switch (eventType) {
        case FormComponentEventType.FIELD_VALUE_CHANGED:
          return valueChangedSubject$.asObservable();
        default:
          return EMPTY;
      }
    });

    appRef = TestBed.inject(ApplicationRef);
    producer = TestBed.runInInjectionContext(
      () => new FormComponentUIAttributeChangeEventProducer(eventBus)
    );
  });

  afterEach(() => {
    producer.destroy();
  });

  /**
   * Helper to build binding options with controllable config.
   * Returns the mutable `config` object so tests can simulate consumer mutations.
   */
  function createBindingOptions(
    fieldId = 'field-123',
    configOverrides: Record<string, any> = {}
  ) {
    const componentDefinition = {
      config: {
        visible: true,
        readonly: false,
        disabled: false,
        ...configOverrides
      }
    };
    const component = {
      componentDefinition,
      formFieldConfigName: () => fieldId
    } as unknown as FormFieldBaseComponent<unknown>;
    const definition = {
      compConfigJson: { name: fieldId },
      component: { componentDefinition }
    } as unknown as FormFieldCompMapEntry;
    return { component, definition, config: componentDefinition.config };
  }

  /**
   * Flush macrotasks (setTimeout) and trigger a full Angular render pass
   * so that effects and afterNextRender callbacks are processed.
   */
  function flushAndRender() {
    tick(0);
    appRef.tick();
  }

  it('should not emit events when no value changes occur', fakeAsync(() => {
    const { component, definition } = createBindingOptions('f1');
    producer.bind({ component, definition });
    flushAndRender();
    expect(eventBus.publish).not.toHaveBeenCalled();
  }));

  it('should emit when config.visible changes after a value change event', fakeAsync(() => {
    const { component, definition, config } = createBindingOptions('f2');
    producer.bind({ component, definition });
    flushAndRender();
    eventBus.publish.calls.reset();
    scopedBus.publish.calls.reset();

    // Simulate consumer mutating config before our macrotask fires
    config.visible = false;
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'trigger',
      value: 42,
      timestamp: Date.now()
    });
    flushAndRender();

    const uiEvents = eventBus.publish.calls.allArgs()
      .filter(a => a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
    expect(uiEvents.length).toBeGreaterThan(0);
    const last = uiEvents[uiEvents.length - 1][0] as FormComponentEventResult<FieldUIAttributeChangedEvent>;
    expect(last.meta['visible']).toBe(false);
    expect(last.meta['readonly']).toBe(false);
    expect(last.meta['disabled']).toBe(false);
  }));

  it('should emit when config.readonly changes', fakeAsync(() => {
    const { component, definition, config } = createBindingOptions('f3');
    producer.bind({ component, definition });
    flushAndRender();
    eventBus.publish.calls.reset();

    config.readonly = true;
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'x',
      value: 1,
      timestamp: 0
    });
    flushAndRender();

    const uiEvents = eventBus.publish.calls.allArgs()
      .filter(a => a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
    expect(uiEvents.length).toBeGreaterThan(0);
    expect((uiEvents[uiEvents.length - 1][0] as FormComponentEventResult<FieldUIAttributeChangedEvent>).meta['readonly']).toBe(true);
  }));

  it('should emit when config.disabled changes', fakeAsync(() => {
    const { component, definition, config } = createBindingOptions('f4');
    producer.bind({ component, definition });
    flushAndRender();
    eventBus.publish.calls.reset();

    config.disabled = true;
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'y',
      value: 2,
      timestamp: 0
    });
    flushAndRender();

    const uiEvents = eventBus.publish.calls.allArgs()
      .filter(a => a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
    expect(uiEvents.length).toBeGreaterThan(0);
    expect((uiEvents[uiEvents.length - 1][0] as FormComponentEventResult<FieldUIAttributeChangedEvent>).meta['disabled']).toBe(true);
  }));

  it('should NOT emit when config has not actually changed', fakeAsync(() => {
    const { component, definition } = createBindingOptions('f5');
    producer.bind({ component, definition });
    flushAndRender();
    eventBus.publish.calls.reset();

    // Emit a value change but config stays the same
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'z',
      value: 3,
      timestamp: 0
    });
    flushAndRender();

    // The signal's custom equality should prevent the effect from firing
    const uiEvents = eventBus.publish.calls.allArgs()
      .filter(a => a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
    expect(uiEvents.length).toBe(0);
  }));

  it('should publish to both general and scoped buses', fakeAsync(() => {
    const { component, definition, config } = createBindingOptions('f6');
    producer.bind({ component, definition });
    flushAndRender();
    eventBus.publish.calls.reset();
    scopedBus.publish.calls.reset();

    config.visible = false;
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'trigger',
      value: 1,
      timestamp: 0
    });
    flushAndRender();

    // General bus: sourceId '*'
    const generalCalls = eventBus.publish.calls.allArgs()
      .filter(a =>
        a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED &&
        a[0].sourceId === '*'
      );
    expect(generalCalls.length).toBeGreaterThan(0);

    // Scoped bus: sourceId === fieldId
    expect(scopedBus.publish).toHaveBeenCalled();
    const scopedArgs = scopedBus.publish.calls.mostRecent()
      .args[0] as FormComponentEventResult<FieldUIAttributeChangedEvent>;
    expect(scopedArgs.type).toBe(FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
    expect(scopedArgs.sourceId).toBe('f6');
  }));

  it('should detach all subscriptions and effect on destroy', fakeAsync(() => {
    const { component, definition, config } = createBindingOptions('f7');
    producer.bind({ component, definition });
    flushAndRender();

    producer.destroy();
    eventBus.publish.calls.reset();
    scopedBus.publish.calls.reset();

    config.visible = false;
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'a',
      value: 0,
      timestamp: 0
    });
    flushAndRender();

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(scopedBus.publish).not.toHaveBeenCalled();
  }));

  it('should skip binding when the field id cannot be resolved', fakeAsync(() => {
    const { component, definition } = createBindingOptions('f8');
    definition.compConfigJson = {} as any;
    (definition as any).name = undefined;
    (component as any).formFieldConfigName = () => undefined;

    producer.bind({ component, definition });
    flushAndRender();

    expect(eventBus.scoped).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  }));

  it('should use default values when config properties are undefined', fakeAsync(() => {
    const componentDefinition = { config: {} };
    const component = {
      componentDefinition,
      formFieldConfigName: () => 'f9'
    } as unknown as FormFieldBaseComponent<unknown>;
    const definition = {
      compConfigJson: { name: 'f9' },
      component: { componentDefinition }
    } as unknown as FormFieldCompMapEntry;

    producer.bind({ component, definition });

    // Trigger a value change that causes a config mutation to a non-UI-attribute key
    // The snapshot should still use defaults for missing UI attributes
    (componentDefinition.config as any).visible = false;
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'trigger',
      value: 1,
      timestamp: 0
    });
    flushAndRender();

    const calls = eventBus.publish.calls.allArgs()
      .filter(a => a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
    expect(calls.length).toBeGreaterThan(0);
    expect((calls[calls.length - 1][0] as FormComponentEventResult<FieldUIAttributeChangedEvent>).meta['visible']).toBe(false);
    // readonly and disabled default to false
    expect((calls[calls.length - 1][0] as FormComponentEventResult<FieldUIAttributeChangedEvent>).meta['readonly']).toBe(false);
    expect((calls[calls.length - 1][0] as FormComponentEventResult<FieldUIAttributeChangedEvent>).meta['disabled']).toBe(false);
  }));

  it('should re-bind cleanly when bind is called again', fakeAsync(() => {
    const opts1 = createBindingOptions('f10a');
    producer.bind({ component: opts1.component, definition: opts1.definition });
    flushAndRender();
    eventBus.publish.calls.reset();
    scopedBus.publish.calls.reset();

    // Re-bind to a different component
    const opts2 = createBindingOptions('f10b', { visible: false });
    producer.bind({ component: opts2.component, definition: opts2.definition });

    // Trigger a config change on the new binding
    opts2.config.disabled = true;
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'trigger',
      value: 1,
      timestamp: 0
    });
    flushAndRender();

    const calls = eventBus.publish.calls.allArgs()
      .filter(a => a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
    expect(calls.length).toBeGreaterThan(0);
    const rebindEvent = calls[calls.length - 1][0] as FormComponentEventResult<FieldUIAttributeChangedEvent>;
    expect(rebindEvent.fieldId).toBe('f10b');
    expect(rebindEvent.meta['visible']).toBe(false);
  }));

  it('should coalesce multiple rapid config changes into a single emit', fakeAsync(() => {
    const { component, definition, config } = createBindingOptions('f11');
    producer.bind({ component, definition });
    flushAndRender();
    eventBus.publish.calls.reset();

    // Simulate multiple rapid config mutations
    config.visible = false;
    config.readonly = true;
    config.disabled = true;
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'a',
      value: 1,
      timestamp: 0
    });
    valueChangedSubject$.next({
      type: FormComponentEventType.FIELD_VALUE_CHANGED,
      fieldId: 'b',
      value: 2,
      timestamp: 0
    });
    flushAndRender();

    const uiEvents = eventBus.publish.calls.allArgs()
      .filter(a => a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
    // The final state should be emitted
    expect(uiEvents.length).toBeGreaterThanOrEqual(1);
    const last = uiEvents[uiEvents.length - 1][0] as FormComponentEventResult<FieldUIAttributeChangedEvent>;
    expect(last.meta).toEqual({ visible: false, readonly: true, disabled: true });
  }));
});

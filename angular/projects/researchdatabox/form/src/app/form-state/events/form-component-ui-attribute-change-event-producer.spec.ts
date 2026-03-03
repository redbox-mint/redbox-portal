import { TestBed } from '@angular/core/testing';
import { ApplicationRef } from '@angular/core';
import { FormFieldBaseComponent, FormFieldCompMapEntry, LoggerService } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus, ScopedEventBus } from './form-component-event-bus.service';
import { FormComponentUIAttributeChangeEventProducer } from './form-component-ui-attribute-change-event-producer';
import {
  FieldUIAttributeChangedEvent,
  FormComponentEventResult,
  FormComponentEventType
} from './form-component-event.types';

describe('FormComponentUIAttributeChangeEventProducer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let scopedBus: jasmine.SpyObj<ScopedEventBus>;
  let producer: FormComponentUIAttributeChangeEventProducer;
  let appRef: ApplicationRef;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });

    eventBus = jasmine.createSpyObj<FormComponentEventBus>(
      'FormComponentEventBus', ['publish', 'scoped', 'select$']
    );
    scopedBus = jasmine.createSpyObj<ScopedEventBus>(
      'ScopedEventBus', ['publish']
    );
    eventBus.scoped.and.returnValue(scopedBus);

    appRef = TestBed.inject(ApplicationRef);
    producer = TestBed.runInInjectionContext(
      () => new FormComponentUIAttributeChangeEventProducer(eventBus)
    );
  });

  afterEach(() => {
    producer.destroy();
  });

  /**
   * Helper to build binding options for a regular component.
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
   * Helper to build binding options for a layout.
   * The layout's componentDefinition is stored on `definition.layout`
   * (mirroring how DefaultLayoutComponent sets itself up).
   */
  function createLayoutBindingOptions(
    fieldId = 'layout-123',
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
      layout: { componentDefinition },
      lineagePaths: { layoutJsonPointer: fieldId }
    } as unknown as FormFieldCompMapEntry;
    return { component, definition, config: componentDefinition.config };
  }

  /**
   * Trigger a full Angular render pass so that `afterRender` callbacks
   * are processed.
   */
  function render() {
    appRef.tick();
  }

  /** Extract all FIELD_UI_ATTRIBUTE_CHANGED calls from the general bus spy. */
  function uiAttrEvents(): FormComponentEventResult<FieldUIAttributeChangedEvent>[] {
    return eventBus.publish.calls.allArgs()
      .filter(a => a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED)
      .map(a => a[0] as FormComponentEventResult<FieldUIAttributeChangedEvent>);
  }

  // ── component tests ──────────────────────────────────────────────────

  it('should not emit when config has not changed after bind', () => {
    const { component, definition } = createBindingOptions('f1');
    producer.bind({ component, definition });
    render();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('should emit when config.visible changes', () => {
    const { component, definition, config } = createBindingOptions('f2');
    producer.bind({ component, definition });
    render();
    eventBus.publish.calls.reset();

    config.visible = false;
    render();

    const events = uiAttrEvents();
    expect(events.length).toBe(1);
    expect(events[0].meta['visible']).toBe(false);
    expect(events[0].meta['readonly']).toBe(false);
    expect(events[0].meta['disabled']).toBe(false);
  });

  it('should emit when config.readonly changes', () => {
    const { component, definition, config } = createBindingOptions('f3');
    producer.bind({ component, definition });
    render();
    eventBus.publish.calls.reset();

    config.readonly = true;
    render();

    const events = uiAttrEvents();
    expect(events.length).toBe(1);
    expect(events[0].meta['readonly']).toBe(true);
  });

  it('should emit when config.disabled changes', () => {
    const { component, definition, config } = createBindingOptions('f4');
    producer.bind({ component, definition });
    render();
    eventBus.publish.calls.reset();

    config.disabled = true;
    render();

    const events = uiAttrEvents();
    expect(events.length).toBe(1);
    expect(events[0].meta['disabled']).toBe(true);
  });

  it('should NOT emit when config has not actually changed between renders', () => {
    const { component, definition } = createBindingOptions('f5');
    producer.bind({ component, definition });
    render();
    eventBus.publish.calls.reset();

    // Trigger another render without mutating config.
    render();

    expect(uiAttrEvents().length).toBe(0);
  });

  it('should publish to both general and scoped buses', () => {
    const { component, definition, config } = createBindingOptions('f6');
    producer.bind({ component, definition });
    render();
    eventBus.publish.calls.reset();
    scopedBus.publish.calls.reset();

    config.visible = false;
    render();

    // General bus: sourceId '*'
    const generalCalls = eventBus.publish.calls.allArgs()
      .filter(a =>
        a[0].type === FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED &&
        a[0].sourceId === '*'
      );
    expect(generalCalls.length).toBe(1);

    // Scoped bus: sourceId === fieldId
    expect(scopedBus.publish).toHaveBeenCalled();
    const scopedArgs = scopedBus.publish.calls.mostRecent()
      .args[0] as FormComponentEventResult<FieldUIAttributeChangedEvent>;
    expect(scopedArgs.type).toBe(FormComponentEventType.FIELD_UI_ATTRIBUTE_CHANGED);
    expect(scopedArgs.sourceId).toBe('f6');
  });

  it('should stop detecting changes after destroy', () => {
    const { component, definition, config } = createBindingOptions('f7');
    producer.bind({ component, definition });
    render();

    producer.destroy();
    eventBus.publish.calls.reset();
    scopedBus.publish.calls.reset();

    config.visible = false;
    render();

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(scopedBus.publish).not.toHaveBeenCalled();
  });

  it('should skip binding when the field id cannot be resolved', () => {
    const { component, definition } = createBindingOptions('f8');
    definition.compConfigJson = {} as any;
    (definition as any).name = undefined;
    (component as any).formFieldConfigName = () => undefined;

    producer.bind({ component, definition });
    render();

    expect(eventBus.scoped).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('should use default values when config properties are undefined', () => {
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
    render();

    // Mutate one property — others should use defaults.
    (componentDefinition.config as any).visible = false;
    render();

    const events = uiAttrEvents();
    expect(events.length).toBe(1);
    expect(events[0].meta['visible']).toBe(false);
    expect(events[0].meta['readonly']).toBe(false);
    expect(events[0].meta['disabled']).toBe(false);
  });

  it('should re-bind cleanly when bind is called again', () => {
    const opts1 = createBindingOptions('f10a');
    producer.bind({ component: opts1.component, definition: opts1.definition });
    render();
    eventBus.publish.calls.reset();
    scopedBus.publish.calls.reset();

    // Re-bind to a different component.
    const opts2 = createBindingOptions('f10b', { visible: false });
    producer.bind({ component: opts2.component, definition: opts2.definition });

    // Mutate the new binding's config.
    opts2.config.disabled = true;
    render();

    const events = uiAttrEvents();
    expect(events.length).toBe(1);
    expect(events[0].fieldId).toBe('f10b');
    expect(events[0].meta['visible']).toBe(false);
  });

  it('should coalesce multiple config mutations into a single emit per render', () => {
    const { component, definition, config } = createBindingOptions('f11');
    producer.bind({ component, definition });
    render();
    eventBus.publish.calls.reset();

    // Multiple mutations before a single render pass.
    config.visible = false;
    config.readonly = true;
    config.disabled = true;
    render();

    const events = uiAttrEvents();
    expect(events.length).toBe(1);
    expect(events[0].meta).toEqual({ visible: false, readonly: true, disabled: true });
  });

  it('should detect changes regardless of what caused the config mutation', () => {
    const { component, definition, config } = createBindingOptions('f12');
    producer.bind({ component, definition });
    render();
    eventBus.publish.calls.reset();

    // Directly mutate config — no upstream event involved at all.
    config.visible = false;
    render();

    const events = uiAttrEvents();
    expect(events.length).toBe(1);
    expect(events[0].meta['visible']).toBe(false);
  });

  // ── layout tests ─────────────────────────────────────────────────────

  it('should emit for a layout when config.visible changes', () => {
    const { component, definition, config } = createLayoutBindingOptions('layout-1');
    producer.bind({ isLayout: true, component, definition });
    render();
    eventBus.publish.calls.reset();

    config.visible = false;
    render();

    const events = uiAttrEvents();
    expect(events.length).toBe(1);
    expect(events[0].fieldId).toBe('layout-1');
    expect(events[0].meta['visible']).toBe(false);
  });

  it('should NOT emit for a layout when config has not changed', () => {
    const { component, definition } = createLayoutBindingOptions('layout-2');
    producer.bind({ isLayout: true, component, definition });
    render();
    eventBus.publish.calls.reset();

    render();

    expect(uiAttrEvents().length).toBe(0);
  });

  it('should read layout config from definition.layout, not definition.component', () => {
    // Set up a definition with BOTH component and layout — ensure the
    // producer reads from the layout when isLayout is true.
    const layoutConfig = { visible: false, readonly: false, disabled: false };
    const componentConfig = { visible: true, readonly: false, disabled: false };
    const layoutInstance = {
      componentDefinition: { config: layoutConfig },
      formFieldConfigName: () => 'dual-field-layout'
    } as unknown as FormFieldBaseComponent<unknown>;
    const definition = {
      compConfigJson: { name: 'dual-field' },
      component: { componentDefinition: { config: componentConfig } },
      layout: { componentDefinition: { config: layoutConfig } },
      lineagePaths: { layoutJsonPointer: 'dual-field-layout' }
    } as unknown as FormFieldCompMapEntry;

    producer.bind({ isLayout: true, component: layoutInstance, definition });
    render();
    eventBus.publish.calls.reset();

    // Mutate the LAYOUT config only.
    layoutConfig.readonly = true;
    render();

    const events = uiAttrEvents();
    expect(events.length).toBe(1);
    // Should reflect layout config (visible=false from initial, readonly=true from mutation).
    expect(events[0].meta['visible']).toBe(false);
    expect(events[0].meta['readonly']).toBe(true);
  });

  it('should stop detecting layout changes after destroy', () => {
    const { component, definition, config } = createLayoutBindingOptions('layout-3');
    producer.bind({ isLayout: true, component, definition });
    render();

    producer.destroy();
    eventBus.publish.calls.reset();

    config.visible = false;
    render();

    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

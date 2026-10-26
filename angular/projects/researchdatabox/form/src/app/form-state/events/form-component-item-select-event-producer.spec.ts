import { Injector, signal, WritableSignal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormFieldBaseComponent, LoggerService } from '@researchdatabox/portal-ng-common';
import { EMPTY } from 'rxjs';
import { buildLineagePaths } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus, ScopedEventBus } from './form-component-event-bus.service';
import { FormComponentItemSelectEventProducer } from './form-component-item-select-event-producer';
import { FieldItemSelectedEvent, FormComponentEventResult, FormComponentEventType } from './form-component-event.types';
import { FormComponentEventBindingOptions } from './form-component-base-event-producer-consumer';

describe('FormComponentItemSelectEventProducer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let producer: FormComponentItemSelectEventProducer;
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });

    injector = TestBed.inject(Injector);
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['publish', 'scoped', 'select$']);
    eventBus.select$.and.returnValue(EMPTY);

    producer = TestBed.runInInjectionContext(() => new FormComponentItemSelectEventProducer(eventBus));
  });

  function createOptions(
    selectedItemSignal: WritableSignal<unknown | null> | undefined,
    fieldId: string | null = '/record/title',
    withInjector = true
  ): FormComponentEventBindingOptions {
    const lineagePaths = { ...buildLineagePaths(), angularComponentsJsonPointer: fieldId ?? undefined };

    return {
      component: Object.assign(jasmine.createSpyObj<FormFieldBaseComponent<unknown>>('Component', ['formFieldConfigName']), { selectedItem: selectedItemSignal }),
      definition: {
        compConfigJson: { name: 'lookup', component: { class: 'TypeaheadInputComponent' } },
        lineagePaths
      },
      injector: withInjector ? injector : undefined
    };
  }

  it('should publish field.item.selected event when selectedItem changes', fakeAsync(() => {
    const selectedItem = signal<unknown | null>(null);
    const options = createOptions(selectedItem, '/record/title');

    producer.bind(options);

    selectedItem.set({ id: '1', label: 'Title 1' });
    tick();

    expect(eventBus.publish).toHaveBeenCalledTimes(1);

    const event = eventBus.publish.calls.mostRecent().args[0] as FormComponentEventResult<FieldItemSelectedEvent>;
    expect(event.type).toBe(FormComponentEventType.FIELD_ITEM_SELECTED);
    expect(event.fieldId).toBe('/record/title');
    expect(event.sourceId).toBe('/record/title');
    expect(event.selectedItem).toEqual({ id: '1', label: 'Title 1' });
  }));

  it('should skip initial null emission and publish when value becomes non-null', fakeAsync(() => {
    const selectedItem = signal<unknown | null>(null);

    producer.bind(createOptions(selectedItem));
    tick();

    expect(eventBus.publish).not.toHaveBeenCalled();

    selectedItem.set({ id: '2' });
    tick();

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  }));

  it('should publish clear event when value changes from non-null to null', fakeAsync(() => {
    const selectedItem = signal<unknown | null>({ id: 'first' });

    producer.bind(createOptions(selectedItem));
    tick();
    eventBus.publish.calls.reset();

    selectedItem.set(null);
    tick();

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const event = eventBus.publish.calls.mostRecent().args[0] as FormComponentEventResult<FieldItemSelectedEvent>;
    expect(event.type).toBe(FormComponentEventType.FIELD_ITEM_SELECTED);
    expect(event.selectedItem).toBeNull();
  }));

  it('publishes an explicit clear after the initial null without requiring a lookup selection', fakeAsync(() => {
    const selectedItem = signal<unknown | null>(null, { equal: () => false });
    producer.bind(createOptions(selectedItem));
    tick();
    expect(eventBus.publish).not.toHaveBeenCalled();

    selectedItem.set(null);
    tick();
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const event = eventBus.publish.calls.mostRecent().args[0] as FormComponentEventResult<FieldItemSelectedEvent>;
    expect(event.selectedItem).toBeNull();
  }));

  it('should not bind when selectedItem signal is missing', () => {
    producer.bind(createOptions(undefined));

    expect(eventBus.scoped).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('should not bind when field pointer is missing', () => {
    const selectedItem = signal<unknown | null>(null);

    producer.bind(createOptions(selectedItem, null));

    expect(eventBus.scoped).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('should not bind when injector is missing', () => {
    const selectedItem = signal<unknown | null>(null);

    producer.bind(createOptions(selectedItem, '/record/title', false));

    expect(eventBus.scoped).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('should stop publishing after destroy', fakeAsync(() => {
    const selectedItem = signal<unknown | null>(null);

    producer.bind(createOptions(selectedItem));
    selectedItem.set({ id: 'first' });
    tick();
    expect(eventBus.publish).toHaveBeenCalledTimes(1);

    producer.destroy();
    eventBus.publish.calls.reset();

    selectedItem.set({ id: 'second' });
    tick();

    expect(eventBus.publish).not.toHaveBeenCalled();
  }));

  it('defers sibling autofill outside the signal render and cancels a queued selection on destroy', fakeAsync(() => {
    const selectedItem = signal<unknown | null>(null);
    producer.bind(createOptions(selectedItem));
    tick();
    selectedItem.set({ id: 'queued' });
    TestBed.flushEffects();
    expect(eventBus.publish).not.toHaveBeenCalled();
    producer.destroy();
    tick();
    expect(eventBus.publish).not.toHaveBeenCalled();
  }));

  it('discards an earlier queued selection after a newer clear', fakeAsync(() => {
    const selectedItem = signal<unknown>(undefined, { equal: () => false });
    producer.bind(createOptions(selectedItem));
    tick();
    eventBus.publish.calls.reset();
    selectedItem.set({ id: 'stale' });
    TestBed.flushEffects();
    selectedItem.set(null);
    tick();
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(jasmine.objectContaining({ selectedItem: null }));
    producer.destroy();
  }));

  it('cancels queued events on rebind and publishes only from the replacement field', fakeAsync(() => {
    const oldSelection = signal<unknown>(null);
    producer.bind(createOptions(oldSelection, '/people/old/name'));
    tick();
    oldSelection.set({ id: 'old' });
    TestBed.flushEffects();
    const replacement = signal<unknown>(null);
    producer.bind(createOptions(replacement, '/people/new/name'));
    tick();
    expect(eventBus.publish).not.toHaveBeenCalled();
    replacement.set({ id: 'new' });
    tick();
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(jasmine.objectContaining({ fieldId: '/people/new/name', selectedItem: { id: 'new' } }));
    producer.destroy();
  }));
});

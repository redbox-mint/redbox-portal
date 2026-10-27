import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { FormFieldModel, LoggerService } from '@researchdatabox/portal-ng-common';
import { Subject } from 'rxjs';
import { FormComponentEventBus, ScopedEventBus } from './form-component-event-bus.service';
import { FormComponentItemSelectEventConsumer } from './form-component-item-select-event-consumer';
import { FieldItemSelectedEvent, FormComponentEventType } from './form-component-event.types';
import { buildLineagePaths } from '@researchdatabox/sails-ng-common';
import { FormComponent } from '../../form.component';
import { FormComponentEventBindingOptions } from './form-component-base-event-producer-consumer';
import { CustomSetValueControl } from '../custom-set-value.control';

describe('FormComponentItemSelectEventConsumer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let consumer: FormComponentItemSelectEventConsumer;
  let eventStream$: Subject<FieldItemSelectedEvent>;
  let scopedBus: jasmine.SpyObj<ScopedEventBus>;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });

    eventStream$ = new Subject<FieldItemSelectedEvent>();
    scopedBus = jasmine.createSpyObj<ScopedEventBus>('ScopedEventBus', ['publish']);
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['select$', 'publish', 'scoped']);
    eventBus.select$.and.returnValue(eventStream$.asObservable());
    eventBus.scoped.and.returnValue(scopedBus);

    consumer = TestBed.runInInjectionContext(() => new FormComponentItemSelectEventConsumer(eventBus));
  });

  afterEach(() => {
    consumer.destroy();
  });

  function createBindOptions(
    ownPointer = '/record/contributors/0/funderName',
    onItemSelect: { rawPath: string; clearValue?: unknown } | null = {
      rawPath: 'label',
      clearValue: ''
    }
  ): { control: FormControl<unknown>; options: FormComponentEventBindingOptions } {
    const control = new FormControl<unknown>('');
    const model = new FormFieldModel<unknown>({ class: 'SimpleInputModel', config: {} });
    model.formControl = control;
    new FormGroup({
      funderName: control,
      funderSearch: new FormControl('')
    });

    const config = onItemSelect === null ? {} : { onItemSelect };

    return {
      control,
      options: {
        definition: {
          model,
          lineagePaths: { ...buildLineagePaths(), angularComponentsJsonPointer: ownPointer },
          compConfigJson: {
            name: 'funderName',
            component: {
              class: 'SimpleInputComponent',
              config: {
                ...config
              }
            }
          }
        }
      }
    };
  }

  function emitEvent(fieldId: string, selectedItem: unknown | null): void {
    eventStream$.next({
      type: FormComponentEventType.FIELD_ITEM_SELECTED,
      fieldId,
      sourceId: fieldId,
      selectedItem,
      timestamp: Date.now()
    });
  }

  it('retains the wrapper form reference when bind omits it and refreshes status after clearing', async () => {
    const form = jasmine.createSpyObj<FormComponent>('FormComponent', ['broadcastFormStatus']);
    consumer.formComponent = form;
    const { control, options } = createBindOptions();
    consumer.bind(options);
    emitEvent('/record/contributors/0/funderSearch', null);
    await Promise.resolve();
    expect(control.value).toBe('');
    expect(consumer.formComponent).toBe(form);
    expect(form.broadcastFormStatus).toHaveBeenCalledTimes(1);
  });

  it('uses an explicitly supplied replacement form reference', async () => {
    consumer.formComponent = jasmine.createSpyObj<FormComponent>('OldForm', ['broadcastFormStatus']);
    const form = jasmine.createSpyObj<FormComponent>('NewForm', ['broadcastFormStatus']);
    const { options } = createBindOptions();
    consumer.bind({ ...options, formComponent: form });
    emitEvent('/record/contributors/0/funderSearch', { label: 'Selected' });
    await Promise.resolve();
    expect(consumer.formComponent).toBe(form);
    expect(form.broadcastFormStatus).toHaveBeenCalledTimes(1);
  });

  it('should subscribe to FIELD_ITEM_SELECTED when onItemSelect is configured', () => {
    const { options } = createBindOptions();

    consumer.bind(options);

    expect(eventBus.select$).toHaveBeenCalledWith(FormComponentEventType.FIELD_ITEM_SELECTED);
  });

  it('should skip binding when onItemSelect is not configured', () => {
    const { options } = createBindOptions('/record/contributors/0/funderName', null);

    consumer.bind(options);

    expect(eventBus.select$).not.toHaveBeenCalled();
  });

  it('should set control value from selectedItem.raw path for sibling event', async () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options);

    emitEvent('/record/contributors/0/funderSearch', {
      raw: {
        identifier: 'https://example.org/funder/123'
      },
      identifier: 'fallback-value'
    });
    await Promise.resolve();

    expect(control.value).toBe('https://example.org/funder/123');
    expect(control.dirty).toBeTrue();
    expect(control.touched).toBeTrue();
  });

  it('should broadcast form status after silent item selection updates', async () => {
    const { options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });
    const formComponent = jasmine.createSpyObj<FormComponent>('FormComponent', ['broadcastFormStatus']);

    consumer.bind({ ...options, formComponent });

    emitEvent('/record/contributors/0/funderSearch', {
      raw: {
        identifier: 'https://example.org/funder/status'
      }
    });
    await Promise.resolve();

    expect(formComponent.broadcastFormStatus).toHaveBeenCalledTimes(1);
  });

  it('should fall back to selectedItem path when raw path is unavailable', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options);

    emitEvent('/record/contributors/0/funderSearch', {
      identifier: 'https://example.org/funder/direct'
    });

    expect(control.value).toBe('https://example.org/funder/direct');
  });

  it('should set clearValue when selected item is null', async () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: 'N/A'
    });

    consumer.bind(options);
    control.setValue('existing');

    emitEvent('/record/contributors/0/funderSearch', null);
    await Promise.resolve();

    expect(control.value).toBe('N/A');
    expect(control.dirty).toBeTrue();
    expect(control.touched).toBeTrue();
  });

  it('should default clear value to null when no clearValue configured', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier'
    });

    consumer.bind(options);
    control.setValue('existing');

    emitEvent('/record/contributors/0/funderSearch', { raw: {} });

    expect(control.value).toBeNull();
  });

  it('should use a custom control value setter when one is registered', async () => {
    const { control: originalControl, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });
    const customSetter = jasmine.createSpy<CustomSetValueControl['setCustomValue']>('customSetter').and.resolveTo(undefined);
    const control = Object.assign(originalControl, { setCustomValue: customSetter });
    const setValueSpy = spyOn(control, 'setValue').and.callThrough();

    consumer.bind(options);

    emitEvent('/record/contributors/0/funderSearch', {
      raw: {
        identifier: 'https://example.org/funder/custom'
      }
    });
    await Promise.resolve();

    expect(customSetter).toHaveBeenCalledWith('https://example.org/funder/custom', { emitEvent: false });
    expect(setValueSpy).not.toHaveBeenCalled();
  });

  it('should rebroadcast the parent group value after applying an item selection', async () => {
    const { options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options);

    emitEvent('/record/contributors/0/funderSearch', {
      raw: {
        identifier: 'https://example.org/funder/parent'
      }
    });
    await Promise.resolve();

    expect(eventBus.scoped).toHaveBeenCalledWith('/record/contributors/0');
    expect(scopedBus.publish).toHaveBeenCalledWith(jasmine.objectContaining({
      fieldId: '/record/contributors/0'
    }));
    expect(eventBus.publish).toHaveBeenCalledWith(jasmine.objectContaining({
      fieldId: '/record/contributors/0',
      sourceId: '*',
      value: {
        funderName: 'https://example.org/funder/parent',
        funderSearch: ''
      }
    }));
  });

  it('should ignore events from same field (self)', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options);

    emitEvent('/record/contributors/0/funderName', {
      raw: { identifier: 'self-value' }
    });

    expect(control.value).toBe('');
  });

  it('should ignore sibling events when the consumer pointer has no parent scope', () => {
    const { control, options } = createBindOptions('/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options);

    emitEvent('/record/contributors/0/funderSearch', {
      raw: { identifier: 'other-value' }
    });

    expect(control.value).toBe('');
    expect(eventBus.scoped).not.toHaveBeenCalled();
  });

  it('should ignore events outside sibling scope', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options);

    emitEvent('/record/contributors/1/funderSearch', {
      raw: { identifier: 'other-row-value' }
    });

    expect(control.value).toBe('');
  });

  it('should stop reacting to events after destroy', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options);
    consumer.destroy();

    emitEvent('/record/contributors/0/funderSearch', {
      raw: { identifier: 'value-after-destroy' }
    });

    expect(control.value).toBe('');
  });

  for (const rebind of [false, true]) {
    it(`does not finish an asynchronous selection against a ${rebind ? 'replacement' : 'destroyed'} binding`, async () => {
      const { control, options } = createBindOptions();
      let finish!: () => void;
      const pending = new Promise<void>(resolve => { finish = resolve; });
      Object.assign(control, { setCustomValue: () => pending });
      const form = jasmine.createSpyObj<FormComponent>('Form', ['broadcastFormStatus']);
      consumer.bind({ ...options, formComponent: form });
      emitEvent('/record/contributors/0/funderSearch', { label: 'Old selection' });
      consumer.destroy();
      if (rebind) {
        const replacement = createBindOptions('/record/contributors/1/funderName');
        consumer.bind({ ...replacement.options, formComponent: form });
      }
      finish();
      await pending;
      expect(control.pristine).toBeTrue();
      expect(control.untouched).toBeTrue();
      expect(eventBus.publish).not.toHaveBeenCalled();
      expect(form.broadcastFormStatus).not.toHaveBeenCalled();
    });
  }
});

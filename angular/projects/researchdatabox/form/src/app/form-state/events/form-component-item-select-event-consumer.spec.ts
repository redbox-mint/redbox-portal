import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { Subject } from 'rxjs';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { FormComponentItemSelectEventConsumer } from './form-component-item-select-event-consumer';
import { FieldItemSelectedEvent, FormComponentEventType } from './form-component-event.types';
import { CustomSetValueControl } from '../custom-set-value.control';

describe('FormComponentItemSelectEventConsumer', () => {
  let eventBus: jasmine.SpyObj<FormComponentEventBus>;
  let consumer: FormComponentItemSelectEventConsumer;
  let eventStream$: Subject<FieldItemSelectedEvent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LoggerService]
    });

    eventStream$ = new Subject<FieldItemSelectedEvent>();
    eventBus = jasmine.createSpyObj<FormComponentEventBus>('FormComponentEventBus', ['select$']);
    eventBus.select$.and.returnValue(eventStream$.asObservable());

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
  ) {
    const control = new FormControl('');

    const config = onItemSelect === null ? {} : { onItemSelect };

    return {
      control,
      options: {
        definition: {
          model: { formControl: control },
          lineagePaths: {
            angularComponentsJsonPointer: ownPointer
          },
          compConfigJson: {
            component: {
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

  it('should subscribe to FIELD_ITEM_SELECTED when onItemSelect is configured', () => {
    const { options } = createBindOptions();

    consumer.bind(options as any);

    expect(eventBus.select$).toHaveBeenCalledWith(FormComponentEventType.FIELD_ITEM_SELECTED);
  });

  it('should skip binding when onItemSelect is not configured', () => {
    const { options } = createBindOptions('/record/contributors/0/funderName', null);

    consumer.bind(options as any);

    expect(eventBus.select$).not.toHaveBeenCalled();
  });

  it('should set control value from selectedItem.raw path for sibling event', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options as any);

    emitEvent('/record/contributors/0/funderSearch', {
      raw: {
        identifier: 'https://example.org/funder/123'
      },
      identifier: 'fallback-value'
    });

    expect(control.value).toBe('https://example.org/funder/123');
  });

  it('should fall back to selectedItem path when raw path is unavailable', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options as any);

    emitEvent('/record/contributors/0/funderSearch', {
      identifier: 'https://example.org/funder/direct'
    });

    expect(control.value).toBe('https://example.org/funder/direct');
  });

  it('should set clearValue when selected item is null', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: 'N/A'
    });

    consumer.bind(options as any);
    control.setValue('existing');

    emitEvent('/record/contributors/0/funderSearch', null);

    expect(control.value).toBe('N/A');
  });

  it('should default clear value to null when no clearValue configured', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier'
    });

    consumer.bind(options as any);
    control.setValue('existing');

    emitEvent('/record/contributors/0/funderSearch', { raw: {} });

    expect(control.value).toBeNull();
  });

  it('should use a custom control value setter when one is registered', async () => {
    const { options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });
    const control = options.definition.model.formControl as FormControl & CustomSetValueControl<unknown>;
    const customSetter = jasmine.createSpy('customSetter').and.resolveTo(undefined);
    control.setCustomValue = customSetter;
    const setValueSpy = spyOn(control, 'setValue').and.callThrough();

    consumer.bind(options as any);

    emitEvent('/record/contributors/0/funderSearch', {
      raw: {
        identifier: 'https://example.org/funder/custom'
      }
    });
    await Promise.resolve();

    expect(customSetter).toHaveBeenCalledWith('https://example.org/funder/custom', { emitEvent: false });
    expect(setValueSpy).not.toHaveBeenCalled();
  });

  it('should ignore events from same field (self)', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options as any);

    emitEvent('/record/contributors/0/funderName', {
      raw: { identifier: 'self-value' }
    });

    expect(control.value).toBe('');
  });

  it('should ignore events outside sibling scope', () => {
    const { control, options } = createBindOptions('/record/contributors/0/funderName', {
      rawPath: 'identifier',
      clearValue: ''
    });

    consumer.bind(options as any);

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

    consumer.bind(options as any);
    consumer.destroy();

    emitEvent('/record/contributors/0/funderSearch', {
      raw: { identifier: 'value-after-destroy' }
    });

    expect(control.value).toBe('');
  });
});

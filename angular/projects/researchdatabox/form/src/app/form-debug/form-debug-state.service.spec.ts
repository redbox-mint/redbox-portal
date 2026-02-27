import { TestBed } from '@angular/core/testing';
import { FormDebugStateService } from './form-debug-state.service';
import { FormComponentEventType } from '../form-state/events/form-component-event.types';

describe('FormDebugStateService', () => {
  let service: FormDebugStateService;
  const createFieldValueChangedEvent = (fieldId: string, sourceId: string, value: string) => ({
    type: FormComponentEventType.FIELD_VALUE_CHANGED,
    timestamp: Date.now(),
    fieldId,
    sourceId,
    value
  }) as const;

  const setFormDebugUrl = (value?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('formDebug');
    if (value) {
      url.searchParams.set('formDebug', value);
    }
    window.history.replaceState({}, '', url.toString());
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FormDebugStateService]
    });
    service = TestBed.inject(FormDebugStateService);
    service.clearDebugEvents();
  });

  afterEach(() => {
    setFormDebugUrl();
  });

  it('enables debug mode for true-like formDebug URL params', () => {
    setFormDebugUrl('YES');
    service.refreshFromUrl();
    expect(service.isDebugEnabled()).toBeTrue();
  });

  it('disables debug mode when formDebug URL param is absent or invalid', () => {
    setFormDebugUrl();
    service.refreshFromUrl();
    expect(service.isDebugEnabled()).toBeFalse();

    setFormDebugUrl('off');
    service.refreshFromUrl();
    expect(service.isDebugEnabled()).toBeFalse();
  });

  it('captures events only when enabled and not paused', () => {
    setFormDebugUrl('1');
    service.refreshFromUrl();
    service.debugEventPaused.set(false);

    service.captureDebugEvent(createFieldValueChangedEvent('field_one', 's1', 'v1') as any);
    expect(service.debugEvents().length).toBe(1);

    service.debugEventPaused.set(true);
    service.captureDebugEvent(createFieldValueChangedEvent('field_two', 's2', 'v2') as any);
    expect(service.debugEvents().length).toBe(1);
  });

  it('filters and trims event history', () => {
    setFormDebugUrl('1');
    service.refreshFromUrl();
    service.setDebugEventMaxItems(2);

    service.captureDebugEvent(createFieldValueChangedEvent('field_alpha', 'source-primary', '1') as any);
    service.captureDebugEvent(createFieldValueChangedEvent('field_beta', 'source-secondary', '2') as any);
    service.captureDebugEvent(createFieldValueChangedEvent('field_alpha', 'source-primary', '3') as any);

    expect(service.debugEvents().length).toBe(2);
    service.debugEventFilterType.set(FormComponentEventType.FIELD_VALUE_CHANGED);
    service.debugEventFilterFieldId.set('alpha');
    service.debugEventFilterSourceId.set('primary');

    const filtered = service.getFilteredDebugEvents();
    expect(filtered.length).toBe(1);
    expect(filtered[0].fieldId).toBe('field_alpha');
  });
});

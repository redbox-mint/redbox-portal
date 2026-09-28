import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { FormDebugStateService } from './form-debug-state.service';
import { FormComponentEventType } from '../form-state/events/form-component-event.types';

describe('FormDebugStateService', () => {
  let service: FormDebugStateService;
  let testDocument: { location: { href: string } };
  let originalBroadcastChannel: typeof BroadcastChannel | undefined;
  const createFieldValueChangedEvent = (fieldId: string, sourceId: string, value: string) => ({
    type: FormComponentEventType.FIELD_VALUE_CHANGED,
    timestamp: Date.now(),
    fieldId,
    sourceId,
    value
  }) as const;

  const setFormDebugUrl = (value?: string, popout = false) => {
    const url = new URL(testDocument.location.href);
    url.searchParams.delete('formDebug');
    url.searchParams.delete('formDebugPopout');
    if (value) {
      url.searchParams.set('formDebug', value);
    }
    if (popout) {
      url.searchParams.set('formDebugPopout', '1');
    }
    testDocument.location.href = url.toString();
  };

  const initService = () => {
    service = TestBed.inject(FormDebugStateService);
    service.clearDebugEvents();
  };

  beforeEach(() => {
    // Avoid shared browser history and Chrome throttling rapid replaceState calls.
    testDocument = { location: { href: 'http://localhost/default/rdmp/record/edit/test-record' } };
    TestBed.configureTestingModule({
      providers: [
        FormDebugStateService,
        { provide: DOCUMENT, useValue: testDocument }
      ]
    });
    originalBroadcastChannel = (window as any).BroadcastChannel;
  });

  afterEach(() => {
    service?.ngOnDestroy();
    (window as any).BroadcastChannel = originalBroadcastChannel;
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  });

  it('enables debug mode for true-like formDebug URL params', () => {
    initService();
    setFormDebugUrl('YES');
    service.refreshFromUrl();
    expect(service.isDebugEnabled()).toBeTrue();
  });

  it('disables debug mode when formDebug URL param is absent or invalid', () => {
    initService();
    setFormDebugUrl();
    service.refreshFromUrl();
    expect(service.isDebugEnabled()).toBeFalse();

    setFormDebugUrl('off');
    service.refreshFromUrl();
    expect(service.isDebugEnabled()).toBeFalse();
  });

  it('captures events only when enabled and not paused', () => {
    initService();
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
    initService();
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

  it('sorts filtered events by newest first by default and supports sort toggling', () => {
    initService();
    setFormDebugUrl('1');
    service.refreshFromUrl();

    service.captureDebugEvent({
      ...createFieldValueChangedEvent('field_a', 'source_z', 'v1'),
      timestamp: 1000
    } as any);
    service.captureDebugEvent({
      ...createFieldValueChangedEvent('field_b', 'source_a', 'v2'),
      timestamp: 3000
    } as any);
    service.captureDebugEvent({
      ...createFieldValueChangedEvent('field_c', 'source_m', 'v3'),
      timestamp: 2000
    } as any);

    const defaultSorted = service.getFilteredDebugEvents().map((event) => event.timestamp);
    expect(defaultSorted).toEqual([3000, 2000, 1000]);

    service.toggleDebugEventSort('timestamp');
    const ascending = service.getFilteredDebugEvents().map((event) => event.timestamp);
    expect(ascending).toEqual([1000, 2000, 3000]);

    service.toggleDebugEventSort('sourceId');
    const sourceSorted = service.getFilteredDebugEvents().map((event) => event.sourceId);
    expect(sourceSorted).toEqual(['source_a', 'source_m', 'source_z']);
  });

  it('publishes captured events to BroadcastChannel when not in popout mode', () => {
    const postedMessages: unknown[] = [];
    class MockBroadcastChannel {
      onmessage: ((event: MessageEvent<any>) => void) | null = null;
      close(): void { }
      postMessage(message: unknown): void {
        postedMessages.push(message);
      }
    }

    (window as any).BroadcastChannel = MockBroadcastChannel as any;
    (globalThis as any).BroadcastChannel = MockBroadcastChannel as any;
    setFormDebugUrl('1');
    initService();
    service.refreshFromUrl();
    service.captureDebugEvent(createFieldValueChangedEvent('field_pub', 'source_pub', 'value_pub') as any);

    expect(postedMessages.length).toBe(1);
    const msg = postedMessages[0] as any;
    expect(msg.scope).toContain('formDebug=1');
    expect(msg.scope).not.toContain('formDebugPopout');
    expect(msg.event.fieldId).toBe('field_pub');
  });

  it('consumes matching-scope BroadcastChannel events in popout mode', () => {
    const channels: Array<{ onmessage: ((event: MessageEvent<any>) => void) | null }> = [];
    class MockBroadcastChannel {
      onmessage: ((event: MessageEvent<any>) => void) | null = null;
      constructor() {
        channels.push(this);
      }
      close(): void { }
      postMessage(): void { }
    }

    (window as any).BroadcastChannel = MockBroadcastChannel as any;
    (globalThis as any).BroadcastChannel = MockBroadcastChannel as any;
    setFormDebugUrl('1', true);
    initService();
    service.refreshFromUrl();
    expect(service.isDebugPopoutWindow()).toBeTrue();

    const scopeUrl = new URL(testDocument.location.href);
    scopeUrl.searchParams.delete('formDebugPopout');
    const matchingScope = `${scopeUrl.pathname}?${scopeUrl.searchParams.toString()}`;
    const nonMatchingScope = `${matchingScope}&x=1`;

    channels[0].onmessage?.({
      data: {
        scope: nonMatchingScope,
        event: createFieldValueChangedEvent('ignored_field', 'source', 'ignored')
      }
    } as MessageEvent<any>);
    expect(service.debugEvents()).toEqual([]);

    channels[0].onmessage?.({
      data: {
        scope: matchingScope,
        event: createFieldValueChangedEvent('accepted_field', 'source', 'accepted')
      }
    } as MessageEvent<any>);

    expect(service.debugEvents().length).toBe(1);
    expect(service.debugEvents()[0].fieldId).toBe('accepted_field');
  });
});

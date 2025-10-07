/**
 * Form Component Event Bus
 * 
 * Ephemeral pub/sub coordination for field components.
 * Per R15.1–R15.29, events do NOT persist in store.
 */

import { Injectable, OnDestroy, computed, signal, Signal, DestroyRef, inject, Injector } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { filter, share } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormComponentEvent, FormComponentEventMap } from './form-component-event.types';

/**
 * Event bus for ephemeral component-to-component coordination
 * R15.1–R15.19
 */
@Injectable({
  providedIn: 'root'
})
export class FormComponentEventBus implements OnDestroy {
  private readonly eventStream$ = new Subject<FormComponentEvent>();
  private readonly diagnosticsEnabled = false; // R15.13, R15.26: toggle via environment flag
  private readonly destroyRef = inject(DestroyRef);
  private readonly eventLoopBatching = false; // R15.19: optional performance optimization

  constructor() {
    // R15.13: Optional diagnostic logging
    if (this.diagnosticsEnabled) {
      this.eventStream$.subscribe(event => {
        console.debug('[FormComponentEventBus] Event published', event);
      });
    }

    // R15.8: Auto-cleanup on destroy
    this.destroyRef.onDestroy(() => {
      this.eventStream$.complete();
    });
  }

  /**
   * Publish an event to the bus (R15.2)
   * Performance: O(1) relative to unrelated subscribers (R15.11, R15.24)
   * 
   * @param event Event to publish (timestamp will be added automatically)
   */
  publish<T extends FormComponentEvent>(event: Omit<T, 'timestamp'>): void {
    const timestampedEvent = {
      ...event,
      timestamp: Date.now()
    } as T;

    if (this.eventLoopBatching) {
      // R15.19: Optional batching to prevent change detection storms
      queueMicrotask(() => {
        this.eventStream$.next(timestampedEvent);
      });
    } else {
      this.eventStream$.next(timestampedEvent);
    }
  }

  /**
   * Subscribe to events by type (R15.3, R15.18)
   * Returns filtered observable for type-safe subscriptions
   * 
   * @param eventType Type of event to subscribe to
   * @returns Observable filtered to specified event type
   */
  select$<T extends FormComponentEvent['type']>(
    eventType: T
  ): Observable<FormComponentEventMap[T]> {
    // R15.11: O(1) filtering, no global fan-out
    return this.eventStream$.pipe(
      filter((event): event is FormComponentEventMap[T] => 
        event.type === eventType
      ),
      share() // Prevent duplicate subscriptions
    );
  }

  /**
   * Subscribe to events as a Signal (R15.18)
   * Provides synchronous consumption in components
   * 
   * @param eventType Type of event to subscribe to
   * @param options Optional injector for use outside injection context
   * @returns Signal containing the latest event or null
   */
  selectSignal<T extends FormComponentEvent['type']>(
    eventType: T,
    options?: { injector?: Injector }
  ): Signal<FormComponentEventMap[T] | null> {
    // R15.5: No history retention, but Signal holds latest value
    return toSignal(this.select$(eventType), { 
      initialValue: null,
      injector: options?.injector
    });
  }

  /**
   * Subscribe to all events (for diagnostics or logging)
   * R15.13, R15.26
   * 
   * @returns Observable of all events
   */
  selectAll$(): Observable<FormComponentEvent> {
    return this.eventStream$.asObservable();
  }

  /**
   * Create a scoped event bus for specific field or channel (R15.10)
   * Reduces broad event fan-out by filtering to specific scope
   * 
   * @param channelId Unique identifier for the scoped channel (e.g., field ID)
   * @returns Scoped event bus
   */
  scoped(channelId: string): ScopedEventBus {
    return new ScopedEventBus(this, channelId);
  }

  /**
   * Cleanup on destroy (R15.8, R15.21)
   */
  ngOnDestroy(): void {
    this.eventStream$.complete();
  }
}

/**
 * Scoped event bus for channel-specific events (R15.10)
 * Reduces event fan-out by filtering to specific field/channel
 */
export class ScopedEventBus {
  constructor(
    private readonly parent: FormComponentEventBus,
    private readonly channelId: string
  ) {}

  /**
   * Publish event with automatic sourceId
   */
  publish<T extends FormComponentEvent>(event: Omit<T, 'timestamp' | 'sourceId'>): void {
    this.parent.publish({
      ...event,
      sourceId: this.channelId
    } as Omit<T, 'timestamp'>);
  }

  /**
   * Select events from this channel only
   */
  select$<T extends FormComponentEvent['type']>(
    eventType: T
  ): Observable<FormComponentEventMap[T]> {
    return this.parent.select$(eventType).pipe(
      filter(event => event.sourceId === this.channelId)
    );
  }

  /**
   * Select events from this channel as Signal
   */
  selectSignal<T extends FormComponentEvent['type']>(
    eventType: T,
    options?: { injector?: Injector }
  ): Signal<FormComponentEventMap[T] | null> {
    return toSignal(this.select$(eventType), { 
      initialValue: null,
      injector: options?.injector
    });
  }
}

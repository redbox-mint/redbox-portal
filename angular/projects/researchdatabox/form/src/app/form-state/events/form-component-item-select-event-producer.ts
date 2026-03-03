import { Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { skipWhile } from 'rxjs';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { createFieldItemSelectedEvent } from './form-component-event.types';
import {
  FormComponentEventBaseProducerConsumer,
  FormComponentEventBindingOptions,
} from './form-component-base-event-producer-consumer';

/**
 * Publishes `field.item.selected` events when a component's `selectedItem` signal changes.
 *
 * Designed to be owned by `FormBaseWrapperComponent`.
 * Uses `toObservable` with an explicit injector to safely bridge a signal
 * from a non-component class. The initial `null` emission is skipped via
 * `skipWhile(v => v === null)` to avoid spurious clear events on form init.
 */
export class FormComponentItemSelectEventProducer extends FormComponentEventBaseProducerConsumer {
  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

  /**
   * Connect the producer to a component instance. Replaces any existing subscription.
   */
  bind(options: FormComponentEventBindingOptions): void {
    this.destroy();
    this.options = options;

    const component = options.component as { selectedItem?: Signal<unknown | null> } | undefined;
    if (!component?.selectedItem) {
      return;
    }

    const fieldId = options.definition?.lineagePaths?.angularComponentsJsonPointer;
    if (!fieldId) {
      return;
    }

    if (!options.injector) {
      this.logDebug(
        'FormComponentItemSelectEventProducer: No injector provided. Item select events will not be published.'
      );
      return;
    }

    this.fieldId = fieldId;

    const sub = toObservable(component.selectedItem, { injector: options.injector })
      .pipe(skipWhile(v => v === null))
      .subscribe(selectedItem => {
        this.publishItemSelected(selectedItem);
      });

    this.subscriptions.set('field.item.selected', sub);
  }

  /**
   * Publishes item selected events to the general event bus.
   */
  private publishItemSelected(selectedItem: unknown | null): void {
    if (!this.fieldId) {
      return;
    }

    const baseEvent = createFieldItemSelectedEvent({
      fieldId: this.fieldId,
      selectedItem,
      sourceId: this.fieldId,
    });

    this.eventBus.publish(baseEvent);
  }
}

import { AbstractControl } from '@angular/forms';
import { get as _get } from 'lodash-es';
import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  FormComponentEventType,
  FieldItemSelectedEvent,
  FormComponentEvent,
  FormComponentEventTypeValue,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import { FormComponentEventBindingOptions } from './form-component-base-event-producer-consumer';
import { FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';

/**
 * Consumes `field.item.selected` events from the `FormComponentEventBus`.
 *
 * When a sibling typeahead field publishes an item selection, this consumer
 * extracts a value at `onItemSelect.rawPath` and writes it into the local
 * form control. Scope is limited to siblings sharing the same JSON Pointer
 * parent container.
 */
export class FormComponentItemSelectEventConsumer extends FormComponentEventBaseConsumer {
  protected override readonly consumedEventType: FormComponentEventTypeValue =
    FormComponentEventType.FIELD_ITEM_SELECTED;

  private onItemSelect?: { rawPath: string; clearValue?: unknown };
  private ownPointer?: string;

  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

  /**
   * Override base bind to skip expression-based consumption.
   * Instead, set up subscription filtered by sibling scope.
   */
  override bind(options: FormComponentEventBindingOptions): void {
    this.destroy();
    this.options = options;

    const config = options.definition?.compConfigJson?.component?.config;
    this.onItemSelect = config?.onItemSelect;
    if (!this.onItemSelect) {
      return;
    }

    this.ownPointer = options.definition?.lineagePaths?.angularComponentsJsonPointer;
    if (!this.ownPointer) {
      this.logDebug(
        'FormComponentItemSelectEventConsumer: No JSON pointer available. Item select events will not be consumed.'
      );
      return;
    }

    const control: AbstractControl | undefined =
      options.definition?.model?.formControl ?? options.component?.model?.formControl;
    if (!control) {
      this.logDebug(
        'FormComponentItemSelectEventConsumer: No form control found. Item select events will not be consumed.'
      );
      return;
    }
    this.control = control;

    const sub = this.eventBus
      .select$(FormComponentEventType.FIELD_ITEM_SELECTED)
      .subscribe((event: FormComponentEvent) => {
        const itemEvent = event as FieldItemSelectedEvent;
        if (this.isSiblingEvent(itemEvent)) {
          this.handleItemSelected(itemEvent);
        }
      });
    this.subscriptions.set('field.item.selected', sub);
  }

  /**
   * Explicit no-op override — all consumption goes through handleItemSelected().
   */
  protected override async consumeEvent(
    _event: FormComponentEvent,
    _expression: FormExpressionsConfigFrame
  ): Promise<void> {
    // no-op: consumption is handled by handleItemSelected()
  }

  /**
   * Process a field.item.selected event from a sibling component.
   */
  protected handleItemSelected(event: FieldItemSelectedEvent): void {
    if (!this.control || !this.onItemSelect) {
      return;
    }

    const clearValue = this.onItemSelect.clearValue ?? null;

    if (event.selectedItem === null || event.selectedItem === undefined) {
      this.control.setValue(clearValue, { emitEvent: false });
      return;
    }

    const rawPath = this.onItemSelect.rawPath;
    const selectedItem = event.selectedItem as Record<string, unknown>;

    let resolved: unknown = undefined;
    if (selectedItem['raw'] !== undefined) {
      resolved = _get(selectedItem['raw'], rawPath);
    }
    if (resolved === undefined) {
      resolved = _get(selectedItem, rawPath);
    }
    if (resolved === undefined) {
      resolved = clearValue;
    }

    this.control.setValue(resolved, { emitEvent: false });
  }

  /**
   * Check whether the event's fieldId shares the same parent JSON pointer
   * as this consumer's own pointer (sibling scope).
   */
  private isSiblingEvent(event: FieldItemSelectedEvent): boolean {
    if (!this.ownPointer || !event.fieldId) {
      return false;
    }
    // Don't consume events from self
    if (event.fieldId === this.ownPointer) {
      return false;
    }
    const eventParent = this.getParentPointer(event.fieldId);
    const ownParent = this.getParentPointer(this.ownPointer);
    if (eventParent === null || ownParent === null) {
      return false;
    }
    return eventParent === ownParent;
  }

  /**
   * Extract the parent JSON pointer segment.
   * Returns null for empty, root-only ("/"), or no-slash pointers.
   */
  private getParentPointer(pointer: string): string | null {
    if (!pointer || pointer === '/') {
      return null;
    }
    const lastSlash = pointer.lastIndexOf('/');
    if (lastSlash <= 0) {
      return null;
    }
    return pointer.substring(0, lastSlash);
  }
}

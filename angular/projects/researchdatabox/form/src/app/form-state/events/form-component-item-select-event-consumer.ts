import { AbstractControl } from '@angular/forms';
import { get as _get } from 'lodash-es';
import { FormComponentEventBus } from './form-component-event-bus.service';
import {
  FormComponentEventType,
  createFieldValueChangedEvent,
  FieldItemSelectedEvent,
  FormComponentEvent,
  FormComponentEventTypeValue,
} from './form-component-event.types';
import { FormComponentEventBaseConsumer } from './form-component-base-event-consumer';
import { FormComponentEventBindingOptions } from './form-component-base-event-producer-consumer';
import { FormExpressionsConfigFrame } from '@researchdatabox/sails-ng-common';
import { setControlValue } from '../custom-set-value.control';

/**
 * Consumes `field.item.selected` events from the `FormComponentEventBus`.
 *
 * When a sibling typeahead field publishes an item selection, this consumer
 * extracts a value at `onItemSelect.rawPath` and writes it into the local
 * form control. Scope is limited to siblings sharing the same JSON Pointer
 * parent container.
 *
 * This narrow scope is deliberate: the consumer is a small compatibility layer
 * for sibling-field autofill and does not evaluate expressions. Cross-tree,
 * additive sync flows use the dedicated sync-source consumer instead.
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
    * Instead, subscribe directly and enforce the sibling-only contract in code.
   */
  override bind(options: FormComponentEventBindingOptions): void {
    this.destroy();
    this.options = options;
    this.formComp = options.formComponent;

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
      .subscribe((event: FieldItemSelectedEvent) => {
        if (this.isSiblingEvent(event)) {
          this.handleItemSelected(event);
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
    *
    * The control update is intentionally followed by a parent-group rebroadcast
    * so listeners attached to the containing object see the final selected row
    * value rather than a piecemeal child-field mutation.
   */
  protected async handleItemSelected(event: FieldItemSelectedEvent): Promise<void> {
    const control = this.control;
    if (!control || !this.onItemSelect) {
      return;
    }
    const parentControl = control.parent;
    const previousParentValue = parentControl ? structuredClone(parentControl.value) : undefined;

    const clearValue = this.onItemSelect.clearValue ?? null;

    if (event.selectedItem === null || event.selectedItem === undefined) {
      await setControlValue(control, clearValue, { emitEvent: false });
      control.markAsDirty();
      control.markAsTouched();
      this.publishParentValueChanged(previousParentValue);
      this.formComp?.broadcastFormStatus();
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

    await setControlValue(control, resolved, { emitEvent: false });
    control.markAsDirty();
    control.markAsTouched();
    this.publishParentValueChanged(previousParentValue);
    this.formComp?.broadcastFormStatus();
  }

  /**
   * Rebroadcast the containing group's final value after an item selection updates
   * sibling fields like email/orcid. This preserves selection-only sync behavior
   * for cross-tree expressions listening on the parent group JSON pointer.
   */
  private publishParentValueChanged(previousValue: unknown): void {
    const parentControl = this.control?.parent;
    const ownPointer = this.ownPointer;
    if (!parentControl || !ownPointer) {
      return;
    }

    const parentPointer = this.getParentPointer(ownPointer);
    if (!parentPointer) {
      return;
    }

    const nextValue = structuredClone(parentControl.value);
    const scopedEvent = createFieldValueChangedEvent({
      fieldId: parentPointer,
      value: nextValue,
      previousValue: previousValue === undefined ? undefined : structuredClone(previousValue),
      sourceId: parentPointer
    });
    this.eventBus.scoped(parentPointer).publish(scopedEvent as Omit<typeof scopedEvent, 'timestamp' | 'sourceId'>);

  }

  /**
   * Check whether the event's fieldId shares the same parent JSON pointer
    * as this consumer's own pointer (sibling scope).
    *
    * Keeping this boundary strict avoids surprising cross-tree writes for older
    * form configs that rely on item selection only affecting adjacent fields.
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

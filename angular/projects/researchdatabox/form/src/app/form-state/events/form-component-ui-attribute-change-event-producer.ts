import { signal, effect, EffectRef, Injector, afterNextRender, inject } from '@angular/core';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { createFieldUIAttributeChangedEvent, FormComponentEventType } from './form-component-event.types';
import { FormComponentEventBaseProducerConsumer, FormComponentEventBindingOptions } from './form-component-base-event-producer-consumer';

/**
 * Snapshot of UI-bound attributes from component config.
 */
export interface UIAttributeSnapshot {
  visible: boolean;
  readonly: boolean;
  disabled: boolean;
}

const DEFAULT_UI_SNAPSHOT: Readonly<UIAttributeSnapshot> = Object.freeze({
  visible: true,
  readonly: false,
  disabled: false
});

/**
 * Produces `field.ui-attribute.changed` events when DOM-bound UI attributes
 * (`visible`, `readonly`, `disabled`) on a component's config change.
 *
 * Detection strategy:
 *   config mutation ─► signal update ─► effect ─► afterNextRender ─► emit
 *
 * The producer subscribes to `field.value.changed` events, which are the
 * events processed by `FormComponentValueChangeEventConsumer` that may
 * mutate config properties (e.g. `component.visible`).
 *
 * After each event a macrotask (`setTimeout`) is scheduled to re-snapshot
 * the config—macrotask timing guarantees that all async consumer processing
 * (promise-based `_set()` calls) has settled before the snapshot is taken.
 *
 * If the snapshot differs from the previous one, the signal is updated.
 * An Angular `effect` watches the signal and defers event emission to
 * `afterNextRender`, ensuring DOM bindings reflect the new state before
 * downstream consumers react.
 */
export class FormComponentUIAttributeChangeEventProducer extends FormComponentEventBaseProducerConsumer {
  private readonly injector = inject(Injector);

  /**
   * Signal holding the current UI attribute projection.
   * Custom equality prevents redundant effect runs when config hasn't
   * actually changed.
   */
  private readonly uiAttributes = signal<UIAttributeSnapshot>(
    { ...DEFAULT_UI_SNAPSHOT },
    {
      equal: (a, b) =>
        a.visible === b.visible &&
        a.readonly === b.readonly &&
        a.disabled === b.disabled
    }
  );

  /** Tracks the effect lifecycle for cleanup on re-bind or destroy. */
  private effectRef?: EffectRef;

  /** Guards against scheduling duplicate afterNextRender callbacks. */
  private renderCallbackPending = false;

  /** Whether the first (eager) effect run has completed. */
  private effectInitialised = false;

  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

  /**
   * Connect the producer to a component instance.
   * Replaces any existing subscriptions and effect.
   */
  bind(options: FormComponentEventBindingOptions): void {
    this.destroy();
    this.options = options;

    const fieldId = this.resolveFieldId(options);
    if (!fieldId) {
      this.logDebug(
        `FormComponentUIAttributeChangeEventProducer: Unable to resolve field ID for component '${options.component?.formFieldConfigName()}'. UI attribute change events will not be published.`,
        options.definition
      );
      return;
    }

    this.fieldId = fieldId;
    this.scopedBus = this.eventBus.scoped(fieldId);

    // Snapshot the initial state without emitting.
    this.uiAttributes.set(this.snapshotUIAttributes());
    this.effectInitialised = false;
    this.renderCallbackPending = false;

    // Listen for value-change events that may trigger config mutations.
    // setTimeout ensures all async consumer processing has settled
    // (consumers use await internally) before we re-snapshot config.
    const valueSub = this.eventBus
      .select$(FormComponentEventType.FIELD_VALUE_CHANGED)
      .subscribe(() => {
        setTimeout(() => this.refreshSnapshot(), 0);
      });
    this.subscriptions.set('ui-attr-value-change', valueSub);

    // Effect: signal → afterNextRender → emit.
    // Skips the eager first run to avoid emitting the initial snapshot.
    this.effectRef = effect(() => {
      const snapshot = this.uiAttributes();

      if (!this.effectInitialised) {
        this.effectInitialised = true;
        return;
      }

      // Coalesce: at most one afterNextRender callback at a time.
      if (!this.renderCallbackPending) {
        this.renderCallbackPending = true;
        afterNextRender(() => {
          this.renderCallbackPending = false;
          this.publishUIAttributeChanged(this.uiAttributes());
        }, { injector: this.injector });
      }
    }, { injector: this.injector });
  }

  /**
   * Tear down subscriptions, effect, and pending state.
   */
  override destroy(): void {
    this.effectRef?.destroy();
    this.effectRef = undefined;
    this.renderCallbackPending = false;
    this.effectInitialised = false;
    super.destroy();
  }

  /**
   * Reads the current UI-relevant properties from the component config.
   */
  private snapshotUIAttributes(): UIAttributeSnapshot {
    const config =
      this.options?.definition?.component?.componentDefinition?.config ??
      this.options?.component?.componentDefinition?.config;
    return {
      visible: config?.visible ?? true,
      readonly: config?.readonly ?? false,
      disabled: config?.disabled ?? false
    };
  }

  /**
   * Re-reads the config and pushes it into the signal.
   * The signal's custom equality check prevents no-op updates.
   */
  private refreshSnapshot(): void {
    this.uiAttributes.set(this.snapshotUIAttributes());
  }

  /**
   * Publishes the UI-attribute-changed event on both the general and scoped buses.
   */
  private publishUIAttributeChanged(snapshot: UIAttributeSnapshot): void {
    if (!this.fieldId) {
      return;
    }

    const baseEvent = createFieldUIAttributeChangedEvent({
      fieldId: this.fieldId,
      meta: { ...snapshot },
      sourceId: '*'
    });
    this.eventBus.publish(baseEvent);

    const scopedEvent = createFieldUIAttributeChangedEvent({
      fieldId: this.fieldId,
      meta: { ...snapshot },
      sourceId: this.fieldId
    });
    this.scopedBus?.publish(scopedEvent);
  }
}

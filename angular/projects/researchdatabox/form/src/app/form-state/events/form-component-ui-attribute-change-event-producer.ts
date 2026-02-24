import { afterEveryRender, AfterRenderRef, Injector, inject } from '@angular/core';
import { FormComponentEventBus } from './form-component-event-bus.service';
import { createFieldUIAttributeChangedEvent } from './form-component-event.types';
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
 * (`visible`, `readonly`, `disabled`) on a component's or layout's config
 * change.
 *
 * ### Detection strategy
 *
 *   config mutation ─► render cycle ─► afterRender ─► snapshot compare ─► emit
 *
 * The producer uses Angular's `afterRender` hook to poll the config after
 * every render pass.  A simple equality comparison against the previous
 * snapshot determines whether an event should be published.
 *
 * This design is intentionally **decoupled from upstream event types**.
 * The producer does not subscribe to `FIELD_VALUE_CHANGED`,
 * `FIELD_UI_ATTRIBUTE_CHANGED`, or any other specific event.  Any
 * consumer — current or future — that mutates config properties will be
 * detected after the next render pass, making the producer forward-
 * compatible with arbitrary new producer / consumer pairs.
 *
 * ### Snapshot resolution
 *
 * When `options.isLayout` is `true`, the snapshot reads from the layout
 * definition (`definition.layout.componentDefinition.config`); otherwise
 * from the component definition
 * (`definition.component.componentDefinition.config`).
 *
 * ### Convergence
 *
 * If the emitted event causes downstream consumers to mutate *this*
 * producer's config again, the next `afterRender` invocation will detect
 * and emit the change.  If the re-snapshot is identical to the previous
 * one, no event is emitted, guaranteeing convergence and terminating any
 * potential feedback loop.
 */
export class FormComponentUIAttributeChangeEventProducer extends FormComponentEventBaseProducerConsumer {
  private readonly injector = inject(Injector);

  /** Previous snapshot used for per-render-pass change detection. */
  private previousSnapshot: UIAttributeSnapshot = { ...DEFAULT_UI_SNAPSHOT };

  /** Cleanup handle returned by `afterRender`. */
  private afterRenderRef?: AfterRenderRef;

  constructor(eventBus: FormComponentEventBus) {
    super(eventBus);
  }

  /**
   * Connect the producer to a component or layout instance.
   * Replaces any existing binding.
   *
   * When `options.isLayout` is `true` the producer reads UI attributes
   * from the layout definition; otherwise from the component definition.
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

    // Capture the initial state — no event emitted.
    this.previousSnapshot = this.snapshotUIAttributes();

    // After every render cycle, re-snapshot and publish if changed.
    this.afterRenderRef = afterEveryRender(() => {
      const current = this.snapshotUIAttributes();
      if (!this.snapshotsEqual(current, this.previousSnapshot)) {
        this.previousSnapshot = current;
        this.publishUIAttributeChanged(current);
      }
    }, { injector: this.injector });
  }

  /**
   * Tear down the render hook and base subscriptions.
   */
  override destroy(): void {
    this.afterRenderRef?.destroy();
    this.afterRenderRef = undefined;
    this.previousSnapshot = { ...DEFAULT_UI_SNAPSHOT };
    super.destroy();
  }

  // ── private helpers ──────────────────────────────────────────────────

  /**
   * Reads the current UI-relevant properties from the component's or
   * layout's config. `options.component` can be either instances.
   *
   */
  private snapshotUIAttributes(): UIAttributeSnapshot {
    const config = this.options?.component?.componentDefinition?.config;
    return {
      visible: config?.visible ?? true,
      readonly: config?.readonly ?? false,
      disabled: config?.disabled ?? false
    };
  }

  /**
   * Value-equality check for two snapshots.
   */
  private snapshotsEqual(a: UIAttributeSnapshot, b: UIAttributeSnapshot): boolean {
    return a.visible === b.visible &&
      a.readonly === b.readonly &&
      a.disabled === b.disabled;
  }

  /**
   * Publishes the UI-attribute-changed event on both the general and
   * scoped buses.
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

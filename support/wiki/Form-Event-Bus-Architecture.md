# Form Event Bus Architecture

## Overview

The Form Event Bus provides an ephemeral publish-subscribe coordination mechanism for form components. Events do NOT persist in the NgRx store - they are transient messages used for intra-form coordination.

## Design Principles

The event bus is designed following these principles:

1. **Ephemeral Events**: Events are transient and not stored in state
2. **Type Safety**: Events are discriminated unions with full TypeScript typing
3. **Performance**: O(1) filtering relative to unrelated subscribers
4. **Scoped Channels**: Support for both broadcast and scoped event delivery
5. **Angular Integration**: Works with both RxJS Observables and Angular Signals

## Core Components

### FormComponentEventBus

The central event bus service, provided at root level.

```typescript
@Injectable({ providedIn: 'root' })
export class FormComponentEventBus {
    // Publish an event to all subscribers
    publish<T extends FormComponentEvent>(event: Omit<T, 'timestamp'>): void;
    
    // Subscribe to events by type (RxJS Observable)
    select$<T extends FormComponentEvent['type']>(eventType: T): Observable<FormComponentEventMap[T]>;
    
    // Subscribe to events as Signal
    selectSignal<T extends FormComponentEvent['type']>(eventType: T): Signal<FormComponentEventMap[T] | null>;
    
    // Create a scoped event bus for a specific channel
    scoped(channelId: string): ScopedEventBus;
}
```

### ScopedEventBus

A scoped view of the event bus filtered to a specific channel (typically a field ID).

```typescript
export class ScopedEventBus {
    // Publish with automatic sourceId
    publish<T extends FormComponentEvent>(event: Omit<T, 'timestamp' | 'sourceId'>): void;
    
    // Select events from this channel only
    select$<T extends FormComponentEvent['type']>(eventType: T): Observable<FormComponentEventMap[T]>;
}
```

## Event Types

All events extend `FormComponentEventBase`:

```typescript
interface FormComponentEventBase {
    readonly type: string;      // Discriminator
    readonly timestamp: number; // Auto-added on publish
    readonly sourceId?: string; // Channel/field that published
    readonly behaviourChain?: readonly number[]; // Behaviours already in this event chain
    readonly expressionChain?: readonly string[]; // Expressions that caused this change
    readonly formScopeId?: string; // Owning form instance
    readonly fieldId?: string;  // Target field (if applicable)
}
```

### Field Events

| Event | Interface | Description |
|-------|-----------|-------------|
| `field.value.changed` | `FieldValueChangedEvent` | Field value changed, includes `value` and `previousValue` |
| `field.ui-attribute.changed` | `FieldUIAttributeChangedEvent` | Field UI attribute changed (visibility, enabled, etc.) |
| `field.dependency.trigger` | `FieldDependencyTriggerEvent` | Triggers dependent field updates |
| `field.request.focus` | `FieldFocusRequestEvent` | Requests focus on a field |

### Form Events

| Event | Interface | Description |
|-------|-----------|-------------|
| `form.definition.ready` | `FormDefinitionReadyEvent` | Form fully loaded and initialized |
| `form.definition.changed` | `FormDefinitionChangedEvent` | Form structure changed |
| `form.definition.change.request` | `FormDefinitionChangeRequestEvent` | Request form structure change |
| `form.validation.broadcast` | `FormValidationBroadcastEvent` | Form-wide validation result |
| `form.save.requested` | `FormSaveRequestedEvent` | Save operation requested |
| `form.save.execute` | `FormSaveExecuteEvent` | Command to execute save |
| `form.save.success` | `FormSaveSuccessEvent` | Save completed successfully |
| `form.save.failure` | `FormSaveFailureEvent` | Save failed |

## Event Producers

Event producers emit events when component state changes.

### FormComponentValueChangeEventProducer

Listens to form control `valueChanges` and publishes `field.value.changed` events.

```typescript
export class FormComponentValueChangeEventProducer {
    // Bind to a component and start producing events
    bind(options: FormComponentEventBindingOptions): void;
    
    // Stop producing events
    destroy(): void;
}
```

**Event Publishing Behavior**:
- Publishes to the general channel with `sourceId: '*'` (broadcast)
- Publishes to the scoped channel with `sourceId: fieldId`
- Tracks `previousValue` for change detection
- Publishes initial value on `form.definition.ready`

### Expression-driven value notifications

An expression targeting `model.value` uses `applyExpressionTarget` to write
changed values with notifications enabled. The same path serves behaviour
`setUIProperty` / `setUIProperties` targets and `runTemplate` `applyResults`
assignments to `model.value`. Behaviour `setValue` / `setValues` actions retain
their silent-write contract and require an explicit `emitEvent` for follow-up
notifications.

The write and notification sequence is:

1. Compare the current and requested values by content. An equal value skips the
   write and its notification.
2. `withExpressionValueNotifications` supplies a fresh options object containing
   `{ emitEvent: true, onlySelf: true }` to `setControlValue`. The changed control
   validates without a second validation pass for notification purposes.
3. Before the bound producer publishes each value change, containing controls
   refresh their aggregate values silently. This ensures event handlers see
   `formData` consistent with the change, including for children of a group being
   populated. It avoids extra ancestor value events while retaining asynchronous
   validation events from the changed control.
4. After the setter completes, the framework awaits display synchronisation and
   broadcasts form status. Controls without a bound producer still receive an
   ancestor refresh.

Notifications are immediate as changes occur, including during asynchronous
setters; they are not held until the setter's promise resolves. Repeatable
replacement suppresses intermediate row changes and publishes the completed
array once. Its definition-change notification follows row initialisation and
precedes the final value notification, so component queries include the new
nested fields.

### Tracking the cause of a value change

Events carry optional `expressionChain` and `behaviourChain` metadata. Expression
consumers skip events containing their own expression identity; behaviour
handlers likewise skip chains they have already handled. Behaviour value writes
through `applyExpressionTarget` and explicit `emitEvent` actions preserve the
incoming chains. This stops feedback through expressions and behaviours without
blocking later independent edits.

A pending asynchronous write does not make every intervening edit part of that
chain. The framework attributes changes made synchronously by the write, and
later changes identified by that write's options object. Independent user edits
start a fresh chain, even if the user enters the same value the pending write
intends to set.

### Asynchronous custom value setters

Controls implementing `CustomSetValueControl.setCustomValue(value, options)`
must pass the **same options object** they receive to their own value-changing
control methods after an `await`, such as `setValue`, `patchValue` or `push`.
The object's identity connects that later notification to the originating write
for cycle detection. Copying the options or replacing them with a new object
loses that connection.

Honour the supplied `emitEvent` and `onlySelf` settings. Publish a composite
replacement's final state with the original options, as the repeatable component
does. For a change on another control belonging to the same write, the internal
`withWriteOptions(options, change)` helper preserves its attribution; repeatables
use this when disabling a new row to match the containing field.

The notification path does not itself mark controls dirty. Keep display state
synchronisation separate from user input, so mirroring an enabled/disabled state
does not mark an untouched form as edited. See
[Automatic Value Changes and Dependent Fields](Configuring-Form-Expressions.md#automatic-value-changes-and-dependent-fields)
for the configuration-facing contract, including behaviour actions that do
explicitly mark controls dirty.

## Event Consumers

Event consumers listen for events and execute expressions.

### FormComponentValueChangeEventConsumer

Consumes `field.value.changed` events and evaluates expressions.

```typescript
export class FormComponentValueChangeEventConsumer {
    // Bind to a component and start consuming events
    bind(options: FormComponentEventBindingOptions): void;
    
    // Stop consuming events
    destroy(): void;
}
```

**Condition Matching**:
1. Events without conditions always match
2. JSONPointer conditions match on path and event type
3. JSONata conditions evaluate against form data
4. JSONata Query conditions include the component tree

**Expression Execution**:
1. Evaluate the JSONata template
2. Apply the result to the target property

## Integration Points

### FormBaseWrapperComponent

The wrapper component creates and manages producer/consumer instances:

```typescript
// Create producer and consumer for a component
this.eventProducer = new FormComponentValueChangeEventProducer(this.eventBus);
this.eventConsumer = new FormComponentValueChangeEventConsumer(this.eventBus);

// Bind to the component
this.eventProducer.bind({ component, definition, formComponent });
this.eventConsumer.bind({ component, definition, formComponent });

// Set references for query source access
this.eventProducer.formComponent = formComponent;
this.eventConsumer.formComponent = formComponent;
```

### FormComponent

The root form component provides the query source and manages form-level events:

```typescript
// Get the query source for JSONata Query conditions
getQuerySource(): JSONataQuerySource;

// Get compiled expression templates
getFormCompiledItems(): Promise<CompiledItems>;

// Publish form-level events
publishFormReady(): void;
publishFormChanged(): void;
```

## Server-Side Processing

### TemplateFormConfigVisitor

Extracts and catalogs expressions for server-side compilation:

```typescript
protected extractExpressions(expressions?: FormExpressionsConfigFrame[]): void {
    expressions?.forEach((expression, index) => {
        // Extract template and condition for JSONata compilation
        for (const prop of ['template', 'condition']) {
            if (expression.config[prop]) {
                this.templates.push({
                    key: [...formConfigPath, 'expressions', index, 'config', prop],
                    value: expression.config[prop],
                    kind: 'jsonata'
                });
            }
        }
    });
}
```

## Performance Considerations

1. **Event Filtering**: The `select$` method filters events at the Observable level, preventing unnecessary processing
2. **Scoped Buses**: Use scoped buses for component-to-component communication to reduce fan-out
3. **Compiled Templates**: JSONata expressions are pre-compiled server-side for fast client execution
4. **Query Source Caching**: The component query source is cached and only updated on structure changes

## Extending the Event System

### Adding a New Event Type

1. Define the event interface in `form-component-event.types.ts`
2. Add to the `FormComponentEvent` union type
3. Add to `FormComponentEventType` constants
4. Add to `FormComponentEventMap`
5. Create a helper factory function

### Adding a New Consumer

1. Extend `FormComponentEventBaseConsumer`
2. Set `consumedEventType` to the event type to listen for
3. Implement `consumeEvent()` to handle matched events
4. Register in `FormBaseWrapperComponent`

## Debugging

Enable diagnostic logging in `FormComponentEventBus`:

```typescript
private readonly diagnosticsEnabled = true;
```

This logs all published events to the console for debugging.

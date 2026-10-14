# Typeahead onItemSelect – Event-Driven Sibling Field Population

## Proposed Changes

### 1. Event Type

#### [MODIFY] [form-component-event.types.ts](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-event.types.ts)

```ts
export interface FieldItemSelectedEvent extends FieldScopedEventBase {
    readonly type: 'field.item.selected';
    readonly selectedItem: unknown | null;
}
```

Add `FIELD_ITEM_SELECTED` constant, map entry, union member, and `createFieldItemSelectedEvent` factory.

---

### 2. Event Producer

#### [NEW] [form-component-item-select-event-producer.ts](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-item-select-event-producer.ts)

Extends [FormComponentEventBaseProducerConsumer](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-producer-consumer.ts).

**Lifecycle safety**: Uses `toObservable(component.selectedItem, {injector})` from `@angular/core/rxjs-interop` with an **explicit injector** passed from [FormBaseWrapperComponent](../../../angular/projects/researchdatabox/form/src/app/component/base-wrapper.component.ts). This avoids injection context issues in a non-component class and fits the existing subscription-based teardown.

> [!IMPORTANT]
> **Initial emission risk**: `toObservable` emits the current signal value on subscribe. Since `selectedItem` starts as `null`, this would publish a spurious clear event during [bind()](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-producer-consumer.ts) and wipe sibling fields on form init. Mitigate with `pipe(skipWhile(v => v === null))` — this skips only the initial `null` and still passes through any non-null value even if it were the first emission.
>
> **Context**: in practice `selectedItem` is `null` at bind time, but `skipWhile` makes correctness independent of this — a pre-set non-null value would still be emitted.

**[bind()](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-producer-consumer.ts)**:
- Check `component.selectedItem` exists. If absent → return (safe no-op).
- Resolve `fieldId` from `options.definition?.lineagePaths?.angularComponentsJsonPointer`. If absent → return.
- Subscribe to `toObservable(component.selectedItem, {injector: options.injector}).pipe(skipWhile(v => v === null))` → `publishItemSelected()`.
- After the initial null is skipped, publishes both null (cleared) and non-null (selected) values.
- **Missing injector**: If `options.injector` is absent, log a debug message and return (no-op) rather than throwing.

**[destroy()](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-change-event-producer.ts)**: Calls `super.destroy()` — clears subscriptions map.

---

### 3. Event Consumer

#### [NEW] [form-component-item-select-event-consumer.ts](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-item-select-event-consumer.ts)

Extends [FormComponentEventBaseConsumer](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-consumer.ts) with `consumedEventType = 'field.item.selected'`.

**[bind()](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-producer-consumer.ts)** — overrides base to skip expressions:
- Read `onItemSelect` from `options.definition?.compConfigJson?.component?.config`.
- If absent → return.
- Resolve own JSON pointer from `options.definition?.lineagePaths?.angularComponentsJsonPointer`. **If absent → return** (prevents cross-group leakage; no name-based fallback). Log a debug message so missing pointers are diagnosable during config errors.
- Resolve `control` from definition/component model.
- Subscribe to `field.item.selected` events, **filtering by sibling scope**: compare parent JSON pointer of event's `fieldId` with own parent pointer using a centralized `getParentPointer()` private helper. **Edge cases**: empty, root-only (`/`), or no-slash pointers → skip (no match).
- On match → call `handleItemSelected()` (not [consumeEvent()](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-change-event-consumer.ts)).

**[consumeEvent(_event, _expression)](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-change-event-consumer.ts)** — explicit no-op override with underscore-prefixed params to avoid lint noise. Satisfies the abstract contract from [FormComponentEventBaseConsumer](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-consumer.ts) but is never called; all consumption goes through `handleItemSelected()`.

**`handleItemSelected(event)`** — new protected method with the actual consumption logic:
- Cast event to `FieldItemSelectedEvent`.
- If `selectedItem` is null → `control.setValue(onItemSelect.clearValue ?? null, {emitEvent: false})`.
- Otherwise: resolve via `lodash.get(selectedItem.raw, rawPath)`, falling back to `lodash.get(selectedItem, rawPath)` when `raw` is undefined. If **both** resolve to `undefined` → use `clearValue ?? null` (treats unresolvable path the same as a cleared selection).
- `control.setValue(resolved, {emitEvent: false})` — prevents cascading change events.

---

### 4. `onItemSelect` Config Type

#### [MODIFY] [field-component.outline.ts](../../../packages/sails-ng-common/src/config/field-component.outline.ts)

Add to [FieldComponentConfigFrame](../../../packages/sails-ng-common/src/config/field-component.outline.ts):

```ts
onItemSelect?: {
    /** Dot-path into selectedItem.raw (or selectedItem) to extract this field's value */
    rawPath: string;
    /**
     * Value to set when selection is cleared. Defaults to null.
     * Should be type-compatible with the target control (e.g. string for text inputs, null for optional fields).
     */
    clearValue?: unknown;
    /**
     * Future: optional source constraint (e.g. sourceField pointer) to scope consumption
     * when multiple producer typeaheads can exist under one parent container.
     * Not implemented in initial version.
     */
    // sourceField?: string;
};
```

---

### 5. Wrapper Integration

#### [MODIFY] [base-wrapper.component.ts](../../../angular/projects/researchdatabox/form/src/app/component/base-wrapper.component.ts)

- Add `FormComponentItemSelectEventProducer` + `FormComponentItemSelectEventConsumer`.
- Add **optional** `injector?` to [FormComponentEventBindingOptions](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-producer-consumer.ts) (in [form-component-base-event-producer-consumer.ts](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-producer-consumer.ts)) — optional ensures backward compatibility with existing producer/consumer call sites. Pass `inject(Injector)` from wrapper only for the item select producer.
- Producer gated by `shouldAttachItemSelectProducer()`: checks `component.selectedItem` signal exists.
- Consumer gated by `shouldAttachItemSelectConsumer()`: checks `onItemSelect` config present.
- Destroy both in [ngOnDestroy()](../../../angular/projects/researchdatabox/form/src/app/component/base-wrapper.component.ts).

---

### 6. TypeaheadInputComponent

#### [MODIFY] [typeahead-input.component.ts](../../../angular/projects/researchdatabox/form/src/app/component/typeahead-input.component.ts)

- Add: `public readonly selectedItem = signal<TypeaheadOption | null>(null)`
- In [onSelect()](../../../angular/projects/researchdatabox/form/src/app/component/typeahead-input.component.ts) after [setModelFromOption()](../../../angular/projects/researchdatabox/form/src/app/component/typeahead-input.component.ts): `this.selectedItem.set(selected)`
- **Stale selection invalidation**: In `displayControl.valueChanges` subscription, when user manually edits the display text and `selectedItem()` is non-null: `this.selectedItem.set(null)`. **Gated by `programmaticDisplayUpdate` flag** — only invalidates on user-initiated edits, not programmatic label writes after [onSelect()](../../../angular/projects/researchdatabox/form/src/app/component/typeahead-input.component.ts).

---

### 7. Barrel + Spec Updates

#### [MODIFY] [index.ts](../../../angular/projects/researchdatabox/form/src/app/form-state/events/index.ts)

Add exports for new producer and consumer.

#### [MODIFY] [form-component-event-bus.service.spec.ts](../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-event-bus.service.spec.ts)

Add `field.item.selected` to: publish test, factory test, naming convention test.

---

### 8. Reusable Form Definition

#### [MODIFY] [reusableFormDefinitions.config.ts](../../../packages/redbox-core/src/config/reusableFormDefinitions.config.ts)

`standard-contributor-fields`: name → [TypeaheadInputComponent](../../../angular/projects/researchdatabox/form/src/app/component/typeahead-input.component.ts) with `vocabRef: "party"`, email + orcid → `onItemSelect: {rawPath: "email"}` / `{rawPath: "orcid"}`.

---

## Verification Plan

### Unit Tests (new spec files)

1. **Producer**: signal → publishes event with correct fieldId, publishes null on clear, no-ops when signal absent, no-ops when pointer absent, no-ops when injector absent, skips initial null but passes first non-null.
2. **Consumer**: sibling scope tested through event matching outcomes (same parent → consumes, different parent → ignores, edge pointers → skip), missing pointer → skips, null → clears with clearValue, **rawPath resolves to undefined → uses clearValue**, raw fallback, emitEvent:false.

### Integration Test

Group with TypeaheadInput + SimpleInputs → selection populates siblings, clear empties them, manual edit invalidates, unrelated group unaffected. **Assert no cascading change events** from consumer's `setValue({emitEvent: false})`.

### Existing Tests

```bash
cd angular && npm test
```

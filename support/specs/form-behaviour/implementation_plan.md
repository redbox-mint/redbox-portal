# Form Behaviours Feature Design — v1

## Problem Statement

The existing ReDBox form **expressions** system is component-scoped and limited to synchronous property assignment. We need a **form-level** concept — **Behaviours** — that subscribes to form events, runs async processing pipelines, and executes richer actions such as setting values on other fields or emitting events.

## Design Goals

- Reuse `FormComponentEventBus` — no new event transport
- Reuse `condition` / `conditionKind` semantics from field-level expressions
- Fit into the existing three-visitor compilation pipeline (`Construct` → `Template` → `Client`)
- v1 is **built-in only** — no hook-extensibility

---

## v1 Scope

### In Scope

| Area | Detail |
|------|--------|
| Config types | `FormBehaviourConfigFrame` with `condition`, `conditionKind`, `processors`, `actions`, `onError` |
| Conditions | `jsonpointer`, `jsonata`, `jsonata_query` |
| Processors | `jsonataTransform`, `fetchMetadata` |
| Actions | `setValue`, `emitEvent` (`field.value.changed` only) |
| Error handling | `onError` action list, pipeline halt |
| Debounce | Subscription-level `debounceMs` via RxJS `debounceTime` |
| Server compilation | Extract and compile JSONata from behaviour conditions, processor templates, and action templates |

### Explicit Non-Goals (v1)

> [!CAUTION]
> Out of scope: hook-registered custom processors/actions, `showNotification`, `highlightField`, `setFieldAttribute`, processor-level debounce.

> [!NOTE]
> `RecordMetadataRetrieverComponent` remains unchanged and coexists with the `fetchMetadata` processor. The component is for expression-driven lookups within a component scope; the processor is for behaviour pipelines where metadata feeds downstream actions without event emission.

---

## Proposed Configuration Schema

```typescript
// Added to FormConfigFrame / FormConfigOutline (sails-ng-common)
interface FormConfigFrame {
    behaviours?: FormBehaviourConfigFrame[];
}
```

### FormBehaviourConfigFrame

```typescript
interface FormBehaviourConfigFrame {
    name: string;
    description?: string;
    condition: string;
    conditionKind?: ExpressionsConditionKindType; // default: 'jsonpointer'
    debounceMs?: number;  // default: 0
    processors?: FormBehaviourProcessorConfig[];
    actions: FormBehaviourActionConfig[];
    onError?: FormBehaviourActionConfig[];
    runOnFormReady?: boolean;
    enabled?: boolean; // default: true
    hasCondition?: boolean; // set by client visitor
}
```

### Processor Config (v1: `jsonataTransform` and `fetchMetadata`)

```typescript
interface FormBehaviourProcessorConfig {
    type: 'jsonataTransform' | 'fetchMetadata';
    config: FormBehaviourJsonataTransformConfig | Record<string, never>;
}

interface FormBehaviourJsonataTransformConfig {
    template?: string;
    hasTemplate?: boolean;
}
```

**`fetchMetadata` processor semantics:**

- Takes the current pipeline `value` as the OID string (use a preceding `jsonataTransform` to extract the OID if needed)
- Calls `RecordService.getRecordMeta(oid)`
- **Does not emit events** — the returned metadata replaces the pipeline `value` for downstream processors/actions
- If `value` is empty/null/not a string, the processor is a no-op (pipeline continues with the existing value)
- On HTTP error, the pipeline halts and `onError` actions execute
- No config properties — the processor has no server-side compilation or client stripping requirements

### Action Config (v1: `setValue` and `emitEvent`)

```typescript
/** Field path resolution strategies */
type FieldPathKind = 'componentJsonPointer' | 'jsonata' | 'logical';

interface FormBehaviourActionConfig {
    type: 'setValue' | 'emitEvent';
    config: FormBehaviourSetValueActionConfig | FormBehaviourEmitEventActionConfig;
}

interface FormBehaviourSetValueActionConfig {
    fieldPath: string;              // angularComponentsJsonPointer or JSONata template
    fieldPathKind?: FieldPathKind;  // default: 'componentJsonPointer'
    hasFieldPathTemplate?: boolean; // set by client visitor when fieldPathKind is 'jsonata'
    valueTemplate?: string;         // optional JSONata for the value to set
    hasValueTemplate?: boolean;
}

interface FormBehaviourEmitEventActionConfig {
    eventType: 'field.value.changed';  // v1: only this type
    fieldId: string;
    sourceId: string;
    valueTemplate?: string;
    hasValueTemplate?: boolean;
}
```

**`fieldPathKind` semantics:**

| Kind | Scope | Behaviour |
|------|-------|-----------|
| `componentJsonPointer` | All fields | Literal `angularComponentsJsonPointer`. Resolved against the current query source at execution time. Default when omitted. |
| `jsonata` | All fields | `fieldPath` is a JSONata template compiled server-side. Evaluated at execution time against the pipeline context; must return a valid `angularComponentsJsonPointer` string. Primary use case: same-row repeatable targeting. |
| `logical` | **Repeatable fields only; `actions` only** | Literal `angularComponentsJsonPointer`. Resolved once at `FORM_DEFINITION_READY` to lock the target `FormFieldCompMapEntry` reference. Tracks that component's identity across repeatable mutations (add/remove/reorder). Bind-time validation ensures the pointer targets a field inside a repeatable. **Forbidden on `onError` actions in v1** — config error at bind-time. |

---

## Server-Side Compilation Pipeline

### 1. ConstructFormConfigVisitor

In `visitFormConfig(item)`, add:

```typescript
this.sharedProps.setPropOverride('behaviours', item, currentData);
```

### 2. TemplateFormConfigVisitor

New `extractBehaviours()` method alongside `extractExpressions()`:

```typescript
protected extractBehaviours(behaviours?: FormBehaviourConfigFrame[]): void {
    (behaviours ?? []).forEach((behaviour, bIdx) => {
        const kind = behaviour.conditionKind ?? 'jsonpointer'; // normalize default
        // Condition (skip jsonpointer — client uses raw string)
        if (behaviour.condition && kind !== 'jsonpointer') {
            this.templates.push({
                key: ['behaviours', bIdx.toString(), 'condition'],
                value: behaviour.condition,
                kind: 'jsonata',
            });
        }
        // Processor templates (jsonataTransform only — fetchMetadata has no templates)
        (behaviour.processors ?? []).forEach((proc, pIdx) => {
            if (proc.config?.template) {
                this.templates.push({
                    key: ['behaviours', bIdx.toString(), 'processors',
                          pIdx.toString(), 'config', 'template'],
                    value: proc.config.template,
                    kind: 'jsonata',
                });
            }
        });
        // Action & onError templates (valueTemplate and jsonata fieldPath)
        for (const [listName, list] of [['actions', behaviour.actions],
                                         ['onError', behaviour.onError]] as const) {
            (list ?? []).forEach((action, aIdx) => {
                const cfg = action.config as Record<string, unknown>;
                // valueTemplate
                if (typeof cfg?.valueTemplate === 'string') {
                    this.templates.push({
                        key: ['behaviours', bIdx.toString(), listName,
                              aIdx.toString(), 'config', 'valueTemplate'],
                        value: cfg.valueTemplate as string,
                        kind: 'jsonata',
                    });
                }
                // fieldPath when fieldPathKind is 'jsonata'
                if (cfg?.fieldPathKind === 'jsonata' && typeof cfg?.fieldPath === 'string') {
                    this.templates.push({
                        key: ['behaviours', bIdx.toString(), listName,
                              aIdx.toString(), 'config', 'fieldPath'],
                        value: cfg.fieldPath as string,
                        kind: 'jsonata',
                    });
                }
            });
        }
    });
}
```

**Compiled key shapes** (joined via `buildKeyString()`):

| Source | Key example |
|--------|-------------|
| Condition | `behaviours__0__condition` |
| Processor template | `behaviours__0__processors__0__config__template` |
| Action valueTemplate | `behaviours__0__actions__0__config__valueTemplate` |
| onError valueTemplate | `behaviours__0__onError__0__config__valueTemplate` |
| Action fieldPath (jsonata) | `behaviours__0__actions__0__config__fieldPath` |
| onError fieldPath (jsonata) | `behaviours__0__onError__0__config__fieldPath` |

### 3. ClientFormConfigVisitor

In `visitFormConfig(item)`, add behaviour stripping:

```typescript
(item.behaviours ?? []).forEach(behaviour => {
    const kind = behaviour.conditionKind ?? 'jsonpointer'; // normalize default
    if (kind !== 'jsonpointer') {
        behaviour.hasCondition = behaviour.condition !== undefined;
        delete (behaviour as any).condition;  // client uses compiled dict
    }
    (behaviour.processors ?? []).forEach(proc => {
        if (proc.config?.template) {
            proc.config.hasTemplate = true;
            delete proc.config.template;
        }
    });
    for (const list of [behaviour.actions, behaviour.onError]) {
        (list ?? []).forEach(action => {
            const cfg = action.config as any;
            if (cfg?.valueTemplate) {
                cfg.hasValueTemplate = true;
                delete cfg.valueTemplate;
            }
            if (cfg?.fieldPathKind === 'jsonata' && cfg?.fieldPath) {
                cfg.hasFieldPathTemplate = true;
                delete cfg.fieldPath;
            }
        });
    }
});
```

---

## Client-Side Runtime Architecture

### Compiled Template Evaluator

> [!IMPORTANT]
> **Design gap resolution**: Expression evaluation in `FormComponentEventBaseConsumer.evaluateExpressionJSONata()` (in `../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-consumer.ts`) builds keys from component `lineagePaths.formConfig` + expression index — this is component-scoped and cannot serve top-level behaviours. A new evaluator is needed.

#### [NEW] `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-compiled-template-evaluator.ts`

A stateless utility that wraps the compiled-items module for behaviour-specific key construction:

```typescript
export class BehaviourCompiledTemplateEvaluator {
    constructor(
        private compiledItems: { evaluate: (key: (string | number)[], context: unknown,
                                            extra?: unknown) => unknown },
        private logger: LoggerService
    ) {}

    /**
     * Evaluate a compiled behaviour template.
     *
     * @param behaviourIndex - index of the behaviour in behaviours[]
     * @param propertyPath   - path segments after the behaviour index,
     *                         e.g. ['condition'] or ['processors', '0', 'config', 'template']
     * @param context        - { value, event, formData, requestParams, runtimeContext }
     */
    async evaluate(behaviourIndex: number, propertyPath: (string | number)[],
                   context: Record<string, unknown>): Promise<unknown> {
        const key = ['behaviours', behaviourIndex, ...propertyPath];
        return this.compiledItems.evaluate(key, context, { libraries: { jsonata } });
    }
}
```

**Source of `compiledItems`**: obtained via `FormComponent.getFormCompiledItems()` (existing method in `../../../angular/projects/researchdatabox/form/src/app/form.component.ts`).

**Context construction**: mirrors `evaluateExpressionJSONata` — clones `value`, `event`, `formData`, `requestParams`, `runtimeContext` via `structuredClone`.

---

### Condition Matcher Utility

> [!IMPORTANT]
> **Design gap resolution**: `hasMatchedJSONPointerCondition` and `hasMatchedJSONataCondition` in `FormComponentEventBaseConsumer` (in `../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-consumer.ts`) depend on instance state (`formComp`, `componentDefQuerySource`, `expressions`, `options.definition`). Extract pure-function equivalents.

#### [NEW] `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-condition-matcher.ts`

```typescript
export interface BehaviourConditionMatchContext {
    querySource: FormComponentEventQuerySource | undefined;
    compiledTemplateEvaluator: BehaviourCompiledTemplateEvaluator;
    behaviourIndex: number;
    formValue: Record<string, unknown>;
    requestParams: Record<string, unknown>;
}

/**
 * Match a behaviour condition against an event.
 * Returns true if the event satisfies the condition.
 */
export async function matchBehaviourCondition(
    condition: string,
    conditionKind: ExpressionsConditionKindType,
    event: FormComponentEvent,
    behaviourConfig: FormBehaviourConfigFrame,
    ctx: BehaviourConditionMatchContext
): Promise<boolean> { ... }
```

**Internal logic** (reuses the same algorithms, not the instance methods):

- **JSONPointer**: calls `getEventJSONPointerCondition(condition)` (extracted as a standalone function, since it is already a pure string-split), then applies the same scoped/broadcast matching logic from `hasMatchedJSONPointerCondition`.
- **JSONata / JSONata Query**: applies the **broadcast-only gating rule** before evaluation, identical to the existing expression runtime:
  1. **Gate**: reject the event unless `event.sourceId === '*'` (broadcast) OR (`event.sourceId === FORM_DEFINITION_READY` AND `behaviourConfig.runOnFormReady !== false`). If neither condition holds, return `false` immediately — scoped (non-broadcast) events never match JSONata/JSONata Query conditions.
  2. **Evaluate**: delegate to `ctx.compiledTemplateEvaluator.evaluate(ctx.behaviourIndex, ['condition'], { value, event, formData, querySource?, runtimeContext })` and return `!!result`.
  3. **JSONata Query** additionally passes `querySource` and `runtimeContext` into the evaluation context (same as `hasMatchedJSONataQueryCondition` does today).

**`getEventJSONPointerCondition`**: already a pure function in `../../../angular/projects/researchdatabox/form/src/app/form-state/events/form-component-base-event-producer-consumer.ts`, extracts to a standalone export.

**`getObjectWithJsonPointer`**: already imported from `@researchdatabox/sails-ng-common`.

---

### Field Resolver for `setValue`

> [!IMPORTANT]
> **Design gap resolution**: `fieldPath` is now an `angularComponentsJsonPointer`, resolved via the form's query source using `getObjectWithJsonPointer()`. Three resolution strategies are supported via `fieldPathKind`.

#### [NEW] `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-field-resolver.ts`

**Core resolution** uses the existing `getObjectWithJsonPointer(jsonPointerSource, pointer)` from `@researchdatabox/sails-ng-common`. The query source's JSON pointer tree maps each `angularComponentsJsonPointer` to a node containing `metadata.formFieldEntry` (the `FormFieldCompMapEntry`) and `metadata.model` (the `FormFieldModel` with `formControl`).

```typescript
export interface BehaviourFieldResolverContext {
    formComponent: FormComponent;  // provides getQuerySource()
}

export interface ResolvedField {
    control: AbstractControl;
    entry: FormFieldCompMapEntry;
}

/**
 * Resolve a fieldPath to a writable form control.
 * Only resolves to concrete field components with a writable formControl.
 * Returns undefined if the pointer is invalid, targets a non-field component,
 * or targets a component without a model/control.
 */
export function resolveFieldByPointer(
    fieldPath: string,
    ctx: BehaviourFieldResolverContext
): ResolvedField | undefined {
    const querySource = ctx.formComponent.getQuerySource();
    if (!querySource) return undefined;
    const result = getObjectWithJsonPointer(querySource.jsonPointerSource, fieldPath);
    const entry: FormFieldCompMapEntry | undefined = result?.val?.metadata?.formFieldEntry;
    const control: AbstractControl | undefined = entry?.model?.formControl;
    if (!entry || !control) return undefined;
    return { control, entry };
}
```

**`fieldPathKind` resolution strategies:**

#### `componentJsonPointer` (default)

Resolves `fieldPath` as a literal `angularComponentsJsonPointer` against the **current** query source at execution time. If the pointer doesn't resolve (e.g. row removed), the action is a no-op with a warning.

```typescript
// At execution time:
const resolved = resolveFieldByPointer(action.config.fieldPath, ctx);
```

#### `jsonata`

Evaluates the compiled `fieldPath` template against the pipeline context to produce an `angularComponentsJsonPointer` string, then resolves that pointer.

```typescript
// At execution time:
const pointer = await compiledTemplateEvaluator.evaluate(
    behaviourIndex,
    [listName, actionIndex.toString(), 'config', 'fieldPath'],
    pipelineContext
) as string;
const resolved = resolveFieldByPointer(pointer, ctx);
```

**Same-row targeting example:**
```jsonata
$substringBefore(event.fieldId, "/name") & "/description"
```
If the trigger event's `fieldId` is `/tab/repeatable/2/name`, this produces `/tab/repeatable/2/description`.

#### `logical` (repeatable-only)

At `FORM_DEFINITION_READY`, resolves `fieldPath` to a `FormFieldCompMapEntry` reference and stores it. The entry object is stable across repeatable mutations — `rebuildLineagePaths()` (in `../../../angular/projects/researchdatabox/form/src/app/component/repeatable.component.ts`) updates the same object's `lineagePaths` in place, it does not create new entries.

At execution time, the resolver:
1. Checks if the locked entry still exists in the component tree (walks the parent repeatable's `compDefMapEntries`)
2. If gone (row was removed), the action is a no-op with a warning
3. If still present, reads the entry's **current** `lineagePaths.angularComponentsJsonPointer` and resolves from there

```typescript
// BehaviourHandler stores this on FORM_DEFINITION_READY:
private logicalFieldEntries: Map<number, FormFieldCompMapEntry> = new Map();

// At FORM_DEFINITION_READY:
for (const [actionIdx, action] of this.behaviour.actions.entries()) {
    if (action.config.fieldPathKind === 'logical') {
        const resolved = resolveFieldByPointer(action.config.fieldPath, ctx);
        if (resolved) {
            this.logicalFieldEntries.set(actionIdx, resolved.entry);
        } else {
            logger.warn(`logical fieldPath '${action.config.fieldPath}' did not resolve at form-load`);
        }
    }
}

// At execution time:
const lockedEntry = this.logicalFieldEntries.get(actionIdx);
if (!lockedEntry) return; // never resolved at form-load
// Runtime staleness check: verify entry is still in the component tree
const currentPointer = lockedEntry.lineagePaths?.angularComponentsJsonPointer;
if (!currentPointer) { logger.warn('logical target removed'); return; }
const resolved = resolveFieldByPointer(currentPointer, ctx);
```

> [!NOTE]
> **Bind-time validation for `logical`**: During `BehaviourHandler.activate()`, the resolver validates that (a) the `fieldPath` targets a field inside a repeatable component and (b) the action is in the `actions` list, not `onError`. If either check fails, a config error is logged and the action is permanently skipped.

---

**`setValue` execution (all kinds):**

> [!WARNING]
> **Silent mutation**: `setValue` must use `{ emitEvent: false }` to prevent event storms and recursive loops. This matches the existing expression mutation path in `form-component-change-event-consumer.ts`. Behaviours that need downstream reactions should use `emitEvent` actions explicitly.

```typescript
if (resolved) {
    const value = /* pipeline result or evaluated valueTemplate */;
    resolved.control.setValue(value, { emitEvent: false });
    resolved.control.markAsDirty();
}
```

**Error cases:**

| Error | Behaviour |
|-------|-----------|
| Invalid pointer (no match in query source) | No-op, log warning |
| Pointer targets a non-field component (container, tab, group) | No-op, log warning |
| Pointer targets a component without a model/formControl | No-op, log warning |
| `logical` on a non-repeatable field | Config error at bind-time, action permanently skipped |
| `logical` on an `onError` action | Config error at bind-time, action permanently skipped |
| `logical` target removed from repeatable | No-op at execution time, log warning |

---

### FormBehaviourManager

> [!IMPORTANT]
> **Design gap resolution**: `bind()` accepts `FormComponent` directly (not `FormConfigOutline`). The Angular runtime uses `FormComponentsMap` which stores `formConfig: FormConfigFrame`, and `FormComponent` provides access to `formDefMap`, `form` (FormGroup), `getFormCompiledItems()`, `getQuerySource()`, and `requestParams()`.

> [!WARNING]
> **Synchronous binding**: `bind()` must be **synchronous** and called **before** `FORM_DEFINITION_READY` is published. This ensures handlers are subscribed before the ready event fires, so `runOnFormReady` behaviours are not missed. Compiled items are fetched **lazily** on first pipeline execution, not during bind.

#### [NEW] `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/form-behaviour-manager.service.ts`

```typescript
@Injectable()
export class FormBehaviourManager implements OnDestroy {
    private handlers: BehaviourHandler[] = [];

    constructor(
        private eventBus: FormComponentEventBus,
        private logger: LoggerService
    ) {}

    /**
     * Bind behaviours from the form component.
     * MUST be called synchronously before FORM_DEFINITION_READY is published.
     * Compiled items are fetched lazily on first pipeline execution.
     */
    bind(formComponent: FormComponent): void {
        this.destroy();
        const formConfig = formComponent.formDefMap?.formConfig;
        const behaviours = formConfig?.behaviours ?? [];
        if (behaviours.length === 0) return;

        for (let i = 0; i < behaviours.length; i++) {
            const behaviour = behaviours[i];
            if (behaviour.enabled === false) continue;
            const handler = new BehaviourHandler(behaviour, i, {
                eventBus: this.eventBus,
                formComponent,
                logger: this.logger,
            });
            handler.activate();
            this.handlers.push(handler);
        }
    }

    destroy(): void { /* unsubscribe all handlers */ }
    ngOnDestroy(): void { this.destroy(); }
}
```

**Compiled items lifecycle**: `BehaviourHandler` lazily calls `formComponent.getFormCompiledItems()` on first `execute()` and caches the result (same pattern as `FormComponentEventBaseConsumer.getCompiledItems()`).

### BehaviourHandler

```typescript
class BehaviourHandler {
    /** Locked entries for 'logical' fieldPathKind actions */
    private logicalFieldEntries: Map<number, FormFieldCompMapEntry> = new Map();

    activate(): void {
        // 1. Bind-time validation: for each action with fieldPathKind 'logical',
        //    validate the fieldPath targets a repeatable child. Log config error
        //    and mark action as permanently skipped if not.
        // 2. Subscribe to FORM_DEFINITION_READY to resolve and lock 'logical'
        //    entries (populate logicalFieldEntries map).
        // 3. For jsonpointer condition: parse via getEventJSONPointerCondition(),
        //    subscribe to the matching event type.
        // 4. For jsonata/jsonata_query: subscribe to all broadcast events.
        // 5. Apply debounceMs via RxJS debounceTime.
    }

    private async execute(event: FormComponentEvent): Promise<void> {
        // 1. Evaluate condition via matchBehaviourCondition()
        // 2. Run processor pipeline (sequential await)
        // 3. Execute actions:
        //    - setValue: resolve fieldPath per fieldPathKind, then silent setValue
        //    - emitEvent: publish to eventBus
        // 4. On error: execute onError actions, log, halt
    }
}
```

---

## Integration Points

> [!NOTE]
> All paths below are relative to `redbox-portal/support/specs/form-behaviour`.

### sails-ng-common (`../../../packages/sails-ng-common/src/config/`)

| File | Change |
|---|---|
| **[NEW]** `../../../packages/sails-ng-common/src/config/form-behaviour.outline.ts` | All behaviour type interfaces |
| `../../../packages/sails-ng-common/src/config/form-config.outline.ts` | Add `behaviours?: FormBehaviourConfigFrame[]` |
| `../../../packages/sails-ng-common/src/config/form-config.model.ts` | Add `behaviours` property |

### redbox-core (`../../../packages/redbox-core/src/visitor/`)

| File | Change |
|---|---|
| `../../../packages/redbox-core/src/visitor/construct.visitor.ts` | `setPropOverride('behaviours', ...)` in `visitFormConfig` |
| `../../../packages/redbox-core/src/visitor/template.visitor.ts` | New `extractBehaviours()` method in `visitFormConfig` |
| `../../../packages/redbox-core/src/visitor/client.visitor.ts` | Strip behaviour templates in `visitFormConfig` |

### Angular form module (`../../../angular/projects/researchdatabox/form/src/app/`)

| File | Change |
|---|---|
| **[NEW]** `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-compiled-template-evaluator.ts` | Behaviour-specific compiled template evaluation |
| **[NEW]** `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-condition-matcher.ts` | Pure-function condition matching |
| **[NEW]** `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-field-resolver.ts` | Field path → control/entry resolution |
| **[NEW]** `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/form-behaviour-manager.service.ts` | `FormBehaviourManager` service |
| **[NEW]** `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-handler.ts` | `BehaviourHandler` class |
| **[NEW]** `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-processors.ts` | `jsonataTransform` processor |
| **[NEW]** `../../../angular/projects/researchdatabox/form/src/app/form-state/behaviours/behaviour-actions.ts` | `setValue` and `emitEvent` actions |
| `../../../angular/projects/researchdatabox/form/src/app/form.component.ts` | Bind `FormBehaviourManager` in `downloadAndCreateFormComponents()` **before** `FORM_DEFINITION_READY` is published |

---

## Example Configurations

### Cross-field copy (non-repeatable)

```javascript
behaviours: [
    {
        name: "copyTitleToDescription",
        condition: "/mainTab/project/title::field.value.changed",
        conditionKind: "jsonpointer",
        debounceMs: 300,
        processors: [
            { type: "jsonataTransform", config: { template: `"Project: " & value` } }
        ],
        actions: [
            { type: "setValue", config: {
                fieldPath: "/mainTab/project/description",
                fieldPathKind: "componentJsonPointer"
            }}
        ]
    }
]
```

### Same-row repeatable targeting (jsonata)

```javascript
behaviours: [
    {
        name: "syncRepeatableRowField",
        condition: "/mainTab/contributors::field.value.changed",
        conditionKind: "jsonpointer",
        actions: [
            { type: "setValue", config: {
                fieldPath: `$substringBefore(event.fieldId, "/name") & "/displayName"`,
                fieldPathKind: "jsonata"
            }}
        ]
    }
]
```

### Identity-tracking repeatable targeting (logical)

```javascript
behaviours: [
    {
        name: "lockFirstContributorRole",
        condition: "/mainTab/projectType::field.value.changed",
        conditionKind: "jsonpointer",
        actions: [
            { type: "setValue", config: {
                fieldPath: "/mainTab/contributors/0/role",
                fieldPathKind: "logical"
            }}
        ]
    }
]
```

### Fetch metadata and populate field (fetchMetadata)

```javascript
behaviours: [
    {
        name: "fetchLinkedRecordTitle",
        condition: "/mainTab/linkedRecord::field.value.changed",
        conditionKind: "jsonpointer",
        processors: [
            { type: "fetchMetadata" },
            { type: "jsonataTransform", config: { template: `value.title` } }
        ],
        actions: [
            { type: "setValue", config: {
                fieldPath: "/mainTab/linkedRecordTitle",
                fieldPathKind: "componentJsonPointer"
            }}
        ]
    }
]
```

---

## Verification Plan

### Automated Tests

- **redbox-core**: visitor tests for `setPropOverride`, `extractBehaviours`, template stripping (including `fieldPath` jsonata extraction)
- **Angular unit tests**:
  - `BehaviourCompiledTemplateEvaluator`, `matchBehaviourCondition()`
  - `resolveFieldByPointer()` — non-repeatable, repeatable with valid index, missing index, non-field target
  - `fieldPathKind: 'componentJsonPointer'` — standard resolution
  - `fieldPathKind: 'jsonata'` — template evaluation → pointer resolution
  - `fieldPathKind: 'logical'`:
    - Lock at form-load, resolve correctly on first execution
    - Survive row add/remove — locked entry tracks to new index
    - Row removal after lock — detect removed target, no-op with warning
    - Row insertion before the locked row — locked entry shifts index, still resolves correctly
    - Reject `logical` on `onError` actions at bind-time
    - Reject `logical` on non-repeatable targets at bind-time
  - `fetchMetadata` processor:
    - Trim OID input (whitespace handling)
    - Empty/null/non-string `value` — no-op, pipeline continues
    - Repeated same-OID dedup behaviour (if applicable)
    - HTTP error → pipeline halt, `onError` actions execute
  - `FormBehaviourManager` lifecycle, `BehaviourHandler` pipeline and error handling

### Manual Verification

- Add `componentJsonPointer` behaviour to `default-1.0-draft.ts`, verify cross-field value propagation
- Add `jsonata` fieldPath behaviour targeting same-row repeatable field, verify correct row targeting
- Add `logical` fieldPath behaviour, add/remove repeatable rows, verify identity tracking
- Verify `fetchMetadata` → `jsonataTransform` → `setValue` pipeline end-to-end
- Verify `onError` flow with a processor that throws
- Verify form destroy cleans up subscriptions

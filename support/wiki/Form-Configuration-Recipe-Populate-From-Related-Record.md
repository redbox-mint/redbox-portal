# Recipe: Populating fields from a related record

> Part of the [Form Configuration Recipes](Form-Configuration-Recipes.md) index.

## Problem

A form lets the user pick a *related* record — for example a **Data Record**
points at the **RDMP** it belongs to, and a **Data Publication** points at the
**Data Record** it publishes. When that related record is chosen we want to:

1. **Pre-fill many fields** on the current form with metadata copied from the
   related record (project name, funding, dates, contributors, …).
2. Do the same when the related record's **OID is supplied as a URL parameter**
   (e.g. a "Create publication" button that opens the publication form already
   linked to a data record), without the user having to pick anything.
3. Re-fetch the latest metadata when the user explicitly asks (a refresh button),
   and behave sensibly before any record is chosen.

The two real implementations this recipe is drawn from:

- `dataRecord-1.0-draft` — populates from the related **RDMP**.
- `dataPublication-1.0-*` (see `dataPublication-1.0-common`) — populates from the
  related **Data Record**.

## The shape of the solution

The pattern has three collaborating pieces. Keep them straight and the rest
follows:

| Piece | Component class | Role |
|-------|-----------------|------|
| **Selector** | `RecordSelectorComponent` | The visible field where the user picks the related record. Its value is an object such as `{ oid, title }`. |
| **Getter** | `RecordMetadataRetrieverComponent` | A **hidden** carrier field (e.g. `rdmpGetter`, `dataRecordGetter`). It holds nothing itself — a behaviour *emits* the fetched metadata onto it as a `field.value.changed` event, and target fields subscribe to that event. |
| **Behaviour(s)** | top-level `behaviours: []` | The pipeline that turns "selector changed" (or "OID param present") into "metadata fetched and broadcast on the getter". |
| **Target field expressions** | `expressions: []` on each field | Copy one property out of the fetched metadata into that field's `model.value`. |

Data flow:

```
user picks record            ┐
  (selector field.value.changed)  ─┐
                                   ├─►  behaviour pipeline
?rdmpOid=... in the URL            │      1. jsonataTransform  → extract OID string
  (form.definition.ready) ─────────┘      2. fetchMetadata     → GET record metadata
                                          actions:
                                            • emitEvent field.value.changed → getter field
                                            • setValue → normalise the selector value
                                                     │
                    getter field.value.changed ◄─────┘
                                                     │
        each target field's expression listens ◄─────┘
        condition: /…/rdmpGetter::field.value.changed
        template:  event.value.<propertyName>  → model.value
```

The important idea: **fetching is centralised in a behaviour, and populating is
decentralised across the target fields.** The getter field is the seam between
them.

---

## 1. Declaring the selector and the getter

Put a `RecordSelectorComponent` where the user chooses the record, and a hidden
`RecordMetadataRetrieverComponent` next to it. (Paths below are the real ones from
the Data Record form: `/mainTab/aim/…`.)

```javascript
// The visible selector
{
    name: "rdmp",
    component: {
        class: "RecordSelectorComponent",
        config: {
            label: "RDMP related to this data record (optional)",
            columnTitle: "Record title",
            recordType: "rdmp",          // which record type to search
            workflowState: "",
            filterMode: "regex",
            filterFields: ["metadata.title"]
        }
    },
    model: { class: "RecordSelectorModel", config: { validators: [] } },
    layout: { class: "DefaultLayout", config: { /* … */ } }
},

// The hidden getter — a carrier for fetched metadata, never shown to the user
{
    name: "rdmpGetter",
    component: { class: "RecordMetadataRetrieverComponent", config: { visible: false } },
    layout:    { class: "DefaultLayout", config: { visible: false } }
}
```

The Data Publication equivalent uses `recordType: "dataRecord"` for a field named
`dataRecord`, plus a `dataRecordGetter`.

---

## 2. The fetch behaviour (selector → metadata on the getter)

This behaviour runs whenever the selector's value changes. It extracts the OID,
fetches the record metadata from the server, and re-broadcasts that metadata as a
`field.value.changed` event aimed at the getter field.

```javascript
behaviours: [
    {
        name: "fetchOnRelatedObjectSelected-rdmp",
        description: "Fetch RDMP metadata when rdmp selector changes",
        conditionKind: "jsonpointer",
        condition: "/mainTab/aim/rdmp::field.value.changed",
        runOnFormReady: false,
        processors: [
            {
                // The selector value can be {oid}, {redboxOid} or a bare string.
                // Reduce it to a plain OID string for fetchMetadata.
                type: "jsonataTransform",
                config: {
                    template: "$exists(event.value.oid) ? event.value.oid : ($exists(event.value.redboxOid) ? event.value.redboxOid : event.value)"
                }
            },
            {
                // Calls RecordService.getRecordMeta(oid) on the server and replaces
                // the pipeline value with the record's metadata (plus its oid).
                type: "fetchMetadata"
            }
        ],
        actions: [
            {
                // Broadcast the fetched metadata onto the getter field. Every
                // target field expression listens for this event.
                type: "emitEvent",
                config: {
                    eventType: "field.value.changed",
                    fieldId: "/mainTab/aim/rdmpGetter",
                    sourceId: "*"
                }
            },
            {
                // Normalise what we store on the selector itself.
                type: "setValue",
                config: {
                    fieldPath: "/mainTab/aim/rdmp",
                    valueTemplate: '{"title": value.title,"oid": value.oid}',
                    hasValueTemplate: true
                }
            }
        ]
    }
]
```

### How the pipeline works

- **`processors`** run in order; each one *replaces* the pipeline `value`. The
  pipeline context also exposes `event`, `formData`, `requestParams` and
  `runtimeContext`.
  - **`jsonataTransform`** evaluates `config.template` (JSONata) against the
    context. Here it collapses the selector's object value down to a bare OID
    string.
  - **`fetchMetadata`** takes the current pipeline value, and if it is a non-empty
    string treats it as an OID and calls `RecordService.getRecordMeta(oid)`. It
    returns the record's metadata merged with `{ oid }`. It **no-ops on an empty
    or non-string value**, so always precede it with a transform that yields a
    string. It intentionally does **not** cache — an explicit refresh re-reads the
    latest server state.
- **`actions`** consume the final pipeline `value` (the fetched metadata):
  - **`emitEvent`** publishes a synthetic `field.value.changed` whose `fieldId` is
    the getter. Because `sourceId: "*"` it is a broadcast event, so any expression
    whose condition path contains `/mainTab/aim/rdmpGetter` will match. The event's
    `value` is the fetched metadata.
  - **`setValue`** writes a value into a field. With `hasValueTemplate: true`,
    `valueTemplate` is JSONata evaluated against the pipeline (`value` is the
    fetched metadata). Here we keep the selector storing a tidy `{ title, oid }`.

---

## 3. Populating each field with an expression

Every field you want pre-filled gets an entry in its `expressions` array that
listens for the getter's `field.value.changed` and copies one property out of
`event.value` (the fetched metadata) into `model.value`.

Simple text field:

```javascript
{
    name: "aim_project_name",
    expressions: [
        {
            name: "rdmpGetter-aim_project_name-title",
            description: "Populate aim_project_name from rdmpGetter metadata",
            config: {
                conditionKind: "jsonpointer",
                runOnFormReady: false,
                condition: "/mainTab/aim/rdmpGetter::field.value.changed",
                target: "model.value",
                hasTemplate: true,
                template: "event.value.title"
            }
        }
    ],
    component: { class: "SimpleInputComponent", config: { /* … */ } },
    model:     { class: "SimpleInputModel", config: { validators: [] } },
    layout:    { class: "DefaultLayout", config: { /* … */ } }
}
```

Field whose name contains a namespace/colon, feeding a repeatable — use JSONata
**backtick navigation** for the property name, and `[]` to coerce to an array:

```javascript
{
    name: "foaf:fundedBy_foaf:Agent",
    expressions: [
        {
            name: "rdmpGetter-foaf-fundedBy_foaf-Agent-foaf-fundedBy_foaf-Agent",
            description: "Populate foaf:fundedBy_foaf:Agent from rdmpGetter metadata",
            config: {
                conditionKind: "jsonpointer",
                runOnFormReady: false,
                condition: "/mainTab/aim/rdmpGetter::field.value.changed",
                target: "model.value",
                hasTemplate: true,
                template: "event.value.`foaf:fundedBy_foaf:Agent`[]"
            }
        }
    ],
    component: { class: "RepeatableComponent", config: { /* … */ } }
    // …
}
```

See [Configuring Form Expressions](Configuring-Form-Expressions.md) for the full
expression reference (condition kinds, targets, template context variables).

### Reducing repetition with a helper

When a form pre-fills *many* fields the expressions become boilerplate. The Data
Publication form factors them into a small builder so each field just declares the
source/target property names. This is worth copying for any form with more than a
handful of populated fields:

```typescript
// dataPublication-1.0-common.ts
const buildExpressionsForDataRecordChange = function (opts?: {
    sourcePropName?: string,
    targetPropName?: string,
    addDataRecordGetter?: boolean,     // add the "copy from getter" expression
    disabledOnNoDataRecord?: boolean,  // disable the field until a record is chosen
    defaultValue?: unknown,            // fallback when the source prop is absent
}): FormExpressionsConfigFrame[] { /* … */ };

// Usage on a field:
{
    name: "title",
    expressions: [
        ...buildExpressionsForDataRecordChange({
            sourcePropName: "title",
            addDataRecordGetter: true,
            disabledOnNoDataRecord: true
        })
    ],
    // component / model / layout …
}
```

The generated "copy" expression is exactly the shape shown above; the
`disabledOnNoDataRecord` option adds a second expression targeting
`field.disabled` so dependent fields stay disabled until a record is selected:

```javascript
{
    condition: "/mainTab/about/dataRecord::field.value.changed",
    target: "field.disabled",
    hasTemplate: true,
    template: "event.value ? false : true",
    runOnFormReady: true
}
```

---

## 4. Handling the OID passed as a URL parameter

The related record can also be supplied up-front as a request parameter — for
example, the Data Record form has a button that opens the Data Publication form
pre-linked to it:

```javascript
// On the Data Record form: a link that carries the OID as a query parameter
href: "/@branding/@portal/record/dataPublication/edit?dataRecordOid=@oid"
```

The parameter is available inside behaviour conditions and templates as
`runtimeContext.requestParams.<paramName>` (e.g. `runtimeContext.requestParams.dataRecordOid`,
`runtimeContext.requestParams.rdmpOid`).

Rather than duplicating the fetch logic, the **form-ready behaviour just seeds the
selector from the parameter and re-emits the selector's change event** — which
makes the ordinary "on selected" behaviour (section 2) do the actual fetch and
populate. One fetch pipeline, two entry points.

```javascript
{
    name: "fetchOnFormReady-rdmpOid",
    description: "Fetch RDMP metadata on form load using rdmpOid request param",
    runOnFormReady: true,                 // evaluate this behaviour at form load
    conditionKind: "jsonata_query",
    // Only fire when the param exists, and pin the evaluation to the form-ready
    // event for the selector field so it runs exactly once.
    condition: "$exists(runtimeContext.requestParams.rdmpOid) and event.fieldId = '/mainTab/aim/rdmp' and event.sourceId = 'form.definition.ready'",
    processors: [
        { type: "jsonataTransform", config: { template: "runtimeContext.requestParams.rdmpOid" } }
    ],
    actions: [
        {
            // Seed the selector with just the OID.
            type: "setValue",
            config: {
                fieldPath: "/mainTab/aim/rdmp",
                valueTemplate: '{"oid": value}',
                hasValueTemplate: true
            }
        },
        {
            // Re-emit the selector's change event → triggers the fetch behaviour.
            type: "emitEvent",
            config: {
                eventType: "field.value.changed",
                fieldId: "/mainTab/aim/rdmp",
                sourceId: "/mainTab/aim/rdmp"
            }
        }
    ]
}
```

Key points:

- Use `conditionKind: "jsonata_query"` and `runOnFormReady: true` so the condition
  is evaluated against the `form.definition.ready` event.
- Guard the condition with `$exists(runtimeContext.requestParams.<param>)` so the
  behaviour is a no-op on normal (non-parameterised) loads.
- Anchoring on `event.fieldId = '<selector>' and event.sourceId = 'form.definition.ready'`
  makes it run once, deterministically, rather than for every field's ready event.
- The two actions (seed value, then re-emit) hand off to the section-2 behaviour —
  do **not** re-implement the fetch here.

---

## 5. Bonus: a manual "refresh" entry point

The Data Publication form adds a third entry point: a refresh button lets the user
pull the latest data locations from the related Data Record after it has been
edited elsewhere. It is the same pipeline, triggered by a hidden "trigger" field's
change, and it resolves the OID from whatever source is available:

```javascript
{
    name: "fetchOnRefreshButtonClicked-dataLocations",
    condition: "/mainTab/data/dataPubLocationRefresherTrigger::field.value.changed",
    processors: [
        {
            type: "jsonataTransform",
            config: {
                // Fall back through form data and finally the request param.
                template: "($record := formData.dataRecord ?: formData.mainTab.about.dataRecord; $exists($record.oid) ? $record.oid : ($exists($record.redboxOid) ? $record.redboxOid : ($exists($record) ? $record : runtimeContext.requestParams.dataRecordOid)))"
            }
        },
        { type: "fetchMetadata" }
    ],
    actions: [ /* emitEvent onto the relevant getter/refresher field */ ]
}
```

Because `fetchMetadata` never caches, a refresh always observes the current
server-side state — including changes saved from another browser tab.

---

## Gotchas and tips

- **The getter must exist and be hidden.** Add a
  `RecordMetadataRetrieverComponent` at the exact path used in your expression
  conditions, with `visible: false` in both component and layout config. Nothing
  populates without it.
- **`fetchMetadata` needs a string OID.** Always precede it with a
  `jsonataTransform` that reduces the selector value to a bare OID string, and
  handle all three shapes the selector can hold: `{oid}`, `{redboxOid}` and a raw
  string. An empty/non-string value makes `fetchMetadata` a silent no-op.
- **`event.value` in a target expression is the fetched metadata**, because the
  behaviour's `emitEvent` set the getter's event value to it — not the selector's
  value.
- **JSONata cannot escape a backtick inside a field name.** A metadata property
  whose name itself contains a backtick is unreachable via backtick navigation;
  the Data Publication helper deliberately throws if a source/target prop name
  contains one.
- **Coerce to array for repeatables** with a trailing `[]`
  (`` event.value.`some:field`[] ``) so a single value still fills a
  `RepeatableComponent` correctly.
- **Set `runOnFormReady: false` on the populating expressions.** They should only
  react to the getter event, not run on initial load (the OID-param behaviour
  drives the initial population instead).
- **Two behaviours, one pipeline.** Resist duplicating the fetch in the
  form-ready behaviour; seed the selector and re-emit its change event so the
  single "on selected" behaviour remains the only place that fetches.
- **Disable dependent fields until a record is chosen** (the
  `disabledOnNoDataRecord` expression targeting `field.disabled`) to stop users
  editing values that are about to be overwritten.

## Related documentation

- [Configuring Form Expressions](Configuring-Form-Expressions.md)
- [Form Event Bus Architecture](Form-Event-Bus-Architecture.md)
- [Configuring Record Forms](Configuring-Record-Forms.md)
- [Configuring Related Records](Configuring-Related-Records.md)

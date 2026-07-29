# Recipe: Configuring option sets and vocabularies

> Part of the [Form Configuration Recipes](Form-Configuration-Recipes.md) index.

## Problem

A form field needs a fixed set of choices, such as a dropdown for a dataset size,
a radio group for access rights, or checkboxes for multiple reasons. The choices
can be defined directly on the field, or kept as a reusable vocabulary and
referenced from one or more fields.

Use this recipe for:

1. Small field-local option sets that only one field will ever use.
2. Shared option sets reused across forms or workflow states.
3. Hook-owned client vocabularies that need to ship through bootstrap data.

The real examples behind this recipe are:

- `default-1.0-draft` — RDMP dropdowns such as dataset extent and location.
- `dataRecord-1.0-draft` — retention and disposal option sets.
- `dataPublication-1.0-*` — publication datatype, access rights, license, and
  DOI request option sets.

## The choice

| Pattern | Where choices live | Use when |
|---------|--------------------|----------|
| `options` | Directly on one field's `component.config` | The list is tiny, field-specific, and unlikely to be reused. |
| `vocabRef` + `inlineVocab` | A JSON vocabulary in `bootstrap-data/vocabularies`, referenced by slug | The list is shared, client-owned, needs disabled historical values, or should be maintained independently from generated form config. |
| `vocabRef` without `inlineVocab` | A server-side vocabulary resolved at runtime | The vocabulary is large or externally managed and should not be embedded in the form config. |

For hook-owned flat vocabularies, prefer `vocabRef` with `inlineVocab: true`.
It keeps the form definition readable while still delivering the choices to the
client with the form.

---

## 1. Direct static options

Dropdowns, radios, and checkboxes all accept an `options` array. Each option has
at least a `label` and a `value`; `disabled` is optional.

```typescript
{
  name: "requestIdentifier",
  component: {
    class: "CheckboxInputComponent",
    config: {
      label: "requestIdentifier",
      options: [
        {
          label: "@dataPublication-citation-request-identifier",
          value: "request"
        }
      ]
    }
  },
  model: { class: "CheckboxInputModel", config: { validators: [] } },
  layout: { class: "DefaultLayout", config: { label: "requestIdentifier" } }
}
```

The same shape works for:

- `DropdownInputComponent`
- `RadioInputComponent`
- `CheckboxInputComponent`

Use translated labels (for example `@dmpt-select:Empty`) when the text is shown
to users. The stored `value` should be the durable metadata value, not the display
text, unless the legacy record contract already stores translation keys.

---

## 2. Bootstrap vocabulary files

Put hook-owned vocabularies under the mounted bootstrap-data vocabulary folder.
For hook repositories this is usually:

```text
support/bootstrap-data/vocabularies/<slug>.json
```

The development and integration Docker harnesses mount that directory into the
portal as `bootstrap-data/vocabularies`.

Example:

```json
{
  "name": "Data Publication Access Rights",
  "slug": "data-publication-access-rights",
  "description": "Available options for data publication access rights.",
  "type": "flat",
  "entries": [
    {
      "label": "@dataPublication-dc:accessRights-open",
      "value": "@dataPublication-dc:accessRights-open-val",
      "order": 0
    },
    {
      "label": "@dataPublication-dc:accessRights-restricted",
      "value": "@dataPublication-dc:accessRights-restricted-val",
      "order": 1
    }
  ]
}
```

For flat form choices, keep each entry close to the option shape:

- `label`: user-facing label or translation key.
- `value`: value written into form metadata.
- `order`: stable display order.
- `disabled`: optional; use for historical values that must render for old
  records but should not be selected for new records.

The `slug` is the value used by form config `vocabRef`.

---

## 3. Referencing a vocabulary from a field

Once the vocabulary exists, replace the field-local option list with `vocabRef`
and `inlineVocab`.

```typescript
{
  name: "dc:accessRights",
  component: {
    class: "RadioInputComponent",
    config: {
      label: "@dataPublication-dc:accessRights",
      vocabRef: "data-publication-access-rights",
      inlineVocab: true,
      options: []
    }
  },
  model: {
    class: "RadioInputModel",
    config: {
      defaultValue: "@dataPublication-dc:accessRights-open-val",
      validators: []
    }
  }
}
```

`options: []` is intentionally left in place. It makes the field shape explicit
and avoids accidentally maintaining two sources of truth. The vocabulary entries
become the source of the rendered options.

### Reusing the same vocabulary

Multiple fields can point at the same slug. For example a publication form can
use one datatype vocabulary for both:

```typescript
{
  name: "datatype",
  component: {
    class: "DropdownInputComponent",
    config: {
      vocabRef: "data-publication-datatypes",
      inlineVocab: true,
      options: []
    }
  }
}
```

```typescript
{
  name: "citation_datatype",
  component: {
    class: "DropdownInputComponent",
    config: {
      vocabRef: "data-publication-datatypes",
      inlineVocab: true,
      options: []
    }
  }
}
```

This is the preferred pattern for workflow variants (`draft`, `queued`,
`published`, `retired`) because they often clone from the same common form
definition.

---

## 4. Dropdown vs radio vs checkbox notes

Dropdowns store one selected value by default:

```typescript
component: { class: "DropdownInputComponent", config: { vocabRef: "license-identifiers", inlineVocab: true, options: [] } },
model: { class: "DropdownInputModel", config: { defaultValue: "" } }
```

Radio buttons store one selected value:

```typescript
component: { class: "RadioInputComponent", config: { vocabRef: "data-publication-access-rights", inlineVocab: true, options: [] } },
model: { class: "RadioInputModel", config: { defaultValue: "@dataPublication-dc:accessRights-open-val" } }
```

Checkboxes can represent a single toggle or a multi-value list, depending on the
model and component settings already used by the field:

```typescript
component: { class: "CheckboxInputComponent", config: { vocabRef: "data-record-retention-period-reason", inlineVocab: true, options: [] } },
model: { class: "CheckboxInputModel", config: { validators: [] } }
```

Keep the component class and model class paired:

- `DropdownInputComponent` with `DropdownInputModel`
- `RadioInputComponent` with `RadioInputModel`
- `CheckboxInputComponent` with `CheckboxInputModel`

## Gotchas and tips

- Do not keep a populated `options` array beside a `vocabRef`; that creates two
  sources of truth.
- Keep slugs stable. Existing form configs and saved records may depend on them.
- Preserve legacy `value` strings exactly when moving options into a vocabulary.
- Use `disabled: true` for deprecated choices that old records may contain.
- Add a vocabulary file for every hook-owned `vocabRef` that is not a shared core
  vocabulary such as `anzsrc-2020-for`.
- For generated or migrated forms, convert common/shared form files first so
  workflow-specific variants inherit the same vocabulary references.

## Related documentation

- [Configuring Record Forms](Configuring-Record-Forms.md)
- [Form Configuration Recipes](Form-Configuration-Recipes.md)
- [Form Configuration Internals](Form-Configuration-Internals.md)

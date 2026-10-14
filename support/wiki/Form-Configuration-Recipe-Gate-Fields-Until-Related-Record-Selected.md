# Recipe: Gate fields until a related record is selected

Use this pattern when a form depends on a selected related record and users must
not edit dependent fields before making that selection. A Data Publication is the
canonical example: its Data Record selector remains enabled, while the rest of
the publication fields are disabled until a Data Record is chosen.

This recipe uses a field expression rather than a form-wide read-only mode. That
keeps the selector, navigation, save actions, and other structural components
available.

## The expression

Add this expression to every dependent field:

```typescript
import type { FormExpressionsConfigFrame } from
  "@researchdatabox/sails-ng-common";

const disableUntilRelatedRecordSelected = (
  selectorPath: string
): FormExpressionsConfigFrame => ({
  name: "disable-until-related-record-selected",
  description:
    "Disable this field until a related record is selected.",
  config: {
    conditionKind: "jsonpointer",
    condition: `${selectorPath}::field.value.changed`,
    target: "field.disabled",
    hasTemplate: true,
    template: "event.value ? false : true",
    runOnFormReady: true
  }
});
```

For a Data Publication whose selector is at
`/mainTab/about/dataRecord`, apply it like this:

```typescript
{
  name: "description",
  expressions: [
    disableUntilRelatedRecordSelected("/mainTab/about/dataRecord")
  ],
  component: {
    class: "RichTextEditorComponent",
    config: {
      label: "@dataPublication-description"
    }
  },
  model: {
    class: "RichTextEditorModel",
    config: {
      validators: []
    }
  },
  layout: {
    class: "DefaultLayout",
    config: {}
  }
}
```

`runOnFormReady: true` establishes the disabled state when the form first loads.
The same expression runs again whenever the selector changes, enabling the field
after selection and disabling it again if the selection is cleared.

## Applying the gate to a whole form

Large forms should use a helper or config finalisation pass instead of duplicating
the expression by hand. Apply it to model-backed input fields and repeatables.

Do not apply it to:

- the related-record selector;
- the metadata retriever/getter populated by the fetch behaviour;
- tab, group, layout, heading, and other structural components;
- navigation, save, cancel, submit, or delete buttons;
- status and validation-summary display components.

For generated configs, checking for a `model` is a useful starting point because
editable fields and repeatables have one while most structural components do not.
Still exclude the selector explicitly because it also has a model.

```typescript
walkComponents(form.componentDefinitions, component => {
  if (
    component.name === "dataRecord"
    || component.name === "dataRecordGetter"
    || !component.model
  ) {
    return;
  }

  component.expressions = [
    ...(component.expressions ?? []).filter(
      expression =>
        expression.name !== "dataPublication-no-dataRecord-field-disable"
    ),
    {
      name: "dataPublication-no-dataRecord-field-disable",
      description:
        "Disable field when no Data Record is selected.",
      config: {
        conditionKind: "jsonpointer",
        condition:
          "/mainTab/about/dataRecord::field.value.changed",
        target: "field.disabled",
        hasTemplate: true,
        template: "event.value ? false : true",
        runOnFormReady: true
      }
    }
  ];
});
```

Use a stable expression name and replace an existing expression with that name so
the finalisation step remains idempotent.

## Related-record population

This gate complements the
[populate-from-related-record recipe](Form-Configuration-Recipe-Populate-From-Related-Record.md).
The usual sequence is:

1. the selector emits `field.value.changed`;
2. a form behaviour fetches the selected record;
3. the getter emits the fetched metadata;
4. field expressions populate values from that metadata;
5. this gate expression enables the dependent fields.

If a related-record OID is supplied in the URL, seed the selector and emit its
normal value-changed event. Do not bypass that event, because both the fetch
pipeline and the disabled-state expressions depend on it.

## Verification checklist

- With no selection, the selector is enabled and every dependent input,
  repeatable add/remove action, and editor is disabled.
- Selecting a record enables all dependent fields.
- Clearing the selector disables them again.
- A related-record OID supplied through the URL also enables the fields after the
  selector/fetch pipeline runs.
- Save and navigation controls remain usable.
- The gate is present in every workflow form that can be edited, not only the
  initial draft form.

## Related documentation

- [Populating fields from a related record](Form-Configuration-Recipe-Populate-From-Related-Record.md)
- [Migrating dynamic field expressions](Form-Configuration-Recipe-Expressions.md)
- [Configuring Form Expressions](Configuring-Form-Expressions.md)
- [Form Event Bus Architecture](Form-Event-Bus-Architecture.md)

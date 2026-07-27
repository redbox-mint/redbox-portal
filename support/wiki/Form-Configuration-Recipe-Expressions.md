# Recipe: Migrating dynamic field expressions

> Part of the [Form Configuration Recipes](Form-Configuration-Recipes.md) index.

## Problem

Legacy v4 forms used `visibilityCriteria`, `subscribe`, `publish`, and template
callbacks to make fields react to other fields. In v5, that behaviour belongs in
the form expression system.

Use this recipe when migrating old forms that:

1. Show or hide fields after a radio, checkbox, or dropdown changes.
2. Show or hide one field based on more than one source field.
3. Copy values from another field or from metadata fetched from a related record.
4. Enable conditional validation only when a controlling answer requires it.
5. Disable or reveal fields after a record selector, URL parameter, or hidden
   migration field receives a value.

The examples below are drawn from the CQU legacy forms in
`redbox-hook-cqu/form-config` and their v5 equivalents.

---

## The old shape

A typical v4 rule put three ideas on the target field:

```javascript
visibilityCriteria: {
  type: 'function',
  action: 'utilityService.runTemplate',
  passCriteria: true,
  template: '<%= data == "yes" %>'
},
subscribe: {
  'storage-question1': {
    onValueUpdate: [{ action: 'setVisibility' }],
    onValueLoaded: [{ action: 'setVisibility' }]
  }
}
```

Read this as:

- `subscribe` tells the target field which source field to listen to.
- `onValueUpdate` runs when the source changes.
- `onValueLoaded` runs when the source value is loaded into the form.
- `visibilityCriteria.template` receives the source value as `data`.
- `setVisibility` writes the boolean result into the target field visibility.

The v5 expression is the same idea, but explicit about the event, the JSONata
template, and the property being changed.

---

## 1. Show or hide one field from one source field

Legacy:

```javascript
visibilityCriteria: {
  action: 'utilityService.runTemplate',
  template: '<%= data == "yes" %>'
},
subscribe: {
  'storage-question1': {
    onValueUpdate: [{ action: 'setVisibility' }],
    onValueLoaded: [{ action: 'setVisibility' }]
  }
}
```

v5:

```typescript
const storageQuestion1Changed =
  "/mainTab/storage/storage-question1::field.value.changed";

const visibilityExpression = (
  name: string,
  condition: string,
  template: string,
): FormExpressionsConfigFrame[] => [
  {
    name: `${name}-layout-visible`,
    config: {
      conditionKind: ExpressionsConditionKind.JSONPointer,
      condition,
      template,
      hasTemplate: true,
      target: "layout.visible",
      runOnFormReady: true,
    },
  },
  {
    name: `${name}-component-visible`,
    config: {
      conditionKind: ExpressionsConditionKind.JSONPointer,
      condition,
      template,
      hasTemplate: true,
      target: "component.visible",
      runOnFormReady: true,
    },
  },
];

{
  name: "storage-question2",
  expressions: visibilityExpression(
    "storageQuestion1-storageQuestion2-visible",
    storageQuestion1Changed,
    'value = "yes"',
  ),
  component: {
    class: "TextAreaComponent",
    config: { visible: true }
  },
  layout: {
    class: "DefaultLayout",
    config: { visible: true }
  }
}
```

Key translations:

| v4 | v5 |
|----|----|
| Source field in `subscribe` | JSON pointer in `condition` |
| `onValueUpdate` | `::field.value.changed` |
| `onValueLoaded` | `runOnFormReady: true` |
| `<%= data == "yes" %>` | JSONata `value = "yes"` |
| `setVisibility` | `target: "layout.visible"` and `target: "component.visible"` |

Set both `layout.visible` and `component.visible`. The layout controls the
wrapper; the component controls the inner field. Keeping them together avoids
empty wrappers or visible controls inside hidden layouts.

---

## 2. Migrating common template operators

Most old `utilityService.runTemplate` snippets are direct JSONata conversions.

| Old lodash template | New JSONata template |
|---------------------|----------------------|
| `<%= data == "yes" %>` | `value = "yes"` |
| `<%= data != "rhd" %>` | `value != "rhd"` |
| `<%= data == "staff" || data == "other" %>` | `value = "staff" or value = "other"` |
| `<%= data != undefined && data != "" %>` | `value != null and value != ""` |
| `<%= data == "yes" || data["ip-external-involvement"] == "yes" %>` | `value = "yes" or event.value.\`ip-external-involvement\` = "yes"` |

Prefer `value` when the expression is only about the source field that triggered
the event. Use `formData` when the expression combines several saved form values.
Use `event.value` when the event carries a fetched metadata object from a hidden
getter field.

When the source field is a dropdown, radio group, checkbox group, or any
vocabulary-backed option component, compare against the stored option `value`,
not the translated label the user sees. The old v4 template received whatever
the legacy component published, and some older configs compared display text such
as `"Other"`. In v5, option components normally publish the configured value.

For example, if the user sees **Other** but the option is configured as:

```json
{
  "label": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-other",
  "value": "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-other"
}
```

the expression must compare the value:

```typescript
template: 'value = "@dmpt-vivo:Dataset_dc:location_rdf:PlainLiteral-other"'
```

not the rendered label:

```typescript
template: 'value = "Other"'
```

For property names with hyphens, colons, or other punctuation, use JSONata
backticks:

```typescript
template: 'event.value.`ip-external-involvement` = "yes"'
```

---

## 3. Show or hide from more than one source field

Legacy forms sometimes used an array of `visibilityCriteria` entries. For
example, Data Publication licence fields were shown only when:

1. `dataset-will-be-published` is `yes`.
2. `access-rights` is not `citation`.

In v5, add one expression for each source field that can change the answer. Each
expression writes the same final boolean to the target.

```typescript
const datasetWillBePublishedChanged = "/mainTab/licence/dataset-will-be-published";
const accessRightsChanged = "/mainTab/licence/access-rights";

const citationSensitiveLayoutVisibilityExpression = (
  name: string,
): FormExpressionsConfigFrame[] => [
  ...visibilityExpression(
    `${name}-dataset`,
    datasetWillBePublishedChanged,
    'formData."dataset-will-be-published" = "yes" and formData."access-rights" != "citation"',
  ),
  ...visibilityExpression(
    `${name}-access`,
    accessRightsChanged,
    'formData."dataset-will-be-published" = "yes" and formData."access-rights" != "citation"',
  ),
];

{
  name: "license-identifier",
  expressions: citationSensitiveLayoutVisibilityExpression("license-identifier")
}
```

Why two expressions? Expressions run when their condition matches an event. If a
field depends on two source values, either source changing should recalculate the
same result.

When using quoted property names on `formData`, both of these forms are useful:

```typescript
template: 'formData."dataset-will-be-published" = "yes"'
template: 'formData["dataset-will-be-published"] = "yes"'
```

---

## 4. Initial visibility and form-ready behaviour

If a field should start hidden until a condition is true, set the field's initial
`visible` values to `false` and use `runOnFormReady: true`.

```typescript
{
  name: "mergedFromDataRecordOid",
  expressions: visibilityExpression(
    "mergedFromDataRecordOid",
    "/mainTab/projectinfo/mergedFromDataRecordOid::field.value.changed",
    'formData.mergedFromDataRecordOid != "" and formData.mergedFromDataRecordOid != null',
  ),
  component: {
    class: "SimpleInputComponent",
    config: { visible: false }
  },
  layout: {
    class: "DefaultLayout",
    config: { visible: false }
  }
}
```

This is the v5 equivalent of a legacy field that subscribed to `form.onFormLoaded`
and to its own value updates so it only appeared when a migrated or merged OID was
present.

If the source path does not emit a normal value-change event on load, use a
top-level behaviour to emit one. See
[Populating fields from a related record](Form-Configuration-Recipe-Populate-From-Related-Record.md)
for the selector/getter pattern.

---

## 5. Copying values into another field

Use `target: "model.value"` when the old form populated a field from another
field or from fetched metadata.

```typescript
const modelValueExpression = (
  name: string,
  condition: string,
  template: string,
  runOnFormReady = false,
): FormExpressionsConfigFrame[] => [
  {
    name,
    config: {
      conditionKind: ExpressionsConditionKind.JSONPointer,
      condition,
      template,
      hasTemplate: true,
      target: "model.value",
      runOnFormReady,
    },
  },
];

const buildExpressionsForRdmpChange = (opts?: {
  sourcePropName?: string;
  targetPropName?: string;
}): FormExpressionsConfigFrame[] => {
  const sourcePropName = opts?.sourcePropName ?? "";
  const targetPropName = opts?.targetPropName ?? sourcePropName;

  return modelValueExpression(
    `rdmpGetter-${targetPropName}-${sourcePropName}`,
    "/mainTab/projectinfo/rdmpGetter::field.value.changed",
    `event.value.\`${sourcePropName}\``,
  );
};
```

Usage:

```typescript
{
  name: "ip-external-involvement-details",
  expressions: [
    ...visibilityExpression(
      "ip-external-involvement-details",
      "/mainTab/ip/ip-external-involvement::field.value.changed",
      'value = "yes"',
    ),
    ...visibilityExpression(
      "ip-external-involvement-details-rdmpGetter",
      "/mainTab/projectinfo/rdmpGetter::field.value.changed",
      'event.value.`ip-external-involvement` = "yes"',
    ),
    ...buildExpressionsForRdmpChange({
      sourcePropName: "ip-external-involvement-details",
    }),
  ],
}
```

This expresses three old behaviours clearly:

- The local field can show itself when the local answer is `yes`.
- The field can also show itself when fetched RDMP metadata says the answer is
  `yes`.
- The value is copied from the fetched RDMP metadata into `model.value`.

For repeatable fields, make sure the expression returns the shape expected by
the component. If the source might be a single value but the target expects an
array, coerce it in JSONata:

```typescript
template: 'event.value.`foaf:fundedBy_foaf:Agent`[]'
```

---

## 6. Conditional validation

Do not mutate a field's validators directly from an expression. Instead:

1. Define a validation group on the form.
2. Put the conditional `required` validator in that group.
3. Use an expression to include or exclude the group from
   `form.enabledValidationGroups`.

```typescript
const PHYSICAL_STORAGE_REQUIRED_GROUP = "physical-storage-required";

formConfig.validationGroups = {
  ...formConfig.validationGroups,
  [PHYSICAL_STORAGE_REQUIRED_GROUP]: {
    description: "Validators in this group only apply when the project uses physical storage.",
    initialMembership: "none",
  },
};

{
  name: "physical-storage-location",
  model: {
    class: "SimpleInputModel",
    config: {
      validators: [
        {
          class: "required",
          groups: {
            include: [PHYSICAL_STORAGE_REQUIRED_GROUP],
            exclude: ["all"],
          },
        },
      ],
    },
  },
}

{
  name: "uses-physical-storage",
  expressions: [
    {
      name: "usesPhysicalStorage-validationGroups",
      config: {
        conditionKind: "jsonpointer",
        condition: "/mainTab/storage/uses-physical-storage::field.value.changed",
        template:
          'value = "@dmpt-storage-question-yes-value" ? {"initial": "current", "groups": {"include": ["physical-storage-required"]}} : {"initial": "current", "groups": {"exclude": ["physical-storage-required"]}}',
        hasTemplate: true,
        target: "form.enabledValidationGroups",
        runOnFormReady: true,
      },
    },
  ],
}
```

This keeps validation declarative: the field declares what validators it has, and
the controller field decides when the group's validators are active.

---

## 7. Disabling a field

When the old form disabled a field until another value existed, use a boolean
expression with a disabled target.

```typescript
const disabledExpression = (
  name: string,
  condition: string,
  template: string,
): FormExpressionsConfigFrame[] => [
  {
    name: `${name}-field-disabled`,
    config: {
      conditionKind: ExpressionsConditionKind.JSONPointer,
      condition,
      template,
      hasTemplate: true,
      target: "field.disabled",
      runOnFormReady: true,
    },
  },
];
```

Use this for true disabled state. If the field should disappear, use visibility
expressions instead.

---

## Gotchas and tips

- Use JSONata equality (`=`), not JavaScript equality (`==`).
- Use JSONata boolean operators (`and`, `or`), not `&&` and `||`.
- For option-backed fields, compare against option values, not translated labels
  or visible text.
- For `jsonpointer` expressions, include `::field.value.changed` when the target
  should react only to value changes.
- Set `hasTemplate: true` whenever `template` is JSONata to evaluate, rather than
  a literal value.
- If a field is hidden by default, set both `component.config.visible` and
  `layout.config.visible` to `false`; do not rely only on the expression.
- If more than one source field affects a target, add an expression for each
  source field and calculate the final state from `formData`.
- Prefer small helper functions such as `visibilityExpression` and
  `modelValueExpression` once a form has repeated rules.
- Keep expression names unique within the target field and descriptive enough to
  show the source and target.
- Preserve legacy stored values exactly. It is fine for labels to move to
  translations, but expressions must compare against the actual value in
  metadata.
- For related-record metadata, use a behaviour to fetch and emit the metadata,
  then expressions to populate individual fields. Do not make every field fetch
  the related record independently.

## Related documentation

- [Configuring Form Expressions](Configuring-Form-Expressions.md)
- [Form Event Bus Architecture](Form-Event-Bus-Architecture.md)
- [Populating fields from a related record](Form-Configuration-Recipe-Populate-From-Related-Record.md)
- [Configuring Record Forms](Configuring-Record-Forms.md)

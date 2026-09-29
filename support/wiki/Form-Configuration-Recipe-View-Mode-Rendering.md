# Recipe: Rendering fields in view mode

> Part of the [Form Configuration Recipes](Form-Configuration-Recipes.md) index.

## Problem

Records are rendered in two form modes: `edit` (the editable form) and `view`
(the read-only display). Most fields "just work" in view mode, but a form
usually also needs:

1. Content that should **only** appear in view mode (a rendered citation, a
   workflow-stage badge, a computed summary, action links).
2. Content that should **only** appear in edit mode (help text, delete buttons,
   inline instructions).
3. A field's value carried into view mode so a *different* component can display
   it, even though its own editor is hidden.
4. Control over *how* an input is rendered read-only, when the default is not
   what you want.

This recipe explains how the framework turns an editable form into a view, and
the config levers you use to steer it. The real examples are drawn from the JCU
`dataPublication-1.0-common` form and the portal's `generated-view-only` config.

## How view mode is produced

You do **not** author two separate forms. The same component definitions are run
through the form-override visitor
([`FormOverride`](../../packages/sails-ng-common/src/config/form-override.model.ts))
once per mode. Two mechanisms decide what a component becomes:

| Mechanism | Where it lives | What it does |
|-----------|----------------|--------------|
| **`constraints.allowModes`** | On any component definition | Restricts the modes the component renders in. `["view"]`, `["edit"]`, both, or `[]`/omitted (all modes). |
| **Automatic view transform** | Built in to `FormOverride.defaultTransforms` | In `view` mode, input components are automatically converted to a read-only `ContentComponent` (and `TabComponent` → `AccordionComponent`). |
| **`overrides.formModeClasses`** | On a component definition | Overrides or supplies the class a component becomes in a given mode. |

### The automatic transform — why most fields need nothing

In view mode the following are converted to `ContentComponent` for you, with the
stored value formatted appropriately:

`SimpleInputComponent`, `TextAreaComponent`, `DropdownInputComponent`,
`CheckboxInputComponent`, `RadioInputComponent`, `DateInputComponent`,
`TypeaheadInputComponent`, `RichTextEditorComponent`, `FileUploadComponent`,
`PDFListComponent`, `DataLocationComponent`,
`PublishDataLocationSelectorComponent`, `RepeatableComponent`,
`GroupComponent`, `CheckboxTreeComponent`, `QuestionTreeComponent`.
`TabComponent` becomes an `AccordionComponent`.

So a plain text field, dropdown, date, or repeatable **renders in view mode with
no extra config** — dropdown/radio/checkbox values are resolved back to their
option labels, dates are formatted, repeatables/groups become tables or
label/value lists, file uploads become download lists, and so on.

**The critical rule:** if a component *explicitly* lists `"view"` in its
`constraints.allowModes`, the automatic transform is **skipped** and the
component renders in view mode exactly as you authored it. This is what lets you
place hand-written view-only content (see below). If you have explicitly allowed
`view` but still want the automatic input→`ContentComponent` transform, set
`overrides.__forceViewTransform: true` to force it back on.

---

## 1. View-only content

Author the component with the class you want rendered (almost always
`ContentComponent`) and restrict it with `allowModes: ["view"]`. Because `view`
is explicitly allowed, the automatic transform is skipped and your component is
rendered verbatim.

The workflow-stage badge from `dataPublication-1.0-common`:

```typescript
{
  name: "view-workflow-stage",
  constraints: {
    allowModes: ["view"]
  },
  overrides: {
    formModeClasses: {
      view: { component: "ContentComponent" }
    }
  },
  component: {
    class: "ContentComponent",
    config: {
      visible: true,
      template: "<span class=\"badge alert-success badge-workflow-stage\" data-stage=\"{{workflow.stage}}\">{{t '@status-label'}}: {{t workflow.stageLabel}}</span>",
      content: "The workflow stage."
    }
  },
  layout: { class: "DefaultLayout", config: { helpTextVisible: false } }
}
```

The `formModeClasses.view.component: "ContentComponent"` here is belt-and-braces:
it makes the intent explicit and is a no-op when the class is already
`ContentComponent`. `allowModes: ["view"]` is what does the real work.

---

## 2. Edit-only content

The mirror image: restrict with `allowModes: ["edit"]`. This is the pattern for
help text, instructions, and action buttons that make no sense on a read-only
record.

```typescript
{
  name: "dataPub-dm-suffix-0",
  constraints: { allowModes: ["edit"] },
  component: {
    class: "ContentComponent",
    config: {
      template: "<div>{{{t content}}}</div>",
      content: "@dataPublication-data_manager-transferResponsibility"
    }
  }
}
```

Reviewer/admin tabs, save and delete buttons, and inline guidance in the JCU
forms all use `allowModes: ["edit"]` (often combined with an
`authorization.allowRoles` list).

---

## 3. Rendering from `formData` (computed and cross-field view content)

A `ContentComponent` that has **both** `content` and a Handlebars `template`
renders the template with a live context. This is how you show computed values,
or one field's value under another field's label.

The context available to the template is:

| Variable | Value |
|----------|-------|
| `content` | The `content` value from the component config (any shape — string, object). |
| `formData` | The whole record's current form value. Re-rendered live as the form changes. |
| `branding`, `portal`, `oid` | Route context for building links. |
| `workflow` | The workflow meta, e.g. `workflow.stage`, `workflow.stageLabel`. |
| `outputFormat` | For rich-text components, `"html"` or `"markdown"`. |

Reading a value straight out of `formData` — the record title heading:

```typescript
{
  name: "heading",
  component: {
    class: "ContentComponent",
    config: {
      content: "title",
      template: "<h1>{{get formData content \"\"}}</h1>"
    }
  }
}
```

Displaying a value under a different label, with a fallback path (the data
manager's name on the licensing/access section):

```typescript
{
  name: "dataLicensingAccess_manager",
  overrides: { formModeClasses: { view: { component: "ContentComponent" } } },
  component: {
    class: "ContentComponent",
    config: {
      label: "@dataPublication-dataLicensingAccess_manager",
      template: `{{#if (get formData content.valuePath "")}}<span>{{get formData content.valuePath ""}}</span>{{else}}{{#if (get formData content.arrayValuePath "")}}<span>{{get formData content.arrayValuePath ""}}</span>{{/if}}{{/if}}`,
      content: {
        valuePath: "contributor_data_manager.text_full_name",
        arrayValuePath: "contributor_data_manager.0.text_full_name"
      }
    }
  }
}
```

Building a route-aware action link (from `generated-view-only`):

```typescript
{
  name: "view_audit",
  constraints: { authorization: { allowRoles: ["Admin", "Librarians"] }, allowModes: ["view"] },
  component: {
    class: "ContentComponent",
    config: {
      content: { cssClasses: "btn btn-info", label: "View Audit Records" },
      template: "<a href=\"{{concat \"/\" branding \"/\" portal \"/record/viewAudit/\" oid}}\" class=\"{{content.cssClasses}}\">{{content.label}}</a>"
    }
  }
}
```

### Handlebars helpers available in templates

Seen in the built-in transforms and JCU config: `t` (translate a key), `get`
(safe deep-get with default), `concat`, `default`, `formatDate`,
`plaintextToHtml`, `markdownToHtml`, `attachmentDownloadUrl`, plus the standard
comparison/block helpers `eq`, `or`, `#if`, `#each`, `#with @root`. Use triple
mustaches (`{{{ }}}`) when the helper already returns HTML (e.g.
`{{{t content}}}`, `{{{markdownToHtml content}}}`); double mustaches escape.

A `ContentComponent` with a `content` string and **no** `template` simply
displays the content — and if the string starts with `@` it is translated.

---

## 4. The hidden value-carrier pattern

Sometimes a field's own editor should not appear in view mode, but its value
must remain in `formData` so a sibling `ContentComponent` (as in section 3) can
render it. Keep the source component as a **hidden `SimpleInputComponent`** and
stop the automatic view transform from turning it into content:

```typescript
{
  name: "contributor_data_manager",
  constraints: { allowModes: ["view"] },
  overrides: { formModeClasses: { view: { component: "SimpleInputComponent" } } },
  component: {
    class: "SimpleInputComponent",
    config: { visible: false, type: "hidden", disabled: true, label: "contributor_data_manager" }
  },
  model: { class: "SimpleInputModel" },
  layout: { class: "DefaultLayout", config: { visible: false, helpTextVisible: false } }
}
```

- `allowModes: ["view"]` skips the automatic transform (which would otherwise
  replace it with a `ContentComponent`).
- `formModeClasses.view.component: "SimpleInputComponent"` keeps it a hidden
  input in view mode, so its value stays bound in `formData`.
- `visible: false` / `type: "hidden"` keep it off-screen.

The visible `dataLicensingAccess_manager` content in section 3 then reads
`contributor_data_manager.text_full_name` out of `formData`.

---

## 5. Conditional fields with values in view mode

The hidden value-carrier pattern is not quite enough when the conditional field
itself must be visible in view mode. A common failed approach is to keep one
definition and add `allowModes: ["view"]`: that disables the automatic
transform, so the editor can appear in view mode. Removing the field from view
avoids the editor, but also removes its model and its saved value.

For a conditional field that has both an editor and a read-only value, keep two
mode-scoped definitions with the same field name and model-backed value:

1. Keep the original definition as `allowModes: ["edit"]`. Put the JSONata
   visibility and disabled expressions on this copy, and initialise it hidden
   and disabled. These expressions can use the driving field's
   `field.value.changed` event in the normal way.
2. Clone the definition for `allowModes: ["view"]`, remove the edit-mode
   expressions, and explicitly set
   `overrides.formModeClasses.view.component` to `ContentComponent`. Give the
   view copy a template that guards against an empty `content` value.

The view copy remains model-backed, so the form compiler supplies the stored
value to the read-only component as `content`. This also lets the normal view
transforms resolve option values to labels. A simplified shape is:

```typescript
const editField = {
  name: "conditional_note",
  constraints: { allowModes: ["edit"] },
  expressions: [/* field.visible and field.disabled JSONata expressions */],
  component: { class: "TextAreaComponent", config: { visible: false } },
  model: { class: "TextAreaModel" },
  layout: { class: "DefaultLayout", config: { visible: false } }
};

const viewField = structuredClone(editField);
delete viewField.expressions;
viewField.constraints = { allowModes: ["view"] };
viewField.overrides = {
  formModeClasses: {
    view: {
      component: "ContentComponent",
      template: "<div class=\"conditional-view-value\">{{#if content}}{{content}}{{/if}}</div>"
    }
  }
};
```

Do not calculate the view copy's `content` with a `runOnFormReady` JSONata
expression. Form-ready expressions can run before the loaded record has
hydrated its values, leaving the view content empty. Let the model-backed view
component receive its value through the form compiler instead. Also keep the
empty-value guard: otherwise a conditional field can leave behind a blank
label, wrapper, or heading in view mode.

### Conditional headings and notices

A standalone view-only `ContentComponent` has no field model or value-change
event of its own. If its content is computed by a `runOnFormReady` JSONata
expression, that expression can run before the loaded record has hydrated.
Keep the original notice or heading as `allowModes: ["edit"]`, then add its
view markup to the driving field's `formModeClasses.view.template`. Evaluate
the condition against the driving field's transformed `content`:

```typescript
{
  component: {
    class: "ContentComponent",
    config: {
      template: `
        {{#if content.value}}<span>{{t content.label}}</span>{{/if}}
        {{#if (eq content.value "planned")}}
          <div class="notice">{{t "@my-planned-notice"}}</div>
        {{/if}}`
    }
  }
}
```

For scalar drivers use `content` directly; for single-select drivers use
`content.value`; and for multi-select drivers test the transformed array shape
(for example with `get` and `#each`). Test the machine value, not the displayed
translated label. This pattern keeps the notice/heading beside the field it
depends on and avoids duplicate headings or notices that remain visible when
their condition is false.

---

## 6. Overriding the read-only rendering

When the default input→`ContentComponent` conversion is not what you want, use
`overrides.formModeClasses.view` to name a different target component (and,
optionally, `model`/`layout`). If you specify `model` or `layout` you must also
specify `component`. Only registered transforms are allowed — for example the
inputs listed above can transform to `ContentComponent`, and `TabComponent` can
transform to `AccordionComponent`. Naming an unsupported target throws at
construction time.

To customise the *markup* of the auto-generated view (rather than the component
class), define reusable view-template fragments. `FormOverride` looks up
reusable component definitions by well-known keys such as
`view-template-leaf-plain`, `view-template-leaf-date`,
`view-template-group-container`, `view-template-repeatable-table`,
`view-template-repeatable-list`, and the various
`view-template-leaf-*` keys, falling back to built-in defaults when absent. Ship
a single `ContentComponent` definition under one of those reusable names whose
`template` uses the documented slot placeholders (`[[valueExpr]]`,
`[[rowsHtml]]`, `[[headersHtml]]`, `[[cellsHtml]]`, …) to override the default
view markup for every field of that shape.

---

## Gotchas and tips

- **Don't rebuild view content that the transform already produces.** Plain
  inputs, dropdowns, dates, repeatables, groups, and file uploads all render in
  view mode automatically. Only hand-author view content for things the
  transform cannot do (computed values, badges, links, cross-field display).
- **`allowModes: ["view"]` disables the automatic transform for that
  component.** That is the feature that lets your hand-written view content
  survive — but it also means an *input* you mark `["view"]` will render as its
  editor, not as content, unless you add `__forceViewTransform: true`.
- **Keep the value bound if a template reads it.** `formData` only contains
  values from components that are still model-backed in the current mode. A
  value-carrier field must stay a `SimpleInputComponent` (section 4), not be
  transformed away.
- **`visible: false` hides a field but keeps its value**; `allowModes` removes
  the field from a mode entirely. Use `visible: false` for value carriers, and
  `allowModes` to scope UI to a mode.
- **Set `helpTextVisible: false`** on view-only content layouts so an empty help
  region does not render.
- **Escape correctly.** Use `{{{ }}}` only for helpers that return HTML; use
  `{{ }}` for plain text so user data is escaped.
- **Templates re-render live** as the form value changes in edit mode, so a
  `formData`-driven `ContentComponent` (e.g. a live citation preview) updates as
  the user types.

## Related documentation

- [Configuring Record Forms](Configuring-Record-Forms.md)
- [Form Configuration Recipes](Form-Configuration-Recipes.md)
- [Form Configuration Internals](Form-Configuration-Internals.md)
- [Configuring Form Expressions](Configuring-Form-Expressions.md)

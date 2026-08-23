# Configuring Record Forms

## Introduction

ReDBox has a flexible and configurable framework that allows you to capture metadata for a variety of purposes such as data management plans, provisioned workspaces and data collections. Metadata is stored in the [JSON-LD](https://json-ld.org/) format and has a very loose schema to support this flexibility.

For each type of metadata record stored, it is also possible to configure a workflow that the record may pass through to map to the business processes within your organisation.

There is also a configurable form system that allows you to design a form to meet your needs without having the need to understand code. It is possible to attach different form structures to each workflow stage to suit the requirements for the user of the form.

## Record Type Configuration

Record Types are configured in the `config/recordtype.js` file.

The record type configuration defines the record type (e.g. a research data management plan record) and what fields in the record should be displayed on the search interface for the purposes of filtering and faceting.

Records are configured via the `config/workflow.js` file and specify the workflow stages a record can transition through and the roles that are permitted to view and edit a record for each workflow stage.

```
<record-type>
|
|- search-filters []
    |- name
    |- title
    |- type
    |- typeLabel
```
Where <> are property labels that are variables.

| Field            | Description                                                                                                                                                                              | Required | Example        |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|----------------|
| < record-type >    | The label of record type | Yes      | rdmp           |
| name  | The name of the Solr index field to facet on. For facet type fields, this is usually the name you've configured in your form configuration. To allow for inexact matching for filter search boxes, append `text_` to the beginning of the name | Yes      | text_title         |
| title  | The heading label to display in the facets section. Can read text from the language file | Yes      | search-refine-description           |
| type  | The type of facet. Fixed for search box filters, facet for facet counts | Yes      | facet           |
| typeLabel  | The label to show above the search box filter. Can read text from the language file. Set to null for facet count fields | Yes      | search-refine-contains           |

### Example
```
"rdmp": {
  searchFilters: [
    {
      name: "text_title",
      title: "search-refine-title",
      type: "exact",
      typeLabel: "search-refine-contains"
    },
    {
      name: "text_description",
      title: "search-refine-description",
      type: "exact",
      typeLabel: "Can read text from the language file"
    },
    {
      name: "grant_number_name",
      title: "search-refine-grant_number_name",
      type: "facet",
      typeLabel: null,
      alwaysActive: true
    },
    {
      name: "finalKeywords",
      title: "search-refine-keywords",
      type: "facet",
      typeLabel: null,
      alwaysActive: true
    },
    {
      name: "workflow_stageLabel",
      title: "search-refine-workflow_stageLabel",
      type: "facet",
      typeLabel: null,
      alwaysActive: true
    }
  ]
}
```

## Workflow Configuration

The structure of the configuration is as follows:

```
<record-type>
|
|- <workflow-stage>
    |
    |- config
        |
        |- workflow
            |
            |- stage
            |- stageLabel
            |- next
        |- authorization
            |
            |- viewRoles
            |- editRoles
        |- form
    |- starting
```
Where <> are property labels that are variables.

| Field            | Description                                                                                                                                                                              | Required | Example        |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|----------------|
| < record-type >    | The label of record type                                                                                                                                                                 | Yes      | rdmp           |
| < workflow-stage > | The label of the workflow stage for the record type                                                                                                                                      | Yes      | draft          |
| stage            | The code value for the stage. This value is stored in the metadata record within ReDBox. Best practice would be to match it with < workflow-stage > but it can be different if necessary.  | Yes      | draft          |
| stageLabel       | The label for the stage that is presented to users on the interface.                                                                                                                     | Yes      | Draft          |
| next             | The stage to transition to.                                                                                                                                                | No       | review         |
| viewRoles        | An array of roles that are allowed to view this record type at this stage                                                                                                                | Yes      | ['Admin']      |
| editRoles        | An array of roles that are allowed to edit this record type at this stage                                                                                                                | Yes      | ['Admin']      |
| form             | The form code. This should match an entry in the form.js configuration file                                                                                                              | Yes      | rdmp-1.0-draft |
| starting         | Is this the stage that new records should commence in?                                                                                                                                   | No       | true           |

### Example
```
"rdmp": {
    "draft": {
      config: {
        workflow: {
          stage: 'draft',
          stageLabel: 'Draft',
          next: 'review',
        },
        authorization: {
          viewRoles: ['Admin'],
          editRoles: ['Admin']
        },
        form: 'rdmp-1.0-draft'
      },
      starting: true
    },
```

## Form/view configuration

The form and view layout is configured via the `config/form.js` file.

The structure of the configuration file is as follows:

```
defaultForm
|
|- forms
    |
    |- <form-name>
        |
        |- name
        |- type
        |- enabledValidationGroups
        |- editCssClasses
        |- viewCssClasses
        |- messages
            |
            |- <message-code>
        |
        |- fields []
            |
            |- class
            |- compClass
            |- viewOnly
            |- definition
                |
                |- <component specific properties>

```

### Form-wide configuration

The settings in this section control the behaviour of the entire form.

| Field                   | Description                                                                                                                                                                                                                      | Required                 | Example                              |
|-------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------|--------------------------------------|
| < form-name >           | The label name of the form, should match a "form" value in workflow.js for it to be used                                                                                                                                         | Yes                      | rdmp-1.0-draft                       |
| name                    | The label name of the form. This should match the < form-name > value.                                                                                                                                                           | Yes                      | rdmp-1.0-draft                       |
| type                    | The type of form (e.g. `rdmp`, `project`, `survey`).                                                                                                                                                                              | Yes                      | rdmp                                 |
| enabledValidationGroups | The validation groups to enable. This property is particularly useful in early stages of a workflow where you want the user to be able to save and come back to the record later without having to fill in all mandatory fields. | No (defaults to ["all"]) | ["minimumCreate"]                    |
| skipValidationOnSave    | Legacy browser behavior migrated to validation groups. It does not bypass authoritative server validation.                                                                                                                       | No                       | false                                |
| editCssClasses          | The CSS classes to apply to each element for styling. These are used in edit mode                                                                                                                                                | Yes                      | row col-md-12                        |
| viewCssClasses          | The CSS classes to apply to each element for styling. These are used in view mode                                                                                                                                                | Yes                      | row col-md-12                        |
| < message-code >        | A set of key value pairs containing messages to show to the user                                                                                                                                                                 | Yes                      | "saveSuccess": "Saved successfully." |

## Authoritative server validation operations

Every metadata-changing save is validated by the server against the complete
candidate and the exact resolved form. `enabledValidationGroups` still drives
interactive Angular feedback, but a client cannot make it authoritative by
sending a different group array.

Forms declare server-owned business intents in `validationOperations`:

```javascript
validationOperations: {
  submit: {
    enabledValidationGroups: ['submit'],
    label: 'Submit for review',
    description: 'Validate submission requirements.',
    roles: ['Researcher'],
    allowedTargetSteps: ['review']
  },
  publish: {
    enabledValidationGroups: ['publish'],
    roles: ['Librarian'],
    allowedTargetSteps: ['published']
  }
}
```

| Property | Meaning |
|---|---|
| operation key | Case-sensitive safe name, up to 64 characters |
| `enabledValidationGroups` | Exact blocking group set applied last for this operation |
| `label` / `description` | Optional safe discovery text shown to authorized clients |
| `roles` | Optional restriction intersected with record edit authorization |
| `allowedTargetSteps` | Optional restriction intersected with authorized transitions |

An omitted operation always runs every blocking validator. It does not preserve
the final form's conditional/default group subset. For a named operation, an
empty enabled-group array retains the established ReDBox meaning of all
validators; use the server-owned declared `none` group to intentionally run
none. In either strict-all case, validators belonging only to advisory groups
from `SuggestedValidationSummaryComponent` are excluded from the blocking pass
and executed separately. Strict-all does not overlap every advisory group;
overlap diagnostics require a named group selected for both passes. Advisory
validator findings, execution failures, and timeouts do not block primary
persistence. Advisory-group discovery is still enforcement configuration:
groups must exist and must use `initialMembership: 'none'`. Configuring an
advisory group—including the built-in `all` group—with
`initialMembership: 'all'` is an enforcement configuration error and does not
prove that any validator is advisory-only or remove ordinary validators from
the strict-all pass. A malformed advisory summary or an unknown/invalid
advisory group remains diagnostic-only in shadow mode and blocks saves in
enforce mode.

Rich-text fields are also inspected during the authoritative pass. With the
default `record.form.htmlSanitizationMode: 'sanitize'`, unsafe HTML is replaced
on a cloned authoritative candidate and reported as the nonblocking
`htmlSanitized` advisory issue. The returned candidate—not the caller object or
the pre-sanitization copy—is used for create, update, transition, postSync, and
persistence. Sanitation precedes field/form validators (including repeatable
rows), and a successful save that sanitizes content returns
`saved-with-warnings` with the advisory issue. Setting the mode to `reject`
leaves the submitted value unchanged
and reports the blocking `htmlUnsafe` issue; the record-validation rollout mode
still determines whether blocking findings are enforced or observed in shadow.
Sanitation transformations include the exact source string and schema-owned
path. Application verifies both before replacement and also applies any
transformations discovered by the blocking or advisory validator pass.
If sanitation succeeds but a later blocking expression or validator fails,
times out, or cannot resolve its groups, the sanitized candidate remains the
only candidate eligible for shadow persistence. A malformed or stale
transformation source, type, or path is not skipped: the save fails closed in both rollout modes
so raw unsafe HTML cannot be written accidentally.

Record-type configuration may replace groups, restrict policy, and select
rollout mode:

```javascript
recordValidation: {
  mode: 'shadow',
  operations: {
    submit: { mode: 'enforce' }
  }
}
```

A workflow stage may refine `recordValidation.operations` groups, roles, and
allowed target steps, but cannot change mode. Mode precedence is global,
global operation, record type, then record-type operation.

Save buttons add `operation` while retaining temporary client groups:

```javascript
config: {
  label: 'Submit',
  operation: 'submit',
  targetStep: 'review',
  enabledValidationGroups: ['submit']
}
```

Server conditional-group expressions run only with deterministic form-ready
state. Browser event routes such as JSONPointer `::field.value.changed`,
browser-only JSONata bindings, and expressions with `runOnFormReady: false`
are not authoritative. During migration they produce safe shadow diagnostics
without changing persistence. In enforce mode they are configuration failures
and the save is rejected; replace them with a form-ready expression over the
documented JSON-like server context or move the rule into a validator before
enabling enforcement.

The server expression context has this fixed shape: candidate `formData`, the
validation `operation`, `recordType`, `formName`, `brand`, current/target
`workflow` steps, allowlisted `requestParams`, normalized `runtimeContext`, and
`actor: { authenticated, roles }`. Browser and API routes offer the same four
normalized request facts: bounded `recordType`/`targetStep` references and
boolean `merge`/`datastreams`. The deployment
`recordValidation.allowedRequestParameters` list narrows those facts again.
Runtime facts contain `routeFamily`, `writeKind`, and `saveOperation`; only
trusted internal callers may add JSON-only values. Raw requests, sessions,
headers, users, IDs, tokens, credentials, and arbitrary query parameters are
not expression inputs.

Candidate record metadata and values are data only. Nested objects that happen
to resemble component definitions, groups, summaries, or expressions are not
traversed as form configuration and cannot select `none` or suppress blocking
validation. Validators inside a repeatable component's schema-owned
`elementTemplate` run once per submitted row with indexed data-model and pointer
lineage, matching Angular's row behavior.

For a targeted create, the target workflow step supplies the exact form and
authorization written to the new record. The caller must have ordinary edit
access to that constructed candidate and, when the target is not the starting
step, must satisfy the target step's transition-role policy. An operation's
`roles` and `allowedTargetSteps` may narrow those checks; they never replace
object edit or workflow-transition authorization.

An explicitly requested create or transition target must be a well-formed,
configured workflow step and is resolved before hooks run. Transition and
create hooks cannot silently switch that target, brand, record type, or
workflow stage. Missing or conflicting hook-produced `metaMetadata.form` is
normalized to the exact authoritative target-step form before validation and
persistence; brand, type, or workflow authority divergence is rejected.
Ordinary target-step and transition-role checks are repeated after hook output;
operation policy remains an additional restriction. Same-name form and
reusable-validator changes invalidate bounded effective caches through their
version/fingerprint. Candidate-sensitive question-tree configurations are
reconstructed for each candidate, including when the question tree appears
only after a reusable definition is expanded.

See [Migrating Save Buttons to Validation Operations](Migrating-Save-Buttons-to-Validation-Operations)
and [Operating Authoritative Server-Side Form Validation](Server-Side-Form-Validation-Operations).

### Messages

Define form event messages within the `messages` object. These should correspond to keys in your localization files.

```javascript
messages: {
  "saving": ["@form-saving"],
  "validationFail": ["@form-validation-fail-prefix", "@form-validation-fail-suffix"]
}
```

### Field configuration

The fields section lays out the components to appear in the form.

| Field      | Description                                                                                   | Required               | Example |
|------------|-----------------------------------------------------------------------------------------------|------------------------|---------|
| class      |                                                                                               | Yes                    |         |
| compClass  | The component class name. See the [Component documentation](https://redbox-mint.github.io/redbox-portal/components/ContributorComponent.html) for a list of available components and how to configure them | Yes                    | TextBlockComponent      |
| viewOnly   | When set to true, this component will only appear in the view (details) rendition of the form | No (defaults to false) | true    |
| editOnly   | When set to true, this component will only appear in the edit (details) rendition of the form | No (defaults to false) | true    |
| definition | Configuration that is specific for the component being added. How to configure a component is described in the [Component documentation](https://redbox-mint.github.io/redbox-portal/components/ContributorComponent.html) | Yes                    | value: '@dmpt-data-collection-heading' |

### Example

```
fields: [
  {
    class: 'Container',
    compClass: 'TextBlockComponent',
    viewOnly: true,
    definition: {
      name: 'title',
      type: 'h1'
    }
  },
```

## Adding and Configuring Tabs

Use `TabOrAccordionContainer` classes for sections requiring tabs:

```javascript
{
  class: "TabOrAccordionContainer",
  compClass: "TabOrAccordionContainerComponent",
  definition: {
    id: "mainTab",
    fields: [ ... ]
  }
}
```

Each tab can host a distinct set of fields.

## Event-Driven Form Expressions

ReDBox provides a powerful expression system that enables dynamic form behavior based on field value changes and form state. This is implemented using an event bus architecture where components publish and consume events.

### Overview

The expression system allows:
- Updating a field's value when another field changes
- Showing or hiding fields based on conditions
- Complex cross-field interactions using JSONata queries
- Reacting to form structure changes (e.g., repeatable items added/removed)

### Quick Example

```javascript
{
    name: 'target_field',
    model: { class: 'SimpleInputModel' },
    component: { class: 'SimpleInputComponent' },
    expressions: [
        {
            name: "listenToSourceField",
            config: {
                condition: "/form_tab/source_field::field.value.changed",
                conditionKind: "jsonpointer",
                template: `value & "_suffix"`,
                target: "model.value"
            }
        }
    ]
}
```

This expression listens for value changes on `source_field` and updates `target_field` with the source value plus a suffix.

### Condition Types

| Type | Use Case |
|------|----------|
| `jsonpointer` | Simple field-to-field event wiring using JSON Pointer paths |
| `jsonata` | Complex conditions using JSONata expressions against form data |
| `jsonata_query` | Conditions that need to query the form's component structure |

For comprehensive documentation on configuring expressions, including all condition types, template syntax, and best practices, see **[Configuring Form Expressions](Configuring-Form-Expressions)**.

### Legacy Publish-Subscribe

> **Note**: The legacy `publish` and `subscribe` properties are still supported for backward compatibility but the new `expressions` system is recommended for new implementations.

The legacy pattern used `publish` to broadcast events and `subscribe` to listen:

```javascript
// Legacy publish configuration
definition: {
  name: 'startDate',
  publish: {
    onValueUpdate: {
      modelEventSource: 'valueChanges'
    }
  }
}

// Legacy subscribe configuration
subscribe: {
  'startDate': {
    onValueUpdate: [
      { action: 'updateValue', actionParams: { minDate: '@startDate' } }
    ]
  }
}
```

## Language Configuration

Messages in the system can be configured using Language files. This allows for internationalisation of the portal as well as editing in a translation management system such as [Locize](https://locize.com).

The application uses [i18next](https://www.i18next.com/) to render the messages and the language files are kept in the `assets/locales/<language>` directories.

Please see the [i18next documentation](https://www.i18next.com/essentials.html) for more information on how the language file is structured and its features.

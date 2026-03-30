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
| skipValidationOnSave    | Determines whether validation is skipped on save. Set to `false` to enforce validation.                                                                                                                                          | No                       | false                                |
| editCssClasses          | The CSS classes to apply to each element for styling. These are used in edit mode                                                                                                                                                | Yes                      | row col-md-12                        |
| viewCssClasses          | The CSS classes to apply to each element for styling. These are used in view mode                                                                                                                                                | Yes                      | row col-md-12                        |
| < message-code >        | A set of key value pairs containing messages to show to the user                                                                                                                                                                 | Yes                      | "saveSuccess": "Saved successfully." |

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

# Configuring web forms

## Introduction



## Record Configuration

Record's are configured via the config/workflow.js file and specifies the workflow stages a record can transition through and the roles that are permitted to view and edit a record for each workflow stage.

The structure of the configuration is as follows

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
| next             | The stage to transition to. *NEEDS rework*                                                                                                                                               | No       | review         |
| viewRoles        | An array of roles that are allowed to view this record type at this stage                                                                                                                | Yes      | ['Admin']      |
| editRoles        | An array of roles that are allowed to edit this record type at this stage                                                                                                                | Yes      | ['Admin']      |
| form             | The form code. This should match an entry in the form.js configuration file                                                                                                              | Yes      | rdmp-1.0-draft |
| starting         | Is this the stage that new records should commence in?                                                                                                                                   | No       | true           |


#### Example
```
"rdmp": {
    "draft": {
      config: {
        workflow: {
          stage: 'draft',
          stageLabel: 'Draft',
          next: 'active',
        },
        authorization: {
          viewRoles: ['Admin'],
          editRoles: ['Admin']
        },
        form: 'default-1.0-draft'
      },
      starting: true
    },
```

## Form/view configuration

The form and view layout is configured via config/form.js file.

The structure of the configuration file is as follows

```
defaultForm
|
|- forms
    |
    |- <form-name>
        |
        |- name
        |- type
        |- skipValidationOnSave
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

| Field                | Description                                                                                                                                                                                                                                                                                                | Required               | Example                              |
|----------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------|--------------------------------------|
| < form-name >        | The label name of the form, should match a "form" value in workflow.js for it to be used                                                                                                                                                                                                                   | Yes                    | rdmp-1.0-draft                       |
| name                 |        The label name of the form. This should match the < form-name > value. form                                                                                                                                                                                                                                                                                                   | Yes                    | rdmp-1.0-draft                       |
| skipValidationOnSave | When set to true, validation will only trigger when the record is submitted to change it's workflow state. This property is particularly useful in early stages of a workflow where you want the user to be able to save and come back to the record later without having to fill in all mandatory fields. | No (defaults to false) | true                                 |
| editCssClasses       | The css classes to apply to each element for styling. These are used in edit mode                                                                                                                                                                                                                          | Yes                    | row col-md-12                        |
| viewCssClasses       | The css classes to apply to each element for styling. These are used in view mode                                                                                                                                                                                                                          | Yes                    | row col-md-12                        |
| < message-code >       | A set of key value pairs containing messages to show to the user                                                                                                                                                                                                                                           | Yes                    | "saveSuccess": "Saved successfully." |

### Field configuration

The fields section lays out the components to appear in the form.

| Field      | Description                                                                                   | Required               | Example |
|------------|-----------------------------------------------------------------------------------------------|------------------------|---------|
| class      |                                                                                               | Yes                    |         |
| compClass  |                                                                                               | Yes                    |         |
| viewOnly   | When set to true, this component will only appear in the view (details) rendition of the form | No (defaults to false) | true    |
| editOnly   | When set to true, this component will only appear in the edit (details) rendition of the form | No (defaults to false) | true    |
| definition | Configuration that is specific for the component being added                                                                                              | Yes                    |  value: '@dmpt-data-collection-heading' |


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

## Language Configuration

Messages in the system can be configured using Language files. This allows for internationalisation of the portal as well as editing in a translation management system such as [Locize](https://locize.com).

The application uses [i18next](https://www.i18next.com/) to render the messages and the language files are kept in the assests/locales/<language> directories.

Please see the [i18next documentation](https://www.i18next.com/essentials.html) for more information on how the language file is structured and it's features.

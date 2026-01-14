ReDBox workflows manage the lifecycle of different record types, from creation to archiving. This guide details configuring workflow stages, customizing the researcher dashboard, and utilizing template imports for dynamic data presentation.

## Workflow Configuration Overview

Define the lifecycle stages for records, specifying settings for access control and associated forms to guide users through their data management processes.

### Configuring Workflows

Workflows are specified within the `sails.config.workflow` object, mapping stages to each record type:

```javascript
module.exports.workflow = {
  "rdmp": {
    "draft": {
      config: {
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        authorization: { viewRoles: ['Admin', 'Librarians'], editRoles: ['Admin', 'Librarians'] },
        form: 'default-1.0-draft'
      },
      starting: true
    }
    // Additional stages...
  },
  "dataRecord": {
    // Stages for dataRecord...
  },
  "dataPublication": {
    // Stages for dataPublication...
  }
  // Further record types...
};

```

**Key Components**:

- **`stage` and `stageLabel`**: Define the workflow stage and its user-friendly label.
- **`authorization`**: Dictates which roles can view or edit records in this stage.
- **`form`**: Specifies the form template used during this stage.
- **`starting`**: Indicates if this is the initial stage for the workflow.


**Best Practices**:
- Ensure stage labels are clear and consistent.
- Set access controls according to your institution's security policies.
- Select forms that match the data collection requirements for each stage.

## Example: Data Publication Workflow

Here is an example workflow configuration for 'dataPublication', encompassing stages like 'Draft', 'Queued for Review', and 'Published':

```javascript
"dataPublication": {
  "draft": {
    config: {
      workflow: { stage: 'draft', stageLabel: 'Draft' },
      authorization: { viewRoles: ['Admin', 'Librarians'], editRoles: ['Admin', 'Librarians'] },
      form: 'dataPublication-1.0-draft'
    },
    starting: true
  },
  "queued": {
    // Configuration for 'Queued for Review' stage...
  },
  // Additional stages...
};
```

This structured approach streamlines the process from initial creation to the final publication, ensuring clarity and consistency at each step.

## Customizing Dashboard Tables (`dashboard.tableConfig`)

Enhance dashboard visibility and data access by customizing table layouts for different workflow stages:

```javascript
"dashboard": {
  "table": {
    "rowConfig": [
      // Column configurations...
    ]
  }
}
```

Tailor columns and data presentation to improve user experience according to specific workflow stage requirements.

### Default Table Layout

ReDBox uses a default layout if `dashboard.tableConfig` is not defined for a workflow stage. However, defining custom configurations enables more tailored data presentation for each stage.

### Leveraging Template Imports for Dynamic Data Display

Templates in `dashboard.tableConfig` use lodash's `_.template`, accessing predefined imports for flexible data presentation:

**Available Imports**:
- **`metadata`, `metaMetadata`, `workflow`**: Access different aspects of record data for dynamic content rendering.
- **`branding`, `rootContext`, `portal`**: Contextual information for constructing URLs and paths.
- **`translationService`**: Facilitates multilingual support within templates.
- **`oid`, `name`**: Essential for creating links and referencing records.

```html
<a href='/<%= rootContext %>/<%= branding %>/<%= portal %>/record/view/<%= oid %>'><%= metadata.title %></a>
```

**Best Practices**:
- Utilize imports to efficiently convey relevant information.
- Ensure template clarity, security, and proper rendering under all expected conditions.
- Conduct comprehensive testing to ensure templates function correctly and display data as intended.

### Best Practices for Dashboard Configuration
- Focus on relevant, stage-specific information for display.
- Maintain clear and accessible column titles and data formatting.
- Ensure user-friendly navigation and data interaction on the dashboard.

## Conclusion

Effectively configuring workflows, customizing dashboard displays, and using dynamic templates enhances ReDBox's utility in managing the research data lifecycle. Tailor these settings to align with your institution's workflows and user needs, facilitating a seamless experience. Regularly review and update configurations to ensure they continue to meet evolving data management requirements.
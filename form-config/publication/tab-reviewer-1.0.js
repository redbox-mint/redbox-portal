module.exports = [
  {
    class: "Container",
    roles: ['Admin', 'Librarians'],
    definition: {
      id: "reviewer",
      label: "@dataPublication-reviewer-tab",
      fields: [
        {
          class: 'Container',
          compClass: 'TextBlockComponent',
          definition: {
            value: "@dataPublication-reviewer-tab-heading",
            type: 'h3'
          }
        },
        {
          class: 'AsynchField',
          definition: {
            name: 'asynchprogress',
            label:"@asynch-label",
            nameLabel: "@asynch-name",
            statusLabel: "@asynch-status",
            dateStartedLabel: "@asynch-dateStarted",
            dateCompletedLabel: "@asynch-dateCompleted",
            startedByLabel: "@asynch-startedBy",
            messageLabel: "@asynch-message",
            completionLabel: "@asynch-completion",
            lastUpdateLabel: "@asynch-lastUpdate",
            listenType: "taskType",
            taskType: "publication",
            relatedRecordId: "@oid",
            criteria: {
              where: {
                relatedRecordId: "@oid",
                taskType: "publication"
              }
            },
            dateFormat: 'L LT'
          },
          variableSubstitutionFields: ['relatedRecordId']
        },
        {
          class: "SaveButton",
          roles: ["Admin"],
          definition: {
            name: "confirmDelete",
            label: '@dataPublication-delete',
            closeOnSave: true,
            redirectLocation: '/@branding/@portal/dashboard/dataPublication',
            cssClasses: 'btn-danger',
            confirmationMessage: '@dataPublication-confirmDelete',
            confirmationTitle: '@dataPublication-confirmDeleteTitle',
            cancelButtonMessage: '@dataPublication-cancelButtonMessage',
            confirmButtonMessage: '@dataPublication-confirmButtonMessage',
            isDelete: true
          },
          variableSubstitutionFields: ['redirectLocation']
        }
      ]
    }
  }
];

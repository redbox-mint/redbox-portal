module.exports = [
  {
    class: "ButtonBarContainer",
    compClass: "ButtonBarContainerComponent",
    definition: {
      fields: [{
          class: "TabNavButton",
          definition: {
            id: 'mainTabNav',
            prevLabel: "@tab-nav-previous",
            nextLabel: "@tab-nav-next",
            targetTabContainerId: "mainTab",
            cssClasses: 'btn btn-primary'
          }
        },
        {
          class: "Spacer",
          definition: {
            width: '50px',
            height: 'inherit'
          }
        },
        {
          class: "SaveButton",
          definition: {
            label: '@save-button',
            cssClasses: 'btn-success',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>'
          }
        },
        {
          class: "SaveButton",
          definition: {
            label: '@save-and-close-button',
            closeOnSave: true,
            redirectLocation: '/@branding/@portal/dashboard/dataPublication',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>'
          },
          variableSubstitutionFields: ['redirectLocation']
        },
        {
          class: "SaveButton",
          definition: {
            label: '@dataPublication-publish',
            closeOnSave: true,
            isSubmissionButton: true,
            redirectLocation: '/@branding/@portal/dashboard/dataPublication',
            targetStep: 'queued',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>'
          },
          variableSubstitutionFields: ['redirectLocation']
        },
        {
          class: "CancelButton",
          definition: {
            label: '@close-button',
          }
        }
      ]
    }
  },
  {
    class: "Container",
    definition: {
      id: "form-render-complete",
      label: "Test",
      fields: [{
        class: 'Container',
        compClass: 'TextBlockComponent',
        definition: {
          value: 'will be empty',
          type: 'span'
        }
      }]
    }
  }
];

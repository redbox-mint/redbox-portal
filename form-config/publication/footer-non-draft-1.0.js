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
            cssClasses: 'btn-success'
          }
        },
        {
          class: "SaveButton",
          definition: {
            label: '@save-and-close-button',
            closeOnSave: true,
            redirectLocation: '/@branding/@portal/dashboard/dataPublication'
          },
          variableSubstitutionFields: ['redirectLocation']
        },
        {
          class: "SaveButton",
          definition: {
            label: '@dataPublication-withdraw',
            closeOnSave: true,
            isSubmissionButton: true,
            redirectLocation: '/@branding/@portal/dashboard/dataPublication',
            targetStep: 'draft',
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
            targetStep: 'published',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) || ( fieldMap.embargoByDate.control.value == true && fieldMap.embargoUntil.control.value && moment(fieldMap.embargoUntil.control.value).isSameOrAfter(moment())  ) %>'
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

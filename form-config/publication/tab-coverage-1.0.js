module.exports = [
  // -------------------------------------------------------------------
  // Coverage Tab
  // -------------------------------------------------------------------
  {
    class: "Container",
    definition: {
      id: "coverage",
      label: "@dataPublication-coverage-tab",
      fields: [{
          class: 'Container',
          compClass: 'TextBlockComponent',
          definition: {
            value: '@dataPublication-coverage-heading',
            type: 'h3'
          }
        },
        {
          class: 'Container',
          compClass: 'TextBlockComponent',
          definition: {
            value: '@dataPublication-temporalcoverage-heading',
            type: 'h4'
          }
        },
        {
          class: 'DateTime',
          definition: {
            name: "startDate",
            label: "@dataPublication-startDate",
            help: '@dataPublication-startDate-help',
            datePickerOpts: {
              format: 'dd/mm/yyyy',
              icon: 'fa fa-calendar',
              autoclose: true
            },
            timePickerOpts: false,
            hasClearButton: false,
            valueFormat: 'YYYY-MM-DD',
            displayFormat: 'L',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            publish: {
              onValueUpdate: {
                modelEventSource: 'valueChanges'
              }
            },
            requiredIfHasValue: ['startDate', 'endDate'],
            subscribe: {
              'form': {
                onValueChange: [
                  { action: 'setRequiredIfDependenciesHaveValue' }
                ]
              }
            }
          }
        },
        {
          class: 'DateTime',
          definition: {
            name: "endDate",
            label: "@dataPublication-endDate",
            help: '@dataPublication-endDate-help',
            datePickerOpts: {
              format: 'dd/mm/yyyy',
              icon: 'fa fa-calendar',
              autoclose: true
            },
            timePickerOpts: false,
            hasClearButton: false,
            valueFormat: 'YYYY-MM-DD',
            displayFormat: 'L',
            adjustStartRange: true,
            requiredIfHasValue: ['startDate', 'endDate'],
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>',
            subscribe: {
              'startDate': {
                onValueUpdate: [
                  {}
                ]
              },
              'form': {
                onValueChange: [
                  { action: 'setRequiredIfDependenciesHaveValue' }
                ]
              }
            }
          }
        },
        {
          class: 'TextField',
          definition: {
            name: 'timePeriod',
            label: '@dataPublication-timePeriod',
            help: '@dataPublication-timePeriod-help',
            type: 'text',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>'
          }
        },
        {
          class: 'MapField',
          compClass: 'MapComponent',
          definition: {
            name: 'geospatial',
            label: '@dataPublication-geospatial',
            help: '@dataPublication-geospatial-help',
            tabId: 'coverage',
            mainTabId: 'mainTab',
            disabledExpression: '<%= _.isEmpty(relatedRecordId) %>'
          }
        }
      ]
    }
  }
];

/**
 * The "Existing Locations" form definition
 */
module.exports = {
    name: "existing-locations-1.0-draft",
    type: "existing-locations",
    skipValidationOnSave: false, // perform client-side validation
    editCssClasses: 'row col-md-12',
    viewCssClasses: 'row col-md-offset-1 col-md-10',
    messages: {
        "saving": ["@dmpt-form-saving"],
        "validationFail": ["@dmpt-form-validation-fail-prefix", "@dmpt-form-validation-fail-suffix"],
        "saveSuccess": ["@dmpt-form-save-success"],
        "saveError": ["@dmpt-form-save-error"]
    },
    fields: [
        {
            class: 'Container',
            compClass: 'TextBlockComponent',
            definition: {
                value: '@workspace-header',
                type: 'h3'
            }
        },
        {
            class: 'TextField',
            definition: {
                name: 'title',
                label: '@workspace-name',
                type: 'text',
                required: true
            }
        },
        {
            class: 'SelectionField',
            compClass: 'DropdownFieldComponent',
            definition: {
                name: 'storage_type',
                label: '@workspace-type',
                required: true,
                options: [
                    {
                        label: "@workspace-type-shared",
                        value: "@workspace-type-shared"
                    },
                    {
                        label: "@workspace-type-cloud",
                        value: "@workspace-type-cloud"
                    },
                    {
                        label: "@workspace-type-survey",
                        value: "@workspace-type-survey"
                    },
                    {
                        label: "@workspace-type-repo",
                        value: "@workspace-type-repo"
                    },
                    {
                        label: "@workspace-type-notebook",
                        value: "@workspace-type-notebook"
                    },
                    {
                        label: "@workspace-type-other",
                        value: "@workspace-type-other"
                    }
                ]
            }
        },
        {
            class: 'TextArea',
            compClass: 'TextAreaComponent',
            definition: {
                name: 'workspace-type-other_details',
                label: '@dmpt-vivo:Dataset_dc:location_skos:note',
                rows: 5,
                columns: 10
            }
        },
        {
            class: 'TextArea',
            compClass: 'TextAreaComponent',
            definition: {
                name: 'description',
                label: '@workspace-description',
                type: 'text',
                rows: 5,
                columns: 10
            }
        },
        {
            class: 'RepeatableContainer',
            compClass: 'RepeatableTextfieldComponent',
            definition: {
                label: "@workspace-location-url",
                name: "storage_locations",
                fields: [{
                    class: 'TextField',
                    definition: {
                        type: 'text',
                    }
                }]
            }
        },
        {
            class: "ButtonBarContainer",
            compClass: "ButtonBarContainerComponent",
            definition: {
                fields: [
                    {
                        class: 'SaveButton',
                        compClass: 'SaveButtonComponent',
                        definition: {
                            label: "Save & Close",
                            closeOnSave: true,
                            redirectLocation: '/@branding/@portal/record/edit/@referrer_rdmp?focusTabId=workspaces'
                        },
                        variableSubstitutionFields: ['redirectLocation']
                    },
                    {
                        class: "AnchorOrButton",
                        definition: {
                          label: 'Cancel',
                          value: '/@branding/@portal/record/edit/@referrer_rdmp?focusTabId=workspaces',
                          cssClasses: 'btn btn-warning',
                          controlType: 'anchor'
                        },
                        variableSubstitutionFields: ['value']
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
        },
        {
          class: "ParameterRetriever",
          compClass: 'ParameterRetrieverComponent',
          editOnly: true,
          definition: {
            name: 'parameterRetriever',
            parameterName:'rdmp'
          }
        },
        {
          class: 'RecordMetadataRetriever',
          compClass: 'RecordMetadataRetrieverComponent',
          editOnly: true,
          definition: {
            name: 'rdmpGetter',
            subscribe: {
              'parameterRetriever': {
                onValueUpdate: [{
                  action: 'publishMetadata'
                }]
              }
            }
          }
        },
        {
          class: 'HiddenValue',
          editOnly: true,
          definition: {
            name: 'rdmpOid',
            subscribe: {
              'rdmpGetter': {
                onValueUpdate: [
                  {
                    action: 'utilityService.getPropertyFromObject',
                    field: 'oid'
                  }
                ]
              }
            }
          }
        },
        {
          class: 'HiddenValue',
          editOnly: true,
          definition: {
            name: 'rdmpTitle',
            subscribe: {
              'rdmpGetter': {
                onValueUpdate: [
                  {
                    action: 'utilityService.getPropertyFromObject',
                    field: 'title'
                  }
                ]
              }
            }
          }
        }
    ]
};

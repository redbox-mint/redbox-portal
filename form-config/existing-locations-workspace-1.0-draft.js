/**
 * The "Existing Locations" form definition
 */
module.exports = {
    name: "existing-locations-1.0-draft",
    type: "workspace",
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
                name: 'workspace-name',
                label: '@workspace-name',
                type: 'text'
            }
        },
        {
            class: 'SelectionField',
            compClass: 'DropdownFieldComponent',
            definition: {
                name: 'workspacesLocationType',
                label: '@workspace-type',
                options: [{
                    value: "",
                    label: "@dmpt-select:Empty"
                },
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
                name: 'workspace-description',
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
                name: "workspaceLocationUrls",
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
                        class: "Spacer",
                        definition: {
                            width: '50px',
                            height: 'inherit'
                        }
                    },
                    {
                        class: 'SaveButton',
                        compClass: 'SaveButtonComponent',
                        definition: {
                            label: "Save & Close",
                            targetStep: 'provisioning',
                            closeOnSave: true,
                            redirectLocation: '/@branding/@portal/record/edit/@rdmpOid?focusTabId=workspaces'
                        },
                        variableSubstitutionFields: ['redirectLocation']
                    },
                    {
                        class: "CancelButton",
                        definition: {
                            label: 'Cancel',
                            targetStep: 'provisioning',
                            redirectLocation: '/@branding/@portal/record/edit/@rdmpOid?focusTabId=workspaces'
                        },
                        variableSubstitutionFields: ['redirectLocation']
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
    ]
};

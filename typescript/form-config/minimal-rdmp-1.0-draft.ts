import {FormConfigFrame} from "@researchdatabox/sails-ng-common";

const formConfig: FormConfigFrame = {
    name: "minimal-rdmp-1.0-draft",
    type: "rdmp",
    debugValue: false,
    domElementType: 'form',
    defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
    },
    editCssClasses: "redbox-form form",
    validationGroups: {
        all: {
            description: "Validate all fields with validators.",
            initialMembership: "all"
        },
        none: {
            description: "Validate none of the fields.",
            initialMembership: "none",
        },
        minimumCreate: {
            description: "Fields that must be valid to create a new record.",
            initialMembership: "none",
        },
        transitionDraftToSubmitted: {
            description: "Fields that must be valid to transition from draft to submitted.",
            initialMembership: "all",
        },
    },
    validators: [],
    componentDefinitions: [
        {
            name: 'main_tab',
            layout: {
                class: 'TabLayout',
                config: {
                    hostCssClasses: 'd-flex align-items-start',
                    buttonSectionCssClass: 'nav flex-column nav-pills me-5',
                    tabPaneCssClass: 'tab-pane fade',
                    tabPaneActiveCssClass: 'active show',
                }
            },
            component: {
                class: 'TabComponent',
                config: {
                    hostCssClasses: 'tab-content',
                    tabs: [
                        // 1. Project Details
                        {
                            name: 'tab_project_details',
                            layout: {
                                class: 'TabContentLayout',
                                config: { buttonLabel: '1. Project Details' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    selected: true,
                                    componentDefinitions: [
                                        {
                                            name: 'title',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Project/Activity Title' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: {
                                                    defaultValue: '',
                                                    validators: [{ class: 'required' }]
                                                }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        },
                                        {
                                            name: 'short_name',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Short Project Name / Acronym' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        },
                                        {
                                            name: 'org_unit',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Organisational Unit / School / Centre' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        },
                                        {
                                            name: 'project_id',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Project Identifier (if applicable)' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        }
                                    ]
                                }
                            }
                        },
                        // 2. People & Roles
                        {
                            name: 'tab_people',
                            layout: {
                                class: 'TabContentLayout',
                                config: { buttonLabel: '2. People & Roles' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: 'ci',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Chief Investigator / Supervisor' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        },
                                        {
                                            name: 'students',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Student(s)' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        },
                                        {
                                            name: 'contributors',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Other Contributors (view only)' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        },
                                        {
                                            name: 'data_manager',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Data Manager (operational role)' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        }
                                    ]
                                }
                            }
                        },
                        // 3. Data Description
                        {
                            name: 'tab_data_description',
                            layout: {
                                class: 'TabContentLayout',
                                config: { buttonLabel: '3. Data Description' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: 'description',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Description of the data to be collected/created' }
                                            },
                                            model: {
                                                class: 'TextAreaModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: {
                                                class: 'TextAreaComponent',
                                                config: { rows: 5, cols: 80 }
                                            }
                                        },
                                        {
                                            name: 'data_type',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Type of data' }
                                            },
                                            model: {
                                                class: 'RadioInputModel',
                                                config: { defaultValue: 'Digital' }
                                            },
                                            component: {
                                                class: 'RadioInputComponent',
                                                config: {
                                                    options: [
                                                        { label: 'Digital', value: 'Digital' },
                                                        { label: 'Physical', value: 'Physical' },
                                                        { label: 'Both', value: 'Both' }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            name: 'file_formats',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'File formats (main types expected)' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        }
                                    ]
                                }
                            }
                        },
                        // 4. Storage
                        {
                            name: 'tab_storage',
                            layout: {
                                class: 'TabContentLayout',
                                config: { buttonLabel: '4. Storage' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: 'storage_location',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Where will the master copy of data be stored?' }
                                            },
                                            model: {
                                                class: 'DropdownInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: {
                                                class: 'DropdownInputComponent',
                                                config: {
                                                    options: [
                                                        { label: 'Institutional Service', value: 'institutional' },
                                                        { label: 'Personal Device', value: 'personal' },
                                                        { label: 'Cloud', value: 'cloud' },
                                                        { label: 'Other', value: 'other' }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            name: 'backup',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Backup arrangements (automatic/manual, frequency)' }
                                            },
                                            model: {
                                                class: 'TextAreaModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: {
                                                class: 'TextAreaComponent',
                                                config: { rows: 3, cols: 80 }
                                            }
                                        },
                                        {
                                            name: 'physical_storage',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'If physical data, where and how will it be stored?' }
                                            },
                                            model: {
                                                class: 'TextAreaModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: {
                                                class: 'TextAreaComponent',
                                                config: { rows: 3, cols: 80 }
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        // 5. Retention & Disposal
                        {
                            name: 'tab_retention',
                            layout: {
                                class: 'TabContentLayout',
                                config: { buttonLabel: '5. Retention & Disposal' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: 'retention_period',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Minimum retention period (years)' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: {
                                                class: 'SimpleInputComponent',
                                                config: { type: 'number' }
                                            }
                                        },
                                        {
                                            name: 'disposal_plan',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'What happens after the retention period? (archive, destroy, etc.)' }
                                            },
                                            model: {
                                                class: 'TextAreaModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: {
                                                class: 'TextAreaComponent',
                                                config: { rows: 3, cols: 80 }
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        // 6. Access & Rights
                        {
                            name: 'tab_access',
                            layout: {
                                class: 'TabContentLayout',
                                config: { buttonLabel: '6. Access & Rights' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: 'access_during',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Who will have access during the project?' }
                                            },
                                            model: {
                                                class: 'TextAreaModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: {
                                                class: 'TextAreaComponent',
                                                config: { rows: 3, cols: 80 }
                                            }
                                        },
                                        {
                                            name: 'access_after',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Who will have access after the project?' }
                                            },
                                            model: {
                                                class: 'TextAreaModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: {
                                                class: 'TextAreaComponent',
                                                config: { rows: 3, cols: 80 }
                                            }
                                        },
                                        {
                                            name: 'data_owner',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Who owns the data?' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        }
                                    ]
                                }
                            }
                        },
                        // 7. Ethics
                        {
                            name: 'tab_ethics',
                            layout: {
                                class: 'TabContentLayout',
                                config: { buttonLabel: '7. Ethics' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: 'ethics_approval',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Does the project have ethics approval?' }
                                            },
                                            model: {
                                                class: 'RadioInputModel',
                                                config: { defaultValue: 'No' }
                                            },
                                            component: {
                                                class: 'RadioInputComponent',
                                                config: {
                                                    options: [
                                                        { label: 'Yes', value: 'Yes' },
                                                        { label: 'No', value: 'No' }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            name: 'ethics_number',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Approval number (if available)' }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: { class: 'SimpleInputComponent' }
                                        },
                                        {
                                            name: 'sensitivities',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Are there any sensitivities (personal, cultural, commercial)?' }
                                            },
                                            model: {
                                                class: 'TextAreaModel',
                                                config: { defaultValue: '' }
                                            },
                                            component: {
                                                class: 'TextAreaComponent',
                                                config: { rows: 3, cols: 80 }
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }
            }
        },
        {
            name: 'save_button',
            component: {
                class: 'SaveButtonComponent',
                config: {
                    label: 'Save',
                    labelSaving: 'Saving...',
                }
            }
        },
        {
            name: 'validation_summary',
            component: { class: "ValidationSummaryComponent" }
        }
    ]
};

module.exports = formConfig;

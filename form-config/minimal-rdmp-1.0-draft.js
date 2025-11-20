"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const formConfig = {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWluaW1hbC1yZG1wLTEuMC1kcmFmdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3R5cGVzY3JpcHQvZm9ybS1jb25maWcvbWluaW1hbC1yZG1wLTEuMC1kcmFmdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLE1BQU0sVUFBVSxHQUFvQjtJQUNoQyxJQUFJLEVBQUUsd0JBQXdCO0lBQzlCLElBQUksRUFBRSxNQUFNO0lBQ1osVUFBVSxFQUFFLEtBQUs7SUFDakIsY0FBYyxFQUFFLE1BQU07SUFDdEIsc0JBQXNCLEVBQUU7UUFDcEIsMEJBQTBCLEVBQUUsS0FBSztLQUNwQztJQUNELGNBQWMsRUFBRSxrQkFBa0I7SUFDbEMsZ0JBQWdCLEVBQUU7UUFDZCxHQUFHLEVBQUU7WUFDRCxXQUFXLEVBQUUsc0NBQXNDO1lBQ25ELGlCQUFpQixFQUFFLEtBQUs7U0FDM0I7UUFDRCxJQUFJLEVBQUU7WUFDRixXQUFXLEVBQUUsOEJBQThCO1lBQzNDLGlCQUFpQixFQUFFLE1BQU07U0FDNUI7UUFDRCxhQUFhLEVBQUU7WUFDWCxXQUFXLEVBQUUsbURBQW1EO1lBQ2hFLGlCQUFpQixFQUFFLE1BQU07U0FDNUI7UUFDRCwwQkFBMEIsRUFBRTtZQUN4QixXQUFXLEVBQUUsa0VBQWtFO1lBQy9FLGlCQUFpQixFQUFFLEtBQUs7U0FDM0I7S0FDSjtJQUNELFVBQVUsRUFBRSxFQUFFO0lBQ2Qsb0JBQW9CLEVBQUU7UUFDbEI7WUFDSSxJQUFJLEVBQUUsVUFBVTtZQUNoQixNQUFNLEVBQUU7Z0JBQ0osS0FBSyxFQUFFLFdBQVc7Z0JBQ2xCLE1BQU0sRUFBRTtvQkFDSixjQUFjLEVBQUUsMEJBQTBCO29CQUMxQyxxQkFBcUIsRUFBRSxnQ0FBZ0M7b0JBQ3ZELGVBQWUsRUFBRSxlQUFlO29CQUNoQyxxQkFBcUIsRUFBRSxhQUFhO2lCQUN2QzthQUNKO1lBQ0QsU0FBUyxFQUFFO2dCQUNQLEtBQUssRUFBRSxjQUFjO2dCQUNyQixNQUFNLEVBQUU7b0JB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
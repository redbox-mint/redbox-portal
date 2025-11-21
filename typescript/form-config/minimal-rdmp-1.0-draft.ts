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
                        {
                            name: 'tab_welcome',
                            layout: {
                                class: 'TabContentLayout',
                                config: { buttonLabel: 'Welcome' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    selected: true,
                                    componentDefinitions: [
                                        {
                                            name: 'welcome_text',
                                            component: {
                                                class: 'ContentComponent',
                                                config: {
                                                    content: `<h3>Data management plan</h3>
<p>Thank you for registering a research data management plan. If you've submitted a research project proposal in Research Master, we should have pre-filled parts of this form for you, where possible. However, research evolves, so it is a good idea to make sure that the pre-fills are correct.</p>

<p>Providing this information will help put you in touch with services that can help you store or analyse your research data and allow you to collaborate online with colleagues. Your data management plan, if kept up to date, will satisfy the requirements of ReDBox policy and most research funder requirements. If your funder has specific requirements beyond the scope of this plan, please contact the eResearch Data Librarian on <a href="mailto:support@redboxresearchdata.com.au">support@redboxresearchdata.com.au</a> for help.</p>

<p>Your plan will also lay the foundation for a catalogue of your research data, ensuring that you (and ReDBox) can meet the data governance responsibilities as required by the Code for the Responsible Conduct of Research, by being able to locate and access the data as required.</p>

<p>If you require any assistance completing your plan, please contact us via <a href="mailto:support@redboxresearchdata.com.au">support@redboxresearchdata.com.au</a>.</p>`
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        // 1. Project Details
                        {
                            name: 'tab_project_details',
                            layout: {
                                class: 'TabContentLayout',
                                config: { buttonLabel: 'Project Details' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
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
                                config: { buttonLabel: 'People & Roles' }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: "",
                                            layout: {class: "DefaultLayout", config: {label: "Chief Investigator"}},
                                            model: {class: "GroupModel", config: {defaultValue: {}}},
                                            component: {
                                                class: "GroupComponent",
                                                config: {
                                                    hostCssClasses: "row g-3",
                                                    componentDefinitions: [
                                                        {
                                                            overrides: {reusableFormName: "standard-contributor-field"},
                                                            name: "dm_wrapper",
                                                            component: {
                                                                class: "ReusableComponent",
                                                                config: {
                                                                    componentDefinitions: [
                                                                        {
                                                                            name: "name",
                                                                            overrides: {replaceName: "ci_name"},
                                                                            layout: {class: "DefaultLayout", config: {label: "Name", hostCssClasses: "col-md-4 mb-3"}},
                                                                            model: {class: "SimpleInputModel", config: {defaultValue: ""}},
                                                                            component: {class: "SimpleInputComponent", config: {hostCssClasses: ""}}
                                                                        },
                                                                        {
                                                                            name: "email",
                                                                            overrides: {replaceName: "ci_email"},
                                                                            layout: {class: "DefaultLayout", config: {label: "Email", hostCssClasses: "col-md-4 mb-3"}},
                                                                            model: {class: "SimpleInputModel", config: {defaultValue: ""}},
                                                                            component: {class: "SimpleInputComponent", config: {hostCssClasses: ""}}
                                                                        },
                                                                        {
                                                                            name: "orcid",
                                                                            overrides: {replaceName: "ci_orcid"},
                                                                            layout: {class: "DefaultLayout", config: {label: "ORCID", hostCssClasses: "col-md-4 mb-3"}},
                                                                            model: {class: "GroupModel", config: {defaultValue: {}}},
                                                                            component: {
                                                                                class: "GroupComponent",
                                                                                config: {
                                                                                    componentDefinitions: [
                                                                                        {
                                                                                            name: "example1",
                                                                                            overrides: {replaceName: "id"},
                                                                                            model: {class: "SimpleInputModel", config: {defaultValue: ""}},
                                                                                            component: {class: "SimpleInputComponent", config: {hostCssClasses: ""}}
                                                                                        }
                                                                                    ]
                                                                                }
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
                                            name: "",
                                            layout: {class: "DefaultLayout", config: {label: "Data Manager"}},
                                            model: {class: "GroupModel", config: {defaultValue: {}}},
                                            component: {
                                                class: "GroupComponent",
                                                config: {
                                                    hostCssClasses: "row g-3",
                                                    componentDefinitions: [
                                                        {
                                                            overrides: {reusableFormName: "standard-contributor-field"},
                                                            name: "data_manager_wrapper",
                                                            component: {
                                                                class: "ReusableComponent",
                                                                config: {
                                                                    componentDefinitions: [
                                                                        {
                                                                            name: "name",
                                                                            overrides: {replaceName: "data_manager_name"},
                                                                            layout: {class: "DefaultLayout", config: {label: "Name", hostCssClasses: "col-md-4 mb-3"}},
                                                                            model: {class: "SimpleInputModel", config: {defaultValue: ""}},
                                                                            component: {class: "SimpleInputComponent", config: {hostCssClasses: ""}}
                                                                        },
                                                                        {
                                                                            name: "email",
                                                                            overrides: {replaceName: "data_manager_email"},
                                                                            layout: {class: "DefaultLayout", config: {label: "Email", hostCssClasses: "col-md-4 mb-3"}},
                                                                            model: {class: "SimpleInputModel", config: {defaultValue: ""}},
                                                                            component: {class: "SimpleInputComponent", config: {hostCssClasses: ""}}
                                                                        },
                                                                        {
                                                                            name: "orcid",
                                                                            overrides: {replaceName: "data_manager_orcid"},
                                                                            layout: {class: "DefaultLayout", config: {label: "ORCID", hostCssClasses: "col-md-4 mb-3"}},
                                                                            model: {class: "GroupModel", config: {defaultValue: {}}},
                                                                            component: {
                                                                                class: "GroupComponent",
                                                                                config: {
                                                                                    componentDefinitions: [
                                                                                        {
                                                                                            name: "example1",
                                                                                            overrides: {replaceName: "id"},
                                                                                            model: {class: "SimpleInputModel", config: {defaultValue: ""}},
                                                                                            component: {class: "SimpleInputComponent", config: {hostCssClasses: ""}}
                                                                                        }
                                                                                    ]
                                                                                }
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
                                            name: "contributors",
                                            layout: {class: "DefaultLayout", config: {label: "Contributors"}},
                                            model: {class: "RepeatableModel", config: {defaultValue: []}},
                                            component: {
                                                class: "RepeatableComponent",
                                                config: {
                                                    elementTemplate: {
                                                        name: "",
                                                        model: {class: "GroupModel", config: {defaultValue: {}}},
                                                        component: {
                                                            class: "GroupComponent",
                                                            config: {
                                                                hostCssClasses: "row g-3",
                                                                componentDefinitions: [
                                                                    {
                                                                        overrides: {reusableFormName: "standard-contributor-field"},
                                                                        name: "contributor_wrapper",
                                                                        component: {
                                                                            class: "ReusableComponent",
                                                                            config: {
                                                                                componentDefinitions: [
                                                                                    {
                                                                                        name: "name",
                                                                                        overrides: {replaceName: "contributor_name"},
                                                                                        layout: {class: "DefaultLayout", config: {label: "Name", hostCssClasses: "col-md-4 mb-3"}},
                                                                                        model: {class: "SimpleInputModel", config: {defaultValue: ""}},
                                                                                        component: {class: "SimpleInputComponent", config: {hostCssClasses: ""}}
                                                                                    },
                                                                                    {
                                                                                        name: "email",
                                                                                        overrides: {replaceName: "contributor_email"},
                                                                                        layout: {class: "DefaultLayout", config: {label: "Email", hostCssClasses: "col-md-4 mb-3"}},
                                                                                        model: {class: "SimpleInputModel", config: {defaultValue: ""}},
                                                                                        component: {class: "SimpleInputComponent", config: {hostCssClasses: ""}}
                                                                                    },
                                                                                    {
                                                                                        name: "orcid",
                                                                                        overrides: {replaceName: "contributor_orcid"},
                                                                                        layout: {class: "DefaultLayout", config: {label: "ORCID", hostCssClasses: "col-md-4 mb-3"}},
                                                                                        model: {class: "GroupModel", config: {defaultValue: {}}},
                                                                                        component: {
                                                                                            class: "GroupComponent",
                                                                                            config: {
                                                                                                componentDefinitions: [
                                                                                                    {
                                                                                                        name: "example1",
                                                                                                        overrides: {replaceName: "id"},
                                                                                                        model: {class: "SimpleInputModel", config: {defaultValue: ""}},
                                                                                                        component: {class: "SimpleInputComponent", config: {hostCssClasses: ""}}
                                                                                                    }
                                                                                                ]
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                ]
                                                                            }
                                                                        }
                                                                    }
                                                                ]
                                                            }
                                                        }
                                                    }
                                                } 
                                            }
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
                                config: { buttonLabel: 'Data Description' }
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
                                config: { buttonLabel: 'Storage' }
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
                                config: { buttonLabel: 'Retention & Disposal' }
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
                                        },
                                        {
                                            name: 'disposal_date',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: { label: 'Expected disposal date' }
                                            },
                                            model: {
                                                class: 'DateInputModel',
                                                config: { defaultValue: null }
                                            },
                                            component: {
                                                class: 'DateInputComponent'
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
                                config: { buttonLabel: 'Access & Rights' }
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
                                config: { buttonLabel: 'Ethics' }
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

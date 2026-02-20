import { FormConfigFrame } from "@researchdatabox/sails-ng-common";

/**
 * A general form config with examples of most of the component types and nested components.
 */
export const formConfigExample1: FormConfigFrame = {
    name: "default-1.0-draft",
    type: "rdmp",
    debugValue: true,
    domElementType: 'form',
    defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
    },
    editCssClasses: "redbox-form form",
    // Validators that operate on multiple fields.
    validators: [
        { class: 'different-values', config: { controlNames: ['text_1_event', 'text_2'] } },
    ],
    // Groups of validators that can be enabled and disabled together.
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
    componentDefinitions: [
        {
            name: 'main_tab',
            layout: {
                class: 'TabLayout',
                config: {
                    // layout-specific config goes here
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
                            name: 'tab_1',
                            layout: {
                                class: 'TabContentLayout',
                                config: {
                                    buttonLabel: 'Tab 1',
                                }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {
                                    selected: true,
                                    componentDefinitions: [
                                        {
                                            name: 'text_block',
                                            component: {
                                                class: 'ContentComponent',
                                                config: {
                                                    content: 'My first text block component!!!',
                                                    template: '<h3>{{content}}</h3>'
                                                }
                                            }
                                        },
                                        {
                                            name: 'textarea_1',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'Textarea some label',
                                                    helpText: 'Textarea some help text',
                                                }
                                            },
                                            model: {
                                                class: 'TextAreaModel',
                                                config: {
                                                    defaultValue: 'Textarea hello world!!!',
                                                }
                                            },
                                            component: {
                                                class: 'TextAreaComponent',
                                                config: {
                                                    rows: 7,
                                                    cols: 80,
                                                    tooltip: 'Textarea tooltip'
                                                }
                                            }
                                        },
                                        {
                                            name: 'dropdown_1',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'Dropdown some label',
                                                    helpText: 'Dropdown some help text',
                                                }
                                            },
                                            model: {
                                                class: 'DropdownInputModel',
                                                config: {
                                                    defaultValue: 'Dropdown hello world!!!',
                                                }
                                            },
                                            component: {
                                                class: 'DropdownInputComponent',
                                                config: {
                                                    options: [
                                                        { label: 'Option 1', value: 'option1' },
                                                        { label: 'Option 2', value: 'option2' },
                                                        { label: 'Option 3', value: 'option3' },
                                                    ],
                                                    tooltip: 'Dropdown tooltip'
                                                }
                                            }
                                        },
                                        {
                                            name: 'checkbox_1',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'Checkbox some label (single value)',
                                                    helpText: 'Checkbox some help text - single selection mode',
                                                }
                                            },
                                            model: {
                                                class: 'CheckboxInputModel',
                                                config: {
                                                    defaultValue: 'option1',
                                                }
                                            },
                                            component: {
                                                class: 'CheckboxInputComponent',
                                                config: {
                                                    options: [
                                                        { label: 'Option 1', value: 'option1' },
                                                        { label: 'Option 2', value: 'option2' },
                                                        { label: 'Option 3', value: 'option3' },
                                                    ],
                                                    tooltip: 'Checkbox tooltip',
                                                    multipleValues: false
                                                }
                                            }
                                        },
                                        {
                                            name: 'checkbox_multiple',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'Checkbox multiple values',
                                                    helpText: 'Checkbox with multiple selection enabled',
                                                }
                                            },
                                            model: {
                                                class: 'CheckboxInputModel',
                                                config: {
                                                    defaultValue: ['option1', 'option3'],
                                                }
                                            },
                                            component: {
                                                class: 'CheckboxInputComponent',
                                                config: {
                                                    options: [
                                                        { label: 'Multi Option 1', value: 'option1' },
                                                        { label: 'Multi Option 2', value: 'option2' },
                                                        { label: 'Multi Option 3', value: 'option3' },
                                                        { label: 'Multi Option 4', value: 'option4' },
                                                    ],
                                                    tooltip: 'Multiple selection checkbox tooltip',
                                                    multipleValues: true
                                                }
                                            }
                                        },
                                        {
                                            name: 'radio_1',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'Radio some label (single value)',
                                                    helpText: 'Radio some help text - single selection mode',
                                                }
                                            },
                                            model: {
                                                class: 'RadioInputModel',
                                                config: {
                                                    defaultValue: 'option1',
                                                }
                                            },
                                            component: {
                                                class: 'RadioInputComponent',
                                                config: {
                                                    options: [
                                                        { label: 'Option 1', value: 'option1' },
                                                        { label: 'Option 2', value: 'option2' },
                                                        { label: 'Option 3', value: 'option3' },
                                                    ],
                                                    tooltip: 'Checkbox tooltip'
                                                }
                                            }
                                        },
                                        {
                                            name: 'date_1',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'Date some label',
                                                    helpText: 'Date some help text',
                                                }
                                            },
                                            model: {
                                                class: 'DateInputModel',
                                                config: {}
                                            },
                                            component: {
                                                class: 'DateInputComponent'
                                            }
                                        },
                                        {
                                            name: 'date_2',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'Date some label',
                                                    helpText: 'Date some help text',
                                                }
                                            },
                                            model: {
                                                class: 'DateInputModel',
                                                config: {}
                                            },
                                            component: {
                                                class: 'DateInputComponent',
                                                config: {
                                                    enableTimePicker: true
                                                }
                                            }
                                        },
                                        {
                                            name: 'text_1_event',
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: {
                                                    defaultValue: 'hello world!',
                                                    validators: [
                                                        { class: 'required' },
                                                    ]
                                                }
                                            },
                                            component: {
                                                class: 'SimpleInputComponent'
                                            }
                                        },
                                        {
                                            name: 'text_2',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'TextField with default wrapper defined',
                                                    helpText: 'This is a help text',
                                                }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: {
                                                    defaultValue: 'hello world 2!',
                                                    validators: [
                                                        // {class: 'pattern', config: {pattern: /prefix.*/, description: "must start with prefix"}},
                                                        // {class: 'minLength', message: "@validator-error-custom-text_2", config: {minLength: 3}},
                                                    ]
                                                }
                                            },
                                            component: {
                                                class: 'SimpleInputComponent'
                                            }
                                        },
                                        {
                                            name: 'text_7',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'TextField with default wrapper defined',
                                                    helpText: 'This is a help text',
                                                }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: {
                                                    defaultValue: 'hello world 2!',
                                                    validators: [
                                                        {
                                                            class: 'pattern',
                                                            config: {
                                                                pattern: /prefix.*/,
                                                                description: "must start with prefix"
                                                            }
                                                        },
                                                        {
                                                            class: 'minLength',
                                                            message: "@validator-error-custom-text_7",
                                                            config: { minLength: 3 }
                                                        },
                                                    ]
                                                }
                                            },
                                            component: {
                                                class: 'SimpleInputComponent'
                                            },
                                          expressions: [
                                            {
                                              name: 'text_7_text_1_event_expr',
                                              config: {
                                                template: `value & "__suffix"`,
                                                conditionKind: 'jsonpointer',
                                                condition: `/main_tab/tab_1/text_1_event::field.value.changed`,
                                                target: `model.value`,
                                              },
                                            },
                                          ],
                                        },
                                        {
                                            name: 'text_2_event',
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: {
                                                    defaultValue: 'hello world! component event',
                                                    validators: [
                                                        { class: 'required' },
                                                    ]
                                                }
                                            },
                                            component: {
                                                class: 'SimpleInputComponent',
                                                config: {
                                                    tooltip: 'text_2_event tooltip',
                                                    type: 'text'
                                                }
                                            }
                                        },
                                        {
                                            name: 'text_2_component_event',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'TextField with default wrapper defined',
                                                    helpText: 'This is a help text',
                                                    tooltip: 'text_2_component_event layout tooltip'
                                                }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: {
                                                    defaultValue: 'hello world 2! component expression'
                                                }
                                            },
                                            component: {
                                                class: 'SimpleInputComponent',
                                                config: {
                                                    tooltip: 'text_2_component_event component tooltip 22222',
                                                    type: 'text'
                                                }
                                            },
                                          expressions: [
                                            {
                                              name: 'text_2_component_event_text_2_event_expr',
                                              config: {
                                                template: `value = "hide text_2_component_event"`,
                                                conditionKind: 'jsonpointer',
                                                condition: `/main_tab/tab_1/text_2_event::field.value.changed`,
                                                target: `component.visible`,
                                              },
                                            },
                                          ]
                                        },
                                        {
                                            name: 'text_3_event',
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: {
                                                    defaultValue: 'hello world! layout event',
                                                    validators: [
                                                        { class: 'required' },
                                                    ]
                                                }
                                            },
                                            component: {
                                                class: 'SimpleInputComponent'
                                            }
                                        },
                                        {
                                            name: 'text_3_layout_event',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'TextField with default wrapper defined',
                                                    helpText: 'This is a help text',
                                                }
                                            },
                                            model: {
                                                class: 'SimpleInputModel',
                                                config: {
                                                    defaultValue: 'hello world 2! layout expression'
                                                }
                                            },
                                            component: {
                                                class: 'SimpleInputComponent'
                                            },
                                          expressions: [
                                            {
                                              name: 'text_3_layout_event_text_3_event_expr',
                                              config: {
                                                template: `value = "hide text_3_layout_event"`,
                                                conditionKind: 'jsonpointer',
                                                condition: `/main_tab/tab_1/text_3_event::field.value.changed`,
                                                target: `layout.visible`,
                                              },
                                            },
                                          ]
                                        },
                                    ]
                                }
                            }
                        },
                        {
                            name: 'tab_2',
                            layout: {
                                class: 'TabContentLayout',
                                config: {
                                    buttonLabel: 'Tab 2',
                                }
                            },
                            component: {
                                class: 'TabContentComponent',
                                config: {

                                    componentDefinitions: [
                                        {
                                            // first group component
                                            name: 'group_1_component',
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'Group label',
                                                    helpText: 'Group help',
                                                }
                                            },
                                            model: {
                                                class: 'GroupModel',
                                                config: {
                                                    defaultValue: {},
                                                }
                                            },
                                            component: {
                                                class: 'GroupComponent',
                                                config: {
                                                    componentDefinitions: [
                                                        {
                                                            name: 'text_3',
                                                            layout: {
                                                                class: 'DefaultLayout',
                                                                config: {
                                                                    label: 'TextField with default wrapper defined',
                                                                    helpText: 'This is a help text',
                                                                }
                                                            },
                                                            model: {
                                                                class: 'SimpleInputModel',
                                                                config: {
                                                                    defaultValue: 'hello world 3!',
                                                                }
                                                            },
                                                            component: {
                                                                class: 'SimpleInputComponent'
                                                            }
                                                        },
                                                        {
                                                            name: 'text_4',
                                                            model: {
                                                                class: 'SimpleInputModel',
                                                                config: {
                                                                    defaultValue: 'hello world 4!'
                                                                }
                                                            },
                                                            component: {
                                                                class: 'SimpleInputComponent'
                                                            }
                                                        },
                                                        {
                                                            // second group component, nested in first group component
                                                            name: 'group_2_component',
                                                            layout: {
                                                                class: 'DefaultLayout',
                                                                config: {
                                                                    label: 'Group2 label',
                                                                    helpText: 'Group 2 help',
                                                                }
                                                            },
                                                            model: {
                                                                class: 'GroupModel',
                                                                config: {
                                                                    defaultValue: {},
                                                                }
                                                            },
                                                            component: {
                                                                class: 'GroupComponent',
                                                                config: {
                                                                    componentDefinitions: [
                                                                        {
                                                                            name: 'text_5',
                                                                            layout: {
                                                                                class: 'DefaultLayout',
                                                                                config: {
                                                                                    label: 'TextField with default wrapper defined',
                                                                                    helpText: 'This is a help text',
                                                                                }
                                                                            },
                                                                            model: {
                                                                                class: 'SimpleInputModel',
                                                                                config: {
                                                                                    defaultValue: 'hello world 5!',
                                                                                    validators: [
                                                                                        { class: 'required' },
                                                                                        {
                                                                                            class: 'pattern',
                                                                                            config: {
                                                                                                pattern: /prefix.*/,
                                                                                                description: "must start with prefix"
                                                                                            }
                                                                                        },
                                                                                    ]
                                                                                }
                                                                            },
                                                                            component: {
                                                                                class: 'SimpleInputComponent'
                                                                            }
                                                                        }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    ]
                                                }
                                            },
                                          expressions: [
                                            {
                                              name: 'group_1_component_text_3_event_expr',
                                              config: {
                                                template: `value = "hide group_1_component"`,
                                                conditionKind: 'jsonpointer',
                                                condition: `/main_tab/tab_1/text_3_event::field.value.changed`,
                                                target: `layout.visible`,
                                              },
                                            },
                                          ]
                                        },
                                        {
                                            name: 'repeatable_textfield_1',
                                            model: {
                                                class: 'RepeatableModel',
                                                config: {
                                                    defaultValue: ['hello world from repeatable, default!']
                                                }
                                            },
                                            component: {
                                                class: 'RepeatableComponent',
                                                config: {
                                                    elementTemplate: {
                                                        name: "",
                                                        model: {
                                                            class: 'SimpleInputModel',
                                                            config: {
                                                                newEntryValue: 'hello world from elementTemplate!',
                                                                validators: [
                                                                    {
                                                                        class: 'pattern',
                                                                        config: {
                                                                            pattern: /prefix.*/,
                                                                            description: "must start with prefix"
                                                                        }
                                                                    },
                                                                    {
                                                                        class: 'minLength',
                                                                        message: "@validator-error-custom-example_repeatable",
                                                                        config: { minLength: 3 }
                                                                    },
                                                                ]
                                                            }
                                                        },
                                                        component: {
                                                            class: 'SimpleInputComponent',
                                                            config: {
                                                                wrapperCssClasses: 'col',
                                                                type: 'text'
                                                            }
                                                        },
                                                        layout: {
                                                            class: 'RepeatableElementLayout',
                                                            config: {
                                                                hostCssClasses: 'row align-items-start'
                                                            }
                                                        },
                                                    },
                                                },
                                            },
                                            layout: {
                                                class: 'DefaultLayout',
                                                config: {
                                                    label: 'Repeatable TextField with default wrapper defined',
                                                    helpText: 'Repeatable component help text',
                                                }
                                            },
                                            expressions: [
                                              {
                                                name: 'repeatable_textfield_1_text_3_event_expr',
                                                config: {
                                                  template: `value = "hide repeatable_textfield_1"`,
                                                  conditionKind: 'jsonpointer',
                                                  condition: `/main_tab/tab_1/text_3_event::field.value.changed`,
                                                  target: `layout.visible`,
                                                },
                                              },
                                            ]
                                        },
                                      {
                                        name: "questiontree_1",
                                        component: {
                                          class: "QuestionTreeComponent",
                                          config: {
                                            availableOutcomes: [
                                              {value: "value1", label: "@outcomes-value1"},
                                              {value: "value2", label: "@outcomes-value2"},
                                            ],
                                            availableMeta: {
                                              prop2: {
                                                value1: "@outcomes-prop2-value1",
                                                value2: "@outcomes-prop2-value2",
                                              },
                                        },
                                            questions: [
                                              {
                                                id: "question_1",
                                                answersMin: 1,
                                                answersMax: 1,
                                                answers: [{value: "yes"}, {value: "no"}],
                                                rules: {op: "true"},
                                              },
                                              {
                                                id: "question_2",
                                                answersMin: 1,
                                                answersMax: 2,
                                                answers: [{value: "yes"}, {value: "no", meta: {prop2: "value1"}, outcome: "value1"}],
                                                rules: {op: "in", q: "question_1", a: ["no"]}
                                              }
                                            ],
                                            componentDefinitions: [],
                                          }
                                        },
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
            name: 'repeatable_group_1',
            model: {
                class: 'RepeatableModel',
                config: {
                    defaultValue: [{ text_3: "hello world from repeating groups" }]
                }
            },
            component: {
                class: 'RepeatableComponent',
                config: {
                    elementTemplate: {
                        name: "",
                        // first group component
                        model: {
                            class: 'GroupModel',
                            config: {
                                newEntryValue: { text_3: 'hello world 3!' },
                            }
                        },
                        component: {
                            class: 'GroupComponent',
                            config: {
                                wrapperCssClasses: 'col',
                                componentDefinitions: [
                                    {
                                        name: 'text_3',
                                        model: {
                                            class: 'SimpleInputModel',
                                            config: {
                                                validators: [
                                                    {
                                                        class: 'minLength',
                                                        message: "@validator-error-custom-text_3",
                                                        config: { minLength: 3 }
                                                    }
                                                ]
                                            }
                                        },
                                        component: {
                                            class: 'SimpleInputComponent',
                                            config: {
                                                type: 'text'
                                            }
                                        }
                                    },

                                ]
                            }
                        },
                        layout: {
                            class: 'RepeatableElementLayout',
                            config: {
                                hostCssClasses: 'row align-items-start'
                            }
                        },
                    }
                },
            },
            layout: {
                class: 'DefaultLayout',
                config: {
                    label: 'Repeatable TextField not inside the tab with default wrapper defined',
                    helpText: 'Repeatable component help text',
                }
            },
        },
        {
            name: 'save_button',
            component: {
                class: 'SaveButtonComponent',
                config: {
                    label: 'Save',
                }
            }
        },
        {
            name: 'validation_summary_1',
            component: { class: "ValidationSummaryComponent" }
        },
    ]
};

/**
 * Form config example that uses reusable form config.
 */
export const formConfigExample2: FormConfigFrame = {
    name: "default-1.0-draft",
    type: "rdmp",
    debugValue: true,
    domElementType: 'form',
    defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
    },
    editCssClasses: "redbox-form form",
    // Validators that operate on multiple fields.
    validators: [
        { class: 'different-values', config: { controlNames: ['text_1_event', 'text_2'] } },
    ],
    componentDefinitions: [
        {
            overrides: { reusableFormName: "standard-people-fields" },
            name: "",
            component: {
                class: "ReusableComponent",
                config: {
                    componentDefinitions: [
                        {
                            // change only the name of the component
                            // note that the 'name' used here must be the name after previous reusable form config process is done, not the original name
                            overrides: {
                                replaceName: "contributor_data_manager2",
                                formModeClasses: { "view": { component: "SimpleInputComponent" } }
                            },
                            name: "contributor_data_manager",
                            component: { class: "SimpleInputComponent", config: {} }
                        },
                        {
                            // change only the name of the component injected into the reusable form config (nested reusable form config!)
                            overrides: { replaceName: "contributor_data_manager_email" },
                            name: "email",
                            component: { class: "SimpleInputComponent", config: {} }
                        }
                        // other two elements 'contributor_ci_name' and 'contributor_ci_orcid' included unchanged
                    ]
                }
            }
        }
    ]
}

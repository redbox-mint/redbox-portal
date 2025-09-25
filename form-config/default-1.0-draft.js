"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const formConfig = {
    name: "default-1.0-draft",
    type: "rdmp",
    debugValue: true,
    domElementType: 'form',
    defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
    },
    editCssClasses: "redbox-form form",
    skipValidationOnSave: false,
    // TODO: a way to crate groups of validators
    // This is not implemented yet.
    // each group has a name, plus either which validators to 'exclude' or 'include', but not both.
    // validatorProfiles: {
    //     // all: All validators (exclude none).
    //     all: {exclude: []},
    //     // minimumSave: The minimum set of validators that must pass to be able to save (create or update).
    //     minimumSave: {include: ['project_title']},
    // },
    // Validators that operate on multiple fields.
    validators: [
        { name: 'different-values', config: { controlNames: ['text_1_event', 'text_2'] } },
    ],
    // componentTemplates: [
    //     // TODO - server-side only, replaced in componentDefinitions
    // ],
    componentDefinitions: [
        {
            name: 'main_tab',
            layout: {
                class: 'TabComponentLayout',
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
                            id: 'tab_1',
                            buttonLabel: 'Tab 1',
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
                                        class: 'DefaultLayoutComponent',
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
                                        class: 'DefaultLayoutComponent',
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
                                        class: 'DefaultLayoutComponent',
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
                                        class: 'DefaultLayoutComponent',
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
                                        class: 'DefaultLayoutComponent',
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
                                        class: 'DefaultLayoutComponent',
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
                                    name: 'text_1_event',
                                    model: {
                                        class: 'SimpleInputModel',
                                        config: {
                                            defaultValue: 'hello world!',
                                            validators: [
                                                { name: 'required' },
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
                                        class: 'DefaultLayoutComponent',
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
                                            // {name: 'pattern', config: {pattern: /prefix.*/, description: "must start with prefix"}},
                                            // {name: 'minLength', message: "@validator-error-custom-text_2", config: {minLength: 3}},
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
                                        class: 'DefaultLayoutComponent',
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
                                                { name: 'pattern', config: { pattern: /prefix.*/, description: "must start with prefix" } },
                                                { name: 'minLength', message: "@validator-error-custom-text_7", config: { minLength: 3 } },
                                            ]
                                        }
                                    },
                                    component: {
                                        class: 'SimpleInputComponent'
                                    },
                                    expressions: {
                                        'model.value': {
                                            template: `<%= _.get(model,'text_1_event','') %>`
                                        }
                                    }
                                },
                                {
                                    name: 'text_2_event',
                                    model: {
                                        class: 'SimpleInputModel',
                                        config: {
                                            defaultValue: 'hello world! component event',
                                            validators: [
                                                { name: 'required' },
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
                                        class: 'DefaultLayoutComponent',
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
                                    expressions: {
                                        'component.visible': {
                                            template: `<% if(_.isEmpty(_.get(model,'text_2_event',''))) {
                            return false;
                          } else {
                            return true;
                          } %>`
                                        }
                                    }
                                },
                                {
                                    name: 'text_3_event',
                                    model: {
                                        class: 'SimpleInputModel',
                                        config: {
                                            defaultValue: 'hello world! layout event',
                                            validators: [
                                                { name: 'required' },
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
                                        class: 'DefaultLayoutComponent',
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
                                    expressions: {
                                        'layout.visible': {
                                            template: `<% if(_.isEmpty(_.get(model,'text_3_event',''))) {
                                                    return false;
                                                } else {
                                                    return true;
                                                } %>`
                                        }
                                    }
                                },
                            ]
                        },
                        {
                            id: 'tab_2',
                            buttonLabel: 'Tab 2',
                            componentDefinitions: [
                                {
                                    // first group component
                                    name: 'group_1_component',
                                    layout: {
                                        class: 'DefaultLayoutComponent',
                                        config: {
                                            label: 'GroupField label',
                                            helpText: 'GroupField help',
                                        }
                                    },
                                    model: {
                                        class: 'GroupFieldModel',
                                        config: {
                                            defaultValue: {},
                                        }
                                    },
                                    component: {
                                        class: 'GroupFieldComponent',
                                        config: {
                                            componentDefinitions: [
                                                {
                                                    name: 'text_3',
                                                    layout: {
                                                        class: 'DefaultLayoutComponent',
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
                                                        class: 'DefaultLayoutComponent',
                                                        config: {
                                                            label: 'GroupField 2 label',
                                                            helpText: 'GroupField 2 help',
                                                        }
                                                    },
                                                    model: {
                                                        class: 'GroupFieldModel',
                                                        config: {
                                                            defaultValue: {},
                                                        }
                                                    },
                                                    component: {
                                                        class: 'GroupFieldComponent',
                                                        config: {
                                                            componentDefinitions: [
                                                                {
                                                                    name: 'text_5',
                                                                    layout: {
                                                                        class: 'DefaultLayoutComponent',
                                                                        config: {
                                                                            label: 'TextField with default wrapper defined',
                                                                            helpText: 'This is a help text',
                                                                        }
                                                                    },
                                                                    model: {
                                                                        class: 'SimpleInputModel',
                                                                        config: {
                                                                            defaultValue: 'hello world 5!',
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
                                    expressions: {
                                        'layout.visible': {
                                            template: `<% if(_.isEmpty(_.get(model,'text_3_event',''))) {
                            return false;
                          } else {
                            return true;
                          } %>`
                                        }
                                    }
                                },
                                {
                                    name: 'repeatable_textfield_1',
                                    model: {
                                        class: 'RepeatableComponentModel',
                                        config: {
                                            defaultValue: ['hello world from repeatable, default!']
                                        }
                                    },
                                    component: {
                                        class: 'RepeatableComponent',
                                        config: {
                                            elementTemplate: {
                                                name: 'example_repeatable',
                                                model: {
                                                    class: 'SimpleInputModel',
                                                    config: {
                                                        defaultValue: 'hello world from elementTemplate!',
                                                        validators: [
                                                            {
                                                                name: 'pattern',
                                                                config: { pattern: /prefix.*/, description: "must start with prefix" }
                                                            },
                                                            {
                                                                name: 'minLength',
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
                                                    class: 'RepeatableElementLayoutComponent',
                                                    config: {
                                                        hostCssClasses: 'row align-items-start'
                                                    }
                                                },
                                            },
                                        },
                                    },
                                    layout: {
                                        class: 'DefaultLayoutComponent',
                                        config: {
                                            label: 'Repeatable TextField with default wrapper defined',
                                            helpText: 'Repeatable component help text',
                                        }
                                    },
                                    expressions: {
                                        'layout.visible': {
                                            template: `<% if(_.isEmpty(_.get(model,'text_3_event',''))) {
                                                    return false;
                                                } else {
                                                    return true;
                                                } %>`
                                        }
                                    }
                                },
                            ]
                        }
                    ]
                }
            }
        },
        {
            name: 'repeatable_group_1',
            model: {
                class: 'RepeatableComponentModel',
                config: {
                    defaultValue: [{ text_3: "hello world from repeating groups" }]
                }
            },
            component: {
                class: 'RepeatableComponent',
                config: {
                    elementTemplate: {
                        // first group component
                        name: 'group_1_component',
                        model: {
                            class: 'GroupFieldModel',
                            config: {
                                defaultValue: {},
                            }
                        },
                        component: {
                            class: 'GroupFieldComponent',
                            config: {
                                wrapperCssClasses: 'col',
                                componentDefinitions: [
                                    {
                                        name: 'text_3',
                                        model: {
                                            class: 'SimpleInputModel',
                                            config: {
                                                defaultValue: 'hello world 3!',
                                                validators: [
                                                    {
                                                        name: 'minLength',
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
                            class: 'RepeatableElementLayoutComponent',
                            config: {
                                hostCssClasses: 'row align-items-start'
                            }
                        },
                    }
                },
            },
            layout: {
                class: 'DefaultLayoutComponent',
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
            model: { class: 'ValidationSummaryFieldModel', config: {} },
            component: { class: "ValidationSummaryFieldComponent" }
        },
        // {
        //   module: 'custom',
        //   component: {
        //     class: 'FormCustomComponent',
        //   },
        //   model: {
        //     class: 'FormCustomFieldModel',
        //     config: {
        //       name: 'project_name',
        //       label: 'Project Name',
        //       type: 'text',
        //       defaultValue: 'hello world!'
        //     }
        //   }
        // }
    ]
};
module.exports = formConfig;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdC0xLjAtZHJhZnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2Zvcm0tY29uZmlnL2RlZmF1bHQtMS4wLWRyYWZ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUEsTUFBTSxVQUFVLEdBQWU7SUFDM0IsSUFBSSxFQUFFLG1CQUFtQjtJQUN6QixJQUFJLEVBQUUsTUFBTTtJQUNaLFVBQVUsRUFBRSxJQUFJO0lBQ2hCLGNBQWMsRUFBRSxNQUFNO0lBQ3RCLHNCQUFzQixFQUFFO1FBQ3BCLDBCQUEwQixFQUFFLEtBQUs7S0FDcEM7SUFDRCxjQUFjLEVBQUUsa0JBQWtCO0lBQ2xDLG9CQUFvQixFQUFFLEtBQUs7SUFFM0IsNENBQTRDO0lBQzVDLCtCQUErQjtJQUMvQiwrRkFBK0Y7SUFDL0YsdUJBQXVCO0lBQ3ZCLDZDQUE2QztJQUM3QywwQkFBMEI7SUFDMUIsMEdBQTBHO0lBQzFHLGlEQUFpRDtJQUNqRCxLQUFLO0lBRUwsOENBQThDO0lBQzlDLFVBQVUsRUFBRTtRQUNSLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sRUFBRSxFQUFFLFlBQVksRUFBRSxDQUFDLGNBQWMsRUFBRSxRQUFRLENBQUMsRUFBRSxFQUFFO0tBQ3JGO0lBQ0Qsd0JBQXdCO0lBQ3hCLG1FQUFtRTtJQUNuRSxLQUFLO0lBQ0wsb0JBQW9CLEVBQUU7UUFDbEI7WUFDSSxJQUFJLEVBQUUsVUFBVTtZQUNoQixNQUFNLEVBQUU7Z0JBQ0osS0FBSyxFQUFFLG9CQUFvQjtnQkFDM0IsTUFBTSxFQUFFO29CQUNKLG1DQUFtQztvQkFDbkMsY0FBYyxFQUFFLDBCQUEwQjtvQkFDMUMscUJBQXFCLEVBQUUsZ0NBQWdDO29CQUN2RCxlQUFlLEVBQUUsZUFBZTtvQkFDaEMscUJBQXFCLEVBQUUsYUFBYTtpQkFDdkM7YUFDSjtZQUNELFNBQVMsRUFBRTtnQkFDUCxLQUFLLEVBQUUsY0FBYztnQkFDckIsTUFBTSxFQUFFO29CQUNKLGNB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
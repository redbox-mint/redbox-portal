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
                                            tooltip: 'text_2_event tooltip'
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
                                            tooltip: 'text_2_component_event component tooltip 22222'
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
                                            config: {}
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
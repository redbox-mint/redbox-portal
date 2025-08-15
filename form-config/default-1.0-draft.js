"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validators_1 = require("../config/validators");
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
    // validatorDefinitions is the combination of redbox core validator definitions and
    // the validator definitions from the client hook form config.
    validatorDefinitions: validators_1.formValidatorsSharedDefinitions,
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
            component: {
                class: 'TabComponent',
                config: {
                    mainCssClass: 'd-flex align-items-start',
                    buttonSectionCssClass: 'nav flex-column nav-pills me-5',
                    tabContentSectionCssClass: 'tab-content',
                    tabPaneCssClass: 'tab-pane fade',
                    tabPaneActiveCssClass: 'active show',
                    tabs: [
                        {
                            id: 'tab_1',
                            buttonLabel: 'Tab 1',
                            componentDefinitions: [
                                {
                                    name: 'text_1_event',
                                    model: {
                                        class: 'TextInputModel',
                                        config: {
                                            defaultValue: 'hello world!',
                                            validators: [
                                                { name: 'required' },
                                            ]
                                        }
                                    },
                                    component: {
                                        class: 'TextInputComponent'
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
                                        class: 'TextInputModel',
                                        config: {
                                            defaultValue: 'hello world 2!',
                                            validators: [
                                                { name: 'pattern', config: { pattern: /prefix.*/, description: "must start with prefix" } },
                                                { name: 'minLength', message: "@validator-error-custom-text_2", config: { minLength: 3 } },
                                            ]
                                        }
                                    },
                                    component: {
                                        class: 'TextInputComponent'
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
                                        class: 'TextInputModel',
                                        config: {
                                            defaultValue: 'hello world! component event',
                                            validators: [
                                                { name: 'required' },
                                            ]
                                        }
                                    },
                                    component: {
                                        class: 'TextInputComponent',
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
                                        class: 'TextInputModel',
                                        config: {
                                            defaultValue: 'hello world 2! component expression'
                                        }
                                    },
                                    component: {
                                        class: 'TextInputComponent',
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
                                        class: 'TextInputModel',
                                        config: {
                                            defaultValue: 'hello world! layout event',
                                            validators: [
                                                { name: 'required' },
                                            ]
                                        }
                                    },
                                    component: {
                                        class: 'TextInputComponent'
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
                                        class: 'TextInputModel',
                                        config: {
                                            defaultValue: 'hello world 2! layout expression'
                                        }
                                    },
                                    component: {
                                        class: 'TextInputComponent'
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
                            selected: true,
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
                                                        class: 'TextInputModel',
                                                        config: {
                                                            defaultValue: 'hello world 3!',
                                                        }
                                                    },
                                                    component: {
                                                        class: 'TextInputComponent'
                                                    }
                                                },
                                                {
                                                    name: 'text_4',
                                                    model: {
                                                        class: 'TextInputModel',
                                                        config: {
                                                            defaultValue: 'hello world 4!'
                                                        }
                                                    },
                                                    component: {
                                                        class: 'TextInputComponent'
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
                                                                        class: 'TextInputModel',
                                                                        config: {
                                                                            defaultValue: 'hello world 5!',
                                                                        }
                                                                    },
                                                                    component: {
                                                                        class: 'TextInputComponent'
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
                                                    class: 'TextInputModel',
                                                    config: {
                                                        defaultValue: 'hello world from elementTemplate!',
                                                        validators: [
                                                            {
                                                                name: 'pattern',
                                                                config: { pattern: /prefix.*/, description: "must start with prefix" }
                                                            },
                                                            {
                                                                name: 'minLength',
                                                                message: "@validator-error-custom-text_2",
                                                                config: { minLength: 3 }
                                                            },
                                                        ]
                                                    }
                                                },
                                                component: {
                                                    class: 'TextInputComponent',
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
                                            class: 'TextInputModel',
                                            config: {
                                                defaultValue: 'hello world 3!',
                                                validators: [
                                                    {
                                                        name: 'minLength',
                                                        message: "@validator-error-custom-text_2",
                                                        config: { minLength: 3 }
                                                    }
                                                ]
                                            }
                                        },
                                        component: {
                                            class: 'TextInputComponent',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdC0xLjAtZHJhZnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2Zvcm0tY29uZmlnL2RlZmF1bHQtMS4wLWRyYWZ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EscURBQXFFO0FBRXJFLE1BQU0sVUFBVSxHQUFlO0lBQzNCLElBQUksRUFBRSxtQkFBbUI7SUFDekIsSUFBSSxFQUFFLE1BQU07SUFDWixVQUFVLEVBQUUsSUFBSTtJQUNoQixjQUFjLEVBQUUsTUFBTTtJQUN0QixzQkFBc0IsRUFBRTtRQUNwQiwwQkFBMEIsRUFBRSxLQUFLO0tBQ3BDO0lBQ0QsY0FBYyxFQUFFLGtCQUFrQjtJQUNsQyxvQkFBb0IsRUFBRSxLQUFLO0lBRTNCLG1GQUFtRjtJQUNuRiw4REFBOEQ7SUFDOUQsb0JBQW9CLEVBQUUsNENBQStCO0lBRXJELDRDQUE0QztJQUM1QywrQkFBK0I7SUFDL0IsK0ZBQStGO0lBQy9GLHVCQUF1QjtJQUN2Qiw2Q0FBNkM7SUFDN0MsMEJBQTBCO0lBQzFCLDBHQUEwRztJQUMxRyxpREFBaUQ7SUFDakQsS0FBSztJQUVMLDhDQUE4QztJQUM5QyxVQUFVLEVBQUU7UUFDUixFQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRSxNQUFNLEVBQUUsRUFBQyxZQUFZLEVBQUUsQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLEVBQUMsRUFBQztLQUNqRjtJQUNELHdCQUF3QjtJQUN4QixtRUFBbUU7SUFDbkUsS0FBSztJQUNMLG9CQUFvQixFQUFFO1FBQ2xCO1lBQ0ksSUFBSSxFQUFFLFVBQVU7WUFDaEIsU0FBUyxFQUFFO2dCQUNQLEtBQUssRUFBRSxjQUFjO2dCQUNyQixNQUFNLEVBQUU7b0JBQ0osWUFBWSxFQUFFLDBCQUEwQjtvQkFDeEMscUJBQXFCLEVBQUUsZ0NBQWdDO29CQUN2RCx5QkFBeUIsRUFBRSxhQUFhO29CQUN4QyxlQUFlLEVBQUUsZUFBZTtvQkFDaEMscUJBQXFCLEVBQUUsYUFBYTtv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
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
                                                { name: 'pattern', config: { pattern: /prefix.*/, description: "must start with prefix" } },
                                                { name: 'minLength', message: "@validator-error-custom-text_2", config: { minLength: 3 } },
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
                                                                message: "@validator-error-custom-text_2",
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
                                                        message: "@validator-error-custom-text_2",
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdC0xLjAtZHJhZnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2Zvcm0tY29uZmlnL2RlZmF1bHQtMS4wLWRyYWZ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EscURBQXVFO0FBRXZFLE1BQU0sVUFBVSxHQUFlO0lBQzNCLElBQUksRUFBRSxtQkFBbUI7SUFDekIsSUFBSSxFQUFFLE1BQU07SUFDWixVQUFVLEVBQUUsSUFBSTtJQUNoQixjQUFjLEVBQUUsTUFBTTtJQUN0QixzQkFBc0IsRUFBRTtRQUNwQiwwQkFBMEIsRUFBRSxLQUFLO0tBQ3BDO0lBQ0QsY0FBYyxFQUFFLGtCQUFrQjtJQUNsQyxvQkFBb0IsRUFBRSxLQUFLO0lBRTNCLG1GQUFtRjtJQUNuRiw4REFBOEQ7SUFDOUQsb0JBQW9CLEVBQUUsNENBQStCO0lBRXJELDRDQUE0QztJQUM1QywrQkFBK0I7SUFDL0IsK0ZBQStGO0lBQy9GLHVCQUF1QjtJQUN2Qiw2Q0FBNkM7SUFDN0MsMEJBQTBCO0lBQzFCLDBHQUEwRztJQUMxRyxpREFBaUQ7SUFDakQsS0FBSztJQUVMLDhDQUE4QztJQUM5QyxVQUFVLEVBQUU7UUFDUixFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxNQUFNLEVBQUUsRUFBRSxZQUFZLEVBQUUsQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLEVBQUUsRUFBRTtLQUNyRjtJQUNELHdCQUF3QjtJQUN4QixtRUFBbUU7SUFDbkUsS0FBSztJQUNMLG9CQUFvQixFQUFFO1FBQ2xCO1lBQ0ksSUFBSSxFQUFFLFVBQVU7WUFDaEIsTUFBTSxFQUFFO2dCQUNKLEtBQUssRUFBRSxvQkFBb0I7Z0JBQzNCLE1BQU0sRUFBRTtvQkFDSixtQ0FBbUM7b0JBQ25DLGNBQWMsRUFBRSwwQkFBMEI7b0JBQzFDLHFCQUFxQixFQUFFLGdDQUFnQztvQkFDdkQsZUFBZSxFQUFFLGVBQWU7b0JBQ2hDLHFCQUFxQixFQUFFLGFBQWE7aUJBQ3ZDO2FB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
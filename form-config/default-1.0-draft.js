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
                                    name: 'textarea_1',
                                    layout: {
                                        class: 'DefaultLayoutComponent',
                                        config: {
                                            label: 'Textarea some label',
                                            helpText: 'Textarea some help text',
                                        }
                                    },
                                    model: {
                                        class: 'TextareaModel',
                                        config: {
                                            defaultValue: 'Textarea hello world!!!',
                                        }
                                    },
                                    component: {
                                        class: 'TextareaComponent'
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
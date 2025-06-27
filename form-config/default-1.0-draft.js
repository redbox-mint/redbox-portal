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
    componentDefinitions: [
        {
            name: 'text_1_event',
            model: {
                name: 'text_1_for_the_form',
                class: 'TextFieldModel',
                config: {
                    value: 'hello world!',
                    defaultValue: 'hello world!',
                    validators: [
                        { name: 'required' },
                    ]
                }
            },
            component: {
                class: 'TextFieldComponent'
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
                class: 'TextFieldModel',
                config: {
                    value: 'hello world 2!',
                    validators: [
                        { name: 'pattern', config: { pattern: /prefix.*/, description: "must start with prefix" } },
                        { name: 'minLength', message: "@validator-error-custom-text_2", config: { minLength: 3 } },
                    ]
                }
            },
            component: {
                class: 'TextFieldComponent'
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
                name: 'text_2_for_the_form',
                class: 'TextFieldModel',
                config: {
                    value: 'hello world! component event',
                    defaultValue: 'hello world! component event',
                    validators: [
                        { name: 'required' },
                    ]
                }
            },
            component: {
                class: 'TextFieldComponent'
            }
        },
        {
            name: 'text_2_component_event',
            layout: {
                class: 'DefaultLayoutComponent',
                config: {
                    label: 'TextField with default wrapper defined',
                    helpText: 'This is a help text',
                }
            },
            model: {
                class: 'TextFieldModel',
                config: {
                    value: 'hello world 2! component expression'
                }
            },
            component: {
                class: 'TextFieldComponent'
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
                name: 'text_3_for_the_form',
                class: 'TextFieldModel',
                config: {
                    value: 'hello world! layout event',
                    defaultValue: 'hello world! layout event',
                    validators: [
                        { name: 'required' },
                    ]
                }
            },
            component: {
                class: 'TextFieldComponent'
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
                class: 'TextFieldModel',
                config: {
                    value: 'hello world 2! layout expression'
                }
            },
            component: {
                class: 'TextFieldComponent'
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
                name: 'group_1_model',
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
                                class: 'TextFieldModel',
                                config: {
                                    value: 'hello world 3!',
                                }
                            },
                            component: {
                                class: 'TextFieldComponent'
                            }
                        },
                        {
                            name: 'text_4',
                            model: {
                                class: 'TextFieldModel',
                                config: {
                                    value: 'hello world 4!',
                                    defaultValue: 'hello world 4!'
                                }
                            },
                            component: {
                                class: 'TextFieldComponent'
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
                                name: 'group_2_model',
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
                                                class: 'TextFieldModel',
                                                config: {
                                                    value: 'hello world 5!',
                                                }
                                            },
                                            component: {
                                                class: 'TextFieldComponent'
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
            name: 'repeatable_textfield_1',
            model: {
                class: 'RepeatableComponentModel',
                config: {
                    value: ['hello world from repeatable value!'],
                    defaultValue: ['hello world from repeatable, default!']
                }
            },
            component: {
                class: 'RepeatableComponent',
                config: {
                    elementTemplate: {
                        model: {
                            class: 'TextFieldModel',
                            config: {
                                wrapperCssClasses: 'col',
                                editCssClasses: 'redbox-form row',
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
                            class: 'TextFieldComponent'
                        }
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
        },
        {
            name: 'repeatable_group_1',
            model: {
                class: 'RepeatableComponentModel',
                config: {
                    value: [{
                            text_3: "hello world from repeating groups"
                        }]
                }
            },
            component: {
                class: 'RepeatableComponent',
                config: {
                    elementTemplate: {
                        // first group component
                        name: 'group_1_component',
                        model: {
                            name: 'group_1_model',
                            class: 'GroupFieldModel',
                            config: {
                                defaultValue: {},
                            }
                        },
                        component: {
                            class: 'GroupFieldComponent',
                            config: {
                                hostCssClasses: 'row',
                                componentDefinitions: [
                                    {
                                        name: 'text_3',
                                        model: {
                                            class: 'TextFieldModel',
                                            config: {
                                                value: 'hello world 3!',
                                            }
                                        },
                                        component: {
                                            class: 'TextFieldComponent',
                                            config: {
                                                hostCssClasses: '',
                                                wrapperCssClasses: 'col'
                                            }
                                        }
                                    },
                                ]
                            }
                        }
                    }
                },
            },
            layout: {
                class: 'DefaultLayoutComponent',
                config: {
                    label: 'Repeatable TextField with default wrapper defined',
                    helpText: 'Repeatable component help text',
                }
            },
        },
        {
            name: 'validation_summary_1',
            model: { name: 'validation_summary_2', class: 'ValidationSummaryFieldModel' },
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
        //       value: 'hello world!'
        //     }
        //   }
        // }
    ]
};
module.exports = formConfig;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdC0xLjAtZHJhZnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2Zvcm0tY29uZmlnL2RlZmF1bHQtMS4wLWRyYWZ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0EscURBQXFFO0FBRXJFLE1BQU0sVUFBVSxHQUFlO0lBQzNCLElBQUksRUFBRSxtQkFBbUI7SUFDekIsSUFBSSxFQUFFLE1BQU07SUFDWixVQUFVLEVBQUUsSUFBSTtJQUNoQixjQUFjLEVBQUUsTUFBTTtJQUN0QixzQkFBc0IsRUFBRTtRQUNwQiwwQkFBMEIsRUFBRSxLQUFLO0tBQ3BDO0lBQ0QsY0FBYyxFQUFFLGtCQUFrQjtJQUVsQyxtRkFBbUY7SUFDbkYsOERBQThEO0lBQzlELG9CQUFvQixFQUFFLDRDQUErQjtJQUVyRCw0Q0FBNEM7SUFDNUMsK0JBQStCO0lBQy9CLCtGQUErRjtJQUMvRix1QkFBdUI7SUFDdkIsNkNBQTZDO0lBQzdDLDBCQUEwQjtJQUMxQiwwR0FBMEc7SUFDMUcsaURBQWlEO0lBQ2pELEtBQUs7SUFFTCw4Q0FBOEM7SUFDOUMsVUFBVSxFQUFFO1FBQ1IsRUFBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxFQUFFLEVBQUMsWUFBWSxFQUFFLENBQUMsY0FBYyxFQUFFLFFBQVEsQ0FBQyxFQUFDLEVBQUM7S0FDakY7SUFFRCxvQkFBb0IsRUFBRTtRQUNsQjtZQUNJLElBQUksRUFBRSxjQUFjO1lBQ3BCLEtBQUssRUFBRTtnQkFDSCxJQUFJLEVBQUUscUJBQXFCO2dCQUMzQixLQUFLLEVBQUUsZ0JBQWdCO2dCQUN2QixNQUFNLEVBQUU7b0JBQ0osS0FBSyxFQUFFLGNBQWM7b0JBQ3JCLFlBQVksRUFBRSxjQUFjO29CQUM1QixVQUFVLEVBQUU7d0JBQ1IsRUFBQyxJQUFJLEVBQUUsVUFBVSxFQUFDO3FCQUNyQjtpQkFDSjthQUNKO1lBQ0QsU0FBUyxFQUFFO2dCQUNQLEtBQUssRUFBRSxvQkFBb0I7YUFDOUI7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
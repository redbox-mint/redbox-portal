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
                                                            name: 'pattern',
                                                            config: {
                                                                pattern: /prefix.*/,
                                                                description: "must start with prefix"
                                                            }
                                                        },
                                                        {
                                                            name: 'minLength',
                                                            message: "@validator-error-custom-text_7",
                                                            config: { minLength: 3 }
                                                        },
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
                                                class: 'RepeatableModel',
                                        config: {
                                            defaultValue: ['hello world from repeatable, default!']
                                        }
                                    },
                                    component: {
                                        class: 'RepeatableComponent',
                                        config: {
                                            elementTemplate: {

                                                        name: 'example_repeatable',model: {
                                                            class: 'SimpleInputModel',
                                                            config: {
                                                                defaultValue: 'hello world from elementTemplate!',
                                                                validators: [
                                                                    {
                                                                        name: 'pattern',
                                                                        config: {
                                                                            pattern: /prefix.*/,
                                                                            description: "must start with prefix"
                                                                        }
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
                        // first group component
                        name: 'group_1_component',
                        model: {
                            class: 'GroupModel',
                            config: {
                                defaultValue: {},
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdC0xLjAtZHJhZnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2Zvcm0tY29uZmlnL2RlZmF1bHQtMS4wLWRyYWZ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUEsTUFBTSxVQUFVLEdBQW9CO0lBQ2hDLElBQUksRUFBRSxtQkFBbUI7SUFDekIsSUFBSSxFQUFFLE1BQU07SUFDWixVQUFVLEVBQUUsSUFBSTtJQUNoQixjQUFjLEVBQUUsTUFBTTtJQUN0QixzQkFBc0IsRUFBRTtRQUNwQiwwQkFBMEIsRUFBRSxLQUFLO0tBQ3BDO0lBQ0QsY0FBYyxFQUFFLGtCQUFrQjtJQUNsQyxvQkFBb0IsRUFBRSxLQUFLO0lBRTNCLDRDQUE0QztJQUM1QywrQkFBK0I7SUFDL0IsK0ZBQStGO0lBQy9GLHVCQUF1QjtJQUN2Qiw2Q0FBNkM7SUFDN0MsMEJBQTBCO0lBQzFCLDBHQUEwRztJQUMxRyxpREFBaUQ7SUFDakQsS0FBSztJQUVMLDhDQUE4QztJQUM5QyxVQUFVLEVBQUU7UUFDUixFQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRSxNQUFNLEVBQUUsRUFBQyxZQUFZLEVBQUUsQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLEVBQUMsRUFBQztLQUNqRjtJQUNELHdCQUF3QjtJQUN4QixtRUFBbUU7SUFDbkUsS0FBSztJQUNMLG9CQUFvQixFQUFFO1FBQ2xCO1lBQ0ksSUFBSSxFQUFFLFVBQVU7WUFDaEIsTUFBTSxFQUFFO2dCQUNKLEtBQUssRUFBRSxXQUFXO2dCQUNsQixNQUFNLEVBQUU7b0JBQ0osbUNBQW1DO29CQUNuQyxjQUFjLEVBQUUsMEJBQTBCO29CQUMxQyxxQkFBcUIsRUFBRSxnQ0FBZ0M7b0JBQ3ZELGVBQWUsRUFBRSxlQUFlO29CQUNoQyxxQkFBcUIsRUFBRSxhQUFhO2lCQUN2QzthQUNKO1lBQ0QsU0FBUyxFQUFFO2dCQUNQLEtBQUssRUFBRSxjQUFjO2dCQUNyQixNQUFNLEVBQUU7b0JBQ0osY0FB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
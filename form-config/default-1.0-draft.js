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
                                                class: 'DefaultLayoutComponent',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdC0xLjAtZHJhZnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2Zvcm0tY29uZmlnL2RlZmF1bHQtMS4wLWRyYWZ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUEsTUFBTSxVQUFVLEdBQW9CO0lBQ2hDLElBQUksRUFBRSxtQkFBbUI7SUFDekIsSUFBSSxFQUFFLE1BQU07SUFDWixVQUFVLEVBQUUsSUFBSTtJQUNoQixjQUFjLEVBQUUsTUFBTTtJQUN0QixzQkFBc0IsRUFBRTtRQUNwQiwwQkFBMEIsRUFBRSxLQUFLO0tBQ3BDO0lBQ0QsY0FBYyxFQUFFLGtCQUFrQjtJQUNsQyxvQkFBb0IsRUFBRSxLQUFLO0lBRTNCLDRDQUE0QztJQUM1QywrQkFBK0I7SUFDL0IsK0ZBQStGO0lBQy9GLHVCQUF1QjtJQUN2Qiw2Q0FBNkM7SUFDN0MsMEJBQTBCO0lBQzFCLDBHQUEwRztJQUMxRyxpREFBaUQ7SUFDakQsS0FBSztJQUVMLDhDQUE4QztJQUM5QyxVQUFVLEVBQUU7UUFDUixFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxNQUFNLEVBQUUsRUFBRSxZQUFZLEVBQUUsQ0FBQyxjQUFjLEVBQUUsUUFBUSxDQUFDLEVBQUUsRUFBRTtLQUNyRjtJQUNELHdCQUF3QjtJQUN4QixtRUFBbUU7SUFDbkUsS0FBSztJQUNMLG9CQUFvQixFQUFFO1FBQ2xCO1lBQ0ksSUFBSSxFQUFFLFVBQVU7WUFDaEIsTUFBTSxFQUFFO2dCQUNKLEtBQUssRUFBRSxXQUFXO2dCQUNsQixNQUFNLEVBQUU7b0JBQ0osbUNBQW1DO29CQUNuQyxjQUFjLEVBQUUsMEJBQTBCO29CQUMxQyxxQkFBcUIsRUFBRSxnQ0FBZ0M7b0JBQ3ZELGVBQWUsRUFBRSxlQUFlO29CQUNoQyxxQkFBcUIsRUFBRSxhQUFhO2lCQUN2QzthQUNKO1lBQ0QsU0FBUyxFQUFFO2dCQUNQLEtBQUssRUFBRSxjQUFjO2dCQUNyQixNQUFNLEVBQUU7b0JBQ0osY0FB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
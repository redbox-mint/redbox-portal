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
                                                        name: null,
                                                        model: {
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
                        name: null,
                        // first group component
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
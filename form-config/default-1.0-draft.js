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
    // TODO: a way to crate groups of validators. This is not implemented yet.
    // each group has a name, plus either which validators to 'exclude' or 'include', but not both.
    // validatorProfiles: {
    //     // all: All validators (exclude none).
    //     all: {exclude: []},
    //     // minimumSave: The minimum set of validators that must pass to be able to save (create or update).
    //     minimumSave: {include: ['project_title']},
    //     // transitionWorkflow: The set of validators that must pass to be able to submit to move to another workflow stage
    //     transitionWorkflow: { exclude: ['validator_for_a_specific_workflow_stage']},
    // },
    // TODO: form modes and component classes
    // for each component
    // modes: {
    //     view: {
    //             layout: {
    //                 class: 'DefaultViewLayoutComponent',
    //                 config: {
    //                     label: 'TextField with default wrapper defined',
    //                     helpText: 'This is a help text',
    //                 }
    //             },
    //
    //             component: {
    //                 class: 'HTMLContentComponent'
    //             },
    //     }
    // },
    // Validators that operate on multiple fields.
    validators: [
        { name: 'different-values', config: { controlNames: ['text_1_event', 'text_2'] } },
    ],
    // TODO: re-usable server-side only, component templates, which replace placeholders in componentDefinitions. This is not implemented yet.
    // componentTemplates: [ ],
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
                            selected: true,
                            componentDefinitions: [
                                {
                                    name: 'text_1_event',
                                    model: {
                                        class: 'TextFieldModel',
                                        config: {
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
                                            defaultValue: 'hello world 2!',
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
                                        class: 'TextFieldModel',
                                        config: {
                                            defaultValue: 'hello world! component event',
                                            validators: [
                                                { name: 'required' },
                                            ]
                                        }
                                    },
                                    component: {
                                        class: 'TextFieldComponent',
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
                                        class: 'TextFieldModel',
                                        config: {
                                            defaultValue: 'hello world 2! component expression'
                                        }
                                    },
                                    component: {
                                        class: 'TextFieldComponent',
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
                                        class: 'TextFieldModel',
                                        config: {
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
                                            defaultValue: 'hello world 2! layout expression'
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
                                                        class: 'TextFieldModel',
                                                        config: {
                                                            defaultValue: 'hello world 3!',
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
                                                            defaultValue: 'hello world 4!',
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
                                                                            defaultValue: 'hello world 5!',
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
                                                    class: 'TextFieldModel',
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
                                                                message: "@validator-error-custom-text_2",
                                                                config: { minLength: 3 }
                                                            },
                                                        ]
                                                    }
                                                },
                                                component: {
                                                    class: 'TextFieldComponent',
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
                    defaultValue: [{
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
                                            class: 'TextFieldModel',
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
                                            class: 'TextFieldComponent',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmYXVsdC0xLjAtZHJhZnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi90eXBlc2NyaXB0L2Zvcm0tY29uZmlnL2RlZmF1bHQtMS4wLWRyYWZ0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBRUEsTUFBTSxVQUFVLEdBQWU7SUFDM0IsSUFBSSxFQUFFLG1CQUFtQjtJQUN6QixJQUFJLEVBQUUsTUFBTTtJQUNaLFVBQVUsRUFBRSxJQUFJO0lBQ2hCLGNBQWMsRUFBRSxNQUFNO0lBQ3RCLHNCQUFzQixFQUFFO1FBQ3BCLDBCQUEwQixFQUFFLEtBQUs7S0FDcEM7SUFDRCxjQUFjLEVBQUUsa0JBQWtCO0lBQ2xDLG9CQUFvQixFQUFFLEtBQUs7SUFFM0IsMEVBQTBFO0lBQzFFLCtGQUErRjtJQUMvRix1QkFBdUI7SUFDdkIsNkNBQTZDO0lBQzdDLDBCQUEwQjtJQUMxQiwwR0FBMEc7SUFDMUcsaURBQWlEO0lBQ2pELHlIQUF5SDtJQUN6SCxtRkFBbUY7SUFDbkYsS0FBSztJQUVMLHlDQUF5QztJQUN6QyxxQkFBcUI7SUFDckIsV0FBVztJQUNYLGNBQWM7SUFDZCx3QkFBd0I7SUFDeEIsdURBQXVEO0lBQ3ZELDRCQUE0QjtJQUM1Qix1RUFBdUU7SUFDdkUsdURBQXVEO0lBQ3ZELG9CQUFvQjtJQUNwQixpQkFBaUI7SUFDakIsRUFBRTtJQUNGLDJCQUEyQjtJQUMzQixnREFBZ0Q7SUFDaEQsaUJBQWlCO0lBQ2pCLFFBQVE7SUFDUixLQUFLO0lBRUwsOENBQThDO0lBQzlDLFVBQVUsRUFBRTtRQUNSLEVBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sRUFBRSxFQUFDLFlBQVksRUFBRSxDQUFDLGNBQWMsRUFBRSxRQUFRLENBQUMsRUFBQyxFQUFDO0tBQ2pGO0lBQ0QsMElBQTBJO0lBQzFJLDJCQUEyQjtJQUMzQixvQkFBb0IsRUFBRTtRQUNsQjtZQUNJLElBQUksRUFBRSxVQUFVO1lBQ2hCLFNBQVMsRUFBRTtnQkFDUCxLQUFLLEVB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
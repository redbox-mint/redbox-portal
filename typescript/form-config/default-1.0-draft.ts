import {FormConfig} from "@researchdatabox/sails-ng-common";
import {formValidatorsSharedDefinitions} from "../config/validators";

const formConfig: FormConfig = {
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
    validatorDefinitions: formValidatorsSharedDefinitions,

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
        {name: 'different-values', config: {controlNames: ['text_1_event', 'text_2']}},
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
                        {name: 'required'},
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
                        {name: 'pattern', config: {pattern: /prefix.*/, description: "must start with prefix"}},
                        {name: 'minLength', message: "@validator-error-custom-text_2", config: {minLength: 3}},
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
                        {name: 'required'},
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
                    value: 'hello world 2! component expression'
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
                name: 'text_3_for_the_form',
                class: 'TextFieldModel',
                config: {
                    value: 'hello world! layout event',
                    defaultValue: 'hello world! layout event',
                    validators: [
                        {name: 'required'},
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
                                        config: {pattern: /prefix.*/, description: "must start with prefix"}
                                    },
                                    {
                                        name: 'minLength',
                                        message: "@validator-error-custom-text_2",
                                        config: {minLength: 3}
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
            model: {name: 'validation_summary_2', class: 'ValidationSummaryFieldModel'},
            component: {class: "ValidationSummaryFieldComponent"}
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

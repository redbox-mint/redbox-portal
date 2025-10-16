import {ClientFormConfigVisitor, FormConfig, FormConfigFrame} from "../../src";

// @ts-ignore
import {default as default_1_0_draft_form_config} from "./../../../../../form-config/default-1.0-draft.js";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Client Visitor", async () => {
    const cases: {
        title: string,
        args: FormConfigFrame;
        expected: FormConfigFrame;
    }[] = [
        {
            title: "create empty form config",
            args: {name: '', componentDefinitions: []},
            expected: {
                name: '',
                debugValue: false,
                skipValidationOnSave: false,
                validators: [],
                componentDefinitions: [],
            },
        },
        {
            title: "create example form config",
            args: default_1_0_draft_form_config,
            expected: {name: '', componentDefinitions: []},
        },
        {
            title: "create basic form config",
            args: {
                name: "basic-form",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                skipValidationOnSave: false,
                componentDefinitions: [
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
                            }
                        },
                        component: {
                            class: 'SimpleInputComponent',
                        },
                        constraints: {
                            authorization: {
                                allowRoles: [],
                            },
                            allowModes: [],
                        },
                    }
                ]
            },
            expected: {
                name: "basic-form",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                skipValidationOnSave: false,
                validators: [],
                componentDefinitions: [
                    {
                        name: 'text_2',
                        layout: {
                            class: 'DefaultLayout',
                            config: {
                                autofocus: false,
                                cssClassesMap: {},
                                disabled: false,
                                editMode: true,
                                helpTextVisible: false,
                                helpTextVisibleOnInit: false,
                                label: 'TextField with default wrapper defined',
                                labelRequiredStr: '*',
                                readonly: false,
                                visible: true,
                                helpText: 'This is a help text',
                            }
                        },
                        model: {
                            class: 'SimpleInputModel',
                            config: {
                                value: 'hello world 2!',
                            }
                        },
                        component: {
                            class: 'SimpleInputComponent',
                            config: {
                                "autofocus": false,
                                "disabled": false,
                                "editMode": true,
                                "readonly": false,
                                "type": "text",
                                "visible": true,
                            }
                        },
                    }
                ]
            }
        },
        {
            title: "remove the component because the user does not have the required roles",
            args: {
                name: "remove-item-constraint-roles",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                skipValidationOnSave: false,
                componentDefinitions: [
                    {
                        name: 'text_1',
                        component: {
                            class: 'SimpleInputComponent',
                        },
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
                            }
                        },
                        component: {
                            class: 'SimpleInputComponent',
                        },
                        constraints: {
                            authorization: {
                                allowRoles: ['Admin', 'Librarians'],
                            },
                            allowModes: [],
                        },
                    }
                ]
            },
            expected: {
                name: "remove-item-constraint-roles",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                skipValidationOnSave: false,
                validators: [],
                componentDefinitions: [
                    {
                        name: 'text_1',
                        component: {
                            class: 'SimpleInputComponent',
                            config: {
                                "autofocus": false,
                                "disabled": false,
                                "editMode": true,
                                "readonly": false,
                                "type": "text",
                                "visible": true,
                            }
                        },
                    }
                ]
            }
        },
        {
            title: "remove the component because the client does not have the required mode",
            args: {
                name: "remove-item-constraint-mode",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                skipValidationOnSave: false,
                componentDefinitions: [
                    {
                        name: 'text_1',
                        component: {
                            class: 'SimpleInputComponent',
                        },
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
                            }
                        },
                        component: {
                            class: 'SimpleInputComponent',
                        },
                        expressions: {
                            'model.value': {
                                template: `<%= _.get(model,'text_1_event','') %>`
                            }
                        },
                        constraints: {
                            authorization: {
                                allowRoles: [],
                            },
                            allowModes: ['edit'],
                        },
                    }
                ]
            },
            expected: {
                name: "remove-item-constraint-mode",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                skipValidationOnSave: false,
                validators: [],
                componentDefinitions: [
                    {
                        name: 'text_1',
                        component: {
                            class: 'SimpleInputComponent',
                        },
                    },
                ]
            }
        },
        {
            title: "remove the components nested in repeatable and group components when the constraints are not met",
            args: {
                name: "remove-items-constrains-nested",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                skipValidationOnSave: false,
                componentDefinitions: [
                    {
                        name: 'repeatable_group_1',
                        model: {
                            class: 'RepeatableModel',
                            config: {defaultValue: [{text_1: "hello world from repeating groups"}]}
                        },
                        component: {
                            class: 'RepeatableComponent',
                            config: {
                                elementTemplate: {
                                    name: "",
                                    model: {class: 'GroupModel', config: {defaultValue: {}}},
                                    component: {
                                        class: 'GroupComponent',
                                        config: {
                                            wrapperCssClasses: 'col',
                                            componentDefinitions: [
                                                {
                                                    // requires mode edit, so expect to be removed
                                                    name: 'text_1',
                                                    model: {
                                                        class: 'SimpleInputModel',
                                                        config: {defaultValue: 'hello world 1!',}
                                                    },
                                                    component: {class: 'SimpleInputComponent'},
                                                    constraints: {allowModes: ['edit']},
                                                },
                                                {
                                                    name: 'text_2',
                                                    model: {
                                                        class: 'SimpleInputModel',
                                                        config: {defaultValue: 'hello world 2!'}
                                                    },
                                                    component: {class: 'SimpleInputComponent'},
                                                },
                                                {
                                                    // requires role 'Admin', so is removed
                                                    name: 'repeatable_for_admin',
                                                    model: {class: 'RepeatableModel', config: {}},
                                                    component: {
                                                        class: 'RepeatableComponent',
                                                        config: {
                                                            elementTemplate: {
                                                                name: "",
                                                                model: {
                                                                    class: 'SimpleInputModel',
                                                                    config: {defaultValue: 'hello world from repeatable for admin'}
                                                                },
                                                                component: {class: 'SimpleInputComponent'},
                                                                constraints: {authorization: {allowRoles: ['Admin']}},
                                                            }
                                                        }
                                                    },
                                                }
                                            ]
                                        }
                                    },
                                    layout: {
                                        class: 'RepeatableElementLayout',
                                        config: {hostCssClasses: 'row align-items-start'}
                                    },
                                    // requires mode view, so is kept
                                    constraints: {authorization: {allowRoles: []}, allowModes: ['view']}
                                }
                            },
                        },
                        layout: {
                            class: 'DefaultLayout',
                            config: {
                                label: 'Repeatable TextField with default wrapper defined',
                                helpText: 'Repeatable component help text',
                            }
                        },
                    },
                ]
            },
            expected: {
                name: "remove-items-constrains-nested",
                type: "rdmp",
                debugValue: true,
                domElementType: 'form',
                defaultComponentConfig: {
                    defaultComponentCssClasses: 'row',
                },
                editCssClasses: "redbox-form form",
                skipValidationOnSave: false,
                validators: [],
                componentDefinitions: [
                    {
                        name: 'repeatable_group_1',
                        model: {
                            class: 'RepeatableModel',
                            config: {value: [{text_1: "hello world from repeating groups"}]}
                        },
                        component: {
                            class: 'RepeatableComponent',
                            config: {
                                elementTemplate: {
                                    name: "",
                                    model: {class: 'GroupModel', config: {value: {}}},
                                    component: {
                                        class: 'GroupComponent',
                                        config: {
                                            wrapperCssClasses: 'col',
                                            componentDefinitions: [
                                                // <-- requires mode edit, so expect to be removed
                                                {
                                                    name: 'text_2',
                                                    model: {
                                                        class: 'SimpleInputModel',
                                                        config: {value: 'hello world 2!'}
                                                    },
                                                    component: {class: 'SimpleInputComponent'},
                                                },
                                                // <-- requires role 'Admin', so is removed
                                            ]
                                        }
                                    },
                                    layout: {
                                        class: 'RepeatableElementLayout',
                                        config: {hostCssClasses: 'row align-items-start'}
                                    },
                                    // <-- requires mode view, so is kept, constraints removed
                                }
                            },
                        },
                        layout: {
                            class: 'DefaultLayout',
                            config: {
                                label: 'Repeatable TextField with default wrapper defined',
                                helpText: 'Repeatable component help text',
                            }
                        },
                    },
                ]
            }
        }
    ];
    cases.forEach(({title, args, expected}) => {
        it(`should ${title}`, async function () {
            const visitor = new ClientFormConfigVisitor();
            const actual = visitor.start(args);
            expect(actual).to.eql(expected);
        });
    });
});

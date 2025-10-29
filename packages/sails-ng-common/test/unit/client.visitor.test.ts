import {
    ClientFormConfigVisitor, ConstructFormConfigVisitor, FormConfigFrame,
    TabContentFieldComponentConfigFrame, TabFieldComponentConfigFrame
} from "../../src";
import {formConfigExample1} from "./example-data";
import {logger} from "./helpers";


let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Client Visitor", async () => {
    it(`should create full example form config`, async function () {
        const args = formConfigExample1;

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start(args, "edit");

        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.startNewRecord(constructed);

        const stringified = JSON.stringify(actual);
        expect(stringified).to.not.contain("expressions");
        expect(stringified).to.not.contain("constraints");
        expect(stringified).to.not.contain("defaultValue");

        // top-level form config components
        const formCompDefs = actual.componentDefinitions;
        expect(formCompDefs).to.have.length(4);

        // tab count
        const formCompDefFirstTabs = actual.componentDefinitions[0].component;
        expect(formCompDefFirstTabs.class).to.eql("TabComponent");
        expect((formCompDefFirstTabs.config as TabFieldComponentConfigFrame)?.tabs).to.have.length(2);

        // tab 1 component count
        const tabFirst = (formCompDefFirstTabs.config as TabFieldComponentConfigFrame)?.tabs[0];
        expect(tabFirst.component.class).to.eql("TabContentComponent");
        expect((tabFirst.component.config as TabContentFieldComponentConfigFrame)?.componentDefinitions).to.have.length(15);

        // tab 2 component count
        const tabSecond = (formCompDefFirstTabs.config as TabFieldComponentConfigFrame)?.tabs[1];
        expect(tabSecond.component.class).to.eql("TabContentComponent");
        expect((tabSecond.component.config as TabContentFieldComponentConfigFrame)?.componentDefinitions).to.have.length(2);
    });

    const cases: {
        title: string,
        args: FormConfigFrame;
        expected: FormConfigFrame | {};
    }[] = [
        {
            title: "create empty form config",
            args: {name: '', componentDefinitions: []},
            expected: {},
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
                            config: {
                                autofocus: false,
                                disabled: false,
                                editMode: true,
                                readonly: false,
                                type: "text",
                                visible: true,
                            },
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
                            config: {
                                defaultValue: [{text_1: "hello world from repeating groups"}]
                            }
                        },
                        component: {
                            class: 'RepeatableComponent',
                            config: {
                                elementTemplate: {
                                    name: "",
                                    model: {
                                        class: 'GroupModel',
                                    },
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
                                                    // elementTemplate requires role 'Admin', so repeatable is removed
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
                                                },
                                                {
                                                    // all group components are removed, so group is removed
                                                    name: "removed_group",
                                                    model: {
                                                        class: 'GroupModel', config: {defaultValue: {}}
                                                    },
                                                    component: {
                                                        class: 'GroupComponent',
                                                        config: {
                                                            wrapperCssClasses: 'col',
                                                            componentDefinitions: [
                                                                {
                                                                    // requires mode edit, so expect to be removed
                                                                    name: 'removed_group_text',
                                                                    model: {
                                                                        class: 'SimpleInputModel',
                                                                        config: {defaultValue: 'hello world 1!',}
                                                                    },
                                                                    component: {class: 'SimpleInputComponent'},
                                                                    constraints: {allowModes: ['edit']},
                                                                },
                                                            ]
                                                        }
                                                    }
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
                                autofocus: false,
                                disabled: false,
                                editMode: true,
                                readonly: false,
                                visible: true,
                                elementTemplate: {
                                    name: "",
                                    model: {class: 'GroupModel', config: {}},
                                    component: {
                                        class: 'GroupComponent',
                                        config: {
                                            autofocus: false,
                                            disabled: false,
                                            editMode: true,
                                            readonly: false,
                                            visible: true,
                                            wrapperCssClasses: 'col',
                                            componentDefinitions: [
                                                // <-- requires mode edit, so expect to be removed
                                                {
                                                    name: 'text_2',
                                                    model: {
                                                        class: 'SimpleInputModel',
                                                        config: {}
                                                    },
                                                    component: {
                                                        class: 'SimpleInputComponent',
                                                        config: {
                                                            autofocus: false,
                                                            disabled: false,
                                                            editMode: true,
                                                            readonly: false,
                                                            type: "text",
                                                            visible: true,
                                                        }
                                                    },
                                                },
                                                // <-- requires role 'Admin', so is removed
                                            ]
                                        }
                                    },
                                    layout: {
                                        class: 'RepeatableElementLayout',
                                        config: {
                                            hostCssClasses: 'row align-items-start',
                                            autofocus: false,
                                            cssClassesMap: {},
                                            disabled: false,
                                            editMode: true,
                                            helpTextVisible: false,
                                            helpTextVisibleOnInit: false,
                                            labelRequiredStr: '*',
                                            readonly: false,
                                            visible: true,
                                        }
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
                                autofocus: false,
                                cssClassesMap: {},
                                disabled: false,
                                editMode: true,
                                helpTextVisible: false,
                                helpTextVisibleOnInit: false,
                                labelRequiredStr: '*',
                                readonly: false,
                                visible: true,
                            }
                        },
                    },
                ]
            }
        }
    ];
    cases.forEach(({title, args, expected}) => {
        it(`should ${title}`, async function () {
            const constructor = new ConstructFormConfigVisitor(logger);
            const constructed = constructor.start(args, "edit");

            const visitor = new ClientFormConfigVisitor(logger);
            const actual = visitor.startNewRecord(constructed);
            expect(actual).to.eql(expected);
        });
    });

    it(`should result in an empty form config`, async function () {
        const formConfig: FormConfigFrame = {
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
                            allowRoles: ['Admin'],
                        },
                        allowModes: [],
                    },
                }
            ]
        };

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start(formConfig, "edit");

        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.startExistingRecord(constructed, "view", ["Librarian"], {metadata: {text_2: "text_2_value"}});
        expect(actual).to.eql({});
    });
});

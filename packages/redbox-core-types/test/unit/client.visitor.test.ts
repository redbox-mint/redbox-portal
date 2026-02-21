import {
    FormConfigFrame,
    TabContentFieldComponentConfigFrame, TabFieldComponentConfigFrame, FormOverride
} from "@researchdatabox/sails-ng-common";
import { ClientFormConfigVisitor } from "../../src/visitor/client.visitor";
import { ConstructFormConfigVisitor } from "../../src/visitor/construct.visitor";
import { formConfigExample1 } from "./example-data";
import { logger } from "./helpers";


let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Client Visitor", async () => {
    it(`should create full example form config`, async function () {
        const args = formConfigExample1;

        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({ data: args, formMode: "edit" });

        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({ form: constructed });

        const stringified = JSON.stringify(actual);

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
                args: { name: '', componentDefinitions: [] },
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
                    enabledValidationGroups: ["all"],
                    validators: [],
                    validationGroups: {
                        all: { description: "Validate all fields with validators.", initialMembership: "all" },
                        none: { description: "Validate none of the fields.", initialMembership: "none" },
                    },
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
                    enabledValidationGroups: ["all"],
                    validators: [],
                    validationGroups: {
                        all: { description: "Validate all fields with validators.", initialMembership: "all" },
                        none: { description: "Validate none of the fields.", initialMembership: "none" },
                    },
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
                            model: { class: "SimpleInputModel", config: {} }
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
                    componentDefinitions: [
                        {
                            name: 'text_1',
                            component: {
                                class: 'SimpleInputComponent',
                            },
                            model: {
                                class: "SimpleInputModel",
                                config: {
                                    validators: [{ class: 'required' }]
                                }
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
                                }
                            },
                            component: {
                                class: 'SimpleInputComponent',
                            },
                            expressions: [{
                                name: 'model.value',
                                config: {
                                    template: `<%= _.get(model,'text_1_event','') %>`
                                }
                            }],
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
                    enabledValidationGroups: ["all"],
                    validators: [],
                    validationGroups: {
                        all: { description: "Validate all fields with validators.", initialMembership: "all" },
                        none: { description: "Validate none of the fields.", initialMembership: "none" },
                    },
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
                            model: {
                                class: "SimpleInputModel",
                                config: {
                                    validators: [{ class: 'required' }]
                                }
                            }
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
                    componentDefinitions: [
                        {
                            name: 'repeatable_group_1',
                            model: {
                                class: 'RepeatableModel',
                                config: {
                                    defaultValue: [{
                                        text_1: "hello world from repeating groups",
                                        text_2: 'hello world 2!',
                                        repeatable_for_admin: ['hello world from repeatable for admin'],
                                        removed_group: { removed_group_text: 'hello world 1!' },
                                    }]
                                }
                            },
                            component: {
                                class: 'RepeatableComponent',
                                config: {
                                    elementTemplate: {
                                        name: "",
                                        model: {
                                            class: 'GroupModel',
                                            config: {
                                                newEntryValue: {
                                                    text_1: 'hello world 1!',
                                                    text_2: "repeatable_group_1 elementTemplate text_2 default"
                                                }
                                            },
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
                                                            config: {}
                                                        },
                                                        component: { class: 'SimpleInputComponent' },
                                                        constraints: { allowModes: ['edit'] },
                                                    },
                                                    {
                                                        name: 'text_2',
                                                        model: {
                                                            class: 'SimpleInputModel',
                                                            config: {}
                                                        },
                                                        component: { class: 'SimpleInputComponent' },
                                                    },
                                                    {
                                                        // elementTemplate requires role 'Admin', so repeatable is removed
                                                        name: 'repeatable_for_admin',
                                                        model: { class: 'RepeatableModel', config: {} },
                                                        component: {
                                                            class: 'RepeatableComponent',
                                                            config: {
                                                                elementTemplate: {
                                                                    name: "",
                                                                    model: {
                                                                        class: 'SimpleInputModel',
                                                                        config: {}
                                                                    },
                                                                    component: { class: 'SimpleInputComponent' },
                                                                    constraints: { authorization: { allowRoles: ['Admin'] } },
                                                                }
                                                            }
                                                        },
                                                    },
                                                    {
                                                        // all group components are removed, so group is removed
                                                        name: "removed_group",
                                                        model: {
                                                            class: 'GroupModel', config: {}
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
                                                                            config: {}
                                                                        },
                                                                        component: { class: 'SimpleInputComponent' },
                                                                        constraints: { allowModes: ['edit'] },
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
                                            config: { hostCssClasses: 'row align-items-start' }
                                        },
                                        // requires mode view, so is kept
                                        constraints: { authorization: { allowRoles: [] }, allowModes: ['view'] }
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
                    enabledValidationGroups: ["all"],
                    validators: [],
                    validationGroups: {
                        all: { description: "Validate all fields with validators.", initialMembership: "all" },
                        none: { description: "Validate none of the fields.", initialMembership: "none" },
                    },
                    componentDefinitions: [
                        {
                            name: 'repeatable_group_1',
                            model: {
                                class: 'RepeatableModel',
                                config: { value: [{ text_2: 'hello world 2!' }] }
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
                                        model: {
                                            class: 'GroupModel',
                                            config: {
                                                newEntryValue: {
                                                    text_2: "repeatable_group_1 elementTemplate text_2 default"
                                                }
                                            }
                                        },
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
    cases.forEach(({ title, args, expected }) => {
        it(`should ${title}`, async function () {
            const constructor = new ConstructFormConfigVisitor(logger);
            const constructed = constructor.start({ data: args, formMode: "edit" });

            const visitor = new ClientFormConfigVisitor(logger);
            const actual = visitor.start({ form: constructed });
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
        const constructed = constructor.start({
            data: formConfig,
            formMode: "edit",
            record: { text_2: "text_2_value" }
        });

        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({
            form: constructed,
            formMode: "view",
            userRoles: ["Librarian"],
        });
        expect(actual).to.eql({});
    });

    it(`should keep transformed accordion in view mode`, async function () {
        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
            formMode: "view",
            data: {
                name: "form",
                componentDefinitions: [
                    {
                        name: "main_tab",
                        component: {
                            class: "TabComponent",
                            config: {
                                tabs: [
                                    {
                                        name: "tab1",
                                        component: {
                                            class: "TabContentComponent",
                                            config: { componentDefinitions: [] }
                                        }
                                    }
                                ]
                            }
                        },
                        layout: { class: "TabLayout", config: {} }
                    }
                ]
            }
        });

        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({ form: constructed, formMode: "view" });
        expect(actual.componentDefinitions[0].component.class).to.eql("AccordionComponent");
    });

    it(`should keep tab in edit mode`, async function () {
        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
            formMode: "edit",
            data: {
                name: "form",
                componentDefinitions: [
                    {
                        name: "main_tab",
                        component: {
                            class: "TabComponent",
                            config: {
                                tabs: [
                                    {
                                        name: "tab1",
                                        component: {
                                            class: "TabContentComponent",
                                            config: { componentDefinitions: [] }
                                        }
                                    }
                                ]
                            }
                        },
                        layout: { class: "TabLayout", config: {} }
                    }
                ]
            }
        });

        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({ form: constructed, formMode: "edit" });
        expect(actual.componentDefinitions[0].component.class).to.eql("TabComponent");
    });

    it(`should transform repeatable group to content table in view mode`, async function () {
        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
            formMode: "view",
            data: {
                name: "form",
                componentDefinitions: [
                    {
                        name: "contributors",
                        component: {
                            class: "RepeatableComponent",
                            config: {
                                elementTemplate: {
                                    name: "",
                                    component: {
                                        class: "GroupComponent",
                                        config: {
                                            componentDefinitions: [
                                                {
                                                    name: "title",
                                                    component: { class: "SimpleInputComponent", config: { label: "@label.title" } },
                                                    model: { class: "SimpleInputModel", config: {} }
                                                },
                                                {
                                                    name: "tree",
                                                    component: { class: "CheckboxTreeComponent", config: { label: "@label.tree" } },
                                                    model: { class: "CheckboxTreeModel", config: {} }
                                                }
                                            ]
                                        }
                                    },
                                    model: { class: "GroupModel", config: {} }
                                }
                            }
                        },
                        model: {
                            class: "RepeatableModel",
                            config: { defaultValue: [{ title: "Alice", tree: "A" }] }
                        }
                    }
                ]
            }
        });

        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({ form: constructed, formMode: "view" });
        const transformed = actual.componentDefinitions?.[0];
        const transformedConfig = transformed?.component?.config as { template?: string } | undefined;
        expect(transformed?.component?.class).to.equal("ContentComponent");
        expect(transformedConfig?.template).to.contain("rb-view-repeatable-table");
        expect(transformedConfig?.template).to.contain('{{t "@label.title"}}');
        expect(transformedConfig?.template).to.contain('{{join (get this "tree" "") ", "}}');
    });

    it(`should force repeatable fallback layout when row contains file upload`, async function () {
        const formOverride = new FormOverride(logger);
        const transformed = formOverride.applyOverrideTransform({
            name: "attachments",
            component: {
                class: "RepeatableComponent",
                config: {
                    elementTemplate: {
                        name: "",
                        component: {
                            class: "GroupComponent",
                            config: {
                                componentDefinitions: [
                                    {
                                        name: "files",
                                        component: { class: "FileUploadComponent" }
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            model: { class: "RepeatableModel", config: { value: [{}] } }
        } as any, "view", { phase: "client" });
        const transformedConfig = transformed.component?.config as { template?: string } | undefined;
        expect(transformedConfig?.template).to.contain("rb-view-repeatable-list");
        expect(transformedConfig?.template).to.not.contain("rb-view-repeatable-table");
    });

    it(`should fallback from table layout for duplicate or empty child names`, async function () {
        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
            formMode: "view",
            data: {
                name: "form",
                componentDefinitions: [
                    {
                        name: "dup_names",
                        component: {
                            class: "RepeatableComponent",
                            config: {
                                elementTemplate: {
                                    name: "",
                                    component: {
                                        class: "GroupComponent",
                                        config: {
                                            componentDefinitions: [
                                                {
                                                    name: "dup",
                                                    component: { class: "SimpleInputComponent", config: {} },
                                                    model: { class: "SimpleInputModel", config: {} }
                                                },
                                                {
                                                    name: "dup",
                                                    component: { class: "SimpleInputComponent", config: {} },
                                                    model: { class: "SimpleInputModel", config: {} }
                                                }
                                            ]
                                        }
                                    },
                                    model: { class: "GroupModel", config: {} }
                                }
                            }
                        },
                        model: { class: "RepeatableModel", config: { defaultValue: [{ dup: "x" }] } }
                    },
                    {
                        name: "empty_name",
                        component: {
                            class: "RepeatableComponent",
                            config: {
                                elementTemplate: {
                                    name: "",
                                    component: {
                                        class: "GroupComponent",
                                        config: {
                                            componentDefinitions: [
                                                {
                                                    name: "",
                                                    component: { class: "SimpleInputComponent", config: {} },
                                                    model: { class: "SimpleInputModel", config: {} }
                                                }
                                            ]
                                        }
                                    },
                                    model: { class: "GroupModel", config: {} }
                                }
                            }
                        },
                        model: { class: "RepeatableModel", config: { defaultValue: [{}] } }
                    }
                ]
            }
        });
        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({ form: constructed, formMode: "view" });
        const firstTemplate = (actual.componentDefinitions?.[0]?.component?.config as { template?: string } | undefined)?.template ?? "";
        const secondTemplate = (actual.componentDefinitions?.[1]?.component?.config as { template?: string } | undefined)?.template ?? "";
        expect(firstTemplate).to.contain("rb-view-repeatable-list");
        expect(secondTemplate).to.contain("rb-view-repeatable-list");
    });

    it(`should transform top-level group to content in view mode`, async function () {
        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
            formMode: "view",
            data: {
                name: "form",
                componentDefinitions: [
                    {
                        name: "details",
                        component: {
                            class: "GroupComponent",
                            config: {
                                componentDefinitions: [
                                    {
                                        name: "title",
                                        component: { class: "SimpleInputComponent", config: { label: "@label.title" } },
                                        model: { class: "SimpleInputModel", config: {} }
                                    },
                                    {
                                        name: "description",
                                        component: { class: "SimpleInputComponent", config: {} },
                                        model: { class: "SimpleInputModel", config: {} }
                                    }
                                ]
                            }
                        },
                        model: { class: "GroupModel", config: { defaultValue: { title: "T", description: "D" } } }
                    }
                ]
            }
        });
        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({ form: constructed, formMode: "view" });
        const transformed = actual.componentDefinitions?.[0];
        const template = (transformed?.component?.config as { template?: string } | undefined)?.template ?? "";
        expect(transformed?.component?.class).to.equal("ContentComponent");
        expect(template).to.contain('{{t "@label.title"}}');
        expect(template).to.contain("description");
    });

    it(`should exclude role and mode disallowed descendants from generated transformed template`, async function () {
        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
            formMode: "view",
            data: {
                name: "form",
                componentDefinitions: [
                    {
                        name: "contributors",
                        component: {
                            class: "RepeatableComponent",
                            config: {
                                elementTemplate: {
                                    name: "",
                                    component: {
                                        class: "GroupComponent",
                                        config: {
                                            componentDefinitions: [
                                                {
                                                    name: "visible",
                                                    component: { class: "SimpleInputComponent", config: { label: "@label.visible" } },
                                                    model: { class: "SimpleInputModel", config: {} }
                                                },
                                                {
                                                    name: "hiddenByMode",
                                                    component: { class: "SimpleInputComponent", config: { label: "@label.hidden.mode" } },
                                                    model: { class: "SimpleInputModel", config: {} },
                                                    constraints: { allowModes: ["edit"] }
                                                },
                                                {
                                                    name: "hiddenByRole",
                                                    component: { class: "SimpleInputComponent", config: { label: "@label.hidden.role" } },
                                                    model: { class: "SimpleInputModel", config: {} },
                                                    constraints: { authorization: { allowRoles: ["Admin"] } }
                                                }
                                            ]
                                        }
                                    },
                                    model: { class: "GroupModel", config: {} }
                                }
                            }
                        },
                        model: {
                            class: "RepeatableModel",
                            config: { defaultValue: [{ visible: "A", hiddenByMode: "B", hiddenByRole: "C" }] }
                        }
                    }
                ]
            }
        });
        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({ form: constructed, formMode: "view", userRoles: ["User"] });
        const template = (actual.componentDefinitions?.[0]?.component?.config as { template?: string } | undefined)?.template ?? "";
        expect(template).to.contain("@label.visible");
        expect(template).to.not.contain("@label.hidden.mode");
        expect(template).to.not.contain("@label.hidden.role");
    });

    it(`should keep repeatable and group untransformed in edit mode`, async function () {
        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
            formMode: "edit",
            data: {
                name: "form",
                componentDefinitions: [
                    {
                        name: "top_group",
                        component: {
                            class: "GroupComponent",
                            config: {
                                componentDefinitions: [
                                    {
                                        name: "group_field",
                                        component: { class: "SimpleInputComponent", config: {} },
                                        model: { class: "SimpleInputModel", config: {} }
                                    }
                                ]
                            }
                        },
                        model: { class: "GroupModel", config: {} }
                    },
                    {
                        name: "top_repeatable",
                        component: {
                            class: "RepeatableComponent",
                            config: {
                                elementTemplate: {
                                    name: "",
                                    component: { class: "SimpleInputComponent", config: {} },
                                    model: { class: "SimpleInputModel", config: {} }
                                }
                            }
                        },
                        model: { class: "RepeatableModel", config: {} }
                    }
                ]
            }
        });
        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({ form: constructed, formMode: "edit" });
        const classesByName = new Map((actual.componentDefinitions ?? []).map(item => [item.name, item.component.class]));
        expect(classesByName.get("top_group")).to.equal("GroupComponent");
        expect(classesByName.get("top_repeatable")).to.equal("RepeatableComponent");
    });

    it(`should extract child values into group content in view mode`, async function () {
        const constructor = new ConstructFormConfigVisitor(logger);
        const constructed = constructor.start({
            formMode: "view",
            data: {
                name: "form",
                componentDefinitions: [
                    {
                        name: "contributor_ci",
                        component: {
                            class: "GroupComponent",
                            config: {
                                componentDefinitions: [
                                    {
                                        name: "name",
                                        component: { class: "SimpleInputComponent", config: {} },
                                        model: { class: "SimpleInputModel", config: { defaultValue: "Brazz" } }
                                    },
                                    {
                                        name: "email",
                                        component: { class: "SimpleInputComponent", config: {} },
                                        model: { class: "SimpleInputModel", config: { defaultValue: "b@b.com" } }
                                    },
                                    {
                                        name: "orcid",
                                        component: { class: "SimpleInputComponent", config: {} },
                                        // Demonstrate the case where value properties might be pruned/absent
                                        model: { class: "SimpleInputModel", config: {} }
                                    }
                                ]
                            }
                        },
                        model: { class: "GroupModel", config: {} }
                    }
                ]
            }
        });

        // The construct visitor would normally wipe out `undefined` properties for `value` on simple inputs
        // Client visitor may also prune things.
        const visitor = new ClientFormConfigVisitor(logger);
        const actual = visitor.start({ form: constructed, formMode: "view" });
        const transformed = actual.componentDefinitions?.[0];

        expect(transformed?.component?.class).to.equal("ContentComponent");
        const content = (transformed?.component?.config as { content?: Record<string, string> } | undefined)?.content;

        expect(content).to.exist;
        expect(content?.name).to.equal("Brazz");
        expect(content?.email).to.equal("b@b.com");
        // ORCID lacked a defaultValue, so it should remain undefined.
        expect(content?.orcid).to.equal(undefined);
    });
});

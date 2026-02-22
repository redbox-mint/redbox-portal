import {
    FormConfig,
    FormConfigFrame, FormModesConfig, ReusableFormDefinitions,
} from "@researchdatabox/sails-ng-common";
import { ConstructFormConfigVisitor } from "../../src/visitor/construct.visitor";
import { formConfigExample2, reusableDefinitionsExample1 } from "./example-data";
import { logger } from "./helpers";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Construct Visitor", async () => {
    describe("basic constructing", async () => {
        const cases: {
            title: string,
            args: FormConfigFrame;
            expected: FormConfigFrame;
        }[] = [
                {
                    title: "create empty item",
                    args: { name: '', componentDefinitions: [] },
                    expected: new FormConfig(),
                },
                {
                    title: "create item with expressions",
                    args: {
                        name: 'form-with-expressions',
                        componentDefinitions: [],
                        expressions: [{
                            name: 'my-expressions',
                            config: {
                                template: "some expression"
                            }
                        }]
                    },
                    expected: {
                        name: 'form-with-expressions',
                        componentDefinitions: [],
                        expressions: [{
                            name: 'my-expressions',
                            config: {
                                template: "some expression"
                            }
                        }]
                    },
                },
                {
                    title: "create simple example",
                    args: {
                        name: '',
                        componentDefinitions: [
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
                                            name: "",
                                            model: {
                                                class: 'GroupModel',
                                                config: {
                                                    newEntryValue: { text_3: 'hello world 3!' },
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
                                                                    validators: [
                                                                        {
                                                                            class: 'minLength',
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
                            }
                        ]
                    },
                    expected: {
                        name: '',
                        componentDefinitions: [
                            {
                                name: 'repeatable_group_1',
                                model: {
                                    class: 'RepeatableModel',
                                    config: {
                                        value: [{ text_3: "hello world from repeating groups" }]
                                    }
                                },
                                component: {
                                    class: 'RepeatableComponent',
                                    config: {
                                        elementTemplate: {
                                            // first group component
                                            name: "",
                                            model: {
                                                class: 'GroupModel',
                                                config: {}
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
                                                                    validators: [
                                                                        {
                                                                            class: 'minLength',
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
                            }
                        ]
                    },
                },
            ];
        cases.forEach(({ title, args, expected }) => {
            it(`should ${title}`, async function () {
                const visitor = new ConstructFormConfigVisitor(logger);
                const actual = visitor.start({ data: args, formMode: "edit" });
                expect(actual).to.deep.include({ name: expected.name });

                const expectedDefs = expected.componentDefinitions ?? [];
                const actualDefs = actual.componentDefinitions ?? [];
                expect(actualDefs).to.have.lengthOf(expectedDefs.length);
                expect(actualDefs.map(componentDef => componentDef.name))
                    .to.deep.include.members(expectedDefs.map(componentDef => componentDef.name));
                expect(actualDefs.map(componentDef => componentDef.component.class))
                    .to.deep.include.members(expectedDefs.map(componentDef => componentDef.component.class));

                expectedDefs.forEach((componentDef, index) => {
                    if (componentDef.layout?.config) {
                        expect(actualDefs[index]?.layout?.config).to.deep.include(componentDef.layout.config);
                    }
                });
            });
        });

        it("should retain checkbox tree labelTemplate config", async function () {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "edit",
                data: {
                    name: "test",
                    componentDefinitions: [
                        {
                            name: "anzsrc",
                            component: {
                                class: "CheckboxTreeComponent",
                                config: {
                                    vocabRef: "anzsrc-2020-for",
                                    labelTemplate: "{{default (split notation '/' -1) notation}} - {{label}}"
                                }
                            },
                            model: { class: "CheckboxTreeModel", config: {} }
                        }
                    ]
                }
            });

            const checkboxTreeConfig = actual.componentDefinitions?.[0]?.component?.config as Record<string, unknown> | undefined;
            expect(checkboxTreeConfig?.labelTemplate).to.equal("{{default (split notation '/' -1) notation}} - {{label}}");
        });

        it("should set typeahead namedQuery defaults and cache behaviour", async function () {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "edit",
                data: {
                    name: "test",
                    componentDefinitions: [
                        {
                            name: "contributor_lookup",
                            component: {
                                class: "TypeaheadInputComponent",
                                config: {
                                    sourceType: "namedQuery",
                                    queryId: "contributors"
                                }
                            },
                            model: { class: "TypeaheadInputModel", config: {} }
                        }
                    ]
                }
            });
            const cfg = actual.componentDefinitions?.[0]?.component?.config as Record<string, unknown>;
            expect(cfg?.sourceType).to.equal("namedQuery");
            expect(cfg?.labelField).to.equal("label");
            expect(cfg?.valueField).to.equal("value");
            expect(cfg?.cacheResults).to.equal(false);
        });

        it("should normalize repeatable elementTemplate layout to RepeatableElementLayout", async function () {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "edit",
                data: {
                    name: "repeatable-layout-normalization",
                    componentDefinitions: [
                        {
                            name: "keywords",
                            component: {
                                class: "RepeatableComponent",
                                config: {
                                    elementTemplate: {
                                        name: "",
                                        component: { class: "SimpleInputComponent" },
                                        model: { class: "SimpleInputModel", config: {} },
                                        layout: { class: "DefaultLayout", config: {} }
                                    }
                                }
                            },
                            model: { class: "RepeatableModel", config: { defaultValue: ["a"] } },
                            layout: { class: "DefaultLayout", config: {} }
                        }
                    ]
                }
            });
            const repeatable = actual.componentDefinitions?.[0];
            const elementLayoutClass = (repeatable?.component?.config as any)?.elementTemplate?.layout?.class;
            expect(elementLayoutClass).to.equal("RepeatableElementLayout");
        });

        it("should drop unsupported map enabledModes and preserve valid modes", async function () {
            const warnings: string[] = [];
            const testLogger = {
                ...logger,
                warn: (message: unknown) => warnings.push(String(message ?? ""))
            };
            const visitor = new ConstructFormConfigVisitor(testLogger);
            const actual = visitor.start({
                formMode: "edit",
                data: {
                    name: "test",
                    componentDefinitions: [
                        {
                            name: "map_coverage",
                            component: {
                                class: "MapComponent",
                                config: {
                                    enabledModes: ["point", "polygon", "bad-mode" as any, "rectangle"]
                                }
                            },
                            model: {
                                class: "MapModel",
                                config: {}
                            }
                        }
                    ]
                }
            });

            const mapConfig = actual.componentDefinitions?.[0]?.component?.config as Record<string, unknown>;
            const enabledModes = mapConfig?.enabledModes as string[];
            expect(enabledModes).to.deep.equal(["point", "polygon", "rectangle"]);
            expect(warnings.some((msg) => msg.includes("Map construct dropped unsupported enabledModes"))).to.equal(true);
        });
    });
    describe("with overrides", async () => {
        const cases: {
            title: string,
            args: {
                reusableFormDefs: ReusableFormDefinitions,
                formConfig: FormConfigFrame,
                formMode?: FormModesConfig
            };
            expected: FormConfigFrame;
        }[] = [
                {
                    title: "expand reusable form config to standard form config in view mode",
                    args: {
                        reusableFormDefs: reusableDefinitionsExample1,
                        formConfig: formConfigExample2,
                        formMode: "view",
                    },
                    expected: {
                        name: "default-1.0-draft",
                        componentDefinitions: [
                            { name: "contributor_ci_name", component: { class: "ContentComponent" } },
                            { name: "contributor_data_manager_email", component: { class: "ContentComponent" } },
                            {
                                name: "orcid",
                                component: {
                                    class: "GroupComponent",
                                    config: {
                                        componentDefinitions: [
                                            { name: "orcid_nested_example1", component: { class: "ContentComponent" } }
                                        ]
                                    }
                                }
                            },
                            { name: "contributor_data_manager2", component: { class: "SimpleInputComponent" } },
                        ]
                    },
                },
                {
                    title: "expand reusable form config to standard form config in edit mode",
                    args: {
                        reusableFormDefs: reusableDefinitionsExample1,
                        formConfig: formConfigExample2,
                        formMode: "edit",
                    },
                    expected: {
                        name: "default-1.0-draft",
                        componentDefinitions: [
                            { name: "contributor_ci_name", component: { class: "SimpleInputComponent" } },
                            { name: "contributor_data_manager_email", component: { class: "SimpleInputComponent" } },
                            {
                                name: "orcid",
                                component: {
                                    class: "GroupComponent",
                                    config: {
                                        componentDefinitions: [
                                            { name: "orcid_nested_example1", component: { class: "ContentComponent" } }
                                        ]
                                    }
                                }
                            },
                            { name: "contributor_data_manager2", component: { class: "SimpleInputComponent" } },
                        ]
                    },
                },
            ];
        cases.forEach(({ title, args, expected }) => {
            it(`should ${title}`, async function () {
                const visitor = new ConstructFormConfigVisitor(logger);
                const actual = visitor.start({
                    data: args.formConfig,
                    formMode: args.formMode,
                    reusableFormDefs: args.reusableFormDefs
                });
                expect(actual).to.deep.include({ name: expected.name });

                const expectedDefs = expected.componentDefinitions ?? [];
                const actualDefs = actual.componentDefinitions ?? [];
                expect(actualDefs).to.have.lengthOf(expectedDefs.length);
                expect(actualDefs.map(componentDef => componentDef.name))
                    .to.deep.include.members(expectedDefs.map(componentDef => componentDef.name));
                expect(actualDefs.map(componentDef => componentDef.component.class))
                    .to.deep.include.members(expectedDefs.map(componentDef => componentDef.component.class));

                const expectedOrcidConfig = expectedDefs.find(componentDef => componentDef.name === "orcid")
                    ?.component?.config as { componentDefinitions?: Array<{ name: string, component: { class: string } }> } | undefined;
                const actualOrcidConfig = actualDefs.find(componentDef => componentDef.name === "orcid")
                    ?.component?.config as { componentDefinitions?: Array<{ name: string, component: { class: string } }> } | undefined;
                const expectedOrcidNested = expectedOrcidConfig?.componentDefinitions ?? [];
                const actualOrcidNested = actualOrcidConfig?.componentDefinitions ?? [];

                if (expectedOrcidNested.length > 0) {
                    expect(actualOrcidNested.map((componentDef: { name: string }) => componentDef.name))
                        .to.deep.include.members(expectedOrcidNested.map(componentDef => componentDef.name));
                    expect(actualOrcidNested.map((componentDef: { component: { class: string } }) => componentDef.component.class))
                        .to.deep.include.members(expectedOrcidNested.map(componentDef => componentDef.component.class));
                }
            });
        });
    });
    describe("expected errors", async () => {
        it("should fail when duplicate expression name is found", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);
                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                name: "comp1",
                                component: { class: "SimpleInputComponent" },
                                expressions: [
                                    { name: "exp1", config: { template: '' } },
                                    { name: "exp1", config: { template: '' } }
                                ]
                            }
                        ]
                    }
                });
            };
            expect(errorFunc).to.throw(Error, 'Duplicate name in expression: exp1');
        });
        it("should fail when repeatable elementTemplate is invalid", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);
                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                name: "repeatable_test",
                                component: {
                                    class: 'RepeatableComponent',
                                    config: {
                                        elementTemplate: {
                                            name: "",
                                            component: { class: "ReusableComponent" },
                                            overrides: { reusableFormName: "standard-contributor-field" },
                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error, `Repeatable element template overrides must result in exactly one item, got 3`);
        });
        it("should fail when repeatable elementTemplate has defaultValue", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);
                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                name: "repeatable_test",
                                component: {
                                    class: 'RepeatableComponent',
                                    config: {
                                        elementTemplate: {
                                            name: "",
                                            component: { class: "SimpleInputComponent" },
                                            model: { class: "SimpleInputModel", config: { defaultValue: "not allowed" } }
                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error, "Set the repeatable elementTemplate new item default using 'elementTemplate.model.config.newEntryValue', not 'elementTemplate.model.config.defaultValue', set the repeatable default in 'repeatable.model.config.defaultValue'");
        });
        it("should fail when repeatable elementTemplate has descendant with defaultValue", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);
                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                name: "repeatable_test",
                                component: {
                                    class: 'RepeatableComponent',
                                    config: {
                                        elementTemplate: {
                                            name: "",
                                            component: {
                                                class: "GroupComponent", config: {
                                                    componentDefinitions: [
                                                        {
                                                            name: "text_1",
                                                            component: { class: "SimpleInputComponent" },
                                                            model: {
                                                                class: "SimpleInputModel",
                                                                config: { defaultValue: "not allowed" }
                                                            }
                                                        }
                                                    ]
                                                }
                                            },

                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error, "Set the repeatable elementTemplate descendant component new item default using 'elementTemplate.model.config.newEntryValue', set the repeatable default in 'repeatable.model.config.defaultValue', not the descendant components");
        });
        it("should fail when component class is not available", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);

                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                name: "repeatable_test",
                                component: {
                                    // Use ts-ignore to easily specify an incorrect class name.
                                    // @ts-ignore
                                    class: 'NotAClass',
                                    config: {
                                        elementTemplate: {
                                            name: "",
                                            component: { class: "ReusableComponent" },
                                            overrides: { reusableFormName: "standard-contributor-field" },
                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error, "Could not find class for form component class name 'NotAClass'");
        });
        it("should fail when form component is invalid", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);

                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            // Use ts-ignore to easily specify an incorrect component.
                            // @ts-ignore
                            {
                                component: {
                                    class: 'RepeatableComponent',
                                    config: {
                                        elementTemplate: {
                                            name: "",
                                            component: { class: "ReusableComponent" },
                                            overrides: { reusableFormName: "standard-contributor-field" },
                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error);
        });
        it("should fail when override has both reusable form name and other property", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);

                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                name: "a_name",
                                component: {
                                    class: 'RepeatableComponent',
                                    config: {
                                        elementTemplate: {
                                            name: "",
                                            component: { class: "ReusableComponent" },
                                            overrides: {
                                                reusableFormName: "standard-contributor-field",
                                                replaceName: "new_name"
                                            },
                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error, "Invalid usage of reusable form config. " +
                "Override for component name '' class 'ReusableComponent' must contain only 'reusableFormName', " +
                "it cannot be combined with other properties '{\"reusableFormName\":\"standard-contributor-field\",\"replaceName\":\"new_name\"}'");
        });
        it("should fail when override for reusable form is invalid", async () => {
            const errorFunc1 = function () {
                const visitor = new ConstructFormConfigVisitor(logger);

                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                name: "a_name",
                                component: {
                                    class: 'RepeatableComponent',
                                    config: {
                                        elementTemplate: {
                                            name: "",
                                            component: { class: "ReusableComponent" },
                                            overrides: {
                                                reusableFormName: "standard-contributor",
                                                replaceName: "new_name"
                                            },
                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc1).to.throw(Error, "Invalid usage of reusable form config. Component class 'ReusableComponent' must be 'ReusableComponent' and reusableFormName");

            const errorFunc2 = function () {
                const visitor = new ConstructFormConfigVisitor(logger);

                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                name: "a_name",
                                component: {
                                    class: 'RepeatableComponent',
                                    config: {
                                        elementTemplate: {
                                            name: "",
                                            component: { class: "TextAreaComponent" },
                                            overrides: {
                                                reusableFormName: "standard-contributor-field",
                                                replaceName: "new_name"
                                            },
                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc2).to.throw(Error, "Invalid usage of reusable form config. Component class 'TextAreaComponent' must be 'ReusableComponent' and reusableFormName");
        });
        it("should fail when override reusable form config tries to override a component that does not exist", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);

                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                overrides: { reusableFormName: "standard-contributor-field" },
                                name: "one",
                                component: {
                                    class: "ReusableComponent",
                                    config: {
                                        componentDefinitions: [
                                            {
                                                name: "a_name",
                                                component: {
                                                    class: 'SimpleInputComponent',
                                                    config: {}
                                                },
                                            }
                                        ]
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error, "Invalid usage of reusable form config. " +
                "Each item in the ReusableComponent componentDefinitions must have a name that matches an item in the reusable form config 'standard-contributor-field'. " +
                "Names 'a_name' did not match any reusable form config items. Available names ");
        });
        it("should fail when override reusable form config override does not have unique names", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);

                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                overrides: { reusableFormName: "standard-contributor-field" },
                                name: "one",
                                component: {
                                    class: "ReusableComponent",
                                    config: {
                                        componentDefinitions: [
                                            {
                                                name: "name",
                                                component: {
                                                    class: 'SimpleInputComponent',
                                                    config: {}
                                                },
                                            },
                                            {
                                                name: "name",
                                                component: {
                                                    class: 'SimpleInputComponent',
                                                    config: {}
                                                },
                                            }
                                        ]
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            }
                ;
            expect(errorFunc).to.throw(Error, "Invalid usage of reusable form config. " +
                "Each item in the ReusableComponent componentDefinitions must have a unique name. " +
                "These names were not unique 'name'.");
        });
        it("should fail when reusable form config override tries to change the class name in the component definition", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);

                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                overrides: { reusableFormName: "standard-contributor-field" },
                                name: "one",
                                component: {
                                    class: "ReusableComponent",
                                    config: {
                                        componentDefinitions: [
                                            {
                                                name: "name",
                                                component: {
                                                    class: 'CheckboxInputComponent',
                                                    config: { options: [] }
                                                },
                                            },
                                        ]
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error, "Invalid usage of reusable form config. " +
                "The class must match the reusable form config. " +
                "To change the class, use 'formModeClasses'. " +
                "The component class in reusable form config 'standard-contributor-field' item 'name' is 'SimpleInputComponent' given class was 'CheckboxInputComponent'");
        });
    });
    describe("model data special cases", async () => {
        it("should populate content component from record", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "content1",
                            component: {
                                class: 'ContentComponent',
                                config: {
                                    template: '<h1>{{model}}</h1>'
                                }
                            }
                        }
                    ]
                },
                formMode: "edit",
                reusableFormDefs: reusableDefinitionsExample1,
                record: { content1: "some value" }
            });
            const expected: FormConfigFrame = {
                name: "form",
                componentDefinitions: [
                    {
                        name: "content1",
                        component: {
                            class: 'ContentComponent',
                            config: {
                                template: '<h1>{{model}}</h1>'
                            }
                        },
                    }
                ]
            };
            expect(actual).to.deep.include({ name: expected.name });
            expect(actual.componentDefinitions[0]).to.deep.include({ name: "content1" });
            expect(actual.componentDefinitions[0].component).to.deep.include({ class: "ContentComponent" });
            expect(actual.componentDefinitions[0].component.config).to.deep.include({
                template: '<h1>{{model}}</h1>'
            });
        });
        it("should populate transformed content component from record", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "component_1",
                            component: {
                                class: 'CheckboxInputComponent',
                                config: {
                                    options: [
                                        { label: 'Option 1', value: 'option1' },
                                        { label: 'Option 2', value: 'option2' },
                                        { label: 'Option 3', value: 'option3' },
                                    ]
                                }
                            },
                            model: {
                                class: "CheckboxInputModel",
                                config: {
                                    defaultValue: ['option1', 'option2'],
                                }
                            }
                        },
                        {
                            name: "component_2",
                            component: {
                                class: 'CheckboxInputComponent',
                                config: {
                                    options: [
                                        { label: 'Option 1', value: 'option1' },
                                        { label: 'Option 2', value: 'option2' },
                                        { label: 'Option 3', value: 'option3' },
                                    ]
                                }
                            },
                            model: {
                                class: "CheckboxInputModel",
                                config: {
                                    defaultValue: ['option1', 'option3'],
                                }
                            }
                        }
                    ]
                },
                formMode: "view",
                reusableFormDefs: reusableDefinitionsExample1,
                record: { component_1: ['option3'], component_2: ['option2', 'option3'] }
            });
            const expected = {
                name: "form",
                componentDefinitions: [
                    {
                        // One value
                        name: "component_1",
                        component: {
                            class: 'ContentComponent',
                            config: {
                                content: { label: 'Option 3', value: 'option3' },
                                template: `<span data-value="{{content.value}}">{{content.label}}</span>`
                            }
                        },
                    },
                    {
                        // More than one value
                        name: "component_2",
                        component: {
                            class: 'ContentComponent',
                            config: {
                                content: [{ label: 'Option 2', value: 'option2' }, { label: 'Option 3', value: 'option3' }],
                                template: `<ul>{{#each content}}<li data-value="{{this.value}}">{{this.label}}</li>{{/each}}</ul>`
                            }
                        },
                    }
                ]
            };
            expect(actual).to.deep.include({ name: expected.name });
            expect(actual.componentDefinitions[0]).to.deep.include({ name: "component_1" });
            expect(actual.componentDefinitions[0].component).to.deep.include({ class: "ContentComponent" });
            expect(actual.componentDefinitions[0].component.config).to.deep.include({
                content: { label: 'Option 3', value: 'option3' },
                template: `<span data-value="{{content.value}}">{{content.label}}</span>`
            });

            expect(actual.componentDefinitions[1]).to.deep.include({ name: "component_2" });
            expect(actual.componentDefinitions[1].component).to.deep.include({ class: "ContentComponent" });
            expect(actual.componentDefinitions[1].component.config).to.deep.include({
                content: [{ label: 'Option 2', value: 'option2' }, { label: 'Option 3', value: 'option3' }],
                template: `<ul>{{#each content}}<li data-value="{{this.value}}">{{this.label}}</li>{{/each}}</ul>`
            });
        });
    });
    describe("accordion transformations", async () => {
        it("should transform tab to accordion in view mode", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
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
                                            name: "tab_one",
                                            layout: { class: "TabContentLayout", config: { buttonLabel: "Tab One" } },
                                            component: {
                                                class: "TabContentComponent",
                                                config: { componentDefinitions: [] }
                                            }
                                        }
                                    ] as any
                                }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const transformed = actual.componentDefinitions[0];
            expect(transformed.component.class).to.equal("AccordionComponent");
            expect(transformed.layout?.class).to.equal("AccordionLayout");
            expect((transformed.component.config as any)?.startingOpenMode).to.equal("all-open");
            expect((transformed.component.config as any)?.panels?.length).to.equal(1);
            expect((transformed.component.config as any)?.panels?.[0]?.layout?.config?.buttonLabel).to.equal("Tab One");
        });

        it("should transform empty tabs to accordion with zero panels in view mode", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "view",
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "main_tab",
                            component: {
                                class: "TabComponent",
                                config: { tabs: [] }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const transformed = actual.componentDefinitions[0];
            expect(transformed.component.class).to.equal("AccordionComponent");
            expect(((transformed.component.config as any)?.panels ?? []).length).to.equal(0);
        });

        it("should apply transformed panel label fallback chain", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
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
                                            name: "tab_with_button_label",
                                            layout: { class: "TabContentLayout", config: { buttonLabel: "Button Label" } },
                                            component: { class: "TabContentComponent", config: { componentDefinitions: [] } }
                                        },
                                        {
                                            name: "tab_with_name_only",
                                            component: { class: "TabContentComponent", config: { componentDefinitions: [] } }
                                        },
                                        {
                                            name: "",
                                            component: { class: "TabContentComponent", config: { componentDefinitions: [] } }
                                        }
                                    ]
                                }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const panels = ((actual.componentDefinitions[0].component.config as any)?.panels ?? []);
            expect(panels.length).to.equal(3);
            expect(panels[0]?.layout?.config?.buttonLabel).to.equal("Button Label");
            expect(panels[1]?.layout?.config?.buttonLabel).to.equal("tab_with_name_only");
            expect(panels[2]?.layout?.config?.buttonLabel).to.equal("2");
        });

        it("should skip malformed transformed tabs with warning in view mode", async () => {
            const warnings: string[] = [];
            const testLogger = {
                ...logger,
                warn: (message: unknown) => warnings.push(String(message ?? ""))
            };
            const visitor = new ConstructFormConfigVisitor(testLogger);
            const actual = visitor.start({
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
                                        { name: "tab_valid", component: { class: "TabContentComponent", config: { componentDefinitions: [] } } },
                                        // @ts-ignore - intentionally invalid to assert warning+skip behavior
                                        { name: "tab_invalid", component: { class: "SimpleInputComponent", config: {} } }
                                    ] as any
                                }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const panels = ((actual.componentDefinitions[0].component.config as any)?.panels ?? []);
            expect(panels.length).to.equal(1);
            expect(warnings.some(msg => msg.includes("Invalid TabContentComponent entry skipped"))).to.equal(true);
        });

        it("should keep tab in edit mode", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "edit",
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "main_tab",
                            component: {
                                class: "TabComponent",
                                config: { tabs: [] }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            expect(actual.componentDefinitions[0].component.class).to.equal("TabComponent");
        });

        it("should construct direct accordion with default startingOpenMode", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "view",
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "main_accordion",
                            component: {
                                class: "AccordionComponent",
                                config: {
                                    panels: [
                                        {
                                            name: "panel_one",
                                            component: {
                                                class: "AccordionPanelComponent",
                                                config: { componentDefinitions: [] }
                                            },
                                            layout: { class: "AccordionPanelLayout", config: {} }
                                        }
                                    ]
                                }
                            },
                            layout: { class: "AccordionLayout", config: {} }
                        }
                    ]
                }
            });

            expect(actual.componentDefinitions[0].component.class).to.equal("AccordionComponent");
            expect((actual.componentDefinitions[0].component.config as any)?.startingOpenMode).to.equal("all-open");
        });

        it("should skip malformed tab entries with warning", async () => {
            const warnings: string[] = [];
            const testLogger = {
                ...logger,
                warn: (message: unknown) => warnings.push(String(message ?? ""))
            };

            const visitor = new ConstructFormConfigVisitor(testLogger);
            const actual = visitor.start({
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
                                            name: "tab_valid",
                                            component: {
                                                class: "TabContentComponent",
                                                config: { componentDefinitions: [] }
                                            }
                                        },
                                        {
                                            // @ts-ignore
                                            name: "invalid_tab",
                                            component: { class: "SimpleInputComponent", config: {} }
                                        }
                                    ] as any
                                }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const tabs = (actual.componentDefinitions[0].component.config as any)?.tabs ?? [];
            expect(tabs.length).to.equal(1);
            expect(warnings.some(msg => msg.includes("Invalid TabContentComponent entry skipped"))).to.equal(true);
        });
    });
    describe("accordion transformations", async () => {
        it("should transform tab to accordion in view mode", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
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
                                            name: "tab_one",
                                            layout: { class: "TabContentLayout", config: { buttonLabel: "Tab One" } },
                                            component: {
                                                class: "TabContentComponent",
                                                config: { componentDefinitions: [] }
                                            }
                                        }
                                    ] as any
                                }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const transformed = actual.componentDefinitions[0];
            expect(transformed.component.class).to.equal("AccordionComponent");
            expect(transformed.layout?.class).to.equal("AccordionLayout");
            expect((transformed.component.config as any)?.startingOpenMode).to.equal("all-open");
            expect((transformed.component.config as any)?.panels?.length).to.equal(1);
            expect((transformed.component.config as any)?.panels?.[0]?.layout?.config?.buttonLabel).to.equal("Tab One");
        });

        it("should transform empty tabs to accordion with zero panels in view mode", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "view",
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "main_tab",
                            component: {
                                class: "TabComponent",
                                config: { tabs: [] }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const transformed = actual.componentDefinitions[0];
            expect(transformed.component.class).to.equal("AccordionComponent");
            expect(((transformed.component.config as any)?.panels ?? []).length).to.equal(0);
        });

        it("should apply transformed panel label fallback chain", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
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
                                            name: "tab_with_button_label",
                                            layout: { class: "TabContentLayout", config: { buttonLabel: "Button Label" } },
                                            component: { class: "TabContentComponent", config: { componentDefinitions: [] } }
                                        },
                                        {
                                            name: "tab_with_name_only",
                                            component: { class: "TabContentComponent", config: { componentDefinitions: [] } }
                                        },
                                        {
                                            name: "",
                                            component: { class: "TabContentComponent", config: { componentDefinitions: [] } }
                                        }
                                    ]
                                }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const panels = ((actual.componentDefinitions[0].component.config as any)?.panels ?? []);
            expect(panels.length).to.equal(3);
            expect(panels[0]?.layout?.config?.buttonLabel).to.equal("Button Label");
            expect(panels[1]?.layout?.config?.buttonLabel).to.equal("tab_with_name_only");
            expect(panels[2]?.layout?.config?.buttonLabel).to.equal("2");
        });

        it("should skip malformed transformed tabs with warning in view mode", async () => {
            const warnings: string[] = [];
            const testLogger = {
                ...logger,
                warn: (message: unknown) => warnings.push(String(message ?? ""))
            };
            const visitor = new ConstructFormConfigVisitor(testLogger);
            const actual = visitor.start({
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
                                        { name: "tab_valid", component: { class: "TabContentComponent", config: { componentDefinitions: [] } } },
                                        // @ts-ignore - intentionally invalid to assert warning+skip behavior
                                        { name: "tab_invalid", component: { class: "SimpleInputComponent", config: {} } }
                                    ] as any
                                }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const panels = ((actual.componentDefinitions[0].component.config as any)?.panels ?? []);
            expect(panels.length).to.equal(1);
            expect(warnings.some(msg => msg.includes("Invalid TabContentComponent entry skipped"))).to.equal(true);
        });

        it("should keep tab in edit mode", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "edit",
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "main_tab",
                            component: {
                                class: "TabComponent",
                                config: { tabs: [] }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            expect(actual.componentDefinitions[0].component.class).to.equal("TabComponent");
        });

        it("should construct direct accordion with default startingOpenMode", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "view",
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "main_accordion",
                            component: {
                                class: "AccordionComponent",
                                config: {
                                    panels: [
                                        {
                                            name: "panel_one",
                                            component: {
                                                class: "AccordionPanelComponent",
                                                config: { componentDefinitions: [] }
                                            },
                                            layout: { class: "AccordionPanelLayout", config: {} }
                                        }
                                    ]
                                }
                            },
                            layout: { class: "AccordionLayout", config: {} }
                        }
                    ]
                }
            });

            expect(actual.componentDefinitions[0].component.class).to.equal("AccordionComponent");
            expect((actual.componentDefinitions[0].component.config as any)?.startingOpenMode).to.equal("all-open");
        });

        it("should skip malformed tab entries with warning", async () => {
            const warnings: string[] = [];
            const testLogger = {
                ...logger,
                warn: (message: unknown) => warnings.push(String(message ?? ""))
            };

            const visitor = new ConstructFormConfigVisitor(testLogger);
            const actual = visitor.start({
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
                                            name: "tab_valid",
                                            component: {
                                                class: "TabContentComponent",
                                                config: { componentDefinitions: [] }
                                            }
                                        },
                                        {
                                            // @ts-ignore
                                            name: "invalid_tab",
                                            component: { class: "SimpleInputComponent", config: {} }
                                        }
                                    ] as any
                                }
                            },
                            layout: { class: "TabLayout", config: {} }
                        }
                    ]
                }
            });

            const tabs = (actual.componentDefinitions[0].component.config as any)?.tabs ?? [];
            expect(tabs.length).to.equal(1);
            expect(warnings.some(msg => msg.includes("Invalid TabContentComponent entry skipped"))).to.equal(true);
        });
    });
    describe("repeatable special cases", async () => {
        it("should use reusable view fragments for construct-phase leaf transforms", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const reusableFormDefs: ReusableFormDefinitions = {
                "view-template-leaf-plain": [
                    {
                        name: "custom_leaf_plain",
                        component: {
                            class: "ContentComponent",
                            config: { template: "<span class=\"custom-leaf\">{{content}}</span>" }
                        }
                    }
                ]
            };
            const actual = visitor.start({
                formMode: "view",
                reusableFormDefs,
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "title",
                            component: { class: "SimpleInputComponent", config: {} },
                            model: { class: "SimpleInputModel", config: { defaultValue: "Alpha" } }
                        }
                    ]
                }
            });
            const transformed = actual.componentDefinitions[0];
            const template = (transformed.component?.config as { template?: string } | undefined)?.template ?? "";
            expect(transformed.component.class).to.equal("ContentComponent");
            expect(template).to.contain("custom-leaf");
        });

        it("should keep top-level repeatable and group untransformed in view mode during construct phase", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "view",
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "top_group",
                            component: {
                                class: "GroupComponent",
                                config: { componentDefinitions: [] }
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
            expect(actual.componentDefinitions[0].component.class).to.equal("GroupComponent");
            expect(actual.componentDefinitions[1].component.class).to.equal("RepeatableComponent");
        });

        it("should set model values as expected", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "view",
                reusableFormDefs: reusableDefinitionsExample1,
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "group_1",
                            component: {
                                class: "GroupComponent",
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: "component_1",
                                            component: {
                                                class: 'RepeatableComponent',
                                                config: {
                                                    elementTemplate: {
                                                        name: "",
                                                        component: {
                                                            class: "SimpleInputComponent"
                                                        },
                                                        model: {
                                                            class: "SimpleInputModel",
                                                            config: {
                                                                newEntryValue: "text_default",
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                            model: {
                                                class: "RepeatableModel",
                                                config: {
                                                    defaultValue: ["text_1", "text_2"]
                                                }
                                            }
                                        }
                                    ]
                                }
                            },
                            model: {
                                class: "GroupModel",
                                config: {
                                    defaultValue: { component_1: ["group_rpt_1", "group_rpt_2"] }
                                }
                            }
                        }
                    ]
                },
            });
            const expected: FormConfigFrame = {
                name: "form",
                componentDefinitions: [
                    {
                        name: "group_1",
                        component: {
                            class: "GroupComponent",
                            config: {
                                componentDefinitions: [
                                    {
                                        name: "component_1",
                                        component: {
                                            class: 'RepeatableComponent',
                                            config: {
                                                elementTemplate: {
                                                    name: "",
                                                    component: {
                                                        class: "ContentComponent",
                                                        config: {}
                                                    },
                                                }
                                            }
                                        },
                                        model: {
                                            class: "RepeatableModel",
                                            config: {
                                                // This value is from the default for the repeatable.
                                                // The form UI will load with these 2 entries in the repeatable.
                                                value: ["text_1", "text_2"]
                                            }
                                        }
                                    }
                                ]
                            }
                        },
                        model: {
                            class: "GroupModel",
                            config: {
                                // The group's default value in the form config was overridden by descendant default values.
                                value: { component_1: ["text_1", "text_2"] },
                            }
                        }
                    }
                ]
            };
            expect(actual).to.deep.include({ name: expected.name });
            const groupDef = actual.componentDefinitions[0];
            expect(groupDef).to.not.equal(undefined);
            expect(groupDef).to.deep.include({ name: "group_1" });
            expect(groupDef.component).to.deep.include({ class: "GroupComponent" });
            expect(groupDef.model).to.deep.include({ class: "GroupModel" });
            expect(groupDef.model?.config).to.deep.include({
                value: { component_1: ["text_1", "text_2"] }
            });

            const groupConfig = groupDef.component.config as { componentDefinitions?: Array<unknown> } | undefined;
            const repeatableDef = groupConfig?.componentDefinitions?.[0] as {
                name: string,
                component: { class: string },
                model?: { class: string, config: { value: string[] } }
            } | undefined;
            expect(repeatableDef).to.not.equal(undefined);
            expect(repeatableDef).to.deep.include({ name: "component_1" });
            expect(repeatableDef?.component).to.deep.include({ class: "RepeatableComponent" });
            expect(repeatableDef?.model).to.deep.include({ class: "RepeatableModel" });
            expect(repeatableDef?.model?.config).to.deep.include({ value: ["text_1", "text_2"] });
        });

        it("should set group model value from record metadata for tab descendants", async () => {
            const visitor = new ConstructFormConfigVisitor(logger);
            const actual = visitor.start({
                formMode: "edit",
                record: {
                    contributor_ci: {
                        name: "TestContributor",
                        email: "b@b.com",
                        orcid: "0000-0000-0000-0001",
                    },
                },
                reusableFormDefs: {
                    "standard-contributor-fields-group": [
                        {
                            name: "standard_contributor_fields_group",
                            component: {
                                class: "GroupComponent",
                                config: {
                                    componentDefinitions: [
                                        {
                                            name: "name",
                                            component: { class: "SimpleInputComponent", config: {} },
                                            model: { class: "SimpleInputModel", config: {} },
                                        },
                                        {
                                            name: "email",
                                            component: { class: "SimpleInputComponent", config: {} },
                                            model: { class: "SimpleInputModel", config: {} },
                                        },
                                        {
                                            name: "orcid",
                                            component: { class: "SimpleInputComponent", config: {} },
                                            model: { class: "SimpleInputModel", config: {} },
                                        },
                                    ],
                                },
                            },
                            model: { class: "GroupModel", config: {} },
                        },
                    ],
                },
                data: {
                    name: "form",
                    componentDefinitions: [
                        {
                            name: "tabs",
                            component: {
                                class: "TabComponent",
                                config: {
                                    tabs: [
                                        {
                                            name: "people",
                                            component: {
                                                class: "TabContentComponent",
                                                config: {
                                                    componentDefinitions: [
                                                        {
                                                            name: "contributor_ci",
                                                            component: {
                                                                class: "ReusableComponent",
                                                                config: {
                                                                    componentDefinitions: [
                                                                        {
                                                                            name: "standard_contributor_fields_group",
                                                                            component: { class: "GroupComponent", config: { componentDefinitions: [] } },
                                                                            model: { class: "GroupModel", config: {} },
                                                                            overrides: { replaceName: "contributor_ci" },
                                                                        },
                                                                    ],
                                                                },
                                                            },
                                                            overrides: { reusableFormName: "standard-contributor-fields-group" },
                                                        },
                                                    ],
                                                },
                                            },
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                },
            });

            const tab = actual.componentDefinitions[0] as { component?: { config?: { tabs?: Array<any> } } };
            const people = tab?.component?.config?.tabs?.[0];
            const contributorCi = people?.component?.config?.componentDefinitions?.[0];
            expect(contributorCi?.name).to.equal("contributor_ci");
            expect(contributorCi?.model?.config?.value).to.deep.equal({
                name: "TestContributor",
                email: "b@b.com",
                orcid: "0000-0000-0000-0001",
            });
        });
    });
});

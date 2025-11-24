import {
    ConstructFormConfigVisitor,
    FormConfig,
    FormConfigFrame, FormConfigOutline, FormModesConfig, ReusableFormDefinitions,
} from "../../src";
import {formConfigExample1, formConfigExample2, reusableDefinitionsExample1} from "./example-data";
import {logger} from "./helpers";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);

describe("Construct Visitor", async () => {
    describe("running start", async () => {
        const cases: {
            title: string,
            args: FormConfigFrame;
            expected: { useArgs: boolean, value?: FormConfig };
        }[] = [
            {
                title: "create empty item",
                args: {name: '', componentDefinitions: []},
                expected: {useArgs: false, value: new FormConfig()},
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
                                    defaultValue: [{text_3: "hello world from repeating groups"}]
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
                                                                        class: 'minLength',
                                                                        message: "@validator-error-custom-text_3",
                                                                        config: {minLength: 3}
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
                expected: {useArgs: true},
            },
            {
                title: "create full example",
                args: formConfigExample1,
                expected: {useArgs: true},
            }
        ];
        cases.forEach(({title, args, expected}) => {
            it(`should ${title}`, async function () {
                const visitor = new ConstructFormConfigVisitor(logger);
                const actual = visitor.start({data: args, formMode: "edit"});
                if (expected.useArgs) {
                    expect(actual).to.containSubset(args);
                } else {
                    expect(actual).to.eql(expected.value);
                }
            });
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
                        {name: "contributor_ci_name", component: {class: "ContentComponent"}},
                        {name: "contributor_data_manager_email", component: {class: "ContentComponent"}},
                        {
                            name: "orcid",
                            component: {
                                class: "GroupComponent",
                                config: {
                                    componentDefinitions: [
                                        {name: "orcid_nested_example1", component: {class: "ContentComponent"}}
                                    ]
                                }
                            }
                        },
                        {name: "contributor_data_manager2", component: {class: "SimpleInputComponent"}},
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
                        {name: "contributor_ci_name", component: {class: "SimpleInputComponent"}},
                        {name: "contributor_data_manager_email", component: {class: "SimpleInputComponent"}},
                        {
                            name: "orcid",
                            component: {
                                class: "GroupComponent",
                                config: {
                                    componentDefinitions: [
                                        {name: "orcid_nested_example1", component: {class: "ContentComponent"}}
                                    ]
                                }
                            }
                        },
                        {name: "contributor_data_manager2", component: {class: "SimpleInputComponent"}},
                    ]
                },
            },
        ];
        cases.forEach(({title, args, expected}) => {
            it(`should ${title}`, async function () {
                const visitor = new ConstructFormConfigVisitor(logger);
                const actual = visitor.start({
                    data: args.formConfig,
                    formMode: args.formMode,
                    reusableFormDefs: args.reusableFormDefs
                });
                expect(actual).to.containSubset(expected);
            });
        });
    });
    describe("expected errors", async () => {
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
                                            component: {class: "ReusableComponent"},
                                            overrides: {reusableFormName: "standard-contributor-field"},
                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error, 'Repeatable element template overrides must result in exactly one item, got 3');
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
                                            component: {class: "ReusableComponent"},
                                            overrides: {reusableFormName: "standard-contributor-field"},
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
                                            component: {class: "ReusableComponent"},
                                            overrides: {reusableFormName: "standard-contributor-field"},
                                        }
                                    }
                                }
                            }
                        ]
                    }, formMode: "edit", reusableFormDefs: reusableDefinitionsExample1
                });
            };
            expect(errorFunc).to.throw(Error, "Invalid FormComponentDefinition at ");
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
                                            component: {class: "ReusableComponent"},
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
                                            component: {class: "ReusableComponent"},
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
                                            component: {class: "TextAreaComponent"},
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
                                overrides: {reusableFormName: "standard-contributor-field"},
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
                                        overrides: {reusableFormName: "standard-contributor-field"},
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
            }
        )
        ;
        it("should fail when reusable form config override tries to change the class name in the component definition", async () => {
            const errorFunc = function () {
                const visitor = new ConstructFormConfigVisitor(logger);

                visitor.start({
                    data: {
                        name: "form",
                        componentDefinitions: [
                            {
                                overrides: {reusableFormName: "standard-contributor-field"},
                                name: "one",
                                component: {
                                    class: "ReusableComponent",
                                    config: {
                                        componentDefinitions: [
                                            {
                                                name: "name",
                                                component: {
                                                    class: 'CheckboxInputComponent',
                                                    config: {options: []}
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
});

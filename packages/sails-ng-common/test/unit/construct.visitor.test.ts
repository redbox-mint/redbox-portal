import {
    ConstructFormConfigVisitor,
    FormConfig,
    FormConfigFrame,
} from "../../src";


describe("Construct Visitor ", async () => {
    const chai = await import("chai");

    const cases: {
        args: FormConfigFrame;
        expected: FormConfig;
    }[] = [
        {
            // empty
            args: {componentDefinitions: []},
            expected: new FormConfig({componentDefinitions: []}),
        },
        {
            // simple example
            args: {
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
            expected: function () {
                const form = new FormConfig();
                form.componentDefinitions = [];
                return form;
            }(),
        },
    ];
    cases.forEach(({args, expected}) => {
        it(`should validate '${JSON.stringify(args)}' = ${JSON.stringify(expected)}`, async function () {
            const visitor = new ConstructFormConfigVisitor();
            const actual = visitor.constructFormConfig(args);
            chai.expect(actual).to.eql(expected);
        });
    });
});
